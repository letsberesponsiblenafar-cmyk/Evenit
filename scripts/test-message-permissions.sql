-- Run with `supabase db query --linked --file scripts/test-message-permissions.sql`.
-- Synthetic users and their data exist only inside this rolled-back transaction.
begin;

create temporary table message_test_ids (name text primary key, id uuid not null);
grant all on message_test_ids to authenticated;
insert into message_test_ids values
  ('owner', gen_random_uuid()), ('member', gen_random_uuid()), ('outsider', gen_random_uuid());

create function pg_temp.assert_true(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Message regression: %', p_message; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, 'authenticated', 'authenticated', 'evenit-rollback-' || id::text || '@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username', 'test_' || replace(id::text, '-', ''), 'full_name', 'Evenit rollback ' || name), now(), now()
from message_test_ids;

-- Exercise the same signed-in role and JWT identity used by PostgREST.
select set_config('request.jwt.claim.sub', (select id::text from message_test_ids where name = 'owner'), true);
set local role authenticated;
insert into message_test_ids values ('private', public.create_group('Rollback private', '', true, 2));
insert into message_test_ids values ('public', public.create_group('Rollback public', '', false, 2));
select pg_temp.assert_true(
  (public.add_group_member((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'member'))->>'status') = 'added',
  'owner can add a private-group member');
select pg_temp.assert_true(
  (public.add_group_member((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'member'))->>'status') = 'already_member',
  'repeating an invitation is idempotent');
select pg_temp.assert_true(
  public.add_group_member((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'outsider')) ? 'error',
  'group capacity is enforced');
select pg_temp.assert_true(
  public.remove_group_member((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'owner')) ? 'error',
  'group owner cannot be removed by RPC');
delete from public.group_members where group_id = (select id from message_test_ids where name = 'private') and user_id = auth.uid();
select pg_temp.assert_true(public.current_group_role((select id from message_test_ids where name = 'private')) = 'owner', 'raw DELETE cannot orphan the owner');
select pg_temp.assert_true((select count(*) = 2 from public.group_members where group_id = (select id from message_test_ids where name = 'private')), 'owner membership SELECT does not recurse');

-- Guest membership, sending, and the direct-message inbox work under RLS.
reset role;
select set_config('request.jwt.claim.sub', (select id::text from message_test_ids where name = 'member'), true);
set local role authenticated;
select public.join_group((select id from message_test_ids where name = 'public'));
select public.join_group((select id from message_test_ids where name = 'public'));
select pg_temp.assert_true((select count(*) = 1 from public.groups where id = (select id from message_test_ids where name = 'private')), 'added member can open the private group');
insert into public.group_messages (group_id, user_id, body)
values ((select id from message_test_ids where name = 'private'), auth.uid(), 'Member reply');
select pg_temp.assert_true((select count(*) = 1 from public.group_messages where group_id = (select id from message_test_ids where name = 'private')), 'added member can read group messages');
select pg_temp.assert_true(
  public.add_group_member((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'outsider')) ? 'error',
  'ordinary member cannot invite other users');
select pg_temp.assert_true(
  public.remove_group_member((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'owner')) ? 'error',
  'ordinary member cannot remove other users');
do $$
begin
  begin
    insert into public.group_messages (group_id, user_id, body)
    values ((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'owner'), 'Forged sender');
    raise exception 'Message regression: member forged a different sender';
  exception when insufficient_privilege then null; end;
end;
$$;
select pg_temp.assert_true(
  (public.send_direct_message((select id from message_test_ids where name = 'owner'), 'Direct test message')->>'status') = 'sent',
  'profile-to-profile message sends');

reset role;
select set_config('request.jwt.claim.sub', (select id::text from message_test_ids where name = 'owner'), true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 1 from public.direct_messages where sender_id = (select id from message_test_ids where name = 'member')), 'DM recipient can SELECT the row required by realtime');
select pg_temp.assert_true((select count(*) = 1 from public.get_direct_message_inbox() where other_id = (select id from message_test_ids where name = 'member') and last_body = 'Direct test message'), 'received DM is in inbox');
select pg_temp.assert_true((public.send_direct_message((select id from message_test_ids where name = 'member'), 'Direct reply')->>'status') = 'sent', 'DM recipient can reply');

-- After 100 messages, the latest reply must remain visible.
insert into public.group_messages (group_id, user_id, body, created_at)
select (select id from message_test_ids where name = 'private'), auth.uid(), 'bulk' || lpad(n::text, 3, '0'), now() + n * interval '1 second'
from generate_series(1, 101) n;
select pg_temp.assert_true((select count(*) = 100 from public.get_group_messages((select id from message_test_ids where name = 'private'))), 'group history is bounded at the latest 100 messages');
select pg_temp.assert_true((select array_agg(body) = array(select 'bulk' || lpad(n::text, 3, '0') from generate_series(2, 101) n) from public.get_group_messages((select id from message_test_ids where name = 'private'))), 'newest 100 messages are returned in chronological order');

