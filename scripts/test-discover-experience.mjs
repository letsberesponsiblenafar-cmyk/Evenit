import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../refinement.css',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260924143000_add_discover_search.sql',import.meta.url),'utf8');
const callback=readFileSync(new URL('../auth-callback.html',import.meta.url),'utf8');

test('Discover search returns separately rendered events, profiles, and aftermath',()=>{
  assert.match(app,/rpc\('search_discover'/);
  assert.match(app,/discoverResultHeading\('Events'/);
  assert.match(app,/discoverResultHeading\('Profiles'/);
  assert.match(app,/discoverResultHeading\('Aftermath'/);
  assert.match(app,/data-discover-event/);
  assert.match(app,/data-public-profile-id/);
  assert.match(migration,/jsonb_build_object\(/);
  assert.match(migration,/'events'/);
  assert.match(migration,/'profiles'/);
  assert.match(migration,/'aftermath'/);
  assert.match(migration,/a\.body/);
  assert.match(migration,/array_to_string\(pr\.interests/);
});

test('profile menu uses non-overlapping copy columns and selected theme state',()=>{
  assert.match(app,/class="profile-menu-copy"/);
  assert.match(app,/class="profile-menu-icon"/);
  assert.match(css,/grid-template-columns:\s*38px minmax\(0,1fr\) 18px/);
  assert.match(css,/\.profile-menu-copy strong/);
  assert.match(css,/button\.is-selected \.profile-menu-check::before/);
});

test('dark mode defines one full semantic palette for application surfaces',()=>{
  assert.match(css,/--ui-bg:\s*#100e14/);
  assert.match(css,/--ui-primary:\s*#b985f2/);
  assert.match(css,/--ui-teal:\s*#65d7ca/);
  assert.match(css,/--ui-coral:\s*#ff9d8d/);
  assert.match(css,/\.feed-area,.page-view,.right-rail/);
  assert.match(css,/\.workspace-surface,.aftermath-page-surface/);
});

test('signup uses a stable callback that shows successful and unsuccessful states',()=>{
  assert.match(app,/new URL\('auth-callback\.html',document\.baseURI\)\.href/);
  assert.match(callback,/Email verified/);
  assert.match(callback,/Verification unsuccessful/);
  assert.match(callback,/exchangeCodeForSession/);
  assert.match(callback,/detectSessionInUrl:true/);
});
