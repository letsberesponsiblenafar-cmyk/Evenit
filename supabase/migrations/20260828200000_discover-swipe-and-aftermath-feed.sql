-- Swipe interest for upcoming events (Discover)
create table if not exists public.plan_swipes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  interested boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);
alter table public.plan_swipes enable row level security;
drop policy if exists "Users manage own swipes" on public.plan_swipes;
create policy "Users manage own swipes" on public.plan_swipes for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create index if not exists idx_swipes_user on public.plan_swipes(user_id);
create index if not exists idx_swipes_plan on public.plan_swipes(plan_id);

-- Likes for aftermath (for feed engagement)
create table if not exists public.plan_aftermath_likes (
  post_id uuid not null references public.plan_aftermath_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.plan_aftermath_likes enable row level security;
drop policy if exists "Likes readable" on public.plan_aftermath_likes;
create policy "Likes readable" on public.plan_aftermath_likes for select using (true);
drop policy if exists "Users like" on public.plan_aftermath_likes;
create policy "Users like" on public.plan_aftermath_likes for insert with check (auth.uid()=user_id);
drop policy if exists "Users unlike" on public.plan_aftermath_likes;
create policy "Users unlike" on public.plan_aftermath_likes for delete using (auth.uid()=user_id);

create table if not exists public.plan_aftermath_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.plan_aftermath_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.plan_aftermath_comments enable row level security;
drop policy if exists "Comments readable" on public.plan_aftermath_comments;
create policy "Comments readable" on public.plan_aftermath_comments for select using (true);
drop policy if exists "Users comment" on public.plan_aftermath_comments;
create policy "Users comment" on public.plan_aftermath_comments for insert with check (auth.uid()=user_id);
drop policy if exists "Users delete own comments" on public.plan_aftermath_comments;
create policy "Users delete own comments" on public.plan_aftermath_comments for delete using (auth.uid()=user_id);

-- Aftermath feed: recent lived posts for feed (past events only)
create or replace function public.get_aftermath_feed(p_limit integer default 20)
returns table(id uuid, plan_id uuid, plan_title text, plan_location text, plan_starts_at timestamptz, author_id uuid, body text, hashtags text[], created_at timestamptz, username text, full_name text, avatar_url text, like_count bigint, comment_count bigint, liked boolean)
language sql stable security definer set search_path=public as $$
  with recent as (
    select a.id, a.plan_id, a.author_id, a.body, a.hashtags, a.created_at
    from public.plan_aftermath_posts a
    join public.plans p on p.id=a.plan_id
    where p.starts_at is not null and p.starts_at <= now()
    order by a.created_at desc
    limit least(coalesce(p_limit,20),50)
  )
  select r.id, r.plan_id, p.title, p.location, p.starts_at, r.author_id, r.body, r.hashtags, r.created_at,
         pr.username, pr.full_name, pr.avatar_url,
         (select count(*) from public.plan_aftermath_likes l where l.post_id=r.id) as like_count,
         (select count(*) from public.plan_aftermath_comments c where c.post_id=r.id) as comment_count,
         exists (select 1 from public.plan_aftermath_likes l where l.post_id=r.id and l.user_id=auth.uid()) as liked
  from recent r
  join public.plans p on p.id=r.plan_id
  join public.profiles pr on pr.id=r.author_id
  order by r.created_at desc;
$$;
revoke all on function public.get_aftermath_feed(integer) from public;
grant execute on function public.get_aftermath_feed(integer) to anon, authenticated;

-- Upcoming plans for Discover (exclude swiped left)
create or replace function public.get_upcoming_for_discover(p_limit integer default 20)
returns table(id uuid, title text, location text, starts_at timestamptz, caption text, category text, user_id uuid, created_at timestamptz, capacity integer, neighborhood text)
language sql stable security definer set search_path=public as $$
  select p.id, p.title, p.location, p.starts_at, p.caption, p.category, p.user_id, p.created_at, p.capacity, p.neighborhood
  from public.plans p
  where p.starts_at is not null and p.starts_at > now()
    and not exists (select 1 from public.plan_swipes s where s.user_id=auth.uid() and s.plan_id=p.id and s.interested=false)
  order by p.starts_at asc
  limit least(coalesce(p_limit,20),50);
$$;
revoke all on function public.get_upcoming_for_discover(integer) from public;
grant execute on function public.get_upcoming_for_discover(integer) to anon, authenticated;
