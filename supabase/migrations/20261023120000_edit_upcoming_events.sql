-- Event changes are atomic, owner-only, and close at the original start time.
-- Questions are versioned: old answers continue to reference their original wording.
alter table public.plan_join_questions add column if not exists active boolean not null default true;
alter table public.plan_join_questions alter column position drop not null;

drop policy if exists "Owners update plans" on public.plans;
revoke update on public.plans from anon, authenticated;
drop policy if exists "Owners manage plan locations" on public.plan_locations;
create policy "Owners read plan locations" on public.plan_locations for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));
revoke insert, update, delete on public.plan_locations from anon, authenticated;

create or replace function public.get_plan_for_edit(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.plans%rowtype; v_location public.plan_locations%rowtype;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if auth.uid() is null or v_plan.user_id is distinct from auth.uid() then
    raise exception 'Only the organizer can edit this event';
  end if;
  if v_plan.starts_at is null or v_plan.starts_at <= clock_timestamp() then
    raise exception 'Editing closes when the event starts';
  end if;
  select * into v_location from public.plan_locations where plan_id = p_plan_id;
  return to_jsonb(v_plan) || jsonb_build_object(
    'latitude', v_location.latitude, 'longitude', v_location.longitude,
    'confirmed_count', (select count(*) from public.plan_members where plan_id = p_plan_id and status = 'confirmed'),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt,
      'type', q.question_type, 'required', q.required, 'options', q.options) order by q.position)
      from public.plan_join_questions q where q.plan_id = p_plan_id and q.active), '[]'::jsonb));
end;
$$;

