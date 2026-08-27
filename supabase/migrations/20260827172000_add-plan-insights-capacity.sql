alter table public.profiles add column if not exists latitude double precision;
alter table public.profiles add column if not exists longitude double precision;

alter table public.plans add column if not exists capacity integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_capacity_positive') then
    alter table public.plans add constraint plans_capacity_positive check (capacity is null or capacity > 0);
  end if;
end $$;

alter table public.plan_members add column if not exists status text not null default 'confirmed';
alter table public.plan_members add column if not exists queue_position integer;
alter table public.plan_members add column if not exists confirmed_at timestamptz;
update public.plan_members set confirmed_at = created_at where status = 'confirmed' and confirmed_at is null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_members_status_check') then
    alter table public.plan_members add constraint plan_members_status_check check (status in ('confirmed', 'waitlisted'));
  end if;
end $$;

create table if not exists public.plan_passes (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  memo text not null default 'You are confirmed for this event.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plan_passes enable row level security;
drop policy if exists "Owners manage plan passes" on public.plan_passes;
create policy "Owners manage plan passes" on public.plan_passes for all using (
  exists (select 1 from public.plans where id = plan_id and user_id = auth.uid())
) with check (
  exists (select 1 from public.plans where id = plan_id and user_id = auth.uid())
);
drop policy if exists "Confirmed guests read plan passes" on public.plan_passes;
create policy "Confirmed guests read plan passes" on public.plan_passes for select using (
  exists (select 1 from public.plan_members where plan_id = plan_passes.plan_id and user_id = auth.uid() and status = 'confirmed')
);

create table if not exists public.plan_interactions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_key text not null,
  kind text not null check (kind in ('impression', 'click', 'share')),
  created_at timestamptz not null default now()
);
create unique index if not exists plan_interactions_unique_actor on public.plan_interactions(plan_id, kind, actor_key);
alter table public.plan_interactions enable row level security;
drop policy if exists "Plan owners read interactions" on public.plan_interactions;
create policy "Plan owners read interactions" on public.plan_interactions for select using (
  exists (select 1 from public.plans where id = plan_id and user_id = auth.uid())
);

create table if not exists public.plan_comments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.plan_comments enable row level security;
drop policy if exists "Plan owners and commenters read comments" on public.plan_comments;
create policy "Plan owners and commenters read comments" on public.plan_comments for select using (
  auth.uid() = user_id or exists (select 1 from public.plans where id = plan_id and user_id = auth.uid())
);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('joined', 'new_plan', 'confirmed', 'waitlisted', 'promoted', 'comment', 'share'));

drop policy if exists "Users join plans" on public.plan_members;
drop policy if exists "Members are public" on public.plan_members;
create policy "Confirmed members are visible" on public.plan_members for select using (
  status = 'confirmed' or auth.uid() = user_id or exists (select 1 from public.plans where id = plan_id and user_id = auth.uid())
);

