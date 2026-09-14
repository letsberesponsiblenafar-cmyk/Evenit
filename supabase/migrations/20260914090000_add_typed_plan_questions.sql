-- Typed plan questions: short answer, long answer, single choice, and checkboxes.
-- Existing text questions remain short answers without needing any data migration.

alter table public.plan_join_questions
  add column if not exists question_type text not null default 'short_text',
  add column if not exists options jsonb not null default '[]'::jsonb;

alter table public.plan_join_questions
  drop constraint if exists plan_join_questions_question_type_check,
  add constraint plan_join_questions_question_type_check
    check (question_type in ('short_text', 'long_text', 'multiple_choice', 'checkboxes')),
  drop constraint if exists plan_join_questions_options_array_check,
  add constraint plan_join_questions_options_array_check
    check (jsonb_typeof(options) = 'array');

create or replace function public.create_plan_with_question_form(
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_caption text default null,
  p_category text default 'Social',
  p_requires_college_verification boolean default false,
  p_questions jsonb default '[]'::jsonb,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_username text;
  v_item jsonb;
  v_prompt text;
  v_type text;
  v_options jsonb;
  v_required boolean;
  v_position integer := 0;
begin
  if v_user_id is null then
    raise exception 'Please log in again before publishing.';
  end if;
  if coalesce(length(trim(p_title)), 0) = 0 or coalesce(length(trim(p_location)), 0) = 0 then
    raise exception 'An event needs both a title and a location.';
  end if;
  if p_starts_at is null then
    raise exception 'Choose a date and time for the event.';
  end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then
    raise exception 'Your guest questions could not be read. Please try again.';
  end if;
  if jsonb_array_length(coalesce(p_questions, '[]'::jsonb)) > 10 then
    raise exception 'You can add up to 10 guest questions.';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180)) then
    raise exception 'The selected location is not valid.';
  end if;

  v_username := coalesce(auth.jwt() -> 'user_metadata' ->> 'username', split_part(coalesce(auth.jwt() ->> 'email', 'member'), '@', 1));
  insert into public.profiles (id, username, full_name)
  values (v_user_id, v_username, auth.jwt() -> 'user_metadata' ->> 'full_name')
  on conflict (id) do nothing;

  insert into public.plans (user_id, title, location, starts_at, caption, category, capacity, neighborhood, requires_college_verification)
  select v_user_id, trim(p_title), trim(p_location), p_starts_at, nullif(trim(coalesce(p_caption, '')), ''), coalesce(nullif(trim(p_category), ''), 'Social'), null, pr.neighborhood, coalesce(p_requires_college_verification, false)
  from public.profiles pr
  where pr.id = v_user_id
  returning id into v_plan_id;

  if v_plan_id is null then
    raise exception 'Your profile could not be prepared for publishing.';
  end if;

  if p_latitude is not null then
    insert into public.plan_locations (plan_id, latitude, longitude, updated_at)
    values (v_plan_id, p_latitude, p_longitude, now())
    on conflict (plan_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = now();
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    v_prompt := nullif(trim(coalesce(v_item ->> 'prompt', '')), '');
    if v_prompt is null then
      raise exception 'Every guest question needs a prompt.';
    end if;
    v_type := coalesce(nullif(trim(v_item ->> 'type'), ''), 'short_text');
    if v_type not in ('short_text', 'long_text', 'multiple_choice', 'checkboxes') then
      raise exception 'One of the guest question types is not supported.';
    end if;
    v_options := coalesce(v_item -> 'options', '[]'::jsonb);
    if jsonb_typeof(v_options) <> 'array' then
      raise exception 'Question options could not be read.';
    end if;
    if v_type in ('multiple_choice', 'checkboxes') then
      if jsonb_array_length(v_options) < 2 or jsonb_array_length(v_options) > 10 then
        raise exception 'Choice questions need between two and ten options.';
      end if;
      if exists (select 1 from jsonb_array_elements_text(v_options) option_value where length(trim(option_value)) = 0) then
        raise exception 'Question options cannot be empty.';
      end if;
    else
      v_options := '[]'::jsonb;
    end if;
    v_required := coalesce((v_item ->> 'required')::boolean, true);
    v_position := v_position + 1;
    insert into public.plan_join_questions (plan_id, prompt, position, required, question_type, options)
    values (v_plan_id, left(v_prompt, 280), v_position, v_required, v_type, v_options);
  end loop;

  return v_plan_id;
end;
$$;

revoke all on function public.create_plan_with_question_form(text, text, timestamptz, text, text, boolean, jsonb, double precision, double precision) from public;
grant execute on function public.create_plan_with_question_form(text, text, timestamptz, text, text, boolean, jsonb, double precision, double precision) to authenticated;

drop function if exists public.get_plan_join_questions(uuid);
create function public.get_plan_join_questions(p_plan_id uuid)
returns table(id uuid, prompt text, sort_order smallint, required boolean, question_type text, options jsonb)
language sql
security definer
set search_path = public
as $$
  select q.id, q.prompt, q.position as sort_order, q.required, q.question_type, q.options
  from public.plan_join_questions q
  where q.plan_id = p_plan_id
  order by q.position;
$$;

revoke all on function public.get_plan_join_questions(uuid) from public;
grant execute on function public.get_plan_join_questions(uuid) to anon, authenticated;

create or replace function public.submit_plan_join_request(p_plan_id uuid, p_answers jsonb)
returns table(status text, queue_position integer, confirmation_memo text, confirmed_count integer, capacity integer, confirmed_plan_id uuid, plan_title text, entry_token text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question public.plan_join_questions%rowtype;
  v_answer text;
  v_answer_json jsonb;
  v_option text;
begin
  if auth.uid() is null then raise exception 'You must be signed in to join a plan'; end if;
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Your answers could not be read. Please try again.';
  end if;

  for v_question in
    select * from public.plan_join_questions where plan_id = p_plan_id order by position
  loop
    select item -> 'answer' into v_answer_json
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as item
    where item ->> 'question_id' = v_question.id::text
    limit 1;

    if v_question.question_type = 'checkboxes' then
      if v_answer_json is null or jsonb_typeof(v_answer_json) <> 'array' then
        v_answer := null;
      else
        if exists (
          select 1 from jsonb_array_elements_text(v_answer_json) selected_option
          where not (v_question.options ? selected_option)
        ) then
          raise exception 'One of the selected answers is not available for: %', v_question.prompt;
        end if;
        select nullif(string_agg(trim(selected_option), ', '), '') into v_answer
        from jsonb_array_elements_text(v_answer_json) selected_option;
      end if;
    else
      v_answer := nullif(trim(coalesce(v_answer_json #>> '{}', '')), '');
      if v_answer is not null and v_question.question_type = 'multiple_choice' and not (v_question.options ? v_answer) then
        raise exception 'Choose one of the listed answers for: %', v_question.prompt;
      end if;
    end if;

    if v_question.required and v_answer is null then
      raise exception 'Please answer: %', v_question.prompt;
    end if;
    if v_answer is not null then
      insert into public.plan_join_answers (plan_id, question_id, user_id, answer)
      values (p_plan_id, v_question.id, auth.uid(), left(v_answer, 1000))
      on conflict (question_id, user_id) do update set answer = excluded.answer, created_at = now();
    end if;
  end loop;

  return query select * from public.register_plan_interest(p_plan_id);
end;
$$;

revoke all on function public.submit_plan_join_request(uuid, jsonb) from public;
grant execute on function public.submit_plan_join_request(uuid, jsonb) to authenticated;
