import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('Saved and joined collections survive corrupt or incompatible local storage',()=>{
  const context=vm.createContext({localStorage:{getItem:()=>'{bad json'}});
  vm.runInContext(extract('function readStoredIds(',"let savedEventIds="),context);
  for(const value of ['{bad json','null','{}','false','[1,null,"event-one","event-one"]']){
    context.localStorage.getItem=()=>value;
    assert.deepEqual([...context.readStoredIds('saved')],value.startsWith('[1')?['event-one']:[]);
  }
  context.localStorage.getItem=()=>{throw new Error('Storage unavailable')};
  assert.equal(context.readStoredIds('saved').size,0);
});

function liveHarness({page='messages',group=false,direct=false}={}){
  const pending=new Map();
  const calls=[];
  let nextId=0;
  const context=vm.createContext({
    document:{querySelector:()=>({dataset:{page}})},
    pageView:{hidden:false,querySelector:selector=>selector==='[data-group-thread]'?group:selector==='.direct-message-page'?direct:false},
    activeInsightsPlanId:null,
    setTimeout:callback=>{const id=++nextId;pending.set(id,callback);return id},
    clearTimeout:id=>pending.delete(id),
    window:{evenitActiveGroupId:group?'group-one':null,refreshEvenitGroupThread:()=>calls.push('group-thread'),refreshEvenitDirectThread:()=>calls.push('direct-thread')},
    loadPlansPreservingHostWorkspace:()=>calls.push('plans'),
    renderDiscover:()=>calls.push('discover'),
    renderInsights:()=>calls.push('insights'),
    loadAftermathFeed:()=>calls.push('aftermath'),
    renderNotifications:()=>calls.push('notifications'),
    loadMessageInbox:()=>calls.push('inbox'),
    loadGroups:()=>calls.push('groups'),
    refreshMessageUnreadState:()=>calls.push('unread-state')
  });
  vm.runInContext(extract('const evenitLiveRefreshTimers=', 'function subscribeToEvenitLiveUpdates('),context);
  return {calls,schedule:kind=>context.scheduleEvenitLiveRefresh(kind),flush(){for(const callback of [...pending.values()])callback()}};
}

test('A burst of plan, direct-message and group updates does not discard other refreshes',()=>{
  const app=liveHarness();
  app.schedule('plans');app.schedule('messages');app.schedule('groups');app.flush();
  assert.deepEqual(app.calls,['plans','inbox','groups']);
});

test('Repeated events debounce only their own update category',()=>{
  const app=liveHarness();
  app.schedule('plans');app.schedule('messages');app.schedule('plans');app.flush();
  assert.equal(app.calls.filter(call=>call==='plans').length,1);
  assert.equal(app.calls.filter(call=>call==='inbox').length,1);
});

test('Live group messages update the thread without rebuilding its draft or manager',()=>{
  const app=liveHarness({group:true});
  app.schedule('groups');app.flush();
  assert.deepEqual(app.calls,['group-thread']);
});

test('Live direct messages refresh the conversation rather than replacing it with the inbox',()=>{
  const app=liveHarness({direct:true});
  app.schedule('messages');app.flush();
  assert.deepEqual(app.calls,['direct-thread']);
});
