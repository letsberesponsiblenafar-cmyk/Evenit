create table if not exists public.plan_verification_access (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

alter table public.plan_verification_access enable row level security;

drop policy if exists "Users view their verification access" on public.plan_verification_access;
create policy "Users view their verification access" on public.plan_verification_access
for select using (auth.uid() = user_id);

drop policy if exists "Hosts view consented verification access" on public.plan_verification_access;
create policy "Hosts view consented verification access" on public.plan_verification_access
for select using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));

create or replace function public.grant_plan_verification_access(p_plan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_college text;
  v_enrollment_id text;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if not exists (select 1 from public.plans where id = p_plan_id and requires_college_verification) then
    raise exception 'This event does not require college verification';
  end if;
  select college, enrollment_id into v_college, v_enrollment_id from public.profiles where id = v_user_id;
  if nullif(trim(coalesce(v_college, '')), '') is null or nullif(trim(coalesce(v_enrollment_id, '')), '') is null then
    raise exception 'Add your college and enrollment ID before sharing verification';
  end if;
  insert into public.plan_verification_access (plan_id, user_id, granted_at)
  values (p_plan_id, v_user_id, now())
  on conflict (plan_id, user_id) do update set granted_at = excluded.granted_at;
end;
$$;

revoke all on function public.grant_plan_verification_access(uuid) from public;
grant execute on function public.grant_plan_verification_access(uuid) to authenticated;

create or replace function public.get_plan_verification_details(p_plan_id uuid)
returns table(user_id uuid, full_name text, username text, college text, enrollment_id text, granted_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.plans where id = p_plan_id and user_id = auth.uid()) then
    raise exception 'Only the event organizer can view verification details';
  end if;
  return query
  select pva.user_id, p.full_name, p.username, p.college, p.enrollment_id, pva.granted_at
  from public.plan_verification_access pva
  join public.profiles p on p.id = pva.user_id
  where pva.plan_id = p_plan_id;
end;
$$;

revoke all on function public.get_plan_verification_details(uuid) from public;
grant execute on function public.get_plan_verification_details(uuid) to authenticated;

create or replace function public.join_plan(p_plan_id uuid)
returns table(status text, queue_position integer, confirmation_memo text, confirmed_count integer, capacity integer, confirmed_plan_id uuid, plan_title text, entry_token text, checked_in_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid(); v_plan public.plans%rowtype; v_existing public.plan_members%rowtype;
  v_status text; v_position integer; v_confirmed_count integer; v_entry_token text; v_checked_in_at timestamptz;
begin
  if v_user_id is null then raise exception 'You must be signed in to join a plan'; end if;
  select * into v_plan from public.plans p where p.id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;
  select pm.* into v_existing from public.plan_members pm where pm.plan_id = p_plan_id and pm.user_id = v_user_id;
  if found then v_status := v_existing.status; v_position := v_existing.queue_position;
  else
    if v_plan.requires_college_verification and not exists (select 1 from public.plan_verification_access where plan_id = p_plan_id and user_id = v_user_id) then
      raise exception 'Authorize this event organizer to view your verification details before joining';
    end if;
    select count(*)::integer into v_confirmed_count from public.plan_members pm where pm.plan_id = p_plan_id and pm.status = 'confirmed';
    if v_plan.capacity is null or v_confirmed_count < v_plan.capacity then
      v_status := 'confirmed'; v_position := null;
      insert into public.plan_members (plan_id, user_id, status, confirmed_at) values (p_plan_id, v_user_id, v_status, now());
    else
      v_status := 'waitlisted';
      select coalesce(max(pm.queue_position), 0) + 1 into v_position from public.plan_members pm where pm.plan_id = p_plan_id and pm.status = 'waitlisted';
      insert into public.plan_members (plan_id, user_id, status, queue_position) values (p_plan_id, v_user_id, v_status, v_position);
    end if;
  end if;
  select count(*)::integer into v_confirmed_count from public.plan_members pm where pm.plan_id = p_plan_id and pm.status = 'confirmed';
  if v_status = 'confirmed' then
    insert into public.plan_entry_passes (plan_id, user_id) values (p_plan_id, v_user_id) on conflict (plan_id, user_id) do nothing;
    select pep.entry_token, pep.checked_in_at into v_entry_token, v_checked_in_at from public.plan_entry_passes pep where pep.plan_id = p_plan_id and pep.user_id = v_user_id;
  end if;
  return query select v_status, v_position, case when v_status = 'confirmed' then 'Your QR entry pass is ready.' else null end, v_confirmed_count, v_plan.capacity, case when v_status = 'confirmed' then v_plan.id else null end, case when v_status = 'confirmed' then v_plan.title else null end, v_entry_token, v_checked_in_at;
end;
$$;

revoke all on function public.join_plan(uuid) from public;
grant execute on function public.join_plan(uuid) to authenticated;
