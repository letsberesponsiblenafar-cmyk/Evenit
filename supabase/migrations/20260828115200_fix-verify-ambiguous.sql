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
  where plan_entry_passes.plan_id = v_pass.plan_id and plan_entry_passes.user_id = v_pass.user_id
  returning plan_entry_passes.checked_in_at into v_checked_in_at;

  return query select true, 'Entry verified'::text, v_pass.plan_id, v_pass.plan_title,
    v_pass.location, v_pass.starts_at, v_pass.attendee_name, v_pass.attendee_username, v_checked_in_at;
end;
$$;
revoke all on function public.verify_entry_pass(text) from public;
grant execute on function public.verify_entry_pass(text) to authenticated;
