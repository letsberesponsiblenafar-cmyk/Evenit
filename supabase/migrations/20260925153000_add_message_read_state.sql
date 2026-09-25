-- Persist unread state so message badges and filters reflect real activity.
alter table public.direct_messages
  add column if not exists read_at timestamptz;

alter table public.group_members
  add column if not exists last_read_at timestamptz not null default now();

create index if not exists direct_messages_unread_idx
  on public.direct_messages (recipient_id, sender_id, created_at desc)
  where read_at is null;

create index if not exists group_messages_unread_idx
  on public.group_messages (group_id, created_at desc);

-- PostgreSQL requires dropping functions when their table return shape changes.
drop function if exists public.get_direct_message_inbox();
create function public.get_direct_message_inbox()
returns table(
  other_id uuid,
  username text,
  full_name text,
  avatar_url text,
  last_body text,
  last_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
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
         latest.body, latest.created_at, latest.sender_id,
         (
           select count(*)
           from public.direct_messages unread
           where unread.sender_id = latest.other_id
             and unread.recipient_id = auth.uid()
             and unread.read_at is null
         ) as unread_count
  from latest
  join public.profiles p on p.id = latest.other_id
  order by latest.created_at desc;
$$;

create or replace function public.mark_direct_conversation_read(p_other_user_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_count bigint;
begin
  if auth.uid() is null then raise exception 'Log in to read messages'; end if;
  update public.direct_messages
  set read_at = now()
  where sender_id = p_other_user_id
    and recipient_id = auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists public.get_group_conversations();
create function public.get_group_conversations()
returns table(
  id uuid,
  name text,
  description text,
  max_members integer,
  member_count bigint,
  viewer_role text,
  last_body text,
  last_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.description, g.max_members,
         (select count(*) from public.group_members members where members.group_id = g.id),
         mine.role,
         latest.body,
         latest.created_at,
         latest.user_id,
         (
           select count(*)
           from public.group_messages unread
           where unread.group_id = g.id
             and unread.user_id <> auth.uid()
             and unread.created_at > mine.last_read_at
         ) as unread_count
  from public.groups g
  join public.group_members mine on mine.group_id = g.id and mine.user_id = auth.uid()
  left join lateral (
    select m.body, m.created_at, m.user_id
    from public.group_messages m
    where m.group_id = g.id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  order by coalesce(latest.created_at, g.created_at) desc;
$$;

create or replace function public.mark_group_conversation_read(p_group_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in to read messages'; end if;
  update public.group_members
  set last_read_at = now()
  where group_id = p_group_id
    and user_id = auth.uid()
    and exists (
      select 1 from public.group_messages unread
      where unread.group_id = p_group_id
        and unread.user_id <> auth.uid()
        and unread.created_at > public.group_members.last_read_at
    );
  return found;
end;
$$;

revoke all on function public.get_direct_message_inbox() from public;
revoke all on function public.mark_direct_conversation_read(uuid) from public;
revoke all on function public.get_group_conversations() from public;
revoke all on function public.mark_group_conversation_read(uuid) from public;
grant execute on function public.get_direct_message_inbox() to authenticated;
grant execute on function public.mark_direct_conversation_read(uuid) to authenticated;
grant execute on function public.get_group_conversations() to authenticated;
grant execute on function public.mark_group_conversation_read(uuid) to authenticated;
