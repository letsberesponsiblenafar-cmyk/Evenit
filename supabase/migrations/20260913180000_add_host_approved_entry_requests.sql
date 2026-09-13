-- A plan request is not an entry confirmation. Hosts explicitly issue each QR
-- pass from Insights after reviewing the request and any optional answers.

alter table public.plan_members drop constraint if exists plan_members_status_check;
alter table public.plan_members add constraint plan_members_status_check
  check (status in ('interested', 'confirmed', 'waitlisted'));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined', 'new_plan', 'follow_request', 'follow_approved', 'confirmed', 'waitlisted', 'promoted', 'comment', 'share')) not valid;

create table if not exists public.plan_join_questions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 1 and 280),
  position smallint not null check (position between 1 and 10),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_id, position)
);

create table if not exists public.plan_join_answers (
  plan_id uuid not null references public.plans(id) on delete cascade,
  question_id uuid not null references public.plan_join_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer text not null check (char_length(trim(answer)) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

alter table public.plan_join_questions enable row level security;
alter table public.plan_join_answers enable row level security;

drop policy if exists "Anyone can read plan request questions" on public.plan_join_questions;
create policy "Anyone can read plan request questions" on public.plan_join_questions
  for select using (true);

drop policy if exists "Hosts can read plan request answers" on public.plan_join_answers;
create policy "Hosts can read plan request answers" on public.plan_join_answers
  for select using (exists (
    select 1 from public.plans p where p.id = plan_join_answers.plan_id and p.user_id = auth.uid()
  ));

drop policy if exists "Guests can read their plan request answers" on public.plan_join_answers;
create policy "Guests can read their plan request answers" on public.plan_join_answers
  for select using (auth.uid() = user_id);

create or replace function public.create_plan_with_questions(
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_caption text default null,
  p_category text default 'Social',
  p_capacity integer default null,
  p_requires_college_verification boolean default false,
  p_questions text[] default '{}'::text[],
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
  v_question text;
  v_index integer;
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
  if p_capacity is not null and p_capacity < 1 then
    raise exception 'Attendance limit must be at least one.';
  end if;
  if coalesce(array_length(p_questions, 1), 0) > 10 then
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
  select v_user_id, trim(p_title), trim(p_location), p_starts_at, nullif(trim(coalesce(p_caption, '')), ''), coalesce(nullif(trim(p_category), ''), 'Social'), p_capacity, pr.neighborhood, coalesce(p_requires_college_verification, false)
  from public.profiles pr
  where pr.id = v_user_id
  returning id into v_plan_id;

  if v_plan_id is null then
    raise exception 'Your profile could not be prepared for publishing.';
  end if;

  if p_latitude is not null then
    insert into public.plan_locations (plan_id, latitude, longitude, updated_at)
    values (v_plan_id, p_latitude, p_longitude, now())
    on conflict (plan_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at;
  end if;

  for v_index in 1..coalesce(array_length(p_questions, 1), 0) loop
    v_question := nullif(trim(p_questions[v_index]), '');
    if v_question is not null then
      insert into public.plan_join_questions (plan_id, prompt, position)
      values (v_plan_id, v_question, v_index);
    end if;
  end loop;

  return v_plan_id;
end;
$$;

revoke all on function public.create_plan_with_questions(text, text, timestamptz, text, text, integer, boolean, text[], double precision, double precision) from public;
grant execute on function public.create_plan_with_questions(text, text, timestamptz, text, text, integer, boolean, text[], double precision, double precision) to authenticated;

create or replace function public.get_plan_join_questions(p_plan_id uuid)
returns table(id uuid, prompt text, sort_order smallint, required boolean)
language sql
security definer
set search_path = public
as $$
  select q.id, q.prompt, q.position as sort_order, q.required
  from public.plan_join_questions q
  where q.plan_id = p_plan_id
  order by q.position;
$$;

revoke all on function public.get_plan_join_questions(uuid) from public;
grant execute on function public.get_plan_join_questions(uuid) to anon, authenticated;

create or replace function public.register_plan_interest(p_plan_id uuid)
returns table(status text, queue_position integer, confirmation_memo text, confirmed_count integer, capacity integer, confirmed_plan_id uuid, plan_title text, entry_token text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.plan_members%rowtype;
  v_confirmed_count integer;
  v_entry_token text;
  v_checked_in_at timestamptz;
begin
  if v_user_id is null then raise exception 'You must be signed in to join a plan'; end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_plan.user_id = v_user_id then raise exception 'You already host this event'; end if;
  if v_plan.requires_college_verification and not exists (
    select 1 from public.plan_verification_access where plan_id = p_plan_id and user_id = v_user_id
  ) then
    raise exception 'Authorize this event organizer to view your verification details before joining';
  end if;

  select * into v_existing from public.plan_members where plan_id = p_plan_id and user_id = v_user_id;
  if not found then
    insert into public.plan_members (plan_id, user_id, status)
    values (p_plan_id, v_user_id, 'interested');
    v_existing.status := 'interested';
  end if;

  select count(*)::integer into v_confirmed_count
  from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
  if v_existing.status = 'confirmed' then
    select entry_token, checked_in_at into v_entry_token, v_checked_in_at
    from public.plan_entry_passes where plan_id = p_plan_id and user_id = v_user_id;
  end if;

  return query select
    v_existing.status,
    v_existing.queue_position,
    case when v_existing.status = 'confirmed' then 'Your QR entry pass is ready.' else 'Interest sent. The organizer will choose who receives an entry pass.' end,
    v_confirmed_count,
    v_plan.capacity,
    case when v_existing.status = 'confirmed' then v_plan.id else null end,
    case when v_existing.status = 'confirmed' then v_plan.title else null end,
    v_entry_token,
    v_checked_in_at;
end;
$$;

revoke all on function public.register_plan_interest(uuid) from public;

create or replace function public.join_plan(p_plan_id uuid)
returns table(status text, queue_position integer, confirmation_memo text, confirmed_count integer, capacity integer, confirmed_plan_id uuid, plan_title text, entry_token text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.plan_join_questions where plan_id = p_plan_id) then
    raise exception 'Please answer the organizer’s questions before joining this event';
  end if;
  return query select * from public.register_plan_interest(p_plan_id);
end;
$$;

revoke all on function public.join_plan(uuid) from public;
grant execute on function public.join_plan(uuid) to authenticated;

create or replace function public.submit_plan_join_request(p_plan_id uuid, p_answers jsonb)
returns table(status text, queue_position integer, confirmation_memo text, confirmed_count integer, capacity integer, confirmed_plan_id uuid, plan_title text, entry_token text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question public.plan_join_questions%rowtype;
  v_answer text;
begin
  if auth.uid() is null then raise exception 'You must be signed in to join a plan'; end if;
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Your answers could not be read. Please try again.';
  end if;

  for v_question in
    select * from public.plan_join_questions where plan_id = p_plan_id order by position
  loop
    select nullif(trim(item ->> 'answer'), '') into v_answer
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as item
    where item ->> 'question_id' = v_question.id::text
    limit 1;
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

create or replace function public.issue_plan_entry_pass(p_plan_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_member public.plan_members%rowtype;
  v_confirmed_count integer;
  v_entry_token text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_plan.user_id <> auth.uid() then raise exception 'Only the event organizer can issue entry passes'; end if;

  select * into v_member from public.plan_members where plan_id = p_plan_id and user_id = p_user_id for update;
  if not found then raise exception 'This person has not sent an interest request'; end if;
  if v_member.status not in ('interested', 'waitlisted', 'confirmed') then raise exception 'This request cannot receive a pass'; end if;
  if v_plan.requires_college_verification and not exists (
    select 1 from public.plan_verification_access where plan_id = p_plan_id and user_id = p_user_id
  ) then
    raise exception 'This person still needs to approve college verification for this event';
  end if;

  if v_member.status <> 'confirmed' then
    select count(*)::integer into v_confirmed_count from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
    if v_plan.capacity is not null and v_confirmed_count >= v_plan.capacity then
      raise exception 'This plan has reached its guest limit';
    end if;
    update public.plan_members
    set status = 'confirmed', queue_position = null, confirmed_at = now()
    where plan_id = p_plan_id and user_id = p_user_id;
  end if;

  insert into public.plan_entry_passes (plan_id, user_id)
  values (p_plan_id, p_user_id)
  on conflict (plan_id, user_id) do nothing;
  select entry_token into v_entry_token from public.plan_entry_passes where plan_id = p_plan_id and user_id = p_user_id;
  return jsonb_build_object('issued', true, 'entry_token', v_entry_token, 'plan_id', p_plan_id, 'user_id', p_user_id);
end;
$$;

revoke all on function public.issue_plan_entry_pass(uuid, uuid) from public;
grant execute on function public.issue_plan_entry_pass(uuid, uuid) to authenticated;

create or replace function public.leave_plan(p_plan_id uuid)
returns table(result text, promoted_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in to leave a plan'; end if;
  delete from public.plan_entry_passes where plan_id = p_plan_id and user_id = auth.uid();
  delete from public.plan_members where plan_id = p_plan_id and user_id = auth.uid();
  return query select 'left'::text, null::uuid;
end;
$$;

revoke all on function public.leave_plan(uuid) from public;
grant execute on function public.leave_plan(uuid) to authenticated;

create or replace function public.notify_plan_owner_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  select user_id, title into v_owner, v_title from public.plans where id = new.plan_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, plan_id, kind, message)
    values (v_owner, new.user_id, new.plan_id, 'joined',
      case when new.status = 'interested'
        then 'A new interest request arrived for: ' || v_title
        else 'A person joined your plan: ' || v_title end);
  end if;
  return new;
end;
$$;

create or replace function public.notify_plan_member_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.status = old.status then return new; end if;
  select title into v_title from public.plans where id = new.plan_id;
  if new.status = 'confirmed' then
    insert into public.notifications (user_id, plan_id, kind, message)
    values (new.user_id, new.plan_id, 'new_plan', 'Your entry pass is ready for: ' || v_title);
  end if;
  return new;
end;
$$;

create or replace function public.get_plan_insights(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_plan_lat double precision;
  v_plan_lon double precision;
  v_attendees jsonb;
  v_confirmed integer;
  v_interested integer;
  v_waitlisted integer;
  v_attended integer;
  v_reach bigint;
  v_clicks bigint;
  v_comments bigint;
  v_shares bigint;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select * into v_plan from public.plans where id = p_plan_id and user_id = auth.uid();
  if not found then raise exception 'Only the event creator can view insights'; end if;
  select latitude, longitude into v_plan_lat, v_plan_lon from public.plan_locations where plan_id = p_plan_id;
  select count(*)::integer into v_confirmed from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
  select count(*)::integer into v_interested from public.plan_members where plan_id = p_plan_id and status = 'interested';
  select count(*)::integer into v_waitlisted from public.plan_members where plan_id = p_plan_id and status = 'waitlisted';
  select count(*)::integer into v_attended from public.plan_entry_passes where plan_id = p_plan_id and checked_in_at is not null;
  select count(distinct actor_key) into v_reach from public.plan_interactions where plan_id = p_plan_id and kind = 'impression';
  select count(distinct actor_key) into v_clicks from public.plan_interactions where plan_id = p_plan_id and kind = 'click';
  select count(*) into v_comments from public.plan_comments where plan_id = p_plan_id;
  select count(distinct actor_key) into v_shares from public.plan_interactions where plan_id = p_plan_id and kind = 'share';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'neighborhood', p.neighborhood,
    'status', pm.status,
    'queue_position', pm.queue_position,
    'confirmed_at', pm.confirmed_at,
    'checked_in_at', pep.checked_in_at,
    'attended', pep.checked_in_at is not null,
    'pass_issued', pep.entry_token is not null,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('question', q.prompt, 'answer', a.answer) order by q.position)
      from public.plan_join_answers a
      join public.plan_join_questions q on q.id = a.question_id
      where a.plan_id = pm.plan_id and a.user_id = pm.user_id
    ), '[]'::jsonb),
    'distance_miles', case when v_plan_lat is not null and v_plan_lon is not null and p.latitude is not null and p.longitude is not null then round((3958.8 * acos(least(1, greatest(-1, cos(radians(v_plan_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_plan_lon)) + sin(radians(v_plan_lat)) * sin(radians(p.latitude))))))::numeric, 1) else null end,
    'nearby', case when v_plan_lat is not null and v_plan_lon is not null and p.latitude is not null and p.longitude is not null then (3958.8 * acos(least(1, greatest(-1, cos(radians(v_plan_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_plan_lon)) + sin(radians(v_plan_lat)) * sin(radians(p.latitude)))))) <= 25 else v_plan.neighborhood is not null and p.neighborhood is not null and lower(v_plan.neighborhood) = lower(p.neighborhood) end
  ) order by case pm.status when 'interested' then 0 when 'waitlisted' then 1 else 2 end, pm.created_at), '[]'::jsonb)
  into v_attendees
  from public.plan_members pm
  join public.profiles p on p.id = pm.user_id
  left join public.plan_entry_passes pep on pep.plan_id = pm.plan_id and pep.user_id = pm.user_id
  where pm.plan_id = p_plan_id;

  return jsonb_build_object(
    'plan', jsonb_build_object('id', v_plan.id, 'title', v_plan.title, 'location', v_plan.location, 'starts_at', v_plan.starts_at, 'created_at', v_plan.created_at, 'capacity', v_plan.capacity),
    'metrics', jsonb_build_object('joined', v_confirmed, 'interested', v_interested, 'waitlisted', v_waitlisted, 'attended', v_attended, 'reach', v_reach, 'clicks', v_clicks, 'comments', v_comments, 'shares', v_shares, 'posted_at', v_plan.created_at),
    'attendees', v_attendees
  );
end;
$$;

revoke all on function public.get_plan_insights(uuid) from public;
grant execute on function public.get_plan_insights(uuid) to authenticated;
