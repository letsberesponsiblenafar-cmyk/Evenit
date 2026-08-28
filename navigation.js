(function(){
  const stateKey='evenitNavigation';
  const pages=new Set(['home','discover','notifications','messages','profile','settings']);
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
    const parts=decodeURIComponent(window.location.hash.replace(/^#/,'')).split('/');
    if(parts[0]==='insights'&&parts[1])return{kind:'insights',planId:parts[1],from:pageRoute('home')};
    if(parts[0]==='public-profile'&&parts[1])return{kind:'public-profile',profileId:parts[1],from:pageRoute('home')};
    if(parts[0]==='profile'&&parts[1])return pageRoute('profile',parts[1]);
    return pageRoute(parts[0]);
  }

  function routeHash(route){
    if(route.kind==='insights')return`#insights/${encodeURIComponent(route.planId)}`;
    if(route.kind==='public-profile')return`#public-profile/${encodeURIComponent(route.profileId)}`;
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
    if(sameRoute(route,currentRoute))return;
    currentRoute=route;
    window.history.pushState(appState(route),'',routeUrl(route));
  }

  function replayClick(element){
    if(!element)return false;
    replaying=true;
    element.click();
    replaying=false;
    return true;
  }

  function closeMobileMenu(){
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
  }

  function profileTabElement(tab){
    const buttons=[...document.querySelectorAll('.profile-tabs button')];
    return buttons.find(button=>{
      const text=button.textContent.toLowerCase();
      return tab==='joined'?text.includes('joined'):tab==='saved'?text.includes('saved'):text.includes('your plans');
    });
  }

  function activatePage(route,done){
    const link=document.querySelector(`[data-page="${route.page}"]`);
    if(!link){if(done)done();return}
    closeMobileMenu();
    replayClick(link);
    if(route.page==='profile'&&route.tab&&route.tab!=='your-plans'){
      setTimeout(()=>{replayClick(profileTabElement(route.tab));if(done)done()},0);
    }else if(done)setTimeout(done,0);
  }

  function matchingElement(attribute,value){
    return[...document.querySelectorAll(`[${attribute}]`)].find(element=>element.getAttribute(attribute)===value);
  }

  function activateRoute(route,done){
    if(!route){if(done)done();return}
    if(route.kind==='page'){activatePage(route,done);return}
    activateRoute(route.from||pageRoute('home'),()=>{
      const expected=++transition;
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
    else renderRoute(pageRoute('home'));
  }

  function profileTabName(button){
    const text=button.textContent.toLowerCase();
    return text.includes('joined')?'joined':text.includes('saved')?'saved':'your-plans';
  }

  window.addEventListener('popstate',event=>{
    const route=event.state?.[stateKey]?.route||routeFromHash();
    renderRoute(route);
  });

  document.addEventListener('click',event=>{
    if(replaying)return;

    const back=event.target.closest('.back-link');
    if(back){event.preventDefault();event.stopImmediatePropagation();goBack();return}

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
