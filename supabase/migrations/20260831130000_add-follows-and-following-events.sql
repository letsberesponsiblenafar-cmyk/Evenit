-- user_follows table
create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);
alter table public.user_follows enable row level security;
create policy "Follows are public" on public.user_follows for select using (true);
create policy "Users can follow" on public.user_follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow" on public.user_follows for delete using (auth.uid() = follower_id);

-- RPC: get upcoming events from users that the current user follows
create or replace function public.get_following_events(p_user_id uuid, p_limit int default 20)
returns table (
  id uuid,
  user_id uuid,
  title text,
  location text,
  starts_at timestamptz,
  caption text,
  category text,
  capacity int,
  created_at timestamptz,
  author_name text,
  author_username text,
  author_avatar text,
  confirmed_count bigint
)
language sql
stable
as $$
  select
    p.id,
    p.user_id,
    p.title,
    p.location,
    p.starts_at,
    p.caption,
    p.category,
    p.capacity,
    p.created_at,
    pr.full_name as author_name,
    pr.username as author_username,
    pr.avatar_url as author_avatar,
    coalesce(cm.confirmed_count, 0) as confirmed_count
  from public.plans p
  join public.user_follows uf on uf.following_id = p.user_id
  join public.profiles pr on pr.id = p.user_id
  left join (
    select plan_id, count(*) as confirmed_count
    from public.plan_members
    where status = 'confirmed'
    group by plan_id
  ) cm on cm.plan_id = p.id
  where uf.follower_id = p_user_id
    and p.starts_at is not null
    and p.starts_at > now()
  order by p.starts_at asc
  limit p_limit;
$$;

-- RPC: check if a user follows another
create or replace function public.get_follow_status(p_follower_id uuid, p_following_ids uuid[])
returns table (following_id uuid)
language sql
stable
as $$
  select uf.following_id
  from public.user_follows uf
  where uf.follower_id = p_follower_id
    and uf.following_id = any(p_following_ids);
$$;

-- RPC: toggle follow
create or replace function public.toggle_follow(p_following_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_id uuid := auth.uid();
  v_exists boolean;
begin
  if v_follower_id is null then
    return jsonb_build_object('error', 'Not logged in');
  end if;
  if v_follower_id = p_following_id then
    return jsonb_build_object('error', 'Cannot follow yourself');
  end if;
  select exists(
    select 1 from public.user_follows
    where follower_id = v_follower_id and following_id = p_following_id
  ) into v_exists;
  if v_exists then
    delete from public.user_follows
    where follower_id = v_follower_id and following_id = p_following_id;
    return jsonb_build_object('status', 'unfollowed');
  else
    insert into public.user_follows (follower_id, following_id)
    values (v_follower_id, p_following_id);
    return jsonb_build_object('status', 'followed');
  end if;
end;
$$;