create or replace function public.record_plan_interaction(p_plan_id uuid, p_kind text, p_session_id text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor_key text;
begin
  if not exists (select 1 from public.plans where id = p_plan_id) then return; end if;
  if p_kind not in ('impression', 'click', 'share') then raise exception 'Unsupported interaction'; end if;
  v_actor_key := coalesce(auth.uid()::text, nullif(left(trim(p_session_id), 128), ''));
  if v_actor_key is null then return; end if;
  insert into public.plan_interactions (plan_id, actor_id, actor_key, kind)
  values (p_plan_id, auth.uid(), v_actor_key, p_kind)
  on conflict (plan_id, kind, actor_key) do nothing;
end;
$$;
revoke all on function public.record_plan_interaction(uuid, text, text) from public;
grant execute on function public.record_plan_interaction(uuid, text, text) to anon, authenticated;

create or replace function public.add_plan_comment(p_plan_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in to comment'; end if;
  if not exists (select 1 from public.plans where id = p_plan_id) then raise exception 'Plan not found'; end if;
  insert into public.plan_comments (plan_id, user_id, body) values (p_plan_id, auth.uid(), trim(p_body)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_plan_comment(uuid, text) from public;
grant execute on function public.add_plan_comment(uuid, text) to authenticated;

create or replace function public.join_plan(p_plan_id uuid)
returns table(status text, queue_position integer, confirmation_memo text, confirmed_count integer, capacity integer)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.plan_members%rowtype;
  v_status text;
  v_position integer;
  v_memo text;
  v_confirmed_count integer;
begin
  if v_user_id is null then raise exception 'You must be signed in to join a plan'; end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;

  select * into v_existing from public.plan_members where plan_id = p_plan_id and user_id = v_user_id;
  if found then
    v_status := v_existing.status;
    v_position := v_existing.queue_position;
  else
    select count(*)::integer into v_confirmed_count from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
    if v_plan.capacity is null or v_confirmed_count < v_plan.capacity then
      v_status := 'confirmed';
      v_position := null;
      insert into public.plan_members (plan_id, user_id, status, confirmed_at) values (p_plan_id, v_user_id, v_status, now());
    else
      v_status := 'waitlisted';
      select coalesce(max(queue_position), 0) + 1 into v_position from public.plan_members where plan_id = p_plan_id and status = 'waitlisted';
      insert into public.plan_members (plan_id, user_id, status, queue_position) values (p_plan_id, v_user_id, v_status, v_position);
    end if;
  end if;

  select count(*)::integer into v_confirmed_count from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
  if v_status = 'confirmed' then
    select memo into v_memo from public.plan_passes where plan_id = p_plan_id;
    v_memo := coalesce(v_memo, 'You are confirmed for this event.');
  end if;
  return query select v_status, v_position, v_memo, v_confirmed_count, v_plan.capacity;
end;
$$;
revoke all on function public.join_plan(uuid) from public;
grant execute on function public.join_plan(uuid) to authenticated;

create or replace function public.leave_plan(p_plan_id uuid)
returns table(result text, promoted_user_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_promoted uuid;
begin
  if v_user_id is null then raise exception 'You must be signed in to leave a plan'; end if;
  select status into v_status from public.plan_members where plan_id = p_plan_id and user_id = v_user_id for update;
  if not found then return query select 'not_joined', null::uuid; return; end if;
  delete from public.plan_members where plan_id = p_plan_id and user_id = v_user_id;
  if v_status = 'confirmed' then
    select user_id into v_promoted from public.plan_members where plan_id = p_plan_id and status = 'waitlisted' order by queue_position nulls last, created_at limit 1 for update;
    if v_promoted is not null then
      update public.plan_members set status = 'confirmed', queue_position = null, confirmed_at = now() where plan_id = p_plan_id and user_id = v_promoted;
    end if;
  end if;
  return query select 'left', v_promoted;
end;
$$;
revoke all on function public.leave_plan(uuid) from public;
grant execute on function public.leave_plan(uuid) to authenticated;

create or replace function public.notify_plan_owner_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare plan_owner uuid; plan_title text; notice text; notice_kind text;
begin
  select user_id, title into plan_owner, plan_title from public.plans where id = new.plan_id;
  if new.status = 'confirmed' then
    notice := 'Someone joined your plan: ' || plan_title;
    notice_kind := 'joined';
  else
    notice := 'Someone joined the waitlist for your plan: ' || plan_title;
    notice_kind := 'waitlisted';
  end if;
  if plan_owner is not null and plan_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, plan_id, kind, message) values (plan_owner, new.user_id, new.plan_id, notice_kind, notice);
  end if;
  insert into public.notifications (user_id, actor_id, plan_id, kind, message)
  values (new.user_id, plan_owner, new.plan_id, case when new.status = 'confirmed' then 'confirmed' else 'waitlisted' end,
    case when new.status = 'confirmed' then 'You are confirmed for: ' || plan_title else 'You are on the waitlist for: ' || plan_title end);
  return new;
end;
$$;
drop trigger if exists on_plan_member_created on public.plan_members;
create trigger on_plan_member_created after insert on public.plan_members for each row execute procedure public.notify_plan_owner_on_join();

create or replace function public.notify_plan_member_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare plan_title text;
begin
  if new.status = old.status then return new; end if;
  select title into plan_title from public.plans where id = new.plan_id;
  if new.status = 'confirmed' then
    insert into public.notifications (user_id, plan_id, kind, message) values (new.user_id, new.plan_id, 'promoted', 'A spot opened up. You are now confirmed for: ' || plan_title);
  end if;
  return new;
end;
$$;
drop trigger if exists on_plan_member_status_changed on public.plan_members;
create trigger on_plan_member_status_changed after update of status on public.plan_members for each row execute procedure public.notify_plan_member_status_change();

create or replace function public.get_plan_summaries(p_plan_ids uuid[])
returns table(plan_id uuid, confirmed_count bigint, comment_count bigint)
language sql security definer set search_path = public as $$
  select p.id,
    (select count(*) from public.plan_members pm where pm.plan_id = p.id and pm.status = 'confirmed'),
    (select count(*) from public.plan_comments pc where pc.plan_id = p.id)
  from public.plans p
  where p.id = any(p_plan_ids);
$$;
revoke all on function public.get_plan_summaries(uuid[]) from public;
grant execute on function public.get_plan_summaries(uuid[]) to anon, authenticated;

create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table(id uuid, username text, full_name text, avatar_url text, neighborhood text)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.neighborhood
  from public.profiles p where p.id = any(p_user_ids);
$$;
revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;

create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'banner_url', p.banner_url,
    'neighborhood', p.neighborhood,
    'college', case when p.education_public then p.college else null end,
    'created_at', p.created_at,
    'plans_posted', (select count(*) from public.plans where user_id = p.id),
    'joined_count', (select count(*) from public.plan_members where user_id = p.id and status = 'confirmed')
  ) from public.profiles p where p.id = p_user_id), '{}'::jsonb);
