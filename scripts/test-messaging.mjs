import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const app=read('app.js');
const css=read('refinement.css');
const migration=read('supabase/migrations/20260925153000_add_message_read_state.sql');
const artwork=read('scripts/generate-ios-artwork.ps1');

test('message filters live in the top-right menu and use real unread counts',()=>{
  assert.doesNotMatch(app,/Your circles are up to date/);
  assert.match(app,/id="message-filter-panel"/);
  assert.match(app,/data-message-filter="all"/);
  assert.match(app,/data-message-filter="unread"/);
  assert.match(app,/conversation\.unread_count/);
  assert.doesNotMatch(app,/message\.hidden=mobileMessageFilter==='unread'&&index>0/);
});

test('direct and group conversations persist and clear recipient read state',()=>{
  assert.match(migration,/direct_messages[\s\S]*read_at timestamptz/);
  assert.match(migration,/group_members[\s\S]*last_read_at timestamptz/);
  assert.match(migration,/mark_direct_conversation_read/);
  assert.match(migration,/mark_group_conversation_read/);
  assert.match(migration,/unread_count bigint/g);
  assert.match(app,/mark_direct_conversation_read/);
  assert.match(app,/mark_group_conversation_read/);
});

test('realtime messaging updates badges without a text notification toast',()=>{
  assert.match(app,/refreshMessageUnreadState/);
  assert.match(app,/message-unread-badge/);
  assert.match(app,/nav-message-unread/);
  assert.doesNotMatch(app,/showToast\('You have a new message'\)/);
});

test('conversation and group UI use the refined message system',()=>{
  for(const selector of ['\.messages-inbox','\.message-filter-panel','\.message-unread-badge','\.conversation-header','\.direct-thread','\.group-conversation-header'])assert.match(css,new RegExp(selector));
  assert.match(app,/conversation-person/);
  assert.match(app,/group-details-panel/);
});

test('small app icons use a high-contrast purple e on white',()=>{
  assert.match(artwork,/\$white = .*#FFFFFF/);
  assert.match(artwork,/favicon-192\.png[^\n]+-BackgroundColor \$white -ForegroundColor \$purple -Thicken/);
  assert.match(artwork,/AppIcon-512@2x\.png[^\n]+-BackgroundColor \$white -ForegroundColor \$purple -Thicken/);
});
