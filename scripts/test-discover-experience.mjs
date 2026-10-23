import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../refinement.css',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260924143000_add_discover_search.sql',import.meta.url),'utf8');
const callback=readFileSync(new URL('../auth-callback.html',import.meta.url),'utf8');

test('Discover search returns separately rendered events, profiles, and aftermath',()=>{
  assert.match(app,/rpc\('search_discover'/);
  assert.match(app,/\['events','Events',events\]/);
  assert.match(app,/\['profiles','Profiles',profiles\]/);
  assert.match(app,/\['aftermath','Aftermath',aftermath\]/);
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
  assert.match(app,/EVENIT_PUBLIC_ORIGIN='https:\/\/evenit\.vercel\.app'/);
  assert.match(app,/emailRedirectTo=`\$\{EVENIT_PUBLIC_ORIGIN\}\/auth-callback\.html`/);
  assert.match(callback,/Email verified/);
  assert.match(callback,/Verification unsuccessful/);
  assert.match(callback,/exchangeCodeForSession/);
  assert.match(callback,/detectSessionInUrl:true/);
});
import vm from 'node:vm';

function searchHarness(){
  const feed={hidden:false},results={hidden:true,innerHTML:'',isConnected:true},pending=[],rendered=[],timers=[];
  const context=vm.createContext({document:{querySelector:selector=>selector==='#discover-default'?feed:results},supabase:{rpc:()=>new Promise(resolve=>pending.push(resolve))},attachAftermathMedia:async items=>items,renderDiscoverSearchResults:(query)=>rendered.push(query),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}});
  const functions=app.slice(app.indexOf('async function runDiscoverSearch(query)'),app.indexOf('\nrenderDiscover=function(){',app.indexOf('async function runDiscoverSearch(query)')));
  vm.runInContext("let discoverSearchRequest=0,discoverSearchTimer=0,discoverSearchTab='events';"+functions,context);
  return{context,feed,results,pending,rendered,timers,run:query=>vm.runInContext(`runDiscoverSearch(${JSON.stringify(query)})`,context)};
}

test('a late search cannot overwrite newer results or a cleared query',async()=>{
  const h=searchHarness();const old=h.run('old');const latest=h.run('latest');
  h.pending[1]({data:{},error:null});await latest;
  h.pending[0]({data:{},error:null});await old;assert.deepEqual(h.rendered,['latest']);
  const late=h.run('late');await h.run('');h.pending[2]({data:{},error:null});await late;
  assert.deepEqual(h.rendered,['latest']);assert.equal(h.results.hidden,true);assert.equal(h.feed.hidden,false);
});

test('typing invalidates in-flight search before debounce, and detached results stay untouched',async()=>{
  const h=searchHarness();const old=h.run('old');vm.runInContext("queueDiscoverSearch('new')",h.context);h.pending[0]({data:{},error:null});await old;assert.equal(h.rendered.length,0);
  const detached=h.run('detached');h.results.isConnected=false;h.pending[1]({data:{},error:null});await detached;assert.equal(h.rendered.length,0);
});
