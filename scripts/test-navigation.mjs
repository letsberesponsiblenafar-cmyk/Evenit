import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../navigation.js',import.meta.url),'utf8');

function harness(hash='#home'){
  const events={window:new Map(),document:new Map()};
  const timers=[];
  const visits=[];
  const elements=[];
  const location=new URL(`https://example.test/Evenit/${hash}`);
  const listen=(target,type,handler)=>{
    if(!events[target].has(type))events[target].set(type,[]);
    events[target].get(type).push(handler);
  };
  const emit=(target,type,event)=>{
    for(const handler of events[target].get(type)||[])handler(event);
  };
  function element(attributes,textContent=''){
    const node={
      textContent,
      dataset:Object.fromEntries(Object.entries(attributes).map(([key,value])=>[key.replace(/^data-/,'').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value])),
      getAttribute:key=>attributes[key]??null,
      closest(selector){
        if(selector==='.profile-tabs button')return attributes['data-profile-tab']?this:null;
        if(selector.split(',').some(part=>part.startsWith('[')&&attributes[part.slice(1,-1)]!==undefined))return this;
        return null;
      },
      click(){
        const event={target:this,preventDefault(){},stopImmediatePropagation(){this.stopped=true}};
        emit('document','click',event);
        if(!event.stopped)visits.push(attributes);
      }
    };
    elements.push(node);
    return node;
  }
  function select(selector){
    if(selector==='.profile-tabs button')return elements.filter(node=>node.dataset.profileTab);
    const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return match?elements.filter(node=>node.getAttribute(match[1])!==null&&(match[2]===undefined||node.getAttribute(match[1])===match[2])):[];
  }
  const history={
    state:null,
    pushState(state,title,url){this.state=state;location.href=String(url)},
    replaceState(state,title,url){this.state=state;location.href=String(url)},
    back(){visits.push({back:true})}
  };
  const window={location,history,addEventListener:(type,handler)=>listen('window',type,handler)};
  const document={querySelector:selector=>select(selector)[0]||null,querySelectorAll:select,addEventListener:(type,handler)=>listen('document',type,handler)};
  for(const page of ['home','discover','messages','profile'])element({'data-page':page});
  const context=vm.createContext({window,document,URL,setTimeout:callback=>timers.push(callback)});
  vm.runInContext(source,context);
  return{
    element,visits,history,window,
    pop(route,extra={}){
      const state={evenitNavigation:true,route,...extra};
      history.state=state;
      location.hash=route.kind==='insights'?`insights/${route.planId}`:route.page||'home';
      emit('window','popstate',{state});
    },
    flush(){let count=0;while(timers.length){assert.ok(count++<50,'Navigation retries must be bounded');timers.shift()()}},
    clearVisits(){visits.length=0}
  };
}

test('Back restores the saved Insights origin and Lived On tab',()=>{
  const app=harness();
  app.element({'data-profile-tab':'lived'},'Lived On');
  app.element({'data-insights-id':'plan-one'});
  app.pop({kind:'insights',planId:'plan-one',from:{kind:'page',page:'profile',tab:'lived'}});
  app.flush();
  assert.deepEqual(app.visits,[{'data-page':'profile'},{'data-profile-tab':'lived'},{'data-insights-id':'plan-one'}]);
});

test('A new page click cancels a pending Insights restoration',()=>{
  const app=harness();
  app.pop({kind:'insights',planId:'slow-plan',from:{kind:'page',page:'profile'}});
  app.element({'data-page':'messages'}).click();
  app.element({'data-insights-id':'slow-plan'});
  app.flush();
  assert.ok(!app.visits.some(visit=>visit['data-insights-id']));
  assert.equal(app.history.state.route.page,'messages');
});

test('Pending profile tab activation cannot override a new page',()=>{
  const app=harness();
  app.element({'data-profile-tab':'lived'},'Lived On');
  app.pop({kind:'page',page:'profile',tab:'lived'});
  app.element({'data-page':'discover'}).click();
  app.flush();
  assert.ok(!app.visits.some(visit=>visit['data-profile-tab']));
});

test('Profile tab restoration uses stable data rather than displayed copy',()=>{
  const app=harness();
  app.element({'data-profile-tab':'lived'},'My moments');
  app.pop({kind:'page',page:'profile',tab:'lived'});
  app.flush();
  assert.ok(app.visits.some(visit=>visit['data-profile-tab']==='lived'));
});

test('Malformed shared URL fragments do not crash navigation',()=>{
  const app=harness('#profile/%');
  app.flush();
  assert.equal(app.history.state.route.page,'profile');
});

test('Returning to a nested app view updates the next route origin',()=>{
  const app=harness();
  app.pop({kind:'page',page:'profile',tab:'lived'},{evenitAppView:{type:'public-profile',profileId:'someone'}});
  app.element({'data-insights-id':'next-plan'}).click();
  assert.equal(app.history.state.route.from.page,'profile');
  assert.equal(app.history.state.route.from.tab,'lived');
});
