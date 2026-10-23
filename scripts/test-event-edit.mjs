import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {canEdit,toLocalDateTime,editPayload}=require('../event-model.js');
const {visibleEvents,statusFor}=require('../experience.js');
const now=Date.parse('2026-10-23T10:00:00Z');
const plan={id:'event',user_id:'host',starts_at:new Date(now+86400000).toISOString(),confirmed_count:3};
const values={title:'Updated event',tagline:'A good day',where:'Park',when:new Date(now+2*86400000).toISOString(),caption:'Bring a picnic.',category:'Social',capacity:'5',cover_style:'ocean',requires_college_verification:'on',plan_latitude:'34',plan_longitude:'74'};
test('editing closes at the exact start and requires the owner',()=>{
  assert.equal(canEdit(plan,'host',now),true);
  assert.equal(canEdit(plan,'other',now),false);
  assert.equal(canEdit(plan,null,now),false);
  assert.equal(canEdit({...plan,starts_at:new Date(now).toISOString()},'host',now),false);
  assert.equal(canEdit({...plan,starts_at:null},'host',now),false);
});
test('editing preserves question identities and cover while converting date and optional values',()=>{
  const questions=[{id:'question-1',prompt:'Diet?',type:'short_text',required:false,options:[]}];
  const payload=editPayload(plan,values,questions,'https://example.com/cover.jpg',now);
  assert.equal(payload.p_plan_id,plan.id);assert.deepEqual(payload.p_questions,questions);
  assert.equal(payload.p_image_url,'https://example.com/cover.jpg');assert.equal(payload.p_requires_college_verification,true);
  assert.equal(payload.p_capacity,5);assert.equal(payload.p_latitude,34);
  const cleared=editPayload(plan,{...values,capacity:'',plan_latitude:'',plan_longitude:''},[],null,now);
  assert.equal(cleared.p_capacity,null);assert.equal(cleared.p_latitude,null);assert.equal(cleared.p_image_url,null);
});
test('invalid edits are rejected before upload or database writes',()=>{
  for(const change of [{when:new Date(now).toISOString()},{capacity:'2'},{capacity:'3.5'},{plan_latitude:'NaN'},{plan_latitude:'91'},{plan_longitude:''},{title:''},{caption:''}])assert.throws(()=>editPayload(plan,{...values,...change},[],null,now));
  assert.throws(()=>editPayload(plan,values,[{prompt:'Choice',type:'multiple_choice',options:['One']}],null,now));
});
test('local editor dates round-trip without shifting the event timezone',()=>{
  const date=new Date('2026-11-14T15:45:00Z');
  assert.equal(new Date(toLocalDateTime(date.toISOString())).getTime(),date.getTime());
  assert.equal(toLocalDateTime(null),'');assert.equal(toLocalDateTime('bad'),'');
});
test('discovery filters exclude persisted dismissals, past dates and mismatched categories',()=>{
  const events=[{id:'tomorrow',category:'Social',starts_at:new Date(now+86400000).toISOString()},{id:'today',category:'Creative',starts_at:new Date(now+3600000).toISOString()},{id:'past',category:'Social',starts_at:new Date(now-3600000).toISOString()},{id:'hidden',category:'Social',starts_at:plan.starts_at,swipeInterest:false}];
  assert.deepEqual(visibleEvents(events,{now}).map(x=>x.id),['today','tomorrow']);
  assert.deepEqual(visibleEvents(events,{now,category:'Social'}).map(x=>x.id),['tomorrow']);
  assert.deepEqual(visibleEvents(events,{now,hidden:new Set(['tomorrow'])}).map(x=>x.id),['today']);
  assert.deepEqual(visibleEvents(events,{now,date:'today'}).map(x=>x.id),['today']);
  assert.equal(visibleEvents(events,{now,date:'all'}).length,3);
});
test('host, pass holders, pending guests and past events retain a useful action',()=>{
  assert.equal(statusFor(plan,'host',now).kind,'host');
  assert.equal(statusFor({...plan,membershipStatus:'confirmed'},'guest',now).kind,'pass');
  assert.equal(statusFor({...plan,membershipStatus:'interested'},'guest',now).action,'View details');
  assert.equal(statusFor({...plan,starts_at:new Date(now-1).toISOString()},'guest',now).kind,'details');
});
