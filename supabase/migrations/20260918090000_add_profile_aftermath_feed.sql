-- Profile Lived On needs the same complete aftermath records that Discover uses.
-- Posting eligibility remains enforced by user_lived_plan: event host or checked-in guest.
create or replace function public.get_profile_aftermath(
  p_user_id uuid,
  p_limit integer default 20
)
returns table(
  id uuid,
  plan_id uuid,
  plan_title text,
  plan_location text,
  plan_starts_at timestamptz,
  author_id uuid,
  body text,
  hashtags text[],
  created_at timestamptz,
  username text,
  full_name text,
  avatar_url text,
  like_count bigint,
  comment_count bigint,
  liked boolean
)
language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.plan_id,
    p.title,
    p.location,
    p.starts_at,
    a.author_id,
    a.body,
    a.hashtags,
    a.created_at,
    pr.username,
    pr.full_name,
    pr.avatar_url,
    (select count(*) from public.plan_aftermath_likes l where l.post_id = a.id) as like_count,
    (select count(*) from public.plan_aftermath_comments c where c.post_id = a.id) as comment_count,
    exists (
      select 1
      from public.plan_aftermath_likes l
      where l.post_id = a.id and l.user_id = auth.uid()
    ) as liked
  from public.plan_aftermath_posts a
  join public.plans p on p.id = a.plan_id
  join public.profiles pr on pr.id = a.author_id
  where a.author_id = p_user_id
    and p.starts_at is not null
    and p.starts_at <= now()
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.get_profile_aftermath(uuid, integer) from public;
grant execute on function public.get_profile_aftermath(uuid, integer) to anon, authenticated;
