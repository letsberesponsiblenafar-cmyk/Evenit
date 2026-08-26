alter table public.profiles add column if not exists neighborhood text;
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.plans add column if not exists category text not null default 'Social';
alter table public.plans add column if not exists neighborhood text;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  plan_id uuid references public.plans(id) on delete cascade,
  kind text not null check (kind in ('joined', 'new_plan')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "Users read their notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "Users mark their notifications read" on public.notifications for update using (auth.uid() = user_id);

create or replace function public.notify_plan_owner_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare plan_owner uuid; plan_title text;
begin
  select user_id, title into plan_owner, plan_title from public.plans where id = new.plan_id;
  if plan_owner is not null and plan_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, plan_id, kind, message)
    values (plan_owner, new.user_id, new.plan_id, 'joined', 'Someone joined your plan: ' || plan_title);
  end if;
  return new;
end;
$$;
drop trigger if exists on_plan_member_created on public.plan_members;
create trigger on_plan_member_created after insert on public.plan_members for each row execute procedure public.notify_plan_owner_on_join();

create or replace function public.notify_local_users_on_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, plan_id, kind, message)
  select p.id, new.user_id, new.id, 'new_plan', 'A new ' || new.category || ' plan is near you: ' || new.title
  from public.profiles p
  where p.id <> new.user_id and (new.neighborhood is null or p.neighborhood = new.neighborhood or new.category = any(p.interests));
  return new;
end;
$$;
drop trigger if exists on_plan_created on public.plans;
create trigger on_plan_created after insert on public.plans for each row execute procedure public.notify_local_users_on_plan();
