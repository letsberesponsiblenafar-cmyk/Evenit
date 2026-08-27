create or replace function public.notify_plan_owner_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  plan_owner uuid;
  plan_title text;
  notice text;
  notice_kind text;
  pass_memo text;
begin
  select user_id, title into plan_owner, plan_title from public.plans where id = new.plan_id;
  if new.status = 'confirmed' then
    notice := 'Someone joined your plan: ' || plan_title;
    notice_kind := 'joined';
    select memo into pass_memo from public.plan_passes where plan_id = new.plan_id;
  else
    notice := 'Someone joined the waitlist for your plan: ' || plan_title;
    notice_kind := 'waitlisted';
  end if;
  if plan_owner is not null and plan_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, plan_id, kind, message) values (plan_owner, new.user_id, new.plan_id, notice_kind, notice);
  end if;
  insert into public.notifications (user_id, actor_id, plan_id, kind, message)
  values (new.user_id, plan_owner, new.plan_id, case when new.status = 'confirmed' then 'confirmed' else 'waitlisted' end,
    case when new.status = 'confirmed' then 'You are confirmed for: ' || plan_title || '. ' || coalesce(pass_memo, 'Your entry pass is ready.') else 'You are on the waitlist for: ' || plan_title end);
  return new;
end;
$$;
