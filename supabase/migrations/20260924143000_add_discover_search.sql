-- One privacy-aware search endpoint keeps Discover results consistent across
-- web and Android while exposing only fields already shown on public pages.
create or replace function public.search_discover(
  p_query text,
  p_limit integer default 12
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select lower(trim(coalesce(p_query, ''))) as query,
           '%' || lower(trim(coalesce(p_query, ''))) || '%' as pattern,
           least(greatest(coalesce(p_limit, 12), 1), 30) as row_limit
  ),
  event_rows as (
    select p.id, p.title, p.tagline, p.caption, p.category, p.location,
           p.starts_at, p.image_url, p.cover_style, p.user_id,
           pr.username, pr.full_name, pr.avatar_url,
           case
             when lower(p.title) = s.query then 0
             when lower(p.title) like s.query || '%' then 1
             when lower(coalesce(p.tagline, '')) like s.pattern then 2
             else 3
           end as rank
    from public.plans p
    join public.profiles pr on pr.id = p.user_id
    cross join settings s
    where s.query <> '' and lower(concat_ws(' ', p.title, p.tagline, p.caption,
      p.category, p.location, pr.username, pr.full_name)) like s.pattern
    order by rank, p.starts_at desc nulls last
    limit (select row_limit from settings)
  ),
  profile_rows as (
    select pr.id, pr.username, pr.full_name, pr.avatar_url, pr.neighborhood,
           pr.about, pr.is_private,
           case
             when lower(pr.username) = s.query then 0
             when lower(coalesce(pr.full_name, '')) = s.query then 0
             when lower(pr.username) like s.query || '%' then 1
             when lower(coalesce(pr.full_name, '')) like s.query || '%' then 1
             else 2
           end as rank
    from public.profiles pr
    cross join settings s
    where s.query <> '' and lower(concat_ws(' ', pr.username, pr.full_name,
      pr.about, pr.neighborhood, array_to_string(pr.interests, ' '))) like s.pattern
    order by rank, pr.full_name nulls last, pr.username
    limit (select row_limit from settings)
  ),
  aftermath_rows as (
    select a.id, a.plan_id, p.title as plan_title, p.location as plan_location,
           p.starts_at as plan_starts_at, a.author_id, a.body, a.hashtags,
           a.created_at, pr.username, pr.full_name, pr.avatar_url,
           (select count(*) from public.plan_aftermath_likes l where l.post_id = a.id) as like_count,
           (select count(*) from public.plan_aftermath_comments c where c.post_id = a.id) as comment_count,
           exists (select 1 from public.plan_aftermath_likes l where l.post_id = a.id and l.user_id = auth.uid()) as liked,
           case
             when lower(p.title) = s.query then 0
             when lower(p.title) like s.query || '%' then 1
             when lower(a.body) like s.pattern then 2
             else 3
           end as rank
    from public.plan_aftermath_posts a
    join public.plans p on p.id = a.plan_id
    join public.profiles pr on pr.id = a.author_id
    cross join settings s
    where s.query <> '' and lower(concat_ws(' ', a.body,
      array_to_string(a.hashtags, ' '), p.title, p.location,
      p.category, pr.username, pr.full_name)) like s.pattern
    order by rank, a.created_at desc
    limit (select row_limit from settings)
  )
  select jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'rank' order by e.rank, e.starts_at desc nulls last) from event_rows e), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(p) - 'rank' order by p.rank, p.full_name nulls last, p.username) from profile_rows p), '[]'::jsonb),
    'aftermath', coalesce((select jsonb_agg(to_jsonb(a) - 'rank' order by a.rank, a.created_at desc) from aftermath_rows a), '[]'::jsonb)
  );
$$;

revoke all on function public.search_discover(text, integer) from public;
grant execute on function public.search_discover(text, integer) to anon, authenticated;
