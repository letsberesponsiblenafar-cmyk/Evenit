-- `register_plan_interest` returns a table with an output field named `status`.
-- In PL/pgSQL, the unqualified `status` below could therefore mean either the
-- output variable or `plan_members.status`, causing every request transaction
-- to fail before its answers and pending membership are committed.
create or replace function public.register_plan_interest(p_plan_id uuid)
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
  if v_user_id is null then
    raise exception 'You must be signed in to join a plan';
  end if;

  select * into v_plan
  from public.plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'Plan not found';
  end if;
  if v_plan.user_id = v_user_id then
    raise exception 'You already host this event';
  end if;
  if v_plan.requires_college_verification and not exists (
    select 1
    from public.plan_verification_access access
    where access.plan_id = p_plan_id and access.user_id = v_user_id
  ) then
    raise exception 'Authorize this event organizer to view your verification details before joining';
  end if;

  select * into v_existing
  from public.plan_members member
  where member.plan_id = p_plan_id and member.user_id = v_user_id;

  if not found then
    insert into public.plan_members (plan_id, user_id, status)
    values (p_plan_id, v_user_id, 'interested')
    returning * into v_existing;
  end if;

  select count(*)::integer into v_confirmed_count
  from public.plan_members member
  where member.plan_id = p_plan_id and member.status = 'confirmed';

  if v_existing.status = 'confirmed' then
    select pass.entry_token, pass.checked_in_at
    into v_entry_token, v_checked_in_at
    from public.plan_entry_passes pass
    where pass.plan_id = p_plan_id and pass.user_id = v_user_id;
  end if;

  return query select
    v_existing.status,
    v_existing.queue_position,
    case
      when v_existing.status = 'confirmed' then 'Your QR entry pass is ready.'
      else 'Interest sent. The organizer will choose who receives an entry pass.'
    end,
    v_confirmed_count,
    v_plan.capacity,
    case when v_existing.status = 'confirmed' then v_plan.id else null end,
    case when v_existing.status = 'confirmed' then v_plan.title else null end,
    v_entry_token,
    v_checked_in_at;
end;
$$;

revoke all on function public.register_plan_interest(uuid) from public;
grant execute on function public.register_plan_interest(uuid) to authenticated;
