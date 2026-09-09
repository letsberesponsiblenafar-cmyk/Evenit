create or replace function public.create_plan_atomically(
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_caption text default null,
  p_category text default 'Social',
  p_capacity integer default null,
  p_requires_college_verification boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_username text;
begin
  if v_user_id is null then
    raise exception 'Please log in again before publishing.';
  end if;
  if coalesce(length(trim(p_title)), 0) = 0 or coalesce(length(trim(p_location)), 0) = 0 then
    raise exception 'An event needs both a title and a location.';
  end if;
  if p_starts_at is null then
    raise exception 'Choose a date and time for the event.';
  end if;
  if p_capacity is not null and p_capacity < 1 then
    raise exception 'Attendance limit must be at least one.';
  end if;

  v_username := coalesce(auth.jwt() -> 'user_metadata' ->> 'username', split_part(coalesce(auth.jwt() ->> 'email', 'member'), '@', 1));
  insert into public.profiles (id, username, full_name)
  values (v_user_id, v_username, auth.jwt() -> 'user_metadata' ->> 'full_name')
  on conflict (id) do nothing;

  insert into public.plans (user_id, title, location, starts_at, caption, category, capacity, neighborhood, requires_college_verification)
  select v_user_id, trim(p_title), trim(p_location), p_starts_at, nullif(trim(coalesce(p_caption, '')), ''), coalesce(nullif(trim(p_category), ''), 'Social'), p_capacity, pr.neighborhood, coalesce(p_requires_college_verification, false)
  from public.profiles pr
  where pr.id = v_user_id
  returning id into v_plan_id;

  if v_plan_id is null then
    raise exception 'Your profile could not be prepared for publishing.';
  end if;
  return v_plan_id;
end;
$$;

revoke all on function public.create_plan_atomically(text, text, timestamptz, text, text, integer, boolean) from public;
grant execute on function public.create_plan_atomically(text, text, timestamptz, text, text, integer, boolean) to authenticated;
