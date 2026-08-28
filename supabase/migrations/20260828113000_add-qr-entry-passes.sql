create table if not exists public.plan_entry_passes (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  primary key (plan_id, user_id),
  unique (entry_token)
);

alter table public.plan_entry_passes enable row level security;
revoke all on table public.plan_entry_passes from anon, authenticated;

insert into public.plan_entry_passes (plan_id, user_id)
select plan_id, user_id
from public.plan_members
where status = 'confirmed'
on conflict (plan_id, user_id) do nothing;

create or replace function public.get_my_entry_passes()
returns table(
  plan_id uuid,
  plan_title text,
  location text,
  starts_at timestamptz,
  entry_token text,
  issued_at timestamptz,
  checked_in_at timestamptz
)
language sql security definer set search_path = public as $$
  select pep.plan_id, p.title, p.location, p.starts_at,
    pep.entry_token, pep.issued_at, pep.checked_in_at
  from public.plan_entry_passes pep
  join public.plans p on p.id = pep.plan_id
  join public.plan_members pm on pm.plan_id = pep.plan_id and pm.user_id = pep.user_id
  where pep.user_id = auth.uid() and pm.status = 'confirmed';
$$;
revoke all on function public.get_my_entry_passes() from public;
grant execute on function public.get_my_entry_passes() to authenticated;

