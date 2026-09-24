-- Owners may cancel an event only while it is still upcoming. After its
-- scheduled start, the event becomes part of the permanent Lived On record.
drop policy if exists "Owners delete plans" on public.plans;
create policy "Owners delete upcoming plans"
on public.plans for delete
using (auth.uid() = user_id and starts_at is not null and starts_at > now());

create or replace function public.delete_future_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_starts_at timestamptz;
  v_title text;
  v_image_url text;
begin
  if auth.uid() is null then
    raise exception 'Log in before deleting an event';
  end if;

  select user_id, starts_at, title, image_url
  into v_owner_id, v_starts_at, v_title, v_image_url
  from public.plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'This event no longer exists';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Only the organizer can delete this event';
  end if;
  if v_starts_at is null or v_starts_at <= now() then
    raise exception 'This event has already occurred and can no longer be deleted';
  end if;

  delete from public.plans where id = p_plan_id;

  return jsonb_build_object(
    'deleted', true,
    'plan_id', p_plan_id,
    'title', v_title,
    'image_url', v_image_url
  );
end;
$$;

revoke all on function public.delete_future_plan(uuid) from public;
grant execute on function public.delete_future_plan(uuid) to authenticated;

-- Delete an author's aftermath post atomically. Likes, comments, and media
-- records cascade in the database; the returned public URLs let the client
-- remove the corresponding Storage objects as well.
create or replace function public.delete_aftermath_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_plan_id uuid;
  v_media_urls jsonb;
begin
  if auth.uid() is null then
    raise exception 'Log in before deleting an aftermath';
  end if;

  select author_id, plan_id
  into v_author_id, v_plan_id
  from public.plan_aftermath_posts
  where id = p_post_id
  for update;

  if not found then
    raise exception 'This aftermath no longer exists';
  end if;
  if v_author_id <> auth.uid() then
    raise exception 'Only the author can delete this aftermath';
  end if;

  select coalesce(jsonb_agg(file_url order by created_at), '[]'::jsonb)
  into v_media_urls
  from public.plan_aftermath_media
  where post_id = p_post_id;

  delete from public.plan_aftermath_posts where id = p_post_id;

  return jsonb_build_object(
    'deleted', true,
    'post_id', p_post_id,
    'plan_id', v_plan_id,
    'media_urls', v_media_urls
  );
end;
$$;

revoke all on function public.delete_aftermath_post(uuid) from public;
grant execute on function public.delete_aftermath_post(uuid) to authenticated;
