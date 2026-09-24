(function(){
  const stateKey='evenitNavigation';
  const pages=new Set(['home','discover','groups','notifications','messages','profile','saved','settings','scan']);
  let currentRoute;
  let replaying=false;
  let transition=0;

  const snapshot=route=>route?{
    kind:route.kind,
    page:route.page,
    tab:route.tab,
    planId:route.planId,
    profileId:route.profileId,
    from:route.from?snapshot(route.from):undefined
  }:null;

  function pageRoute(page,tab){
    return {kind:'page',page:pages.has(page)?page:'home',tab:page==='profile'?(tab||'your-plans'):undefined};
  }

  function routeFromHash(){
    const parts=window.location.hash.replace(/^#/,'').split('/').map(part=>{
      try{return decodeURIComponent(part)}catch{return part}
    });
    if(parts[0]==='insights'&&parts[1])return{kind:'insights',planId:parts[1],from:pageRoute('home')};
    if(parts[0]==='public-profile'&&parts[1])return{kind:'public-profile',profileId:parts[1],from:pageRoute('home')};
    if(parts[0]==='event'&&parts[1])return{kind:'public-event',planId:parts[1],from:pageRoute('home')};
    if(parts[0]==='profile'&&parts[1])return pageRoute('profile',parts[1]);
    return pageRoute(parts[0]);
  }

  function routeHash(route){
    if(route.kind==='insights')return`#insights/${encodeURIComponent(route.planId)}`;
    if(route.kind==='public-profile')return`#public-profile/${encodeURIComponent(route.profileId)}`;
    if(route.kind==='public-event')return`#event/${encodeURIComponent(route.planId)}`;
    if(route.page==='profile'&&route.tab&&route.tab!=='your-plans')return`#profile/${encodeURIComponent(route.tab)}`;
    return`#${route.page||'home'}`;
  }

  function routeUrl(route){
    const url=new URL(window.location.href);
    url.hash=routeHash(route).slice(1);
    return url.href;
  }

  function sameRoute(first,second){
    return JSON.stringify(snapshot(first))===JSON.stringify(snapshot(second));
  }

  function appState(route){return{[stateKey]:true,route:snapshot(route)}}

  function pushRoute(route){
    route=snapshot(route);
    const storedRoute=window.history.state?.route;
    if(sameRoute(route,storedRoute||currentRoute)&&!window.history.state?.evenitAppView)return;
    if(route.kind==='page')window.evenitSharedLinks?.clearPending();
    transition++;
    currentRoute=route;
    window.history.pushState(appState(route),'',routeUrl(route));
  }

  function replayClick(element){
    if(!element)return false;
    replaying=true;
    try{element.click()}finally{replaying=false}
    return true;
  }

  function closeMobileMenu(){
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
  }

  function profileTabElement(tab){
    const buttons=[...document.querySelectorAll('.profile-tabs button')];
    return buttons.find(button=>profileTabName(button)===(tab==='plans'?'your-plans':tab));
  }

  function activatePage(route,done){
    const expected=transition;
    const link=document.querySelector(`[data-page="${route.page}"]`);
    if(!link){
      // Settings and Saved are opened from Profile's menu rather than the
      // permanent dock. They still need to restore correctly on Back/Forward.
      if(typeof window.setPage==='function')window.setPage(route.page);
      if(done)setTimeout(()=>{if(expected===transition)done()},0);
      return;
    }
    closeMobileMenu();
    replayClick(link);
    if(route.page==='profile'&&route.tab&&route.tab!=='your-plans'){
      setTimeout(()=>{if(expected!==transition)return;replayClick(profileTabElement(route.tab));if(done)done()},0);
    }else if(done)setTimeout(()=>{if(expected===transition)done()},0);
  }

  function matchingElement(attribute,value){
    return[...document.querySelectorAll(`[${attribute}]`)].find(element=>element.getAttribute(attribute)===value);
  }

  function activateRoute(route,done){
    const expected=transition;
    if(!route){if(done)done();return}
    if(route.kind==='page'){activatePage(route,done);return}
    if(route.kind==='public-event'){
      if(window.evenitSharedLinks)window.evenitSharedLinks.open({kind:'event',id:route.planId});
      else if(typeof window.openEvenitPublicEvent==='function')window.openEvenitPublicEvent(route.planId,{restore:true});
      if(done)setTimeout(done,0);
      return;
    }
    if(route.kind==='public-profile'){
      if(window.evenitSharedLinks)window.evenitSharedLinks.open({kind:'profile',id:route.profileId});
      else if(typeof window.openEvenitPublicProfile==='function')window.openEvenitPublicProfile(route.profileId,{restore:true});
      if(done)setTimeout(done,0);
      return;
    }
    activateRoute(route.from||pageRoute('home'),()=>{
      const retry=attempt=>{
        if(expected!==transition)return;
        const target=route.kind==='insights'?matchingElement('data-insights-id',route.planId):matchingElement('data-public-profile-id',route.profileId)||matchingElement('data-profile-id',route.profileId);
        if(target){replayClick(target);if(done)done();return}
        if(attempt<12)setTimeout(()=>retry(attempt+1),100);
        else if(done)done();
      };
      retry(0);
    });
  }

  function renderRoute(route){
    currentRoute=snapshot(route||pageRoute('home'));
    transition++;
    activateRoute(currentRoute);
  }

  function goBack(){
    if(currentRoute&&currentRoute.kind==='page'&&currentRoute.page==='home'&&(!currentRoute.tab||currentRoute.tab==='your-plans'))return;
    if(window.history.state?.[stateKey])window.history.back();
    else renderRoute(currentRoute?.from||pageRoute('profile'));
  }

  function profileTabName(button){
    const tab=button.dataset.profileTab;
    if(tab)return tab==='plans'?'your-plans':tab;
    const text=button.textContent.toLowerCase();
    return text.includes('joined')?'joined':text.includes('saved')?'saved':text.includes('lived')?'lived':'your-plans';
  }

  window.addEventListener('popstate',event=>{
    const route=event.state?.[stateKey]&&event.state.route||routeFromHash();
    if(event.state?.evenitAppView){currentRoute=snapshot(route);transition++;return;}
    renderRoute(route);
  });

  document.addEventListener('click',event=>{
    if(replaying)return;

    const back=event.target.closest('.back-link');
    if(back&&!window.history.state?.evenitAppView){event.preventDefault();event.stopImmediatePropagation();goBack();return}

    const insights=event.target.closest('[data-insights-id]');
    if(insights){pushRoute({kind:'insights',planId:insights.dataset.insightsId,from:currentRoute||pageRoute('home')});return}

    const publicProfile=event.target.closest('[data-public-profile-id],[data-profile-id]');
    if(publicProfile){
      pushRoute({kind:'public-profile',profileId:publicProfile.dataset.publicProfileId||publicProfile.dataset.profileId,from:currentRoute||pageRoute('home')});
      return;
    }

    const tab=event.target.closest('.profile-tabs button');
    if(tab){pushRoute(pageRoute('profile',profileTabName(tab)));return}

    const nav=event.target.closest('[data-page]');
    if(nav){event.preventDefault();closeMobileMenu();pushRoute(pageRoute(nav.dataset.page));return}

    const discoverLink=event.target.closest('.rail-heading a');
    if(discoverLink){event.preventDefault();closeMobileMenu();pushRoute(pageRoute('discover'));}
  },true);

  const initialRoute=routeFromHash();
  currentRoute=snapshot(initialRoute);
  window.history.replaceState(appState(initialRoute),'',routeUrl(initialRoute));
  if(initialRoute.page!=='home'||initialRoute.kind!=='page')setTimeout(()=>renderRoute(initialRoute),0);
})();
