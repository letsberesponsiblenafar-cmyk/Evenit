create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.user_follows enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_follows' and policyname = 'Follows are public') then
    create policy "Follows are public" on public.user_follows for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_follows' and policyname = 'Users can follow') then
    create policy "Users can follow" on public.user_follows for insert with check (auth.uid() = follower_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_follows' and policyname = 'Users can unfollow') then
    create policy "Users can unfollow" on public.user_follows for delete using (auth.uid() = follower_id);
  end if;
end;
$$;

create index if not exists user_follows_following_idx on public.user_follows (following_id);
