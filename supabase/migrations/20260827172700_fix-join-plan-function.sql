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
  select * into v_plan from public.plans p where p.id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;

  select pm.* into v_existing from public.plan_members pm where pm.plan_id = p_plan_id and pm.user_id = v_user_id;
  if found then
    v_status := v_existing.status;
    v_position := v_existing.queue_position;
  else
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
    select pp.memo into v_memo from public.plan_passes pp where pp.plan_id = p_plan_id;
    v_memo := coalesce(v_memo, 'You are confirmed for this event.');
  end if;
  return query select v_status, v_position, v_memo, v_confirmed_count, v_plan.capacity;
end;
$$;
