alter table public.plans add column if not exists requires_college_verification boolean not null default false;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists direct_messages_conversation_idx
  on public.direct_messages (sender_id, recipient_id, created_at desc);

alter table public.direct_messages enable row level security;

create or replace function public.can_message_user(p_other_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_is_private boolean;
begin
  if v_user_id is null or v_user_id = p_other_id then return false; end if;
  select is_private into v_is_private from public.profiles where id = p_other_id;
  if not found then return false; end if;
  if not coalesce(v_is_private, false) then return true; end if;
  return exists (
    select 1 from public.user_follows
    where follower_id = v_user_id and following_id = p_other_id
  );
end;
$$;

create or replace function public.send_direct_message(p_recipient_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sender_id uuid := auth.uid(); v_body text := trim(coalesce(p_body, ''));
begin
  if v_sender_id is null then return jsonb_build_object('error', 'Log in to send a message'); end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then return jsonb_build_object('error', 'Messages must be between 1 and 1000 characters'); end if;
  if not public.can_message_user(p_recipient_id) then
    return jsonb_build_object('error', 'This private profile must approve your follow request before you can message');
  end if;
  insert into public.direct_messages (sender_id, recipient_id, body)
  values (v_sender_id, p_recipient_id, v_body);
  return jsonb_build_object('status', 'sent');
end;
$$;

create or replace function public.get_direct_messages(p_other_id uuid)
returns table (id uuid, sender_id uuid, recipient_id uuid, body text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.can_message_user(p_other_id) then return; end if;
  return query
    select m.id, m.sender_id, m.recipient_id, m.body, m.created_at
    from public.direct_messages m
    where (m.sender_id = v_user_id and m.recipient_id = p_other_id)
       or (m.sender_id = p_other_id and m.recipient_id = v_user_id)
    order by m.created_at asc;
end;
$$;

create or replace function public.notify_local_users_on_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, plan_id, kind, message)
  select p.id, new.user_id, new.id, 'new_plan', 'A new ' || new.category || ' plan is near you: ' || new.title
  from public.profiles p
  where p.id <> new.user_id
    and (
      new.neighborhood is null
      or p.neighborhood = new.neighborhood
      or new.category = any(p.interests)
      or exists (
        select 1 from public.user_follows uf
        where uf.follower_id = p.id and uf.following_id = new.user_id
      )
    );
  return new;
end;
$$;

revoke all on function public.can_message_user(uuid) from public;
revoke all on function public.send_direct_message(uuid, text) from public;
revoke all on function public.get_direct_messages(uuid) from public;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.get_direct_messages(uuid) to authenticated;
