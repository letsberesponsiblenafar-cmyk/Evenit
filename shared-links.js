(function(){
  const supportedKinds=new Set(['event','profile']);
  let pendingRoute=null;
  let authSettled=false;
  let currentUser=null;
  let handlers=null;
  let activeRouteKey='';

  function safeDecode(value){
    try{return decodeURIComponent(value)}catch{return value}
  }

  function normalizeRoute(route){
    const kind=route?.kind==='public-event'?'event':route?.kind==='public-profile'?'profile':route?.kind;
    const id=String(route?.id||route?.planId||route?.profileId||'').trim();
    if(!supportedKinds.has(kind)||!id||id.length>200)return null;
    return {kind,id};
  }

  function routeFromUrl(value=window.location.href){
    try{
      const url=new URL(value,window.location.href);
      const parts=url.hash.replace(/^#/,'').split('/').map(safeDecode);
      if(parts[0]==='event'&&parts[1])return normalizeRoute({kind:'event',id:parts[1]});
      if(parts[0]==='public-profile'&&parts[1])return normalizeRoute({kind:'profile',id:parts[1]});
      // Keep older links useful if a previously shared URL used query params.
      const eventId=url.searchParams.get('event')||url.searchParams.get('plan');
      const profileId=url.searchParams.get('profile');
      if(eventId)return normalizeRoute({kind:'event',id:eventId});
      if(profileId)return normalizeRoute({kind:'profile',id:profileId});
    }catch{}
    return null;
  }

  function canonicalUrl(kind,id,value=window.location.href){
    const route=normalizeRoute({kind,id});
    if(!route)return '';
    const url=new URL(value,window.location.href);
    url.search='';
    url.hash=route.kind==='profile'?`public-profile/${encodeURIComponent(route.id)}`:`event/${encodeURIComponent(route.id)}`;
    return url.href;
  }

  async function dispatch(){
    if(!pendingRoute||!authSettled||!handlers)return false;
    const route={...pendingRoute};
    if(!currentUser){handlers.requestLogin?.(route);return false;}
    const key=`${route.kind}:${route.id}`;
    if(activeRouteKey===key){pendingRoute=null;handlers.clearLogin?.();return true;}
    pendingRoute=null;
    activeRouteKey=key;
    handlers.clearLogin?.();
    try{
      if(route.kind==='event')await handlers.openEvent?.(route.id);
      else await handlers.openProfile?.(route.id);
      return true;
    }catch(error){
      activeRouteKey='';
      pendingRoute=route;
      handlers.showError?.(error,route);
      return false;
    }
  }

  function open(route){
    const normalized=normalizeRoute(route);
    if(!normalized)return Promise.resolve(false);
    const key=`${normalized.kind}:${normalized.id}`;
    if(activeRouteKey===key&&!pendingRoute)return Promise.resolve(true);
    activeRouteKey='';
    pendingRoute=normalized;
    return dispatch();
  }

  function clearPending(){
    pendingRoute=null;
    activeRouteKey='';
    handlers?.clearLogin?.();
  }

  function setAuth(user){
    currentUser=user||null;
    authSettled=true;
    return dispatch();
  }

  function setHandlers(nextHandlers){
    handlers=nextHandlers;
    return dispatch();
  }

  pendingRoute=routeFromUrl();
  window.addEventListener('popstate',()=>{
    const route=routeFromUrl();
    if(route)open(route);
    else clearPending();
  });
  window.evenitSharedLinks={
    canonicalUrl,
    clearPending,
    dispatch,
    open,
    pending:()=>pendingRoute?{...pendingRoute}:null,
    routeFromUrl,
    setAuth,
    setHandlers
  };
})();
