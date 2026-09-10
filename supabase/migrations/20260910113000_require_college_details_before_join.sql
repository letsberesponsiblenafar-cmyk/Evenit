create or replace function public.join_plan(p_plan_id uuid)
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
  v_college text;
  v_enrollment_id text;
begin
  if v_user_id is null then raise exception 'You must be signed in to join a plan'; end if;
  select * into v_plan from public.plans p where p.id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;

  select pm.* into v_existing from public.plan_members pm where pm.plan_id = p_plan_id and pm.user_id = v_user_id;
  if found then
    v_status := v_existing.status;
    v_position := v_existing.queue_position;
  else
    if v_plan.requires_college_verification then
      select college, enrollment_id into v_college, v_enrollment_id from public.profiles where id = v_user_id;
      if nullif(trim(coalesce(v_college, '')), '') is null or nullif(trim(coalesce(v_enrollment_id, '')), '') is null then
        raise exception 'Add your college and enrollment ID in your profile before joining this event';
      end if;
    end if;

    select count(*)::integer into v_confirmed_count from public.plan_members pm where pm.plan_id = p_plan_id and pm.status = 'confirmed';
    if v_plan.capacity is null or v_confirmed_count < v_plan.capacity then
      v_status := 'confirmed';
      v_position := null;
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