create or replace function public.update_plan_details(
  p_plan_id uuid, p_title text, p_location text, p_starts_at timestamptz,
  p_caption text, p_category text, p_requires_college_verification boolean,
  p_questions jsonb, p_latitude double precision, p_longitude double precision,
  p_tagline text, p_image_url text, p_cover_style text, p_capacity integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans%rowtype; v_old public.plan_join_questions%rowtype;
  v_item jsonb; v_options jsonb; v_prompt text; v_type text; v_required boolean;
  v_id uuid; v_seen uuid[] := '{}'; v_active uuid[]; v_position smallint := 0; v_confirmed integer;
begin
  select * into v_plan from public.plans where id = p_plan_id for update;
  if auth.uid() is null or v_plan.user_id is distinct from auth.uid() then
    raise exception 'Only the organizer can edit this event';
  end if;
  -- Check after acquiring the lock, including time spent waiting for another writer.
  if v_plan.starts_at is null or v_plan.starts_at <= clock_timestamp() then
    raise exception 'Editing closes when the event starts';
  end if;
  if p_starts_at is null or p_starts_at <= clock_timestamp() or not isfinite(p_starts_at) then
    raise exception 'Choose a future event date and time';
  end if;
  if coalesce(length(trim(p_title)), 0) not between 1 and 160
    or coalesce(length(trim(p_location)), 0) not between 1 and 300
    or coalesce(length(trim(p_tagline)), 0) not between 1 and 120
    or coalesce(length(trim(p_caption)), 0) not between 1 and 2000 then
    raise exception 'Check the title, tagline, location and description lengths';
  end if;
  if coalesce(length(trim(p_category)), 0) not between 1 and 60 then raise exception 'Choose an event category'; end if;
  if p_cover_style is null or p_cover_style not in ('aurora','coffee','outdoors','studio','sunset','ocean','citrus','midnight','bloom','paper','ember','mono') then
    raise exception 'Choose an available cover style';
  end if;
  if nullif(trim(p_image_url), '') is not null and p_image_url !~ '^https://' then raise exception 'Use a secure cover image URL'; end if;
  if (p_latitude is null) <> (p_longitude is null) or
    (p_latitude is not null and not (p_latitude between -90 and 90 and p_longitude between -180 and 180)) then
    raise exception 'The selected coordinates are not valid';
  end if;
  select count(*) into v_confirmed from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
  if p_capacity is not null and (p_capacity < 1 or p_capacity < v_confirmed) then
    raise exception 'Guest limit cannot be less than the number of confirmed guests (%)', v_confirmed;
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then raise exception 'Guest questions must be a list'; end if;
  if jsonb_array_length(p_questions) > 10 then raise exception 'You can add up to 10 guest questions'; end if;

  select coalesce(array_agg(id), '{}') into v_active from public.plan_join_questions where plan_id = p_plan_id and active;
  -- Release positions without deleting questions (answers have cascading foreign keys).
  update public.plan_join_questions set active = false, position = null where plan_id = p_plan_id and active;
  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_position := v_position + 1;
    v_prompt := trim(v_item->>'prompt'); v_type := v_item->>'type';
    v_required := coalesce((v_item->>'required')::boolean, true);
    v_options := coalesce(v_item->'options', '[]'::jsonb);
    if coalesce(length(v_prompt),0) not between 1 and 280 or v_type is null or
      v_type not in ('short_text','long_text','multiple_choice','checkboxes') then raise exception 'Check the guest question wording and type'; end if;
    if jsonb_typeof(v_options) <> 'array' then raise exception 'Question options must be a list'; end if;
    if v_type in ('multiple_choice','checkboxes') then
      if jsonb_array_length(v_options) not between 2 and 10 or exists
        (select 1 from jsonb_array_elements(v_options) o where jsonb_typeof(o) <> 'string' or length(trim(o #>> '{}')) not between 1 and 120) then
        raise exception 'Choice questions need 2 to 10 nonempty options, up to 120 characters each';
      end if;
    else v_options := '[]'::jsonb; end if;
    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is not null then
      if not (v_id = any(v_active)) or v_id = any(v_seen) then raise exception 'The question list has changed. Reopen the editor'; end if;
      v_seen := array_append(v_seen, v_id);
      select * into v_old from public.plan_join_questions where id = v_id and plan_id = p_plan_id;
      if v_old.prompt is distinct from v_prompt or v_old.question_type is distinct from v_type
        or v_old.options is distinct from v_options or v_old.required is distinct from v_required then v_id := null; end if;
    end if;
    if v_id is null then
      insert into public.plan_join_questions(plan_id,prompt,position,required,question_type,options,active)
        values(p_plan_id,v_prompt,v_position,v_required,v_type,v_options,true);
    else update public.plan_join_questions set active = true, position = v_position where id = v_id; end if;
  end loop;
  update public.plans set title=trim(p_title), location=trim(p_location), starts_at=p_starts_at,
    caption=trim(p_caption), category=trim(p_category), tagline=trim(p_tagline),
    image_url=nullif(trim(p_image_url),''), cover_style=p_cover_style, capacity=p_capacity,
    requires_college_verification=coalesce(p_requires_college_verification,false)
    where id=p_plan_id;
  if p_latitude is null then delete from public.plan_locations where plan_id=p_plan_id;
  else insert into public.plan_locations(plan_id,latitude,longitude,updated_at)
    values(p_plan_id,p_latitude,p_longitude,clock_timestamp())
    on conflict(plan_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,updated_at=excluded.updated_at;
  end if;
  return public.get_plan_for_edit(p_plan_id);
end;
$$;

create or replace function public.get_plan_join_questions(p_plan_id uuid)
returns table(id uuid, prompt text, sort_order smallint, required boolean, question_type text, options jsonb)
language sql security definer set search_path = public as $$
  select q.id,q.prompt,q.position,q.required,q.question_type,q.options
  from public.plan_join_questions q where q.plan_id=p_plan_id and q.active order by q.position;
$$;

revoke all on function public.get_plan_for_edit(uuid) from public, anon;
grant execute on function public.get_plan_for_edit(uuid) to authenticated;
revoke all on function public.update_plan_details(uuid,text,text,timestamptz,text,text,boolean,jsonb,double precision,double precision,text,text,text,integer) from public, anon;
grant execute on function public.update_plan_details(uuid,text,text,timestamptz,text,text,boolean,jsonb,double precision,double precision,text,text,text,integer) to authenticated;

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
  perform 1 from public.plans where id = p_plan_id for update;
  if not exists (select 1 from public.plans where id = p_plan_id and starts_at > clock_timestamp()) then
    raise exception 'This event has already started or is unavailable';
  end if;
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Your answers could not be read. Please try again.';
  end if;

  if exists (select 1 from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) item
    where not exists (select 1 from public.plan_join_questions q where q.id::text = item->>'question_id'
      and q.plan_id = p_plan_id and q.active)) then
    raise exception 'The organizer updated the questions. Reopen this event to refresh your request';
  end if;
  for v_question in
    select * from public.plan_join_questions where plan_id = p_plan_id and active order by position
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


create or replace function public.join_plan(p_plan_id uuid)
returns table(status text, queue_position integer, confirmation_memo text, confirmed_count integer, capacity integer, confirmed_plan_id uuid, plan_title text, entry_token text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in to join a plan'; end if;
  perform 1 from public.plans where id = p_plan_id for update;
  if not exists (select 1 from public.plans where id = p_plan_id and starts_at > clock_timestamp()) then
    raise exception 'This event has already started or is unavailable';
  end if;
  if exists (select 1 from public.plan_join_questions where plan_id = p_plan_id and active) then
    raise exception 'Please answer the organizer’s questions before joining this event';
  end if;
  return query select * from public.register_plan_interest(p_plan_id);
end;
$$;

revoke all on function public.join_plan(uuid) from public;
grant execute on function public.join_plan(uuid) to authenticated;
