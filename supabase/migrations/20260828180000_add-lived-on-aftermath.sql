-- Lived On — aftermath of completed events (photos/videos/PDFs/posts/hashtags)
insert into storage.buckets (id, name, public) values ('aftermath-media','aftermath-media', true)
on conflict (id) do update set public = true;

create policy "Aftermath media is public" on storage.objects for select using (bucket_id='aftermath-media');
drop policy if exists "Users upload aftermath" on storage.objects;
create policy "Users upload aftermath" on storage.objects for insert with check (bucket_id='aftermath-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update aftermath" on storage.objects;
create policy "Users update aftermath" on storage.objects for update using (bucket_id='aftermath-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Users delete aftermath" on storage.objects;
create policy "Users delete aftermath" on storage.objects for delete using (bucket_id='aftermath-media' and (storage.foldername(name))[1]=auth.uid()::text);

create table if not exists public.plan_aftermath_posts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.plan_aftermath_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.plan_aftermath_posts(id) on delete cascade,
  file_url text not null,
  file_type text not null check (file_type in ('image','video','pdf','other')),
  file_name text,
  created_at timestamptz not null default now()
);
alter table public.plan_aftermath_posts enable row level security;
alter table public.plan_aftermath_media enable row level security;

-- helper: user lived this event (host or checked-in)
create or replace function public.user_lived_plan(p_plan_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.plans where id=p_plan_id and user_id=p_user_id)
      or exists(select 1 from public.plan_entry_passes where plan_id=p_plan_id and user_id=p_user_id and checked_in_at is not null);
$$;

drop policy if exists "Aftermath readable" on public.plan_aftermath_posts;
create policy "Aftermath readable" on public.plan_aftermath_posts for select using (true);
drop policy if exists "Lived can post aftermath" on public.plan_aftermath_posts;
create policy "Lived can post aftermath" on public.plan_aftermath_posts for insert with check (
  auth.uid()=author_id and public.user_lived_plan(plan_id, auth.uid()) and exists (select 1 from public.plans where id=plan_id and starts_at is not null and starts_at <= now())
);
drop policy if exists "Authors can delete aftermath" on public.plan_aftermath_posts;
create policy "Authors can delete aftermath" on public.plan_aftermath_posts for delete using (auth.uid()=author_id);

drop policy if exists "Aftermath media readable" on public.plan_aftermath_media;
create policy "Aftermath media readable" on public.plan_aftermath_media for select using (true);
drop policy if exists "Lived can add media" on public.plan_aftermath_media;
create policy "Lived can add media" on public.plan_aftermath_media for insert with check (
  exists (select 1 from public.plan_aftermath_posts p where p.id=post_id and p.author_id=auth.uid() and public.user_lived_plan(p.plan_id, auth.uid()))
);

create index if not exists idx_aftermath_plan on public.plan_aftermath_posts(plan_id, created_at desc);
create index if not exists idx_aftermath_author on public.plan_aftermath_posts(author_id);
create index if not exists idx_aftermath_media_post on public.plan_aftermath_media(post_id);

create or replace function public.get_lived_on(p_user_id uuid)
returns table(plan_id uuid, title text, location text, starts_at timestamptz, lived_at timestamptz, aftermath_count bigint)
language sql stable security definer set search_path=public as $$
  with lived as (
    select p.id as plan_id, p.title, p.location, p.starts_at, coalesce(pe.checked_in_at, p.created_at) as lived_at
    from public.plans p
    left join public.plan_entry_passes pe on pe.plan_id=p.id and pe.user_id=p_user_id and pe.checked_in_at is not null
    where (p.user_id=p_user_id or pe.checked_in_at is not null) and p.starts_at is not null and p.starts_at <= now()
  )
  select l.plan_id, l.title, l.location, l.starts_at, l.lived_at,
         (select count(*) from public.plan_aftermath_posts a where a.plan_id=l.plan_id) as aftermath_count
  from lived l order by l.starts_at desc;
$$;
revoke all on function public.get_lived_on(uuid) from public;
grant execute on function public.get_lived_on(uuid) to anon, authenticated;

create or replace function public.get_aftermath_for_plan(p_plan_id uuid)
returns table(id uuid, plan_id uuid, author_id uuid, body text, hashtags text[], created_at timestamptz, username text, full_name text, avatar_url text)
language sql stable security definer set search_path=public as $$
  select a.id, a.plan_id, a.author_id, a.body, a.hashtags, a.created_at, pr.username, pr.full_name, pr.avatar_url
  from public.plan_aftermath_posts a join public.profiles pr on pr.id=a.author_id
  where a.plan_id=p_plan_id order by a.created_at desc;
$$;
revoke all on function public.get_aftermath_for_plan(uuid) from public;
grant execute on function public.get_aftermath_for_plan(uuid) to anon, authenticated;
