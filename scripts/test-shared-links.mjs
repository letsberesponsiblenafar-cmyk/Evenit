import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../shared-links.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const mobileBuilder=readFileSync(new URL('./build-mobile.mjs',import.meta.url),'utf8');

function harness(url){
  const calls=[];
  const listeners=new Map();
  const window={
    location:new URL(url),
    addEventListener(type,handler){listeners.set(type,handler)}
  };
  vm.runInContext(source,vm.createContext({window,URL,encodeURIComponent,decodeURIComponent}));
  const handlers={
    openEvent:id=>calls.push(['event',id]),
    openProfile:id=>calls.push(['profile',id]),
    requestLogin:route=>calls.push(['login',route.kind,route.id]),
    clearLogin:()=>calls.push(['clear'])
  };
  return {calls,handlers,links:window.evenitSharedLinks};
}

test('signed-out event link requests login and resumes the exact event after auth',async()=>{
  const app=harness('https://evenit.example/#event/event-123');
  await app.links.setHandlers(app.handlers);
  await app.links.setAuth(null);
  assert.deepEqual(app.calls,[['login','event','event-123']]);
  await app.links.setAuth({id:'viewer'});
  assert.deepEqual(app.calls,[['login','event','event-123'],['clear'],['event','event-123']]);
});

test('signed-in profile link opens only the addressed profile',async()=>{
  const app=harness('https://evenit.example/#public-profile/person-456');
  await app.links.setAuth({id:'viewer'});
  await app.links.setHandlers(app.handlers);
  assert.deepEqual(app.calls,[['clear'],['profile','person-456']]);
});

test('canonical share URLs are unique, clean, and safely encoded',()=>{
  const app=harness('https://evenit.example/Evenit/?old=value#discover');
  assert.equal(app.links.canonicalUrl('event','plan/a'),'https://evenit.example/Evenit/#event/plan%2Fa');
  assert.equal(app.links.canonicalUrl('profile','user name'),'https://evenit.example/Evenit/#public-profile/user%20name');
});

test('legacy query-param shares still resolve to their exact destination',()=>{
  const eventApp=harness('https://evenit.example/Evenit/?event=old-event#home');
  const profileApp=harness('https://evenit.example/Evenit/?profile=old-profile#home');
  assert.equal(JSON.stringify(eventApp.links.pending()),JSON.stringify({kind:'event',id:'old-event'}));
  assert.equal(JSON.stringify(profileApp.links.pending()),JSON.stringify({kind:'profile',id:'old-profile'}));
});

test('the deep-link controller loads before navigation and ships in Android assets',()=>{
  assert.ok(index.indexOf('shared-links.js')<index.indexOf('navigation.js'));
  assert.match(mobileBuilder,/'shared-links\.js'/);
});
