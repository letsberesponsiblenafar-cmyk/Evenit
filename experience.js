(function(root){
  function visibleEvents(items,{category='all',date='upcoming',hidden=new Set(),now=Date.now()}={}){
    return items.filter(item=>{
      if(hidden.has(item.id)||item.swipeInterest===false)return false;
      if(category!=='all'&&item.category!==category)return false;
      const start=new Date(item.starts_at);
      if(date!=='all'&&(!Number.isFinite(start.getTime())||start.getTime()<=now))return false;
      if(date==='today'&&start.toDateString()!==new Date(now).toDateString())return false;
      if(date==='week'&&start.getTime()>now+7*86400000)return false;
      return true;
    }).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  }
  function statusFor(post,userId,now=Date.now()){
    if(post.user_id===userId&&userId)return {label:'You’re hosting',action:'Manage event',kind:'host'};
    if(post.membershipStatus==='confirmed')return {label:'Pass confirmed',action:'View entry pass',kind:'pass'};
    if(post.membershipStatus==='interested')return {label:'Request sent',action:'View details',kind:'details'};
    if(post.membershipStatus==='waitlisted')return {label:'On the waitlist',action:'View details',kind:'details'};
    if(Date.parse(post.starts_at)<=now)return {label:'Event has started',action:'View event',kind:'details'};
    return {label:'Open for requests',action:'Interested',kind:'request'};
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={visibleEvents,statusFor};return;}
  root.EvenitExperience={visibleEvents,statusFor};
  const app=root.evenitApp;
  const discoverState={query:'',category:'all',date:'upcoming',tab:'events'};
  let homeDate='upcoming',toastTimer;
  const hiddenIds=new Set();
  const hiddenKey=()=>`evenit-dismissed-events:${app.currentUser?.id||'guest'}`;
  let hiddenScope='';
  function loadHidden(){
    if(hiddenScope===hiddenKey())return;
    hiddenScope=hiddenKey();hiddenIds.clear();
    try{const data=JSON.parse(localStorage.getItem(hiddenScope)||'[]');if(Array.isArray(data))data.forEach(id=>hiddenIds.add(id));}catch{}
  }
  function persistHidden(){try{localStorage.setItem(hiddenKey(),JSON.stringify([...hiddenIds]));}catch{}}
  app.showToast=function(message,{action,label='Undo',duration=5500}={}){
    const toast=document.querySelector('#toast');if(!toast)return;
    clearTimeout(toastTimer);toast.replaceChildren();
    const text=document.createElement('span');text.textContent=message;toast.append(text);
    if(action){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await action();}catch(error){app.showToast(error.message||'Please try again.');}};toast.append(button);}
    toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),action?10000:duration);
  };
  function emptyState(title,copy,button='Discover events',action='discover'){
    return `<div class="experience-empty"><span aria-hidden="true">✦</span><h3>${app.escapeHtml(title)}</h3><p>${app.escapeHtml(copy)}</p><button type="button" data-experience-page="${action}">${app.escapeHtml(button)}</button></div>`;
  }
  function eventRow(post){
    const state=statusFor(post,app.currentUser?.id);
    return `<article class="event-list-row"><button class="event-list-main" data-event-details="${app.escapeHtml(post.id)}"><span class="event-date-tile"><b>${app.escapeHtml(new Date(post.starts_at).toLocaleDateString(undefined,{day:'2-digit'}))}</b><small>${app.escapeHtml(new Date(post.starts_at).toLocaleDateString(undefined,{month:'short'}))}</small></span><span><small>${app.escapeHtml(post.category||'Event')}</small><strong>${app.escapeHtml(post.title)}</strong><span>${app.escapeHtml(app.formatDateTime(post.starts_at))}</span><span>${app.escapeHtml(post.location||'')}</span><em>${app.escapeHtml(state.label)}</em></span></button><button class="event-bookmark ${app.savedEventIds.has(post.id)?'is-saved':''}" data-event-save="${app.escapeHtml(post.id)}" aria-pressed="${app.savedEventIds.has(post.id)}" aria-label="${app.savedEventIds.has(post.id)?'Unsave':'Save'} ${app.escapeHtml(post.title)}">${app.icon('bookmark')||'♡'}</button></article>`;
  }
  function renderRadar(){
    const rail=document.querySelector('.trending');if(!rail)return;
    const nearby=visibleEvents(app.posts,{hidden:hiddenIds}).slice(0,3);
    rail.innerHTML=`<div class="rail-heading"><span>Coming up</span><button type="button" data-experience-page="discover">Explore all</button></div>${nearby.length?nearby.map(post=>`<button class="radar-event" type="button" data-event-details="${app.escapeHtml(post.id)}"><small>${app.escapeHtml(post.category)}</small><strong>${app.escapeHtml(post.title)}</strong><span>${app.escapeHtml(app.formatDateTime(post.starts_at))}</span></button>`).join(''):'<p class="rail-empty">New upcoming plans will appear here.</p>'}`;
  }
  app.renderHomeEventCards=function(){
    if(!app.postsEl)return;loadHidden();
    const items=visibleEvents(app.posts,{date:homeDate,hidden:hiddenIds});
    app.postsEl.innerHTML=`<div class="event-board-toolbar"><div><p class="overline">Make time for something good</p><h2>${homeDate==='upcoming'?'Coming up':'All events'}</h2></div><div class="experience-segment" aria-label="Event dates"><button data-home-date="upcoming" aria-pressed="${homeDate==='upcoming'}">Upcoming</button><button data-home-date="all" aria-pressed="${homeDate==='all'}">All</button></div></div>`+items.map(post=>{
      const index=app.posts.indexOf(post),state=statusFor(post,app.currentUser?.id);
      const cover=app.planCoverStyles.has(post.coverStyle)?post.coverStyle:'aurora';
      return `<article class="home-event-card" data-plan-id="${app.escapeHtml(post.id)}" data-plan-index="${index}"><header class="home-event-host"><button class="home-event-profile" data-profile-id="${app.escapeHtml(post.user_id)}" aria-label="Open ${app.escapeHtml(post.name)}'s profile"><img src="${app.escapeHtml(post.avatar)}" alt="" loading="lazy"><span><strong>${app.escapeHtml(post.user)}</strong><small>${app.escapeHtml(post.category)}</small></span></button><div class="event-card-tools"><button class="event-bookmark ${app.savedEventIds.has(post.id)?'is-saved':''}" data-event-save="${app.escapeHtml(post.id)}" aria-pressed="${app.savedEventIds.has(post.id)}" aria-label="${app.savedEventIds.has(post.id)?'Unsave':'Save'} ${app.escapeHtml(post.title)}">${app.icon('bookmark')||'♡'}</button><button class="home-event-share" data-event-share="${app.escapeHtml(post.id)}" aria-label="Share ${app.escapeHtml(post.title)}">${app.icon('share')}</button></div></header><button class="home-event-art event-art-button" data-event-details="${app.escapeHtml(post.id)}" data-cover-style="${app.escapeHtml(cover)}" aria-label="View ${app.escapeHtml(post.title)}"><span>${app.escapeHtml(post.category)}</span>${post.imageUrl?`<img class="home-event-cover-image" src="${app.escapeHtml(post.imageUrl)}" alt="" loading="lazy">`:''}<h2>${app.escapeHtml(post.title)}</h2><p>${app.escapeHtml(post.location)}</p></button><div class="home-event-content">${post.tagline?`<p class="home-event-tagline">${app.escapeHtml(post.tagline)}</p>`:''}<p class="home-event-when">${app.escapeHtml(app.formatDateTime(post.starts_at))}</p><div class="home-event-details"><span>${app.escapeHtml(state.label)}</span><span>${post.joinedCount||0}${post.capacity?` / ${post.capacity}`:''} confirmed</span></div><div class="event-card-actions"><button class="event-secondary" data-event-details="${app.escapeHtml(post.id)}">View details</button><button class="home-join-button" data-event-action="${app.escapeHtml(post.id)}" data-action-kind="${state.kind}">${app.escapeHtml(state.action)}</button></div>${!post.membershipStatus&&!post.isOwner?`<button class="event-dismiss" data-event-dismiss="${app.escapeHtml(post.id)}">Not for me</button>`:''}</div></article>`;
    }).join('');
    if(!items.length)app.postsEl.insertAdjacentHTML('beforeend',emptyState('Room for your next plan',homeDate==='upcoming'?'No upcoming events match right now. Explore past moments or start a plan of your own.':'No events to show. Start a plan and bring people together.'));
    renderRadar();
  };
  async function dismiss(post){
    if(app.currentUser){const {error}=await app.supabase.from('plan_swipes').upsert({plan_id:post.id,user_id:app.currentUser.id,interested:false},{onConflict:'plan_id,user_id'});if(error)throw error;}
    post.swipeInterest=false;hiddenIds.add(post.id);persistHidden();app.renderHomeEventCards();
    app.showToast('Event hidden from your suggestions.',{action:async()=>{
      if(app.currentUser){const {error}=await app.supabase.from('plan_swipes').delete().eq('plan_id',post.id).eq('user_id',app.currentUser.id);if(error)throw error;}
      const current=app.posts.find(item=>item.id===post.id);if(current)current.swipeInterest=undefined;
      post.swipeInterest=undefined;hiddenIds.delete(post.id);persistHidden();app.renderHomeEventCards();app.showToast('Event restored.');
    }});
  }
  app.dismissHomePlan=async function(card,index){try{await dismiss(app.posts[index]);}catch(error){app.showToast(`Could not hide this event: ${error.message}`);}};
  app.renderSavedPage=function(){
    const items=app.posts.filter(post=>app.savedEventIds.has(post.id));
    app.pageView.innerHTML=`<div class="page-header"><p class="overline">Make time for these</p><h2>Saved events</h2><p>Saved on this device. Open a plan when you’re ready to join.</p></div><section class="event-list">${items.length?items.map(eventRow).join(''):emptyState('Start your shortlist','Tap the bookmark on an event to keep it here.')}</section>`;
  };
  app.renderSavedCollection=()=>app.renderSavedPage();
  function refreshDiscoverEvents(){
    loadHidden();const list=document.querySelector('#discover-upcoming-list');if(!list)return;
    const items=visibleEvents(app.posts,{category:discoverState.category,date:discoverState.date,hidden:hiddenIds});
    list.innerHTML=items.length?items.map(eventRow).join(''):emptyState('No matching plans','Try another category or a wider date range.','Clear filters','clear-filters');
    const count=document.querySelector('#discover-count');if(count)count.textContent=`${items.length} ${items.length===1?'event':'events'}`;
    renderRadar();
  }
  const existingQueueSearch=app.queueDiscoverSearch;
  app.queueDiscoverSearch=function(query){discoverState.query=String(query||'');existingQueueSearch(query);};
  app.renderDiscover=function(){
    // Realtime refreshes update event rows without replacing the search input,
    // focused filters, or an in-flight search result.
    if(app.pageView.querySelector('[data-discover-experience]')){if(!discoverState.query.trim())refreshDiscoverEvents();return;}
    const categories=[...new Set(app.posts.map(post=>post.category).filter(Boolean))].sort();
    app.pageView.innerHTML=`<section data-discover-experience><header class="discover-experience-heading"><p class="overline">Find your next good day</p><h2>Discover</h2><p>Explore a plan. Meet your people. Keep the memories.</p></header><div class="page-topbar discover-topbar"><label class="topbar-search">${app.icon('search')}<input id="discover-search" type="search" aria-label="Search events, profiles, and aftermath" placeholder="Search events, people, or moments" autocomplete="off" value="${app.escapeHtml(discoverState.query)}"></label></div><section id="discover-default"><div class="discover-browse-tabs experience-segment" role="group" aria-label="Explore"><button data-discover-tab="events" aria-pressed="${discoverState.tab==='events'}">Upcoming plans</button><button data-discover-tab="moments" aria-pressed="${discoverState.tab==='moments'}">Aftermath</button></div><div id="discover-events-panel" ${discoverState.tab==='events'?'':'hidden'}><div class="discover-filters"><label>When<select id="discover-date"><option value="upcoming">Any upcoming date</option><option value="today">Today</option><option value="week">Next 7 days</option><option value="all">Include past events</option></select></label><label>Category<select id="discover-category"><option value="all">All categories</option>${categories.map(category=>`<option value="${app.escapeHtml(category)}">${app.escapeHtml(category)}</option>`).join('')}</select></label></div><p id="discover-count" class="result-count" role="status"></p><div class="event-list" id="discover-upcoming-list"></div></div><div id="discover-moments-panel" ${discoverState.tab==='moments'?'':'hidden'}><div id="discover-aftermath-feed"></div></div></section><section id="discover-results" class="discover-results" aria-live="polite" hidden></section></section>`;
    const input=document.querySelector('#discover-search');input.oninput=()=>app.queueDiscoverSearch(input.value);
    const date=document.querySelector('#discover-date'),category=document.querySelector('#discover-category');
    date.value=discoverState.date;category.value=discoverState.category;
    date.onchange=()=>{discoverState.date=date.value;refreshDiscoverEvents();};category.onchange=()=>{discoverState.category=category.value;refreshDiscoverEvents();};
    refreshDiscoverEvents();
    if(discoverState.tab==='moments')app.loadAftermathFeed(document.querySelector('#discover-aftermath-feed'));
    if(discoverState.query.trim())app.runDiscoverSearch(discoverState.query);
  };
  const previousSettings=app.renderSettingsPanel;
  app.renderSettingsPanel=function(panel){
    if(panel!=='notifications'){previousSettings(panel);return;}
    app.pageView.innerHTML=`<div class="settings-panel"><button class="back-link" data-experience-page="settings">← Settings</button><p class="overline">Stay in the loop</p><h2>Event updates</h2><p>Evenit shows in-app updates about requests, passes and follows. Push notifications and notification preferences are not available yet.</p><button class="event-primary" data-experience-page="notifications">View activity</button></div>`;
  };
  const previousPublicEvent=app.openPublicEventDetails;
  app.openPublicEventDetails=async function(planId,fallback={},options={}){
    await previousPublicEvent(planId,fallback,options);
    const page=app.pageView.querySelector('.public-event-page');if(!page)return;
    const post=app.posts.find(item=>item.id===planId)||fallback;
    const upcoming=Date.parse(post.starts_at)>Date.now();
    page.querySelector('.public-event-kicker').textContent=upcoming?'Upcoming event':'Event moments';
    const lead=page.querySelector('.public-event-lead');if(lead)lead.textContent=upcoming?'The details you need before you make a plan.':'Revisit the event and the moments people shared.';
    if(upcoming)page.querySelector('.public-event-aftermath')?.remove();
    const actions=document.createElement('div');actions.className='public-event-actions';
    if(post.user_id===app.currentUser?.id){actions.innerHTML=`<button class="event-primary" data-event-action="${app.escapeHtml(planId)}" data-action-kind="host">Manage event</button>${upcoming?`<button class="event-secondary" data-edit-event="${app.escapeHtml(planId)}">Edit event</button>`:''}`;}
    else if(post.membershipStatus){const state=statusFor(post,app.currentUser?.id);actions.innerHTML=`<span class="event-state-label">${app.escapeHtml(state.label)}</span>${state.kind==='pass'?`<button class="event-primary" data-event-action="${app.escapeHtml(planId)}" data-action-kind="pass">View entry pass</button>`:''}`;}
    page.querySelector('.public-event-detail-grid')?.after(actions);
  };
  document.addEventListener('click',async event=>{
    const target=event.target.closest('button');if(!target)return;
    try{
      if(target.dataset.homeDate){homeDate=target.dataset.homeDate;app.renderHomeEventCards();return;}
      if(target.dataset.experiencePage){
        if(target.dataset.experiencePage==='clear-filters'){discoverState.category='all';discoverState.date='upcoming';document.querySelector('#discover-date').value='upcoming';document.querySelector('#discover-category').value='all';refreshDiscoverEvents();}
        else app.setPage(target.dataset.experiencePage);return;
      }
      if(target.dataset.discoverTab){
        discoverState.tab=target.dataset.discoverTab;
        document.querySelectorAll('[data-discover-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button===target)));
        document.querySelector('#discover-events-panel').hidden=discoverState.tab!=='events';document.querySelector('#discover-moments-panel').hidden=discoverState.tab!=='moments';
        if(discoverState.tab==='moments')app.loadAftermathFeed(document.querySelector('#discover-aftermath-feed'));return;
      }
      const id=target.dataset.eventSave||target.dataset.eventDetails||target.dataset.eventShare||target.dataset.eventAction||target.dataset.eventDismiss;
      if(!id)return;
      const post=app.posts.find(item=>item.id===id);if(!post)return;
      if(target.dataset.eventSave){
        const saving=!app.savedEventIds.has(id);if(saving)app.savedEventIds.add(id);else app.savedEventIds.delete(id);
        try{localStorage.setItem('evenit-saved-events',JSON.stringify([...app.savedEventIds]));}catch{if(saving)app.savedEventIds.delete(id);else app.savedEventIds.add(id);throw new Error('This device could not save the event. Check browser storage.');}
        document.querySelectorAll('[data-event-save]').forEach(button=>{if(button.dataset.eventSave===id){button.setAttribute('aria-pressed',String(saving));button.classList.toggle('is-saved',saving);button.setAttribute('aria-label',`${saving?'Unsave':'Save'} ${post.title}`);}});
        if(document.querySelector('[data-page="saved"].active')||app.pageView.querySelector('.page-header h2')?.textContent==='Saved events')app.renderSavedPage();
        app.showToast(saving?'Saved on this device.':'Removed from saved events.');return;
      }
      if(target.dataset.eventDetails){await app.openPublicEventDetails(id,post);return;}
      if(target.dataset.eventShare){app.openEvenitShare({type:'event',id,title:post.title,text:`Join me at ${post.title}`});return;}
      if(target.dataset.eventDismiss){target.disabled=true;await dismiss(post);return;}
      if(target.dataset.eventAction){
        if(target.dataset.actionKind==='host')await app.renderInsights(id);
        else if(target.dataset.actionKind==='pass'){
          if(post.entryPass)app.openEntryPass(post,post.entryPass);
          else {const {data,error}=await app.supabase.rpc('get_my_entry_passes');if(error)throw error;const pass=(data||[]).find(item=>item.plan_id===id);if(pass)app.openEntryPass(post,pass);else app.showToast('Your pass is being prepared. Open your agenda for the latest status.');}
        }else if(target.dataset.actionKind==='request')await app.requestPlanInterest(post,target);
        else await app.openPublicEventDetails(id,post);
      }
    }catch(error){target.disabled=false;app.showToast(error.message||'Something went wrong. Please try again.');}
  });
  requestAnimationFrame(()=>{loadHidden();if(app.pageView.hidden)app.renderHomeEventCards();renderRadar();});
})(typeof window!=='undefined'?window:globalThis);
