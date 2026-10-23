-- Run after the migration, or append to the migration in a rollback-only validation.
-- No synthetic users, events, answers or passes survive this transaction.
begin;
create temporary table edit_cases(name text primary key, id uuid, payload jsonb);
grant all on edit_cases to authenticated;
insert into edit_cases(name,id) values ('owner',gen_random_uuid()),('guest',gen_random_uuid()),('other',gen_random_uuid()),('event',gen_random_uuid());
create function pg_temp.assert_edit(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Event edit regression: %',message; end if; end $$;
create function pg_temp.expect_edit_error(sql text, fragment text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(fragment in sqlerrm)=0 then raise exception 'Unexpected error: % (wanted %)',sqlerrm,fragment; end if;
    return;
  end;
  raise exception 'Expected rejection: %',fragment;
end $$;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated','evenit-edit-'||id::text||'@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username','edit_'||replace(id::text,'-',''),'full_name','Event edit regression'),now(),now()
from edit_cases where name in ('owner','guest','other');
insert into public.plans(id,user_id,title,location,starts_at,caption,category,tagline,cover_style,capacity)
select e.id,o.id,'Original title','Original place',now()+interval '2 days','Original description','Social','Original tagline','aurora',3
from edit_cases e,edit_cases o where e.name='event' and o.name='owner';
insert into public.plan_join_questions(plan_id,prompt,position,required,question_type,options)
select id,'Original question?',1,true,'short_text','[]' from edit_cases where name='event';
insert into public.plan_members(plan_id,user_id,status)
select e.id,g.id,'confirmed' from edit_cases e,edit_cases g where e.name='event' and g.name in ('guest','other');
insert into public.plan_entry_passes(plan_id,user_id)
select e.id,g.id from edit_cases e,edit_cases g where e.name='event' and g.name='guest' on conflict do nothing;
insert into edit_cases(name,payload) select 'token',to_jsonb(entry_token) from public.plan_entry_passes where plan_id=(select id from edit_cases where name='event') and user_id=(select id from edit_cases where name='guest');
insert into public.plan_join_answers(plan_id,question_id,user_id,answer)
select q.plan_id,q.id,g.id,'Original guest answer' from public.plan_join_questions q,edit_cases g where q.plan_id=(select id from edit_cases where name='event') and g.name='guest';

create function pg_temp.edit_event(changes jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$
declare p jsonb;
begin
  select payload||changes into p from edit_cases where name='base';
  return public.update_plan_details((p->>'id')::uuid,p->>'title',p->>'location',(p->>'starts_at')::timestamptz,
    p->>'caption',p->>'category',(p->>'requires_college_verification')::boolean,p->'questions',
    (p->>'latitude')::double precision,(p->>'longitude')::double precision,p->>'tagline',p->>'image_url',p->>'cover_style',(p->>'capacity')::integer);
end $$;

select set_config('request.jwt.claim.sub',(select id::text from edit_cases where name='owner'),true);
set local role authenticated;
insert into edit_cases(name,payload) values('base',public.get_plan_for_edit((select id from edit_cases where name='event')));


select pg_temp.assert_edit(pg_temp.edit_event('{"title":"Updated title","location":"New place","latitude":34,"longitude":74,"cover_style":"ocean","capacity":2}') ->>'title'='Updated title','owner can edit all details');
select pg_temp.assert_edit((select latitude=34 from public.plan_locations where plan_id=(select id from edit_cases where name='event')),'location saved');
select pg_temp.assert_edit((select count(*)=1 from public.get_plan_join_questions((select id from edit_cases where name='event'))),'unchanged question kept');
select pg_temp.expect_edit_error('select pg_temp.edit_event(''{"capacity":1}'')','Guest limit');
select pg_temp.expect_edit_error('select pg_temp.edit_event(''{"starts_at":"2000-01-01T00:00:00Z"}'')','future event');
select pg_temp.expect_edit_error('select pg_temp.edit_event(''{"latitude":91,"longitude":74}'')','coordinates');
select pg_temp.expect_edit_error('select pg_temp.edit_event(''{"title":"Should not persist","questions":[{"prompt":"bad","type":"multiple_choice","options":["one"]}]}'' )','Choice questions');
select pg_temp.assert_edit((select title='Updated title' from public.plans where id=(select id from edit_cases where name='event')),'invalid questions roll back whole event');
select pg_temp.expect_edit_error('update public.plans set title=''Bypass'' where id=(select id from edit_cases where name=''event'')','permission denied');
select pg_temp.expect_edit_error('update public.plan_locations set latitude=0 where plan_id=(select id from edit_cases where name=''event'')','permission denied');
select pg_temp.expect_edit_error('select pg_temp.edit_event(''{"questions":[{"id":"00000000-0000-0000-0000-000000000001","prompt":"Foreign question","type":"short_text"}]}'' )','question list has changed');

select pg_temp.edit_event(jsonb_build_object('questions',(select jsonb_build_array((payload->'questions'->0)||'{"prompt":"Revised question?"}'::jsonb) from edit_cases where name='base')));
select pg_temp.assert_edit((select prompt='Revised question?' from public.get_plan_join_questions((select id from edit_cases where name='event'))),'new question revision is visible');
select pg_temp.assert_edit(public.get_plan_insights((select id from edit_cases where name='event'))::text like '%Original question?%','historic answer keeps original wording');
select pg_temp.assert_edit(public.get_plan_insights((select id from edit_cases where name='event'))::text like '%Original guest answer%','historic answer preserved');
update edit_cases set payload=public.get_plan_for_edit((select id from edit_cases where name='event')) where name='base';
select pg_temp.edit_event('{"questions":[],"latitude":null,"longitude":null}');
select pg_temp.assert_edit((select count(*)=0 from public.get_plan_join_questions((select id from edit_cases where name='event'))),'removed question no longer asked');
select pg_temp.assert_edit((select count(*)=0 from public.plan_locations where plan_id=(select id from edit_cases where name='event')),'coordinates cleared');

select set_config('request.jwt.claim.sub',(select id::text from edit_cases where name='guest'),true);
select pg_temp.expect_edit_error('select pg_temp.edit_event()','Only the organizer');
select pg_temp.expect_edit_error('select public.get_plan_for_edit((select id from edit_cases where name=''event''))','Only the organizer');
select pg_temp.assert_edit((select entry_token=(select payload#>>'{}' from edit_cases where name='token') from public.get_my_entry_passes() where plan_id=(select id from edit_cases where name='event')),'existing QR token unchanged');
select pg_temp.assert_edit((select status='confirmed' from public.join_plan((select id from edit_cases where name='event'))),'archived questions do not block joining');

reset role;
update public.plans set starts_at=clock_timestamp()-interval '1 second' where id=(select id from edit_cases where name='event');
select set_config('request.jwt.claim.sub',(select id::text from edit_cases where name='owner'),true);
set local role authenticated;
select pg_temp.expect_edit_error('select pg_temp.edit_event()','Editing closes');
select pg_temp.expect_edit_error('select public.get_plan_for_edit((select id from edit_cases where name=''event''))','Editing closes');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_edit_error('select pg_temp.edit_event()','Only the organizer');
reset role;
select 'Event-edit integration checks passed; all test data rolled back' as result;
rollback;
