-- Groups feature: Telegram-like private groups, 100-150 max
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  description text check (char_length(description) <= 300),
  is_private boolean not null default true,
  max_members integer not null default 150 check (max_members between 2 and 150),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

-- Policies: groups are visible if public or member, but we make all private by default - only members can see
drop policy if exists "Groups are visible to members" on public.groups;
create policy "Groups are visible to members" on public.groups for select using (
  not is_private or exists (select 1 from public.group_members where group_id = groups.id and user_id = auth.uid()) or owner_id = auth.uid()
);

drop policy if exists "Authenticated can create groups" on public.groups;
create policy "Authenticated can create groups" on public.groups for insert with check (auth.uid() = owner_id);

drop policy if exists "Owners can update groups" on public.groups;
create policy "Owners can update groups" on public.groups for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners can delete groups" on public.groups;
create policy "Owners can delete groups" on public.groups for delete using (auth.uid() = owner_id);

drop policy if exists "Members can view membership" on public.group_members;
create policy "Members can view membership" on public.group_members for select using (
  exists (select 1 from public.group_members m where m.group_id = group_members.group_id and m.user_id = auth.uid())
  or exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_id = auth.uid())
);

drop policy if exists "Users can join groups" on public.group_members;
create policy "Users can join groups" on public.group_members for insert with check (
  auth.uid() = user_id and
  (select count(*) from public.group_members where group_id = group_members.group_id) < (select max_members from public.groups where id = group_members.group_id)
);

drop policy if exists "Members can leave groups" on public.group_members;
create policy "Members can leave groups" on public.group_members for delete using (auth.uid() = user_id or auth.uid() = (select owner_id from public.groups where id = group_id));

drop policy if exists "Members can view messages" on public.group_messages;
create policy "Members can view messages" on public.group_messages for select using (
  exists (select 1 from public.group_members where group_id = group_messages.group_id and user_id = auth.uid())
);

drop policy if exists "Members can send messages" on public.group_messages;
create policy "Members can send messages" on public.group_messages for insert with check (
  auth.uid() = user_id and exists (select 1 from public.group_members where group_id = group_messages.group_id and user_id = auth.uid())
);

-- Indexes
create index if not exists idx_groups_owner on public.groups(owner_id);
create index if not exists idx_group_members_group on public.group_members(group_id);
create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_group_messages_group on public.group_messages(group_id, created_at desc);

-- Helper function to create group with owner as member
create or replace function public.create_group(p_name text, p_description text, p_is_private boolean, p_max_members integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to create a group'; end if;
  if char_length(trim(p_name)) < 2 then raise exception 'Group name too short'; end if;
  if p_max_members is null then p_max_members := 150; end if;
  if p_max_members < 2 or p_max_members > 150 then raise exception 'Group limit must be 2-150'; end if;
  insert into public.groups (owner_id, name, description, is_private, max_members)
  values (auth.uid(), trim(p_name), nullif(trim(p_description),''), coalesce(p_is_private,true), p_max_members)
  returning id into v_group_id;
  insert into public.group_members (group_id, user_id, role) values (v_group_id, auth.uid(), 'owner');
  return v_group_id;
end;
$$;
revoke all on function public.create_group(text,text,boolean,integer) from public;
grant execute on function public.create_group(text,text,boolean,integer) to authenticated;

create or replace function public.join_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count integer; v_max integer; v_private boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join'; end if;
  select max_members, is_private into v_max, v_private from public.groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) then return; end if;
  select count(*)::integer into v_count from public.group_members where group_id = p_group_id;
  if v_count >= v_max then raise exception 'Group is full (max %)', v_max; end if;
  insert into public.group_members (group_id, user_id) values (p_group_id, auth.uid());
end;
$$;
revoke all on function public.join_group(uuid) from public;
grant execute on function public.join_group(uuid) to authenticated;

create or replace function public.get_user_groups()
returns table(id uuid, name text, description text, is_private boolean, max_members integer, member_count bigint, owner_id uuid, created_at timestamptz, is_member boolean)
language sql security definer set search_path = public as $$
  select g.id, g.name, g.description, g.is_private, g.max_members,
         (select count(*) from public.group_members where group_id = g.id) as member_count,
         g.owner_id, g.created_at,
         exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) as is_member
  from public.groups g
  where not g.is_private or exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) or g.owner_id = auth.uid()
  order by g.created_at desc;
$$;
revoke all on function public.get_user_groups() from public;
grant execute on function public.get_user_groups() to authenticated;

create or replace function public.get_nearby_profiles(p_limit integer default 6)
returns table(id uuid, username text, full_name text, avatar_url text, neighborhood text, distance_km double precision)
language sql security definer set search_path = public as $$
  with me as (select latitude, longitude from public.profiles where id = auth.uid())
  select p.id, p.username, p.full_name, p.avatar_url, p.neighborhood,
         case when me.latitude is not null and me.longitude is not null and p.latitude is not null and p.longitude is not null
           then (6371 * acos(least(1, greatest(-1, cos(radians(me.latitude)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(me.longitude)) + sin(radians(me.latitude)) * sin(radians(p.latitude))))))
           else null end as distance_km
  from public.profiles p, me
  where p.id <> auth.uid()
    and p.latitude is not null and p.longitude is not null
  order by distance_km asc nulls last, p.created_at desc
  limit least(coalesce(p_limit,6), 20);
$$;
revoke all on function public.get_nearby_profiles(integer) from public;
grant execute on function public.get_nearby_profiles(integer) to authenticated;