-- A third profile must not see the private group, members, messages, or DMs.
reset role;
select set_config('request.jwt.claim.sub', (select id::text from message_test_ids where name = 'outsider'), true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.groups where id = (select id from message_test_ids where name = 'private')), 'outsider cannot see private group');
select pg_temp.assert_true((select count(*) = 0 from public.group_members where group_id = (select id from message_test_ids where name = 'private')), 'outsider cannot list private members');
select pg_temp.assert_true((select count(*) = 0 from public.group_messages where group_id = (select id from message_test_ids where name = 'private')), 'outsider cannot SELECT group messages');
select pg_temp.assert_true((select count(*) = 0 from public.get_group_messages((select id from message_test_ids where name = 'private'))), 'outsider cannot read group RPC');
select pg_temp.assert_true((select count(*) = 0 from public.get_group_members((select id from message_test_ids where name = 'private'))), 'outsider cannot read member RPC');
select pg_temp.assert_true((select count(*) = 0 from public.get_group_conversations()), 'outsider has no group inbox entries');
select pg_temp.assert_true((select count(*) = 0 from public.direct_messages where sender_id in (select id from message_test_ids)), 'outsider cannot read others direct messages');
select pg_temp.assert_true((select count(*) = 0 from public.get_direct_messages((select id from message_test_ids where name = 'owner'))), 'DM RPC does not expose conversations to a third person');
select pg_temp.assert_true((select count(*) = 0 from public.get_direct_message_inbox()), 'outsider DM inbox is empty');
select pg_temp.assert_true(public.add_group_member((select id from message_test_ids where name = 'private'), auth.uid()) ? 'error', 'outsider cannot invite themselves');
do $$
begin
  begin
    insert into public.group_members (group_id, user_id, role)
    values ((select id from message_test_ids where name = 'private'), auth.uid(), 'owner');
    raise exception 'Message regression: outsider forged owner membership';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.group_messages (group_id, user_id, body)
    values ((select id from message_test_ids where name = 'private'), auth.uid(), 'Uninvited message');
    raise exception 'Message regression: outsider posted to private group';
  exception when insufficient_privilege then null; end;
  begin
    perform public.join_group((select id from message_test_ids where name = 'private'));
    raise exception 'Message regression: outsider joined a private group';
  exception when raise_exception then
    if sqlerrm <> 'This private group requires an invitation from its owner' then raise; end if;
  end;
  begin
    perform public.join_group((select id from message_test_ids where name = 'public'));
    raise exception 'Message regression: outsider joined a full group';
  exception when raise_exception then
    if sqlerrm <> 'Group is full (max 2)' then raise; end if;
  end;
end;
$$;

-- Verify organizer-only access to explicitly shared college details.
reset role;
insert into message_test_ids values ('plan', gen_random_uuid());
insert into public.plans (id, user_id, title, location, starts_at, requires_college_verification, neighborhood)
values ((select id from message_test_ids where name = 'plan'), (select id from message_test_ids where name = 'owner'), 'Rollback verification test', 'Test venue', now(), true, 'rollback-test');
select set_config('request.jwt.claim.sub', (select id::text from message_test_ids where name = 'member'), true);
set local role authenticated;
update public.profiles set college = 'Rollback college', enrollment_id = 'PRIVATE-TEST' where id = auth.uid();
select public.grant_plan_verification_access((select id from message_test_ids where name = 'plan'));
reset role;
select set_config('request.jwt.claim.sub', (select id::text from message_test_ids where name = 'owner'), true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 1 from public.get_plan_verification_details((select id from message_test_ids where name = 'plan')) where enrollment_id = 'PRIVATE-TEST'), 'organizer can read consented verification details without ambiguous columns');
select pg_temp.assert_true((public.remove_group_member((select id from message_test_ids where name = 'private'), (select id from message_test_ids where name = 'member'))->>'status') = 'removed', 'owner can remove a member');
reset role;
select set_config('request.jwt.claim.sub', (select id::text from message_test_ids where name = 'member'), true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.group_messages where group_id = (select id from message_test_ids where name = 'private')), 'removed member loses direct read access');
select pg_temp.assert_true((select count(*) = 0 from public.get_group_messages((select id from message_test_ids where name = 'private'))), 'removed member loses RPC read access');
select pg_temp.assert_true((select count(*) = 2 from public.direct_messages where sender_id = auth.uid() or recipient_id = auth.uid()), 'DM sender and recipient can both select their conversation');
do $$
begin
  begin
    insert into public.group_messages (group_id, user_id, body)
    values ((select id from message_test_ids where name = 'private'), auth.uid(), 'Removed message');
    raise exception 'Message regression: removed member can still post';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_plan_verification_details((select id from message_test_ids where name = 'plan'));
    raise exception 'Message regression: guest read organizer-only verification data';
  exception when raise_exception then
    if sqlerrm <> 'Only the event organizer can view verification details' then raise; end if;
  end;
end;
$$;

reset role;
rollback;
select 'PASS: member/outsider permissions, direct inboxes, newest group history, removal, and verification. All fixtures rolled back.' as result;
