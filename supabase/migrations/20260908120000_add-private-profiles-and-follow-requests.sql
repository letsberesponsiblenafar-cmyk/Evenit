alter table public.profiles add column if not exists about text check (char_length(about) <= 280);
alter table public.profiles add column if not exists is_private boolean not null default false;

create table if not exists public.follow_requests (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follow_requests enable row level security;
create policy "Users view their follow requests" on public.follow_requests for select using (auth.uid() in (follower_id, following_id));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('joined', 'new_plan', 'follow_request', 'follow_approved')) not valid;

create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
    'id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
    'banner_url', p.banner_url, 'neighborhood', p.neighborhood, 'about', p.about, 'is_private', p.is_private,
    'plans_posted', (select count(*) from public.plans where user_id = p.id),
    'joined_count', (select count(*) from public.plan_members where user_id = p.id and status = 'confirmed')
  ) from public.profiles p where p.id = p_user_id), '{}'::jsonb);
$$;

create or replace function public.get_follow_state(p_following_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_follower uuid := auth.uid();
begin
  if v_follower is null then return jsonb_build_object('status', 'none'); end if;
  if exists (select 1 from public.user_follows where follower_id = v_follower and following_id = p_following_id) then
    return jsonb_build_object('status', 'following');
  end if;
  if exists (select 1 from public.follow_requests where follower_id = v_follower and following_id = p_following_id and status = 'pending') then
    return jsonb_build_object('status', 'pending');
  end if;
  return jsonb_build_object('status', 'none');
end;
$$;

create or replace function public.toggle_follow(p_following_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_follower uuid := auth.uid(); v_private boolean;
begin
  if v_follower is null then return jsonb_build_object('error', 'Not logged in'); end if;
  if v_follower = p_following_id then return jsonb_build_object('error', 'Cannot follow yourself'); end if;
  if exists (select 1 from public.user_follows where follower_id = v_follower and following_id = p_following_id) then
    delete from public.user_follows where follower_id = v_follower and following_id = p_following_id;
    return jsonb_build_object('status', 'unfollowed');
  end if;
  if exists (select 1 from public.follow_requests where follower_id = v_follower and following_id = p_following_id and status = 'pending') then
    delete from public.follow_requests where follower_id = v_follower and following_id = p_following_id;
    return jsonb_build_object('status', 'request_cancelled');
  end if;
  select is_private into v_private from public.profiles where id = p_following_id;
  if coalesce(v_private, false) then
    insert into public.follow_requests (follower_id, following_id, status) values (v_follower, p_following_id, 'pending')
    on conflict (follower_id, following_id) do update set status = 'pending', updated_at = now();
    insert into public.notifications (user_id, actor_id, kind, message)
    values (p_following_id, v_follower, 'follow_request', 'Someone requested to follow you');
    return jsonb_build_object('status', 'requested');
  end if;
  insert into public.user_follows (follower_id, following_id) values (v_follower, p_following_id);
  return jsonb_build_object('status', 'followed');
end;
$$;

create or replace function public.respond_to_follow_request(p_follower_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then return jsonb_build_object('error', 'Not logged in'); end if;
  if not exists (select 1 from public.follow_requests where follower_id = p_follower_id and following_id = v_owner and status = 'pending') then
    return jsonb_build_object('error', 'Follow request not found');
  end if;
  update public.follow_requests set status = case when p_approve then 'approved' else 'declined' end, updated_at = now()
  where follower_id = p_follower_id and following_id = v_owner;
  if p_approve then
    insert into public.user_follows (follower_id, following_id) values (p_follower_id, v_owner) on conflict do nothing;
    insert into public.notifications (user_id, actor_id, kind, message) values (p_follower_id, v_owner, 'follow_approved', 'Your follow request was approved');
    return jsonb_build_object('status', 'approved');
  end if;
  return jsonb_build_object('status', 'declined');
end;
$$;

revoke all on function public.get_follow_state(uuid) from public;
grant execute on function public.get_follow_state(uuid) to authenticated;
revoke all on function public.toggle_follow(uuid) from public;
grant execute on function public.toggle_follow(uuid) to authenticated;
revoke all on function public.respond_to_follow_request(uuid, boolean) from public;
grant execute on function public.respond_to_follow_request(uuid, boolean) to authenticated;