create or replace function public.verify_entry_pass(p_entry_token text)
returns table(
  valid boolean,
  reason text,
  plan_id uuid,
  plan_title text,
  location text,
  starts_at timestamptz,
  attendee_name text,
  attendee_username text,
  checked_in_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_pass record;
  v_status text;
  v_checked_in_at timestamptz;
begin
  if auth.uid() is null then
    return query select false, 'Event host sign-in required'::text, null::uuid, null::text, null::text,
      null::timestamptz, null::text, null::text, null::timestamptz;
    return;
  end if;

  if nullif(trim(p_entry_token), '') is null then
    return query select false, 'Pass code is missing'::text, null::uuid, null::text, null::text,
      null::timestamptz, null::text, null::text, null::timestamptz;
    return;
  end if;

  select pep.plan_id, pep.user_id, pep.checked_in_at,
    p.user_id as owner_id, p.title as plan_title, p.location, p.starts_at,
    coalesce(attendee.full_name, attendee.username, 'Evenit member') as attendee_name,
    coalesce(attendee.username, 'member') as attendee_username
  into v_pass
  from public.plan_entry_passes pep
  join public.plans p on p.id = pep.plan_id
  left join public.profiles attendee on attendee.id = pep.user_id
  where pep.entry_token = trim(p_entry_token)
  for update of pep;

  if not found then
    return query select false, 'Pass not found'::text, null::uuid, null::text, null::text,
      null::timestamptz, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_pass.owner_id <> auth.uid() then
    return query select false, 'Only the event host can verify this pass'::text, null::uuid, null::text, null::text,
      null::timestamptz, null::text, null::text, null::timestamptz;
    return;
  end if;

  select pm.status into v_status
  from public.plan_members pm
  where pm.plan_id = v_pass.plan_id and pm.user_id = v_pass.user_id;

  if v_status is distinct from 'confirmed' then
    return query select false, 'This pass is no longer active'::text, v_pass.plan_id, v_pass.plan_title,
      v_pass.location, v_pass.starts_at, v_pass.attendee_name, v_pass.attendee_username, v_pass.checked_in_at;
    return;
  end if;

  if v_pass.checked_in_at is not null then
    return query select false, 'Pass already checked in'::text, v_pass.plan_id, v_pass.plan_title,
      v_pass.location, v_pass.starts_at, v_pass.attendee_name, v_pass.attendee_username, v_pass.checked_in_at;
    return;
  end if;

  update public.plan_entry_passes
  set checked_in_at = now()
  where plan_id = v_pass.plan_id and user_id = v_pass.user_id
  returning checked_in_at into v_checked_in_at;

  return query select true, 'Entry verified'::text, v_pass.plan_id, v_pass.plan_title,
    v_pass.location, v_pass.starts_at, v_pass.attendee_name, v_pass.attendee_username, v_checked_in_at;
end;
$$;
revoke all on function public.verify_entry_pass(text) from public;
grant execute on function public.verify_entry_pass(text) to authenticated;

drop function if exists public.join_plan(uuid);
create function public.join_plan(p_plan_id uuid)
returns table(
  status text,
  queue_position integer,
  confirmation_memo text,
  confirmed_count integer,
  capacity integer,
  confirmed_plan_id uuid,
  plan_title text,
  entry_token text,
  checked_in_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.plan_members%rowtype;
  v_status text;
  v_position integer;
  v_confirmed_count integer;
  v_entry_token text;
  v_checked_in_at timestamptz;
begin
  if v_user_id is null then raise exception 'You must be signed in to join a plan'; end if;
  select * into v_plan from public.plans p where p.id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;

  select pm.* into v_existing
  from public.plan_members pm
  where pm.plan_id = p_plan_id and pm.user_id = v_user_id;

  if found then
    v_status := v_existing.status;
    v_position := v_existing.queue_position;
  else
    select count(*)::integer into v_confirmed_count
    from public.plan_members pm
    where pm.plan_id = p_plan_id and pm.status = 'confirmed';
    if v_plan.capacity is null or v_confirmed_count < v_plan.capacity then
      v_status := 'confirmed';
      v_position := null;
      insert into public.plan_members (plan_id, user_id, status, confirmed_at)
      values (p_plan_id, v_user_id, v_status, now());
    else
      v_status := 'waitlisted';
      select coalesce(max(pm.queue_position), 0) + 1 into v_position
      from public.plan_members pm
      where pm.plan_id = p_plan_id and pm.status = 'waitlisted';
      insert into public.plan_members (plan_id, user_id, status, queue_position)
      values (p_plan_id, v_user_id, v_status, v_position);
    end if;
  end if;

  select count(*)::integer into v_confirmed_count
  from public.plan_members pm
  where pm.plan_id = p_plan_id and pm.status = 'confirmed';

  if v_status = 'confirmed' then
    insert into public.plan_entry_passes (plan_id, user_id)
    values (p_plan_id, v_user_id)
    on conflict (plan_id, user_id) do nothing;
    select pep.entry_token, pep.checked_in_at into v_entry_token, v_checked_in_at
    from public.plan_entry_passes pep
    where pep.plan_id = p_plan_id and pep.user_id = v_user_id;
  end if;

  return query select v_status, v_position,
    case when v_status = 'confirmed' then 'Your QR entry pass is ready.' else null end,
    v_confirmed_count, v_plan.capacity,
    case when v_status = 'confirmed' then v_plan.id else null end,
    case when v_status = 'confirmed' then v_plan.title else null end,
    v_entry_token, v_checked_in_at;
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
  select status into v_status
  from public.plan_members
  where plan_id = p_plan_id and user_id = v_user_id
  for update;
  if not found then return query select 'not_joined', null::uuid; return; end if;

  delete from public.plan_entry_passes where plan_id = p_plan_id and user_id = v_user_id;
  delete from public.plan_members where plan_id = p_plan_id and user_id = v_user_id;

  if v_status = 'confirmed' then
    select user_id into v_promoted
    from public.plan_members
    where plan_id = p_plan_id and status = 'waitlisted'
    order by queue_position nulls last, created_at
    limit 1
    for update;
    if v_promoted is not null then
      update public.plan_members
      set status = 'confirmed', queue_position = null, confirmed_at = now()
      where plan_id = p_plan_id and user_id = v_promoted;
      insert into public.plan_entry_passes (plan_id, user_id)
      values (p_plan_id, v_promoted)
      on conflict (plan_id, user_id) do nothing;
    end if;
  end if;
  return query select 'left', v_promoted;
end;
$$;
revoke all on function public.leave_plan(uuid) from public;
grant execute on function public.leave_plan(uuid) to authenticated;

create or replace function public.notify_plan_owner_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  plan_owner uuid;
  plan_title text;
  notice text;
  notice_kind text;
begin
  select user_id, title into plan_owner, plan_title
  from public.plans where id = new.plan_id;
  if new.status = 'confirmed' then
    notice := 'Someone joined your plan: ' || plan_title;
    notice_kind := 'joined';
  else
    notice := 'Someone joined the waitlist for your plan: ' || plan_title;
    notice_kind := 'waitlisted';
  end if;
  if plan_owner is not null and plan_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, plan_id, kind, message)
    values (plan_owner, new.user_id, new.plan_id, notice_kind, notice);
  end if;
  insert into public.notifications (user_id, actor_id, plan_id, kind, message)
  values (new.user_id, plan_owner, new.plan_id,
    case when new.status = 'confirmed' then 'confirmed' else 'waitlisted' end,
    case when new.status = 'confirmed'
      then 'You are confirmed for: ' || plan_title || '. Your QR entry pass is ready.'
      else 'You are on the waitlist for: ' || plan_title
    end);
  return new;
end;
$$;

create or replace function public.notify_plan_member_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare plan_title text;
begin
  if new.status = old.status then return new; end if;
  select title into plan_title from public.plans where id = new.plan_id;
  if new.status = 'confirmed' then
    insert into public.notifications (user_id, plan_id, kind, message)
    values (new.user_id, new.plan_id, 'promoted',
      'A spot opened up. You are now confirmed for: ' || plan_title || '. Your QR entry pass is ready.');
  end if;
  return new;
end;
$$;
