-- Direct message inboxes: every participant sees the latest message in each conversation.
create or replace function public.get_direct_message_inbox()
returns table(
  other_id uuid,
  username text,
  full_name text,
  avatar_url text,
  last_body text,
  last_at timestamptz,
  last_sender_id uuid
)
language sql stable security definer set search_path = public as $$
  with conversations as (
    select
      case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other_id,
      m.body,
      m.created_at,
      m.sender_id
    from public.direct_messages m
    where auth.uid() is not null
      and auth.uid() in (m.sender_id, m.recipient_id)
  ), latest as (
    select distinct on (other_id) other_id, body, created_at, sender_id
    from conversations
    order by other_id, created_at desc
  )
  select latest.other_id, p.username, p.full_name, p.avatar_url,
         latest.body, latest.created_at, latest.sender_id
  from latest
  join public.profiles p on p.id = latest.other_id
  order by latest.created_at desc;
$$;

-- A conversation stays readable to its two participants, even if a later
-- privacy/follow change means that no new direct messages may be started.
create or replace function public.get_direct_messages(p_other_id uuid)
returns table (id uuid, sender_id uuid, recipient_id uuid, body text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_other_id is null or v_user_id = p_other_id then return; end if;
  if not exists (
    select 1 from public.direct_messages m
    where (m.sender_id = v_user_id and m.recipient_id = p_other_id)
       or (m.sender_id = p_other_id and m.recipient_id = v_user_id)
  ) and not public.can_message_user(p_other_id) then
    return;
  end if;
  return query
    select m.id, m.sender_id, m.recipient_id, m.body, m.created_at
    from public.direct_messages m
    where (m.sender_id = v_user_id and m.recipient_id = p_other_id)
       or (m.sender_id = p_other_id and m.recipient_id = v_user_id)
    order by m.created_at asc;
end;
$$;

-- Group conversations list only groups the signed-in user belongs to.
create or replace function public.get_group_conversations()
returns table(
  id uuid,
  name text,
  description text,
  max_members integer,
  member_count bigint,
  viewer_role text,
  last_body text,
  last_at timestamptz,
  last_sender_id uuid
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.description, g.max_members,
         (select count(*) from public.group_members members where members.group_id = g.id),
         mine.role,
         latest.body,
         latest.created_at,
         latest.user_id
  from public.groups g
  join public.group_members mine on mine.group_id = g.id and mine.user_id = auth.uid()
  left join lateral (
    select m.body, m.created_at, m.user_id
    from public.group_messages m
    where m.group_id = g.id
    order by m.created_at desc
    limit 1
  ) latest on true
  order by coalesce(latest.created_at, g.created_at) desc;
$$;

create or replace function public.get_group_messages(p_group_id uuid)
returns table(
  id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  username text,
  full_name text,
  avatar_url text
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, m.body, m.created_at, p.username, p.full_name, p.avatar_url
  from public.group_messages m
  join public.profiles p on p.id = m.user_id
  where m.group_id = p_group_id
    and exists (
      select 1 from public.group_members mine
      where mine.group_id = m.group_id and mine.user_id = auth.uid()
    )
  order by m.created_at asc
  limit 100;
$$;

create or replace function public.get_group_members(p_group_id uuid)
returns table(
  user_id uuid,
  role text,
  joined_at timestamptz,
  username text,
  full_name text,
  avatar_url text
)
language sql stable security definer set search_path = public as $$
  select gm.user_id, gm.role, gm.joined_at, p.username, p.full_name, p.avatar_url
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and exists (
      select 1 from public.group_members mine
      where mine.group_id = gm.group_id and mine.user_id = auth.uid()
    )
  order by case gm.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(coalesce(p.full_name, p.username, ''));
$$;

-- Only a group owner or admin may search for and add members.
create or replace function public.search_group_invitees(p_group_id uuid, p_query text)
returns table(id uuid, username text, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url
  from public.profiles p
  where char_length(trim(coalesce(p_query, ''))) >= 2
    and exists (
      select 1 from public.group_members mine
      where mine.group_id = p_group_id
        and mine.user_id = auth.uid()
        and mine.role in ('owner', 'admin')
    )
    and p.id <> auth.uid()
    and not exists (
      select 1 from public.group_members existing
      where existing.group_id = p_group_id and existing.user_id = p.id
    )
    and (
      coalesce(p.username, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.full_name, '') ilike '%' || trim(p_query) || '%'
    )
  order by lower(coalesce(p.full_name, p.username, ''))
  limit 8;
$$;

create or replace function public.add_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_max_members integer; v_member_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Log in to manage members'); end if;
  if not exists (
    select 1 from public.group_members mine
    where mine.group_id = p_group_id and mine.user_id = auth.uid() and mine.role in ('owner', 'admin')
  ) then
    return jsonb_build_object('error', 'Only a group owner or admin can add people');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('error', 'Profile not found');
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    return jsonb_build_object('status', 'already_member');
  end if;
  select max_members into v_max_members from public.groups where id = p_group_id for update;
  if not found then return jsonb_build_object('error', 'Group not found'); end if;
  select count(*) into v_member_count from public.group_members where group_id = p_group_id;
  if v_member_count >= v_max_members then return jsonb_build_object('error', 'This group is full'); end if;
  insert into public.group_members (group_id, user_id, role) values (p_group_id, p_user_id, 'member');
  return jsonb_build_object('status', 'added');
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Log in to manage members'); end if;
  if not exists (
    select 1 from public.group_members mine
    where mine.group_id = p_group_id and mine.user_id = auth.uid() and mine.role in ('owner', 'admin')
  ) then
    return jsonb_build_object('error', 'Only a group owner or admin can remove people');
  end if;
  if exists (
    select 1 from public.group_members target
    where target.group_id = p_group_id and target.user_id = p_user_id and target.role = 'owner'
  ) then
    return jsonb_build_object('error', 'The group owner cannot be removed');
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  return jsonb_build_object('status', 'removed');
end;
$$;

-- A private group never allows self-joining; its manager must add the profile.
create or replace function public.join_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count integer; v_max integer; v_private boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join'; end if;
  select max_members, is_private into v_max, v_private from public.groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if v_private then raise exception 'This private group requires an invitation from its owner'; end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) then return; end if;
  select count(*)::integer into v_count from public.group_members where group_id = p_group_id;
  if v_count >= v_max then raise exception 'Group is full (max %)', v_max; end if;
  insert into public.group_members (group_id, user_id) values (p_group_id, auth.uid());
end;
$$;

revoke all on function public.get_direct_message_inbox() from public;
revoke all on function public.get_direct_messages(uuid) from public;
revoke all on function public.get_group_conversations() from public;
revoke all on function public.get_group_messages(uuid) from public;
revoke all on function public.get_group_members(uuid) from public;
revoke all on function public.search_group_invitees(uuid, text) from public;
revoke all on function public.add_group_member(uuid, uuid) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.join_group(uuid) from public;
grant execute on function public.get_direct_message_inbox() to authenticated;
grant execute on function public.get_direct_messages(uuid) to authenticated;
grant execute on function public.get_group_conversations() to authenticated;
grant execute on function public.get_group_messages(uuid) to authenticated;
grant execute on function public.get_group_members(uuid) to authenticated;
grant execute on function public.search_group_invitees(uuid, text) to authenticated;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.join_group(uuid) to authenticated;

do $$
begin
  if to_regclass('public.group_members') is not null and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end;
$$;
