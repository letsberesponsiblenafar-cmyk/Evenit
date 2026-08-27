create table if not exists public.plan_locations (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.plan_locations enable row level security;
drop policy if exists "Owners manage plan locations" on public.plan_locations;
create policy "Owners manage plan locations" on public.plan_locations for all using (
  exists (select 1 from public.plans where id = plan_id and user_id = auth.uid())
) with check (
  exists (select 1 from public.plans where id = plan_id and user_id = auth.uid())
);

drop policy if exists "Profiles are public" on public.profiles;
drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles for select using (
  auth.uid() = id or exists (select 1 from public.profiles admin_profile where admin_profile.id = auth.uid() and admin_profile.is_admin = true)
);
drop policy if exists "Users leave plans" on public.plan_members;

create or replace function public.get_plan_insights(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans%rowtype;
  v_plan_lat double precision;
  v_plan_lon double precision;
  v_attendees jsonb;
  v_confirmed integer;
  v_waitlisted integer;
  v_reach bigint;
  v_clicks bigint;
  v_comments bigint;
  v_shares bigint;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select * into v_plan from public.plans where id = p_plan_id and user_id = auth.uid();
  if not found then raise exception 'Only the event creator can view insights'; end if;
  select latitude, longitude into v_plan_lat, v_plan_lon from public.plan_locations where plan_id = p_plan_id;
  select count(*)::integer into v_confirmed from public.plan_members where plan_id = p_plan_id and status = 'confirmed';
  select count(*)::integer into v_waitlisted from public.plan_members where plan_id = p_plan_id and status = 'waitlisted';
  select count(distinct actor_key) into v_reach from public.plan_interactions where plan_id = p_plan_id and kind = 'impression';
  select count(distinct actor_key) into v_clicks from public.plan_interactions where plan_id = p_plan_id and kind = 'click';
  select count(*) into v_comments from public.plan_comments where plan_id = p_plan_id;
  select count(distinct actor_key) into v_shares from public.plan_interactions where plan_id = p_plan_id and kind = 'share';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'neighborhood', p.neighborhood,
    'status', pm.status,
    'queue_position', pm.queue_position,
    'confirmed_at', pm.confirmed_at,
    'distance_miles', case when v_plan_lat is not null and v_plan_lon is not null and p.latitude is not null and p.longitude is not null then round((3958.8 * acos(least(1, greatest(-1, cos(radians(v_plan_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_plan_lon)) + sin(radians(v_plan_lat)) * sin(radians(p.latitude))))))::numeric, 1) else null end,
    'nearby', case when v_plan_lat is not null and v_plan_lon is not null and p.latitude is not null and p.longitude is not null then (3958.8 * acos(least(1, greatest(-1, cos(radians(v_plan_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_plan_lon)) + sin(radians(v_plan_lat)) * sin(radians(p.latitude)))))) <= 25 else v_plan.neighborhood is not null and p.neighborhood is not null and lower(v_plan.neighborhood) = lower(p.neighborhood) end
  ) order by pm.status, pm.queue_position nulls last, pm.created_at), '[]'::jsonb)
  into v_attendees
  from public.plan_members pm join public.profiles p on p.id = pm.user_id
  where pm.plan_id = p_plan_id and pm.status in ('confirmed', 'waitlisted');
  return jsonb_build_object(
    'plan', jsonb_build_object('id', v_plan.id, 'title', v_plan.title, 'location', v_plan.location, 'starts_at', v_plan.starts_at, 'created_at', v_plan.created_at, 'capacity', v_plan.capacity),
    'metrics', jsonb_build_object('joined', v_confirmed, 'waitlisted', v_waitlisted, 'reach', v_reach, 'clicks', v_clicks, 'comments', v_comments, 'shares', v_shares, 'posted_at', v_plan.created_at),
    'attendees', v_attendees
  );
end;
$$;
