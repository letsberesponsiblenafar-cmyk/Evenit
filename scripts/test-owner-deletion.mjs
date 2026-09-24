import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../refinement.css',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260924151500_add_owner_deletion_controls.sql',import.meta.url),'utf8');

test('only organizers can delete events before their scheduled start',()=>{
  assert.match(migration,/auth\.uid\(\) = user_id and starts_at is not null and starts_at > now\(\)/);
  assert.match(migration,/if v_owner_id <> auth\.uid\(\)/);
  assert.match(migration,/if v_starts_at is null or v_starts_at <= now\(\)/);
  assert.match(app,/eventCanBeDeleted=Boolean\(plan\.starts_at&&new Date\(plan\.starts_at\)\.getTime\(\)>Date\.now\(\)\)/);
  assert.match(app,/rpc\('delete_future_plan'/);
  assert.match(app,/id="delete-upcoming-event"/);
});

test('aftermath authors receive an owner menu that deletes database and storage data',()=>{
  assert.match(app,/currentUser\?\.id===post\.author_id/);
  assert.match(app,/data-aftermath-menu/);
  assert.match(app,/data-aftermath-delete/);
  assert.match(app,/rpc\('delete_aftermath_post'/);
  assert.match(app,/storage\.from\('aftermath-media'\)\.remove\(paths\)/);
  assert.match(migration,/delete from public\.plan_aftermath_posts where id = p_post_id/);
  assert.match(migration,/'media_urls', v_media_urls/);
  assert.match(css,/\.aftermath-menu-popover/);
  assert.match(css,/\.destructive-confirmation-card/);
});
