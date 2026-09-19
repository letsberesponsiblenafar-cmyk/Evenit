-- Resolve membership without recursively applying the membership table's RLS.
-- The caller can ask only about their own membership in a specific group.
create or replace function public.current_group_role(p_group_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select gm.role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = auth.uid();
$$;
revoke all on function public.current_group_role(uuid) from public;
grant execute on function public.current_group_role(uuid) to anon, authenticated;

drop policy if exists "Groups are visible to members" on public.groups;
create policy "Groups are visible to members" on public.groups for select using (
  not is_private or owner_id = auth.uid() or public.current_group_role(id) is not null
);

drop policy if exists "Members can view membership" on public.group_members;
create policy "Members can view membership" on public.group_members for select to authenticated using (
  public.current_group_role(group_id) is not null
);

-- Membership insertion must go through the capacity/privacy-aware RPCs. The
-- old insert policy let callers choose their own role and ignored privacy.
drop policy if exists "Users can join groups" on public.group_members;

drop policy if exists "Members can leave groups" on public.group_members;
create policy "Members can leave groups" on public.group_members for delete to authenticated using (
  role <> 'owner' and (user_id = auth.uid() or public.current_group_role(group_id) = 'owner')
);

drop policy if exists "Members can view messages" on public.group_messages;
create policy "Members can view messages" on public.group_messages for select to authenticated using (
  public.current_group_role(group_id) is not null
);
drop policy if exists "Members can send messages" on public.group_messages;
create policy "Members can send messages" on public.group_messages for insert to authenticated with check (
  user_id = auth.uid() and public.current_group_role(group_id) is not null
);

-- Realtime checks SELECT policies even when messages are sent/read via RPCs.
drop policy if exists "Participants can read direct messages" on public.direct_messages;
create policy "Participants can read direct messages" on public.direct_messages for select to authenticated using (
  auth.uid() = sender_id or auth.uid() = recipient_id
);

create or replace function public.add_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_max_members integer; v_member_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Log in to manage members'); end if;
  select g.max_members into v_max_members from public.groups g where g.id = p_group_id for update;
  if not found then return jsonb_build_object('error', 'Group not found'); end if;
  if coalesce(public.current_group_role(p_group_id), '') not in ('owner', 'admin') then
    return jsonb_build_object('error', 'Only a group owner or admin can add people');
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return jsonb_build_object('error', 'Profile not found');
  end if;
  if exists (select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_user_id) then
    return jsonb_build_object('status', 'already_member');
  end if;
  select count(*) into v_member_count from public.group_members gm where gm.group_id = p_group_id;
  if v_member_count >= v_max_members then return jsonb_build_object('error', 'This group is full'); end if;
  insert into public.group_members (group_id, user_id, role) values (p_group_id, p_user_id, 'member');
  return jsonb_build_object('status', 'added');
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Log in to manage members'); end if;
  perform 1 from public.groups g where g.id = p_group_id for update;
  if not found then return jsonb_build_object('error', 'Group not found'); end if;
  if coalesce(public.current_group_role(p_group_id), '') not in ('owner', 'admin') then
    return jsonb_build_object('error', 'Only a group owner or admin can remove people');
  end if;
  if exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_user_id and gm.role = 'owner'
  ) then
    return jsonb_build_object('error', 'The group owner cannot be removed');
  end if;
  delete from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_user_id;
  return jsonb_build_object('status', 'removed');
end;
$$;

create or replace function public.join_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count integer; v_max integer; v_private boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join'; end if;
  select g.max_members, g.is_private into v_max, v_private from public.groups g where g.id = p_group_id for update;
  if not found then raise exception 'Group not found'; end if;
  if public.current_group_role(p_group_id) is not null then return; end if;
  if v_private then raise exception 'This private group requires an invitation from its owner'; end if;
  select count(*)::integer into v_count from public.group_members gm where gm.group_id = p_group_id;
  if v_count >= v_max then raise exception 'Group is full (max %)', v_max; end if;
  insert into public.group_members (group_id, user_id) values (p_group_id, auth.uid());
end;
$$;

-- Show the newest conversation window, in reading order, after 100 messages.
create or replace function public.get_group_messages(p_group_id uuid)
returns table(id uuid, user_id uuid, body text, created_at timestamptz, username text, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  with recent as (
    select m.id, m.user_id, m.body, m.created_at
    from public.group_messages m
    where m.group_id = p_group_id and public.current_group_role(p_group_id) is not null
    order by m.created_at desc, m.id desc
    limit 100
  )
  select m.id, m.user_id, m.body, m.created_at, p.username, p.full_name, p.avatar_url
  from recent m join public.profiles p on p.id = m.user_id
  order by m.created_at asc, m.id asc;
$$;

create or replace function public.get_plan_verification_details(p_plan_id uuid)
returns table(user_id uuid, full_name text, username text, college text, enrollment_id text, granted_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.plans plan where plan.id = p_plan_id and plan.user_id = auth.uid()) then
    raise exception 'Only the event organizer can view verification details';
  end if;
  return query
  select pva.user_id, p.full_name, p.username, p.college, p.enrollment_id, pva.granted_at
  from public.plan_verification_access pva
  join public.profiles p on p.id = pva.user_id
  where pva.plan_id = p_plan_id;
end;
$$;

revoke all on function public.add_group_member(uuid, uuid) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.join_group(uuid) from public;
revoke all on function public.get_group_messages(uuid) from public;
revoke all on function public.get_plan_verification_details(uuid) from public;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.get_group_messages(uuid) to authenticated;
grant execute on function public.get_plan_verification_details(uuid) to authenticated;