$$;
revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

create or replace function public.get_plan_insights(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans%rowtype;
  v_attendees jsonb;
  v_confirmed integer;
  v_waitlisted integer;
  v_reach bigint;
  v_clicks bigint;
  v_comments bigint;
  v_shares bigint;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select * into v_plan from public.plans where id = p_plan_id and user_id = auth.uid();
  if not found then raise exception 'Only the event creator can view insights'; end if;
  select count(*)::integer into v_confirmed from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
  select count(*)::integer into v_waitlisted from public.plan_members where plan_id = p_plan_id and status = 'waitlisted';
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
    'distance_miles', case when v_plan.latitude is not null and v_plan.longitude is not null and p.latitude is not null and p.longitude is not null then round((3958.8 * acos(least(1, greatest(-1, cos(radians(v_plan.latitude)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_plan.longitude)) + sin(radians(v_plan.latitude)) * sin(radians(p.latitude))))))::numeric, 1) else null end,
    'nearby', case when v_plan.latitude is not null and v_plan.longitude is not null and p.latitude is not null and p.longitude is not null then (3958.8 * acos(least(1, greatest(-1, cos(radians(v_plan.latitude)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_plan.longitude)) + sin(radians(v_plan.latitude)) * sin(radians(p.latitude)))))) <= 25 else v_plan.neighborhood is not null and p.neighborhood is not null and lower(v_plan.neighborhood) = lower(p.neighborhood) end
  ) order by pm.status, pm.queue_position nulls last, pm.created_at), '[]'::jsonb)
  into v_attendees
  from public.plan_members pm join public.profiles p on p.id = pm.user_id
  where pm.plan_id = p_plan_id and pm.status in ('confirmed', 'waitlisted');
  return jsonb_build_object(
    'plan', jsonb_build_object('id', v_plan.id, 'title', v_plan.title, 'location', v_plan.location, 'starts_at', v_plan.starts_at, 'created_at', v_plan.created_at, 'capacity', v_plan.capacity),
    'metrics', jsonb_build_object('joined', v_confirmed, 'waitlisted', v_waitlisted, 'reach', v_reach, 'clicks', v_clicks, 'comments', v_comments, 'shares', v_shares, 'posted_at', v_plan.created_at),
    'attendees', v_attendees
  );
end;
$$;
revoke all on function public.get_plan_insights(uuid) from public;
grant execute on function public.get_plan_insights(uuid) to authenticated;
