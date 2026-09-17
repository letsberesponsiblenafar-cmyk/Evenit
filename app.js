(function(){
let posts = [
  {user:'maya.rose', name:'Maya Rose', avatar:'https://i.pravatar.cc/100?img=25', time:'2h', image:'pic-one', category:'Outdoors', title:'Sunset picnic', location:'Prospect Park · Today, 5:00 PM', caption:'The blanket is packed and the sky is looking promising. Bringing snacks, sketchbooks, and room for a few more. Who’s in? ✦', likes:128, comments:14, joined:false},
  {user:'ari.makes', name:'Ari M.', avatar:'https://i.pravatar.cc/100?img=47', time:'5h', image:'pic-two', category:'Social', title:'Sunday people', location:'Red Hook · Sun, 10:30 AM', caption:'A little walk, a really good coffee, and some new neighborhood friends. Low-pressure plans are the best plans.', likes:86, comments:9, joined:false}
];
const postsEl=document.querySelector('#posts');
const hasSupabase=window.SUPABASE_URL&&!window.SUPABASE_URL.startsWith('YOUR_')&&window.SUPABASE_ANON_KEY&&!window.SUPABASE_ANON_KEY.startsWith('YOUR_');
const supabase=hasSupabase&&window.supabase?.createClient?window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY):null;
let currentUser=null;
let savedEventIds=new Set(JSON.parse(localStorage.getItem('evenit-saved-events')||'[]'));
let activeSavedCollection='plans';
let joinedEventIds=new Set(JSON.parse(localStorage.getItem('evenit-joined-events')||'[]'));
let adminContent={};
let activeInsightsPlanId=null;
let currentLocation=null;
let collegeVerificationReady=false;
let navHistory=[];
function pushNav(from){navHistory.push(from);if(navHistory.length>10)navHistory.shift()}
function pushAppView(view){window.history.pushState({...window.history.state,evenitAppView:view},'',window.location.href)}
function insightsReturnState(planId){return{...(window.history.state||{}),evenitNavigation:true,route:{kind:'insights',planId,from:{kind:'page',page:'profile',tab:'your-plans'}}}}
function insightsUrl(planId){const url=new URL(window.location.href);url.hash=`insights/${encodeURIComponent(planId)}`;return url.href}
function pushHostWorkspaceView(view){const state=insightsReturnState(view.planId);const url=insightsUrl(view.planId);window.history.replaceState(state,'',url);window.history.pushState({...state,evenitAppView:view},'',url)}
function goBack(){if(window.history.state?.evenitAppView||window.history.state?.evenitNavigation){window.history.back();return}const prev=navHistory.pop();if(prev==='home'||!prev)goHome();else setPage(prev)}
window.addEventListener('popstate',event=>{const view=event.state?.evenitAppView;if(!view)return;if(view.type==='agenda')showJoinedPage({restore:true});if(view.type==='agenda-detail')showAgendaDetail(view.planId,{restore:true});if(view.type==='plan-request'){const post=posts.find(item=>item.id===view.planId);if(post)openPlanRequestPage(post,{restore:true});}if(view.type==='host-request-review')openHostRequestReview(view.planId,view.userId,{restore:true});if(view.type==='host-scan')openScanModal(view.planId,{restore:true});});
function goHome(){
  setInsightsDockScan(null);
  navHistory=[];
  pageView.hidden=true;
  homeElements.forEach(e=>e.hidden=false);
  document.querySelectorAll('[data-page]').forEach(l=>l.classList.remove('active'));
  document.querySelector('[data-page="home"]')?.classList.add('active');
  updateMobileHeader('home');
  window.scrollTo({top:0,behavior:'smooth'});
}
const analyticsSessionId=localStorage.getItem('evenit-analytics-session')||(()=>{const id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem('evenit-analytics-session',id);return id})();
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const formatPostTime=value=>{if(!value)return'New';const date=new Date(value);const seconds=Math.max(1,Math.floor((Date.now()-date.getTime())/1000));if(seconds<60)return'just now';if(seconds<3600)return`${Math.floor(seconds/60)}m`;if(seconds<86400)return`${Math.floor(seconds/3600)}h`;if(seconds<604800)return`${Math.floor(seconds/86400)}d`;return date.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
const formatDateTime=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not scheduled';
const rpcRow=data=>Array.isArray(data)?data[0]:data;
async function recordPlanInteraction(planId,kind){if(!supabase||!planId)return;await supabase.rpc('record_plan_interaction',{p_plan_id:planId,p_kind:kind,p_session_id:analyticsSessionId})}
async function trackPostImpressions(){if(!window.IntersectionObserver)return;const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){recordPlanInteraction(entry.target.dataset.planId,'impression');observer.unobserve(entry.target)}}),{threshold:.45});document.querySelectorAll('[data-plan-id].post').forEach(post=>observer.observe(post))}
 function updateMobileHeader(page){const activePage=page||document.querySelector('[data-page].active')?.dataset.page||'home';const mobileLogin=document.querySelector('#open-login-mobile');const mobileMenu=document.querySelector('#mobile-menu');if(mobileLogin)mobileLogin.hidden=Boolean(currentUser);if(mobileMenu)mobileMenu.hidden=activePage!=='profile';}
 function updateAccountUI(){const loginButton=document.querySelector('#open-login');const navAvatar=document.querySelector('#nav-avatar');if(currentUser){const name=currentUser.user_metadata?.full_name||currentUser.email?.split('@')[0]||'Evenit member';const avatar=currentUser.user_metadata?.avatar_url;loginButton.hidden=true;navAvatar.textContent=name.slice(0,2).toUpperCase();if(avatar)navAvatar.innerHTML=`<img src="${avatar}" alt="">`}else{loginButton.hidden=false;navAvatar.textContent='EV'}updateMobileHeader()}
const mapUrl=place=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
async function refreshCollegeVerification(){if(!supabase||!currentUser){collegeVerificationReady=false;return false}const {data}=await supabase.from('profiles').select('college,enrollment_id').eq('id',currentUser.id).maybeSingle();collegeVerificationReady=Boolean(String(data?.college||'').trim()&&String(data?.enrollment_id||'').trim());return collegeVerificationReady}
async function loadPlans(){if(!supabase)return;if(currentUser)await refreshCollegeVerification();const {data,error}=await supabase.from('plans').select('id,title,location,starts_at,caption,category,user_id,created_at,capacity,neighborhood,requires_college_verification').order('created_at',{ascending:false});if(error){showToast('Could not load plans: '+error.message);return}if(data?.length){const ids=data.map(plan=>plan.id);const authorIds=[...new Set(data.map(plan=>plan.user_id).filter(Boolean))];const [summaryResult,authorResult,membershipResult,swipeResult,accessResult]=await Promise.all([supabase.rpc('get_plan_summaries',{p_plan_ids:ids}),authorIds.length?supabase.rpc('get_public_profiles',{p_user_ids:authorIds}):Promise.resolve({data:[]}),currentUser?supabase.from('plan_members').select('plan_id,status').eq('user_id',currentUser.id).in('plan_id',ids):Promise.resolve({data:[]}),currentUser?supabase.from('plan_swipes').select('plan_id,interested').eq('user_id',currentUser.id).in('plan_id',ids):Promise.resolve({data:[]}),currentUser?supabase.from('plan_verification_access').select('plan_id').eq('user_id',currentUser.id).in('plan_id',ids):Promise.resolve({data:[]})]);const summaries=new Map((summaryResult.data||[]).map(item=>[item.plan_id,item]));const authors=new Map((authorResult.data||[]).map(item=>[item.id,item]));const memberships=new Map((membershipResult.data||[]).map(item=>[item.plan_id,item.status]));const swipes=new Map((swipeResult.data||[]).map(item=>[item.plan_id,item.interested]));const access=new Set((accessResult.data||[]).map(item=>item.plan_id));posts=data.map(plan=>{const author=authors.get(plan.user_id)||{};const status=memberships.get(plan.id)||null;const summary=summaries.get(plan.id)||{};const swipeInterest=swipes.get(plan.id);const requiresVerification=!!plan.requires_college_verification;const verificationShared=!requiresVerification||access.has(plan.id);return{id:plan.id,user:author.username||author.full_name||'Evenit member',name:author.full_name||author.username||'Evenit member',avatar:author.avatar_url||'https://i.pravatar.cc/100?img=68',user_id:plan.user_id,time:formatPostTime(plan.created_at),created_at:plan.created_at,starts_at:plan.starts_at,image:'pic-one',category:plan.category||'Community event',title:plan.title,location:plan.location,caption:plan.caption||'A new event is taking shape. Come as you are and make it yours. ✦',likes:0,comments:Number(summary.comment_count||0),joined:status==='confirmed',membershipStatus:status,joinedCount:Number(summary.confirmed_count||0),capacity:plan.capacity,requiresCollegeVerification:requiresVerification,hasCollegeDetails:collegeVerificationReady,verificationShared,verificationComplete:!requiresVerification||(collegeVerificationReady&&verificationShared),isOwner:currentUser?.id===plan.user_id,swipeInterest,interested:swipeInterest===true,saved:savedEventIds.has(plan.id)||swipeInterest===true}})}renderPosts();applyAdminContent();applyAdminStyles();if(!pageView.hidden&&document.querySelector('[data-page].active')?.dataset.page==='profile')renderProfile();renderPulseBar()}

function renderPulseBar(){
  const bar=document.querySelector('#pulse-bar');
  if(!bar) return;
  bar.querySelectorAll('.pulse-card').forEach(el=>el.remove());
  if(!currentUser) return;
  const intro=bar.querySelector('.pulse-intro');
  if(intro){intro.tabIndex=0;intro.setAttribute('role','button');intro.setAttribute('aria-label','Open your event timeline');intro.onclick=showJoinedPage;intro.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')showJoinedPage()};}
  const now=new Date();
  const upcoming=getAgendaPlans().filter(p=>p.starts_at&&new Date(p.starts_at)>now);
  upcoming.sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
  if(!upcoming.length) return;
  const days=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  upcoming.slice(0,10).forEach((p,i)=>{
    const d=new Date(p.starts_at);
    const isToday=d.toDateString()===now.toDateString();
    const isTomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toDateString()===d.toDateString();
    let timeLabel;
    if(isToday){
      const h=d.getHours();const m=d.getMinutes();
      const ampm=h>=12?'PM':'AM';
      const h12=h%12||12;
      timeLabel=`Today \u00b7 ${h12}:${String(m).padStart(2,'0')} ${ampm}`;
    } else if(isTomorrow){
      const h=d.getHours();const m=d.getMinutes();
      const ampm=h>=12?'PM':'AM';
      const h12=h%12||12;
      timeLabel=`Tomorrow \u00b7 ${h12}:${String(m).padStart(2,'0')} ${ampm}`;
    } else {
      const diff=Math.ceil((d-now)/86400000);
      if(diff<=6){
        timeLabel=`${days[d.getDay()]} \u00b7 ${months[d.getMonth()]} ${d.getDate()}`;
      } else {
        timeLabel=`${months[d.getMonth()]} ${d.getDate()}`;
      }
    }
    const el=document.createElement('button');
    el.className='story pulse-card';
    el.setAttribute('data-pulse-idx',i);
    el.innerHTML=`<span class="pulse-time">${timeLabel}</span><strong>${escapeHtml(p.title)}</strong><small>${escapeHtml(p.location||'')}</small>`;
    el.onclick=()=>showAgendaDetail(p.id);
    bar.appendChild(el);
  });
}

function getAgendaPlans(){
  return posts.filter(post=>post.user_id===currentUser?.id||post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'||post.interested);
}

function agendaStatus(post){
  if(post.entryPass?.checked_in_at)return {label:'Attended',className:'attended'};
  if(post.user_id===currentUser?.id)return {label:'Hosting',className:'owned'};
  if(post.membershipStatus==='confirmed')return {label:'Confirmed',className:'confirmed'};
  if(post.interested)return {label:'Interested',className:'interested'};
  return {label:'Waitlisted',className:'waitlisted'};
}

function showJoinedPage(options={}){
  if(!options.restore)pushAppView({type:'agenda'});
  homeElements.forEach(e=>e.hidden=true);
  pageView.hidden=false;
  document.querySelectorAll('[data-page]').forEach(l=>l.classList.remove('active'));
  pageView.innerHTML='<div class="joined-page-loading">Loading your plans...</div>';
  // Always fetch before drawing the Timeline. A join can happen while an
  // earlier background refresh is still finishing, so an old in-memory list
  // can briefly hide a newly-created request.
  if(!options.skipRefresh&&supabase&&currentUser){
    loadPlans().then(()=>{
      if(!pageView.hidden&&pageView.querySelector('.joined-page-loading')){
        showJoinedPage({...options,restore:true,skipRefresh:true});
      }
    });
    return;
  }
  const joined=getAgendaPlans();
  joined.sort((a,b)=>{
    const da=a.starts_at?new Date(a.starts_at):new Date(0);
    const db=b.starts_at?new Date(b.starts_at):new Date(0);
    return da-db;
  });
  if(!joined.length){
    pageView.innerHTML=`<div class="page-header"><button class="back-to-home" onclick="goBack()">\u2190 Back</button><p class="overline">Your plans</p><h2>Joined</h2></div><div class="joined-empty"><div class="joined-empty-icon">\u25CE</div><h3>No plans yet</h3><p>Join a plan or create one, and it will appear here with your entry pass.</p></div>`;
    return;
  }
  const cardsHtml=joined.map(post=>{
    const when=post.starts_at?formatDateTime(post.starts_at):'';
    const isPast=post.starts_at&&new Date(post.starts_at)<new Date();
    const isOwned=post.user_id===currentUser?.id;
    const hasPass=post.entryPass&&post.membershipStatus==='confirmed'&&post.verificationComplete;
    const status=agendaStatus(post);
    return`<div class="joined-card" data-joined-id="${escapeHtml(post.id||'')}">
      <div class="joined-card-top" data-joined-detail="${escapeHtml(post.id||'')}">
        <div class="joined-card-info">
          <div class="joined-card-title">${escapeHtml(post.title)}</div>
          <div class="joined-card-meta">
            <span class="joined-card-loc">\uD83D\uDCCD ${escapeHtml(post.location||'')}</span>
            ${when?`<span class="joined-card-when">${escapeHtml(when)}</span>`:''}
          </div>
          <div class="joined-card-footer">
            <span class="joined-badge ${status.className}">${status.label}</span>
            <span class="joined-card-count">${post.joinedCount||0}${post.capacity?`/${post.capacity}`:''} joined</span>
          </div>
        </div>
        <div class="joined-card-arrow">\u2192</div>
      </div>
      <div class="joined-card-actions">
        ${hasPass?`<button class="joined-action-btn pass-btn" data-joined-pass="${escapeHtml(post.id||'')}">View Your Pass</button>`:''}
        ${isOwned&&!isPast?`<button class="joined-action-btn insights-btn" data-insights-id="${escapeHtml(post.id||'')}">Insights \u2197</button>`:''}
        ${!isPast&&(post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted')&&!isOwned?`<button class="joined-action-btn leave-btn" data-joined-leave="${escapeHtml(post.id||'')}">Leave Event</button>`:''}
      </div>
    </div>`}).join('');
  pageView.innerHTML=`<div class="page-header"><button class="back-to-home" onclick="goBack()">\u2190 Back</button><p class="overline">Your timeline</p><h2>Ideas in motion</h2><p class="agenda-subtitle">Hosted, confirmed, waitlisted, and interested plans — ordered by date.</p></div><div class="joined-page-list">${cardsHtml}</div>`;
  pageView.querySelectorAll('[data-joined-detail]').forEach(el=>{
    el.style.cursor='pointer';
    el.onclick=()=>{
      const pid=el.dataset.joinedDetail;
      const post=posts.find(p=>p.id===pid);
      if(!post) return;
      showAgendaDetail(pid);
    };
  });
  pageView.querySelectorAll('[data-joined-pass]').forEach(btn=>{
    btn.onclick=()=>{
      const post=posts.find(p=>p.id===btn.dataset.joinedPass);
      if(post?.entryPass) openEntryPass(post,post.entryPass);
      else showToast('Pass not available yet');
    };
  });
  pageView.querySelectorAll('[data-joined-leave]').forEach(btn=>{
    btn.onclick=async()=>{
      const pid=btn.dataset.joinedLeave;
      const post=posts.find(p=>p.id===pid);
      if(!post) return;
      const idx=posts.indexOf(post);
      if(idx<0) return;
      btn.disabled=true;
      btn.textContent='Leaving...';
      await toggleJoin(idx);
      showJoinedPage();
    };
  });
  pageView.querySelectorAll('[data-insights-id]').forEach(btn=>{
    btn.onclick=()=>{
      const pid=btn.dataset.insightsId;
      const post=posts.find(p=>p.id===pid);
      if(!post) return;
      renderInsights(pid);
    };
  });
}

function showAgendaDetail(planId,options={}){
  const post=posts.find(item=>item.id===planId);
  if(!post)return;
  if(!options.restore)pushAppView({type:'agenda-detail',planId});
  homeElements.forEach(element=>element.hidden=true);
  pageView.hidden=false;
  document.querySelectorAll('[data-page]').forEach(link=>link.classList.remove('active'));
  const status=agendaStatus(post);
  const isOwner=post.user_id===currentUser?.id;
  const isPast=post.starts_at&&new Date(post.starts_at)<new Date();
  const attendance=post.capacity?`${post.joinedCount||0} of ${post.capacity} confirmed`:`${post.joinedCount||0} confirmed`;
  const needsVerification=post.requiresCollegeVerification&&!post.verificationComplete;
  const needsProfileDetails=post.requiresCollegeVerification&&!post.hasCollegeDetails;
  const requirements=post.requiresCollegeVerification?(needsProfileDetails?'Add your private college and enrollment details, then authorize this organizer for this event.':needsVerification?'Authorize this event’s organizer to view your private verification details.':'Your private verification is shared only with this event’s organizer.'):'No additional identity details are required for this event.';
  const isMember=post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted';
  // One primary action at a time keeps the event-entry journey unambiguous.
  const passAction=post.entryPass&&post.membershipStatus==='confirmed'&&post.verificationComplete?`<button class="agenda-primary" data-agenda-pass="${escapeHtml(post.id)}">${post.entryPass.checked_in_at?'View checked-in pass':'View QR entry pass'}</button>`:'';
  const verificationAction=!isMember&&needsVerification?`<button class="agenda-primary" data-agenda-verify="${escapeHtml(post.id)}">${needsProfileDetails?'Add private details':'Authorize and join event'}</button>`:'';
  const joinAction=!isMember&&!needsVerification&&!isPast&&!isOwner?`<button class="agenda-primary" data-agenda-join="${escapeHtml(post.id)}">Show interest</button>`:'';
  const hostAction=isOwner?`<button class="joined-action-btn insights-btn" data-insights-id="${escapeHtml(post.id)}">View host insights ↗</button>`:'';
  const leaveAction=!isOwner&&!isPast&&(post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted')?`<button class="joined-action-btn leave-btn" data-agenda-leave="${escapeHtml(post.id)}">Leave event</button>`:'';
  const waitlistNote=post.membershipStatus==='waitlisted'?'<p class="agenda-note">You are on the waitlist. Your pass will appear here automatically if a place opens.</p>':'';
  const entryState=isMember?(post.membershipStatus==='waitlisted'?'You are on the waitlist.':'Your place is confirmed.'):(needsVerification?'One private verification step remains.':'You are ready to show interest.');
  pageView.innerHTML=`<section class="agenda-detail"><button class="back-to-home" data-agenda-back>← Your timeline</button><div class="agenda-hero"><span class="joined-badge ${status.className}">${status.label}</span><p class="overline">${escapeHtml(post.category||'Community event')}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.location||'Location to be announced')}</p></div><div class="agenda-detail-grid"><section class="agenda-panel"><h3>Event details</h3><dl><div><dt>When</dt><dd>${escapeHtml(post.starts_at?formatDateTime(post.starts_at):'Date to be announced')}</dd></div><div><dt>Where</dt><dd><a href="${mapUrl(post.location||'')}" target="_blank" rel="noreferrer">${escapeHtml(post.location||'Location to be announced')} ↗</a></dd></div><div><dt>Attendance</dt><dd>${escapeHtml(attendance)}</dd></div></dl><p class="agenda-description">${escapeHtml(post.caption)}</p></section><section class="agenda-panel agenda-entry-panel"><div class="agenda-panel-heading"><h3>Your entry</h3><span>${escapeHtml(entryState)}</span></div><p class="agenda-requirement"><strong>Verification</strong>${escapeHtml(requirements)}</p>${waitlistNote}<div class="agenda-primary-action">${verificationAction||joinAction||passAction}</div><div class="agenda-actions">${hostAction}${leaveAction}</div></section></div></section>`;
  pageView.querySelector('[data-agenda-back]').onclick=goBack;
  pageView.querySelector('[data-agenda-pass]')?.addEventListener('click',()=>openEntryPass(post,post.entryPass));
  pageView.querySelector('[data-agenda-verify]')?.addEventListener('click',()=>openPlanVerification(post));
  pageView.querySelector('[data-agenda-join]')?.addEventListener('click',event=>joinTimelinePlan(post.id,event.currentTarget));
  pageView.querySelector('[data-agenda-leave]')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;event.currentTarget.textContent='Leaving…';const index=posts.indexOf(post);await toggleJoin(index);showJoinedPage();});
  pageView.querySelector('[data-insights-id]')?.addEventListener('click',()=>renderInsights(post.id));
}

async function loadAftermathFeed(target=postsEl){
  if(!supabase){ renderAftermathTarget([],target); return; }
  const aftRes=await supabase.rpc('get_aftermath_feed',{p_limit:20});
  const aftData=aftRes.data||[];
  const withMedia=await Promise.all(aftData.map(async post=>{
    const {data:media}=await supabase.from('plan_aftermath_media').select('file_url,file_type,file_name').eq('post_id',post.id);
    return {...post,media:media||[]};
  }));
  renderAftermathTarget(withMedia,target);
}
function renderAftermathTarget(items,target){
  // Home is the plan board now. The same loader still powers aftermath on Discover.
  if(target===postsEl){
    if(pageView?.hidden) renderPlanBoard();
    else renderHomeFeed(items);
  }
  else if(target){
    target.innerHTML=items?.length?renderAftermathCards(items):'<div class="aftermath-empty"><div class="aftermath-empty-icon">◌</div><h3>No aftermath yet</h3><p>When events end, the stories people share will appear here.</p></div>';
    wireAftermathActions();
  }
}
function renderPlanBoard(){
  const homeLinks=[...document.querySelectorAll('[data-page="home"]')];
  homeLinks.forEach(link=>link.classList.remove('active'));
  renderPosts();
  homeLinks.forEach(link=>link.classList.add('active'));
}
function renderHomeFeed(aftermathItems){
  if(!postsEl) return;
  const hasAft=aftermathItems&&aftermathItems.length;
  if(!hasAft){
    postsEl.innerHTML='<div class="aftermath-empty"><div class="aftermath-empty-icon">\u25CE</div><h3>No aftermath yet</h3><p>When events end, the stories people share will appear here.</p><button onclick="document.querySelector(\'[data-page=discover]\')?.click()">Discover events</button></div>';
    return;
  }
  postsEl.innerHTML='<div class="feed-section"><div class="feed-section-header"><span class="feed-section-dot aftermath"></span><h3>Aftermath</h3></div>'+renderAftermathCards(aftermathItems)+'</div>';
  wireAftermathActions();
}
function renderFollowingCards(followingItems){
  return followingItems.map(p=>{
      const d=new Date(p.starts_at);
      const now=new Date();
      const isToday=d.toDateString()===now.toDateString();
      const isTomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toDateString()===d.toDateString();
      let when;
      if(isToday){const h=d.getHours();const m=d.getMinutes();when='Today \u00b7 '+(h%12||12)+':'+String(m).padStart(2,'0')+(h>=12?'PM':'AM');}
      else if(isTomorrow){const h=d.getHours();const m=d.getMinutes();when='Tomorrow \u00b7 '+(h%12||12)+':'+String(m).padStart(2,'0')+(h>=12?'PM':'AM');}
      else{when=d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' \u00b7 '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});}
      const cap=p.capacity?((p.confirmed_count??p.joinedCount??0)+'/'+p.capacity):((p.confirmed_count??p.joinedCount??0)+' joined');
      const gradient=getCardGradient(p.category);
      const joined=posts.find(pp=>pp.id===p.id)?.joined;
      return '<article class="following-card" data-plan-id="'+escapeHtml(p.id)+'">'
        +'<div class="following-card-visual" data-cat="'+gradient+'"><div class="following-card-gradient"></div>'
        +'<div class="following-card-visual-inner"><span class="following-card-badge">'+escapeHtml(p.category||'Event')+'</span>'
        +'<h3>'+escapeHtml(p.title)+'</h3><p>'+escapeHtml(p.location||'')+'</p></div></div>'
        +'<div class="following-card-body"><div class="following-card-author" data-public-profile-id="'+escapeHtml(p.user_id)+'">'
        +'<img src="'+escapeHtml(p.author_avatar||p.avatar||'https://i.pravatar.cc/100?img=68')+'" alt="">'
        +'<div><strong>'+escapeHtml(p.author_name||p.author_username||p.name||p.user||'Member')+'</strong><small>'+escapeHtml(when)+'</small></div></div>'
        +(p.caption?'<p class="following-card-caption">'+escapeHtml(p.caption)+'</p>':'')
        +'<div class="following-card-footer"><span class="following-card-count">'+cap+'</span><span class="discover-match">'+escapeHtml(p.recommendationLabel||'Upcoming')+'</span>'
        +'<button class="following-join-btn '+(joined?'joined':'')+'" data-following-join="'+escapeHtml(p.id)+'">'+(joined?'Joined \u2713':'Join')+'</button></div></div></article>';
  }).join('');
}
async function loadFollowingEvents(){
  const list=document.querySelector('#following-events');
  if(!list) return;
  if(!currentUser){list.innerHTML='<div class="aftermath-empty"><div class="aftermath-empty-icon">✦</div><h3>Log in to personalize Discover</h3><p>We will rank upcoming events around your interests once your profile is ready.</p></div>';return;}
  const ranked=await getRankedDiscoverPlans();
  list.innerHTML=ranked.length?renderFollowingCards(ranked):'<div class="aftermath-empty"><div class="aftermath-empty-icon">✦</div><h3>No upcoming plans right now</h3><p>Come back soon — new events will appear here.</p></div>';
  wireFollowingJoinButtons();
}

async function getDiscoverPreferences(){
  if(!supabase||!currentUser)return {interests:[],categorySignals:new Map()};
  const [{data:profile},{data:swipes}]=await Promise.all([
    supabase.from('profiles').select('interests').eq('id',currentUser.id).maybeSingle(),
    supabase.from('plan_swipes').select('plan_id,interested').eq('user_id',currentUser.id)
  ]);
  const byId=new Map(posts.map(post=>[post.id,post]));
  const categorySignals=new Map();
  (swipes||[]).forEach(swipe=>{const category=byId.get(swipe.plan_id)?.category;if(!category)return;const key=category.toLowerCase();categorySignals.set(key,(categorySignals.get(key)||0)+(swipe.interested?1:-1));});
  return {interests:(profile?.interests||[]).map(value=>String(value).toLowerCase()),categorySignals};
}

function discoverNoise(id){
  const key=`${id}-${new Date().toISOString().slice(0,10)}`;
  let hash=0;for(let index=0;index<key.length;index++)hash=(hash*31+key.charCodeAt(index))|0;
  return Math.abs(hash%100)/100;
}

async function getRankedDiscoverPlans({forSwipe=false}={}){
  const preferences=await getDiscoverPreferences();
  const now=Date.now();
  return posts.filter(post=>{
    if(!post.starts_at||new Date(post.starts_at).getTime()<=now||post.user_id===currentUser?.id)return false;
    if(post.swipeInterest===false)return false;
    return !forSwipe||post.swipeInterest===undefined;
  }).map(post=>{
    const category=String(post.category||'').toLowerCase();
    const interestMatch=preferences.interests.includes(category);
    const signal=preferences.categorySignals.get(category)||0;
    const score=(interestMatch?100:0)+signal*18+discoverNoise(post.id)*12-(new Date(post.starts_at).getTime()-now)/86400000*.04;
    return {...post,recommendationLabel:interestMatch?'Interest match':signal>0?'Based on your swipes':'Explore something new',discoverScore:score};
  }).sort((a,b)=>b.discoverScore-a.discoverScore);
}
function renderAftermathCards(items){
  return items.map(post=>{
    const tags=(post.hashtags||[]).map(h=>'<span class="aftermath-tag">#'+escapeHtml(h)+'</span>').join(' ');
    const authorLabel=post.username?'@'+post.username:(post.full_name||'Evenit member');
    const mediaHtml=(post.media||[]).map(m=>{
      if(m.file_type==='image') return '<div class="aftermath-media-item image"><img src="'+escapeHtml(m.file_url)+'" alt="Photo" loading="lazy"></div>';
      if(m.file_type==='video') return '<div class="aftermath-media-item video"><video src="'+escapeHtml(m.file_url)+'" controls preload="none"></video></div>';
      if(m.file_type==='pdf') return '<a class="aftermath-media-item pdf" href="'+escapeHtml(m.file_url)+'" target="_blank" rel="noreferrer"><span class="pdf-icon">\uD83D\uDCC4</span><span class="pdf-name">'+escapeHtml(m.file_name||'PDF')+'</span></a>';
      return '';
    }).join('');
    const gridClass=(post.media||[]).length>=2?'grid-2':(post.media||[]).length>=3?'grid-3':'';
    return '<article class="aftermath-card" data-aftermath-id="'+escapeHtml(post.id)+'">'
      +'<button class="aftermath-author-line" type="button" data-public-profile-id="'+escapeHtml(post.author_id)+'">'+escapeHtml(authorLabel)+'</button>'
      +'<button class="aftermath-event-context" type="button" data-aftermath-event="'+escapeHtml(post.plan_id||'')+'" data-event-title="'+escapeHtml(post.plan_title||'')+'" data-event-location="'+escapeHtml(post.plan_location||'')+'"><span class="aftermath-event-badge">Lived</span>'
      +'<span class="aftermath-event-info"><span class="aftermath-event-title">'+escapeHtml(post.plan_title||'Event details')+'</span>'
      +(post.plan_location?'<span class="aftermath-event-loc">\uD83D\uDCCD '+escapeHtml(post.plan_location)+'</span>':'')
      +'</span><span class="aftermath-event-arrow" aria-hidden="true">›</span></button>'
      +'<div class="aftermath-body">'+escapeHtml(post.body)+'</div>'
      +(tags?'<div class="aftermath-tags">'+tags+'</div>':'')
      +(mediaHtml?'<div class="aftermath-media '+gridClass+'">'+mediaHtml+'</div>':'')
      +'<div class="aftermath-stats">'
      +(post.like_count?'<span>'+post.like_count+' '+(post.like_count===1?'like':'likes')+'</span>':'')
      +(post.comment_count?'<span>'+post.comment_count+' '+(post.comment_count===1?'comment':'comments')+'</span>':'')
      +'</div>'
      +'<div class="aftermath-actions">'
      +'<button class="aftermath-action '+(post.liked?'liked':'')+'" data-aftermath-like="'+escapeHtml(post.id)+'"><span class="action-icon">'+(post.liked?'\u2665':'\u2661')+'</span><span class="action-label">'+(post.liked?'Liked':'Like')+'</span></button>'
      +'<button class="aftermath-action" data-aftermath-comment="'+escapeHtml(post.id)+'"><span class="action-icon">\uD83D\uDCAC</span><span class="action-label">Comment</span></button>'
      +'<button class="aftermath-action save" data-aftermath-save="'+escapeHtml(post.id)+'"><span class="action-icon">\u25C7</span></button>'
      +'</div></article>';
  }).join('');
}
function wireFollowingJoinButtons(){
  document.querySelectorAll('[data-following-join]').forEach(btn=>{
    btn.onclick=async()=>{
      if(!supabase||!currentUser){showToast('Log in to join');return;}
      const planId=btn.dataset.followingJoin;
      const post=posts.find(p=>p.id===planId);
      if(!post){showToast('Event not found');return;}
      const idx=posts.indexOf(post);
      if(idx<0)return;
      btn.disabled=true;btn.textContent='...';
      await toggleJoin(idx);
      const isJoined=post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted';
      btn.textContent=isJoined?'Joined \u2713':'Join';
      btn.classList.toggle('joined',isJoined);
      btn.disabled=false;
    };
  });
}
function wireAftermathActions(){
  document.querySelectorAll('[data-aftermath-like]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.aftermathLike;const liked=b.classList.contains('liked');
    if(!supabase||!currentUser){showToast('Log in to like');return;}
    if(liked)await supabase.from('plan_aftermath_likes').delete().eq('post_id',id).eq('user_id',currentUser.id);
    else await supabase.from('plan_aftermath_likes').insert({post_id:id,user_id:currentUser.id});
    loadAftermathFeed();
  });
  document.querySelectorAll('[data-aftermath-comment]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.aftermathComment;activeAftermathCommentId=id;
    document.querySelector('#comment-sheet')?.classList.add('open');
    document.querySelector('#comment-list').innerHTML='<div style="padding:20px;text-align:center;color:#6E6E73">Loading comments...</div>';
    supabase.from('plan_aftermath_comments').select('id,body,created_at,user_id').eq('post_id',id).order('created_at',{ascending:true}).then(async({data})=>{
      const list=document.querySelector('#comment-list');
      if(!data||!data.length){list.innerHTML='<div style="padding:24px;text-align:center;color:#6E6E73">No comments yet. Be first to share your thoughts.</div>';return;}
      const uids=[...new Set(data.map(c=>c.user_id))];
      const {data:profs}=await supabase.rpc('get_public_profiles',{p_user_ids:uids});
      const mp=new Map((profs||[]).map(p=>[p.id,p]));
      list.innerHTML=data.map(c=>{const p=mp.get(c.user_id)||{};return '<div class="comment-item"><img src="'+escapeHtml(p.avatar_url||'https://i.pravatar.cc/100?img=68')+'" alt=""><div><div class="comment-header"><strong>'+escapeHtml(p.full_name||p.username||'Member')+'</strong><small>'+formatPostTime(c.created_at)+'</small></div><div class="comment-body">'+escapeHtml(c.body)+'</div></div></div>';}).join('');
    });
  });
  document.querySelectorAll('[data-aftermath-save]').forEach(b=>b.onclick=()=>{
    b.classList.toggle('saved');try{navigator.vibrate?.(12);}catch{}
    showToast(b.classList.contains('saved')?'Saved \u2713':'Unsaved');
  });
}
function renderAftermathFeed(items){
  if(!postsEl) return;
  if(!items||!items.length){
    postsEl.innerHTML='<div class="aftermath-empty"><div class="aftermath-empty-icon">\u25CE</div><h3>No stories yet</h3><p>When events end, their stories appear here.</p><button onclick="document.querySelector(\'[data-page=discover]\'\x29?.click()">Discover upcoming</button></div>';
    return;
  }
  postsEl.innerHTML='<div class="feed-section"><div class="feed-section-header"><span class="feed-section-dot aftermath"></span><h3>Aftermath</h3></div>'+renderAftermathCards(items)+'</div>';
  wireAftermathActions();
}
let activeAftermathCommentId=null;
async function joinTimelinePlan(planId,button){const post=posts.find(item=>item.id===planId);if(!post)return false;if(post.requiresCollegeVerification&&!post.verificationComplete){openPlanVerification(post);return false}if(button){button.disabled=true;button.textContent='Joining…'}const joined=await toggleJoin(posts.indexOf(post));if(joined)showAgendaDetail(planId);else if(button){button.disabled=false;button.textContent='Join this event'}return joined}
async function toggleJoin(index){const post=posts[index];if(!post)return false;if(!supabase||!currentUser){showToast('Log in before joining this event');loginModal?.classList.add('open');return false}if(!post.id){post.joined=!post.joined;renderPosts();return true}const isMember=post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted';if(!isMember&&post.requiresCollegeVerification&&!post.verificationComplete){openPlanVerification(post);return false}try{if(!navigator.onLine)throw new Error('You are offline. Connect to Wi-Fi or mobile data, then try again.');await withEvenitTimeout(getFreshEvenitUser(),8000,'Your login check took too long. Please try again.');const result=await withEvenitTimeout(isMember?supabase.rpc('leave_plan',{p_plan_id:post.id}):supabase.rpc('join_plan',{p_plan_id:post.id}),15000,'The event could not be updated in time. Please try again.');if(result.error)throw result.error;const row=rpcRow(result.data);if(isMember){showToast(row?.promoted_user_id?'You left the event. A person from the waitlist was promoted.':'You left this event');}else if(row?.status==='confirmed'){showToast(row.confirmation_memo?`You’re confirmed. ${row.confirmation_memo}`:'You’re confirmed for this event ✦')}else{showToast(`You’re on the waitlist${row?.queue_position?` at #${row.queue_position}`:''}. Confirmed guests receive the entry pass.`)}await refreshEvenitLiveData({quiet:true});return true}catch(error){showToast(`Could not update your event: ${error?.message||'Please try again.'}`);return false}}
function joinRequirement(post){
  if(!post?.requiresCollegeVerification)return null;
  if(!post.hasCollegeDetails)return {state:'details',label:'College details required',message:'This event requires your private college and enrollment details before you can join.'};
  if(!post.verificationShared)return {state:'authorization',label:'Verification required',message:'This event requires your approval to share those private details with its organizer.'};
  return null;
}
async function startHomeJoin(index,button){
  const post=posts[index];
  if(!post)return false;
  if(post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted')return true;
  if(!supabase||!currentUser){showToast('Log in to join this event');loginModal?.classList.add('open');return false;}
  const requirement=joinRequirement(post);
  if(requirement){
    showToast(requirement.message);
    openPlanVerification(post);
    return false;
  }
  if(button){button.disabled=true;button.textContent='Joining…';}
  const joined=await toggleJoin(index);
  if(!joined&&button){button.disabled=false;button.textContent='Join';}
  return joined;
}
let activeCommentPlanId=null;
async function openComments(planId){
  activeCommentPlanId=planId;
  const sheet=document.querySelector('#comment-sheet');
  const list=document.querySelector('#comment-list');
  const avatar=document.querySelector('#comment-avatar');
  if(avatar) avatar.src=currentUser?.user_metadata?.avatar_url||'https://i.pravatar.cc/100?img=68';
  sheet.classList.add('open');
  list.innerHTML='<div style="padding:24px;text-align:center;color:#6E6E73;font-size:13px">Loading comments...</div>';
  try{
    const {data,error}=await supabase.from('plan_comments').select('id,body,created_at,user_id').eq('plan_id',planId).order('created_at',{ascending:true}).limit(50);
    if(error) throw error;
    const userIds=[...new Set((data||[]).map(c=>c.user_id))];
    let profiles=new Map();
    if(userIds.length){
      const {data:profs}=await supabase.rpc('get_public_profiles',{p_user_ids:userIds});
      (profs||[]).forEach(p=>profiles.set(p.id,p));
    }
    if(!data||!data.length){
      list.innerHTML='<div style="padding:32px 20px;text-align:center;color:#6E6E73"><div style="font-size:28px;margin-bottom:8px">💬</div><div style="font-weight:600;color:#1D1D1F">No comments yet</div><div style="font-size:12px;margin-top:4px">Be the first to say something warm.</div></div>';
    } else {
      list.innerHTML=data.map(c=>{
        const p=profiles.get(c.user_id)||{};
        const name=p.full_name||p.username||'Evenit member';
        const time=formatPostTime(c.created_at);
        return `<article class="comment-item"><img src="${escapeHtml(p.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt=""><div><div class="comment-header"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(time)}</small></div><div class="comment-body">${escapeHtml(c.body)}</div></div></article>`;
      }).join('');
    }
  }catch(e){ list.innerHTML=`<div style="padding:20px;color:#b00020;font-size:13px">${escapeHtml(e.message)}</div>`; }
}
function closeComments(){ document.querySelector('#comment-sheet')?.classList.remove('open'); activeCommentPlanId=null; activeAftermathCommentId=null; }
async function addPlanComment(index){
  const post=posts[index];
  if(!post?.id){ showToast('Open the post first'); return; }
  await openComments(post.id);
}
async function submitComment(e){
  e.preventDefault();
  const input=document.querySelector('#comment-input');
  const body=input?.value?.trim();
  if(!body) return;
  if(!supabase||!currentUser){ showToast('Log in to comment'); loginModal.classList.add('open'); return; }
  input.value='';
  if(activeAftermathCommentId){
    const {error}=await supabase.from('plan_aftermath_comments').insert({post_id:activeAftermathCommentId,user_id:currentUser.id,body});
    if(error){ showToast(error.message); return; }
    showToast('Comment added');
    closeComments();
    loadAftermathFeed();
    return;
  }
  if(!activeCommentPlanId) return;
  const {error}=await supabase.rpc('add_plan_comment',{p_plan_id:activeCommentPlanId,p_body:body});
  if(error){ showToast(error.message); return; }
  showToast('Comment added');
  await openComments(activeCommentPlanId);
  await loadPlans();
}
function renderPosts(){if(document.querySelector('[data-page=home]')?.classList.contains('active'))return;postsEl.innerHTML=posts.map((post,index)=>{const attendance=post.capacity?`${post.joinedCount||0} / ${post.capacity} confirmed`:`${post.joinedCount||0} joined`;const membership=post.entryPass?.checked_in_at?'Attended \u2713':post.membershipStatus==='confirmed'?'Confirmed \u2713':post.membershipStatus==='waitlisted'?'On waitlist':'Join in';const membershipClass=post.entryPass?.checked_in_at?' attended':post.membershipStatus==='confirmed'?' joined':post.membershipStatus==='waitlisted'?' waitlisted':'';return`<article class="post" data-plan-id="${escapeHtml(post.id||'')}"><header class="post-head"><img data-profile-id="${escapeHtml(post.user_id||'')}" src="${escapeHtml(post.avatar)}" alt="${escapeHtml(post.name)}"><div><strong data-profile-id="${escapeHtml(post.user_id||'')}">${escapeHtml(post.user)}</strong><small>${escapeHtml(post.time)} · <a class="place" href="${mapUrl(post.location)}" target="_blank" rel="noreferrer">${escapeHtml(post.location)} ↗</a></small></div><button class="more" data-index="${index}">•••</button></header><div class="post-visual ${escapeHtml(post.image)}" data-plan-id="${escapeHtml(post.id||'')}" ><div class="visual-label"><small class="visual-category">${escapeHtml(post.category||'COMMUNITY EVENT')}</small><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.location)}</p></div></div><div class="post-actions"><button class="action like ${post.liked?'liked':''}" data-index="${index}">${post.liked?'👍':'👍🏻'}</button><button class="action comment" data-index="${index}">◯</button><button class="action share" data-index="${index}">⌁</button><button class="action save ${post.saved?'saved':''}" data-index="${index}">${post.saved?'◆':'◇'}</button></div><div class="post-body"><p class="likes">${post.likes+(post.liked?1:0)} people are interested</p><p class="caption"><strong>${escapeHtml(post.user)}</strong> ${escapeHtml(post.caption)} <a href="#">#${escapeHtml(post.title.replaceAll(' ',''))}</a></p><p class="comments">View all ${post.comments||0} comments</p><p class="plan-attendance">${attendance}${post.capacity&&post.joinedCount>=post.capacity?' · Full':''}</p><button class="join-plan${membershipClass}" data-index="${index}">${membership} <span>→</span></button>${post.isOwner?`<button class="insights-button" data-insights-id="${escapeHtml(post.id)}">View insights <span>↗</span></button>`:''}</div></article>`}).join('');document.querySelectorAll('.like').forEach(btn=>btn.onclick=()=>{
  const p=posts[btn.dataset.index]; p.liked=!p.liked;
  try{ navigator.vibrate?.(p.liked?20:10); }catch{}
  btn.animate?.([{transform:'scale(1)'},{transform:'scale(1.25)'},{transform:'scale(1)'}],{duration:220, easing:'cubic-bezier(.2,.8,.2,1)'});
  renderPosts();
  showToast(p.liked?'Liked — thanks for the love':'Like removed');
});
document.querySelectorAll('.save').forEach(btn=>{
  btn.onclick=()=>{
    const post=posts[btn.dataset.index];post.saved=!post.saved;
    post.saved?savedEventIds.add(post.id||post.title):savedEventIds.delete(post.id||post.title);
    localStorage.setItem('evenit-saved-events',JSON.stringify([...savedEventIds]));
    try{ navigator.vibrate?.(post.saved?20:10); }catch{}
    btn.animate?.([{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:220, easing:'cubic-bezier(.2,.8,.2,1)'});
    showToast(post.saved?'Saved ✓ — find it in Profile → Saved':'Removed from saved');
    renderPosts();
  };
});document.querySelectorAll('.share').forEach(btn=>btn.onclick=async()=>{
  const post=posts[btn.dataset.index];
  const url=`${window.location.origin}${window.location.pathname}#plan-${post.id||post.title}`;
  const sheet=document.querySelector('#share-sheet');
  const urlEl=document.querySelector('#share-url');
  if(urlEl) urlEl.textContent=url;
  sheet?.classList.add('open');
  if(post.id) recordPlanInteraction(post.id,'share');
  try{ navigator.vibrate?.(10); }catch{}
});
document.querySelector('#close-share')?.addEventListener('click',()=>document.querySelector('#share-sheet')?.classList.remove('open'));
document.querySelector('#share-sheet')?.addEventListener('click',e=>{ if(e.target.id==='share-sheet') e.currentTarget.classList.remove('open'); });
document.querySelectorAll('.share-option').forEach(b=>b.onclick=async()=>{
  const kind=b.dataset.share;
  const url=document.querySelector('#share-url')?.textContent||window.location.href;
  if(kind==='copy'){ try{ await navigator.clipboard.writeText(url); showToast('Link copied ✓'); }catch{ showToast(url); } }
  else if(kind==='native'){ try{ if(navigator.share) await navigator.share({title:document.title, url}); else throw 0; }catch{ try{await navigator.clipboard.writeText(url); showToast('Link copied');}catch{ showToast('Share coming soon'); } } }
  else if(kind==='whatsapp'){ window.open(`https://wa.me/?text=${encodeURIComponent(url)}`,'_blank'); }
  else if(kind==='message'){ window.location.href=`sms:?&body=${encodeURIComponent(url)}`; }
  document.querySelector('#share-sheet')?.classList.remove('open');
});document.querySelectorAll('.comment').forEach(btn=>btn.onclick=()=>addPlanComment(btn.dataset.index));document.querySelectorAll('.join-plan').forEach(btn=>btn.onclick=()=>toggleJoin(btn.dataset.index));document.querySelectorAll('.more').forEach(btn=>btn.onclick=()=>showToast('More event actions are coming next ✦'));document.querySelectorAll('.post-visual[data-plan-id]').forEach(visual=>visual.onclick=()=>recordPlanInteraction(visual.dataset.planId,'click'));trackPostImpressions()}
renderPosts();
const pageView=document.querySelector('#page-view');
const homeElements=[document.querySelector('.feed-top'),document.querySelector('.stories'),postsEl];
function loadPlansPreservingHostWorkspace(){
  if(!pageView?.querySelector('.host-approval-insights,.host-request-review'))return loadPlans();
  const profileRenderer=renderProfile;
  renderProfile=()=>{};
  return Promise.resolve(loadPlans()).finally(()=>{renderProfile=profileRenderer;});
}
const pageTemplates={
  discover:`<div class="page-header"><p class="overline">Find your people</p><h2>Discover plans<br><em>worth joining.</em></h2><div class="search-box">⌕ <input placeholder="Search plans, places, or people..."></div></div><div class="discover-grid"><div class="discover-tile tile-violet"><small>OUTDOORS</small><strong>Golden hour<br>on the water</strong><span>16 people going →</span></div><div class="discover-tile tile-gold"><small>FOOD & DRINK</small><strong>Sunday supper<br>club</strong><span>12 people going →</span></div><div class="discover-tile tile-ink"><small>CREATIVE</small><strong>Make a tiny<br>zine together</strong><span>8 people going →</span></div></div>`,
  notifications:`<div class="page-header"><p class="overline">Stay in the loop</p><h2>Notifications</h2></div><div class="activity-list"><div class="activity"><img src="https://i.pravatar.cc/100?img=47"><p><strong>ari.makes</strong> joined your plan <b>Sunset picnic</b><small>12 minutes ago</small></p></div><div class="activity"><img src="https://i.pravatar.cc/100?img=25"><p><strong>maya.rose</strong> liked your plan <b>Saturday sketch walk</b><small>1 hour ago</small></p></div><div class="activity"><img src="https://i.pravatar.cc/100?img=44"><p><strong>theo.walks</strong> started following you<small>Yesterday</small></p></div></div>`,
  messages:`<div class="page-header message-header"><div><p class="overline">Keep the plan moving</p><h2>Messages</h2><p>Conversations and private circles, in one calm place.</p></div><button class="message-compose" type="button" title="New message" aria-label="Start a new conversation">✎ <span>New</span></button></div><div class="message-availability"><span class="online-dot"></span><strong>Your circles are up to date</strong><small>Replies, group notes, and event chats live here.</small></div><div class="msg-toggle" role="tablist"><button class="msg-tab active" data-msg-tab="primary">Primary <small>2</small></button><button class="msg-tab" data-msg-tab="groups">Groups</button></div><div id="msg-primary-pane" class="msg-pane"><div class="message-list"><button class="message"><img src="https://i.pravatar.cc/100?img=25" alt=""><div><strong>maya.rose <span class="message-presence"></span></strong><p>Should we bring extra blankets for the picnic?</p></div><small>2m</small></button><button class="message"><img src="https://i.pravatar.cc/100?img=47" alt=""><div><strong>ari.makes</strong><p>That coffee walk sounds perfect.</p></div><small>1h</small></button></div><div class="message-note"><span>✦</span><div><strong>Keep good plans close</strong><p>Join a plan to start a new conversation.</p></div></div></div><div id="msg-groups-pane" class="msg-pane" hidden><div class="groups-heading"><div><h3>Groups</h3><p>Private circles for members only.</p></div><button class="publish-button" id="open-group-create">＋ Create</button></div><div id="groups-list" class="groups-list"></div></div>`,
  settings:`<div class="page-header"><p class="overline">Make it yours</p><h2>Settings</h2><p class="settings-intro">Control the parts of Evenit that matter to you.</p></div><div class="settings-list"><button data-settings-panel="account"><span class="settings-icon">◎</span><span><strong>Account details</strong><small>Name, username, profile and email</small></span><b>›</b></button><button data-settings-panel="notifications"><span class="settings-icon">♡</span><span><strong>Notification preferences</strong><small>Choose what reaches you</small></span><b>›</b></button><button data-settings-panel="privacy"><span class="settings-icon">◌</span><span><strong>Privacy and safety</strong><small>Profile visibility and location</small></span><b>›</b></button><a class="settings-download" href="https://github.com/letsberesponsiblenafar-cmyk/Evenit/releases/latest/download/Evenit.apk" target="_blank" rel="noreferrer"><span class="settings-icon">↓</span><span><strong>Download Android app</strong><small>Install the latest Evenit APK</small></span><b>›</b></a><button data-settings-panel="help"><span class="settings-icon">?</span><span><strong>Help center</strong><small>Answers and support</small></span><b>›</b></button></div>`,
};
  function renderProfile(){
    const loggedIn=Boolean(currentUser);
    const name=currentUser?.user_metadata?.full_name||currentUser?.email?.split('@')[0]||'Your profile';
    const username=currentUser?.user_metadata?.username||'your.profile';
    const createdEvents=posts.filter(post=>post.user_id===currentUser?.id).length;
    pageView.innerHTML=`<section class="profile-instagram"><header class="profile-appbar"><button type="button" class="topbar-plus" aria-label="Create a plan">＋</button><strong>${loggedIn?'@'+escapeHtml(username):'Your profile'}</strong><button id="profile-menu" class="profile-menu profile-menu-lines" type="button" aria-label="Open profile menu" aria-expanded="false"><i></i><i></i><i></i></button></header><div class="profile-intro"><img src="${currentUser?.user_metadata?.avatar_url||'https://i.pravatar.cc/160?img=68'}" alt="${escapeHtml(name)}"><div class="profile-identity"><p class="overline">Your profile</p><h2>${escapeHtml(name)}</h2><p class="profile-handle">${loggedIn?'@'+escapeHtml(username):'Start your Evenit story'}</p></div></div><div class="profile-stats" aria-label="Profile stats"><span><strong>${createdEvents}</strong>Events created</span><span><strong id="profile-followers-count">0</strong>Followers</span><span><strong id="profile-following-count">0</strong>Following</span></div><section class="profile-about-section" hidden><h3>About</h3><p class="profile-about-own" hidden></p></section>${loggedIn?'<div class="profile-actions-row"><button class="edit-profile" type="button">Edit profile</button><button class="share-profile" id="share-profile" type="button">Share profile</button></div>':''}<div class="profile-tabs" role="tablist" aria-label="Profile activity"><button class="active" type="button" role="tab" aria-selected="true" data-profile-tab="plans">My Plans</button><button type="button" role="tab" aria-selected="false" data-profile-tab="lived">Lived On</button></div><div class="profile-tab-stage"><div class="profile-empty"><span>✦</span><h3>${loggedIn?'Your plans will appear here':'Join the community'}</h3><p>${loggedIn?'Share an idea and give people a reason to show up.':'Create your profile to post events and join other people’s plans.'}</p>${loggedIn?'<button class="publish-button" id="profile-post">Create plan <span>→</span></button>':'<div class="profile-actions"><button class="publish-button" id="profile-signup">Create a profile</button><button class="profile-login-button" id="profile-login">Log in</button></div>'}</div></div></section>`;
    if(loggedIn){
      document.querySelector('#profile-post').onclick=()=>modal.classList.add('open');
      loadOwnProfileFollowStats();
    }else{
      document.querySelector('#profile-signup').onclick=()=>signupModal.classList.add('open');
      document.querySelector('#profile-login').onclick=()=>loginModal.classList.add('open');
    }
    renderProfileTab(document.querySelector('[data-profile-tab="plans"]'));
    loadProfileDetails();
    applyAdminContent();applyAdminStyles();
  }
  function renderDiscover(){
  pageView.innerHTML=`<div class="page-header discover-header"><div><p class="overline">Made for you</p><h2>Discover<br><em>events.</em></h2><p>Interest matches first, then a little room for something unexpected.</p></div><button class="discover-swipe-launch" id="open-swipe-discover" type="button"><span>✦</span> Swipe events</button></div><div class="discover-welcome"><span class="discover-welcome-icon">⌕</span><div><strong>All upcoming events, ranked for you.</strong><small>Swipe separately to tune what Evenit recommends next.</small></div></div><div id="following-events" class="following-feed"></div><div class="discover-swipe-overlay" id="discover-swipe-overlay" hidden><section id="discover-swipe-section" class="discover-swipe-section" role="dialog" aria-modal="true" aria-label="Swipe events"><div class="discover-swipe-heading"><div><p class="overline">Something new</p><h3>Swipe to choose.</h3><small>Right means interested. Left means show me less like this.</small></div><button type="button" id="close-swipe-discover" aria-label="Close swipe events">×</button></div><div id="swipe-deck" class="swipe-deck-wrap"></div><div id="swipe-actions-row" class="swipe-actions"></div><div id="swipe-progress-row" class="swipe-progress"></div></section></div>`;
  loadFollowingEvents();
  const swipeOverlay=document.querySelector('#discover-swipe-overlay');
  const closeSwipe=()=>{swipeOverlay.classList.remove('open');setTimeout(()=>swipeOverlay.hidden=true,180);};
  document.querySelector('#open-swipe-discover').onclick=()=>{swipeOverlay.hidden=false;requestAnimationFrame(()=>swipeOverlay.classList.add('open'));loadSwipeDeck();};
  document.querySelector('#close-swipe-discover').onclick=closeSwipe;
  swipeOverlay.onclick=event=>{if(event.target===swipeOverlay)closeSwipe();};
  applyAdminContent();applyAdminStyles();
}

// The sketches use compact app bars: Home keeps the plan board, while Discover
// becomes the social aftermath feed without changing any of its existing actions.
const evenitRenderDiscover=renderDiscover;
renderDiscover=function(){
  evenitRenderDiscover();
  const header=document.querySelector('.discover-header');
  if(header){
    header.insertAdjacentHTML('afterbegin','<div class="page-topbar discover-topbar"><button class="topbar-brand" type="button" data-page="home">evenit</button><label class="topbar-search">⌕<input id="discover-search" placeholder="Search people, plans, places"></label><button class="topbar-icon" id="discover-filter" type="button" aria-label="Filter plans">☷</button></div>');
    header.querySelector('.overline')?.remove();
  }
  const feed=document.querySelector('#following-events');
  if(feed)feed.insertAdjacentHTML('afterend','<section class="discover-aftermath"><div class="discover-section-heading"><div><small>FROM THE COMMUNITY</small><h3>Aftermath</h3></div><span>Stories from plans that happened</span></div><div id="discover-aftermath-feed"></div></section>');
  loadAftermathFeed(document.querySelector('#discover-aftermath-feed'));
  document.querySelector('#discover-filter')?.addEventListener('click',()=>showToast('Filters are coming next — your recommendations are already personalized.'));
  document.querySelector('#discover-search')?.addEventListener('input',event=>{
    const query=event.target.value.trim().toLowerCase();
    document.querySelectorAll('#following-events .following-card').forEach(card=>{card.hidden=Boolean(query)&&!card.textContent.toLowerCase().includes(query)});
  });
};

const evenitRenderProfile=renderProfile;
renderProfile=function(){
  evenitRenderProfile();
  const intro=document.querySelector('.profile-intro');
  const cover=document.querySelector('.profile-cover');
  const handle=document.querySelector('.profile-handle')?.textContent||'@profile';
  if(cover&&!document.querySelector('.profile-sketch-topbar'))cover.insertAdjacentHTML('beforebegin',`<div class="profile-sketch-topbar"><button type="button" class="topbar-plus" aria-label="Create a plan">＋</button><strong>${escapeHtml(handle)}</strong><button id="profile-menu" class="profile-menu" type="button" aria-label="Open profile options"><i></i><i></i><i></i></button></div>`);
  document.querySelector('.topbar-plus')?.addEventListener('click',()=>modal.classList.add('open'));
};
let swipeStack=[];
let swipeIndex=0;
let swipeHistory=[];
const SWIPE_THRESHOLD=80;
const SWIPE_VELOCITY_THRESHOLD=0.4;
const CARD_GRADIENTS=['default','outdoor','food','creative','music','sports','social','wellness','workshop','tech'];
function getCardGradient(category){
  if(!category) return 'default';
  const cat=category.toLowerCase();
  for(const g of CARD_GRADIENTS){ if(cat.includes(g)) return g; }
  return 'community event';
}
function formatWhen(iso){
  if(!iso) return '';
  const d=new Date(iso);
  const now=new Date();
  const diff=d-now;
  if(diff<0) return '';
  const days=Math.floor(diff/86400000);
  const hours=Math.floor((diff%86400000)/3600000);
  if(days>0) return days===1?'Tomorrow':`${days}d away`;
  if(hours>0) return `${hours}h away`;
  const mins=Math.floor((diff%3600000)/60000);
  return mins>0?`${mins}m away`:'Soon';
}
async function loadSwipeDeck(){
  const deck=document.querySelector('#swipe-deck');
  if(!deck) return;
  deck.innerHTML='<div class="swipe-empty"><div class="swipe-empty-icon">\u25CE</div><p>Loading upcoming...</p></div>';
  const data=await getRankedDiscoverPlans({forSwipe:true});
  swipeStack=data.slice(0,20);
  swipeIndex=0;
  swipeHistory=[];
  renderSwipeCard();
  renderSwipeActions();
  renderSwipeProgress();
}
function renderSwipeProgress(){
  const row=document.querySelector('#swipe-progress-row');
  if(!row) return;
  const total=swipeStack.length;
  const remaining=Math.max(0,total-swipeIndex);
  if(total===0){ row.innerHTML=''; return; }
  const pct=total>0?((swipeIndex/total)*100):0;
  row.innerHTML=`<div class="swipe-progress-bar"><div class="swipe-progress-fill" style="width:${pct}%"></div></div><span class="swipe-progress-text">${remaining} remaining</span>`;
}
function renderSwipeActions(){
  const row=document.querySelector('#swipe-actions-row');
  if(!row) return;
  const hasCards=swipeIndex<swipeStack.length;
  const hasHistory=swipeHistory.length>0;
  row.innerHTML=`<button class="swipe-action-btn swipe-action-btn-undo" ${hasHistory?'':'disabled style="opacity:0.3;pointer-events:none"'} title="Undo">\u21A9</button><button class="swipe-action-btn swipe-action-btn-pass" title="Pass">\u2715</button><button class="swipe-action-btn swipe-action-btn-like" title="Interested">\u2665</button>`;
  row.querySelector('.swipe-action-btn-pass').onclick=()=>doSwipe(false);
  row.querySelector('.swipe-action-btn-like').onclick=()=>doSwipe(true);
  const undoBtn=row.querySelector('.swipe-action-btn-undo');
  if(undoBtn && hasHistory) undoBtn.onclick=()=>undoSwipe();
}
function renderSwipeCard(){
  const deck=document.querySelector('#swipe-deck');
  if(!deck) return;
  if(swipeIndex >= swipeStack.length){
    deck.innerHTML=`<div class="swipe-empty"><div class="swipe-empty-icon">\u25CE</div><h3>No more upcoming</h3><p>Check back later or create one.</p><button onclick="loadSwipeDeck()">Refresh</button></div>`;
    renderSwipeProgress();
    renderSwipeActions();
    return;
  }
  deck.innerHTML='';
  const stackSize=Math.min(3,swipeStack.length-swipeIndex);
  for(let i=stackSize-1;i>=0;i--){
    const p=swipeStack[swipeIndex+i];
    const el=buildSwipeCardEl(p,i);
    deck.appendChild(el);
  }
  const mainCard=deck.querySelector('.swipe-stack-card[data-depth="0"]');
  if(mainCard) attachDragHandlers(mainCard);
  renderSwipeProgress();
  renderSwipeActions();
}
function buildSwipeCardEl(p,depth){
  const title=escapeHtml(p.title||'Untitled');
  const loc=escapeHtml(p.location||'');
  const when=formatWhen(p.starts_at);
  const cat=escapeHtml(p.category||'Event');
  const cap=p.capacity?`${p.joinedCount||0}/${p.capacity}`:`${p.joinedCount||0} joined`;
  const gradient=getCardGradient(p.category);
  const captionText=escapeHtml(p.caption||'A new plan is taking shape. Swipe right if you are interested.');
  const el=document.createElement('div');
  el.className='swipe-stack-card'+(depth>0?' swipe-peek swipe-peek-'+depth:'');
  el.setAttribute('data-depth',depth);
  el.innerHTML=`
    <div class="card-visual">
      <div class="card-gradient" data-cat="${gradient}"></div>
      <div style="position:relative;text-align:center;padding:20px;z-index:1">
        <div style="display:inline-block;background:rgba(255,255,255,0.92);backdrop-filter:blur(10px);border-radius:999px;padding:5px 11px;font:700 10px -apple-system,sans-serif;letter-spacing:0.05em;color:var(--apple-ink);box-shadow:0 2px 8px rgba(0,0,0,0.06)">UPCOMING \u00b7 ${cat}</div>
        <h3 style="font:700 26px -apple-system,sans-serif;letter-spacing:-0.03em;margin:14px 0 6px;line-height:1.05;color:var(--apple-ink)">${title}</h3>
        <p style="font:500 12px -apple-system,sans-serif;color:var(--apple-muted);margin:0">${when}${loc?' \u00b7 '+loc:''}</p>
        <p style="margin-top:10px;font:600 11px -apple-system,sans-serif;letter-spacing:0.04em;color:var(--apple-accent)">${cap}</p>
      </div>
      <div class="swipe-badge swipe-badge-like">LIKE \u2665</div>
      <div class="swipe-badge swipe-badge-nope">PASS \u2715</div>
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="card-category"><span class="cat-dot"></span>${cat}</span>
        <span class="card-when">${when}</span>
      </div>
      <h3>${title}</h3>
      <p class="card-location">\uD83D\uDCCD ${loc||'Somewhere'}</p>
      <p class="card-caption">${captionText}</p>
      <div class="card-footer">
        <span class="card-chip">\uD83D\uDC65 ${cap}</span>
        ${p.neighborhood?'<span class="card-chip">\uD83C\uDFE0 '+escapeHtml(p.neighborhood)+'</span>':''}
      </div>
    </div>`;
  return el;
}
function attachDragHandlers(card){
  let startX=0,startY=0,curX=0,curY=0,dragging=false,startTime=0;
  let lastX=0,lastTime=0,velocityX=0;
  const likeBadge=card.querySelector('.swipe-badge-like');
  const nopeBadge=card.querySelector('.swipe-badge-nope');
  const onDown=e=>{
    if(e.button && e.button!==0) return;
    dragging=true; startTime=Date.now();
    startX=(e.touches?e.touches[0].clientX:e.clientX);
    startY=(e.touches?e.touches[0].clientY:e.clientY);
    lastX=startX; lastTime=startTime; velocityX=0;
    card.classList.add('dragging');
    card.style.transition='none';
    if(card.setPointerCapture && e.pointerId!==undefined) card.setPointerCapture(e.pointerId);
  };
  const onMove=e=>{
    if(!dragging) return;
    const x=(e.touches?e.touches[0].clientX:e.clientX);
    const y=(e.touches?e.touches[0].clientY:e.clientY);
    const now=Date.now();
    const dt=now-lastTime;
    if(dt>0) velocityX=(x-lastX)/dt;
    lastX=x; lastTime=now;
    curX=x-startX;
    curY=(y-startY)*0.3;
    const absX=Math.abs(curX);
    const rot=curX*0.06;
    const scale=Math.max(0.96,1-absX*0.0004);
    card.style.transform=`translateX(${curX}px) translateY(${curY}px) rotate(${rot}deg) scale(${scale})`;
    if(likeBadge){ likeBadge.style.opacity=curX>30?Math.min((curX-30)/70,1):0; likeBadge.classList.toggle('visible',curX>30); }
    if(nopeBadge){ nopeBadge.style.opacity=curX<-30?Math.min((-curX-30)/70,1):0; nopeBadge.classList.toggle('visible',curX<-30); }
    const stack=card.parentElement?.querySelectorAll('.swipe-peek');
    stack?.forEach(pk=>{
      const depth=parseInt(pk.getAttribute('data-depth'))||1;
      const progress=Math.min(absX/150,1);
      const ty=8-depth*8+progress*6;
      const sc=0.96+progress*0.02*(depth===1?1:0);
      pk.style.transform=`translateY(${ty}px) scale(${sc})`;
      pk.style.opacity=0.7+progress*0.3;
    });
    e.preventDefault?.();
  };
  const onUp=()=>{
    if(!dragging) return;
    dragging=false;
    card.classList.remove('dragging');
    card.style.transition='transform .35s cubic-bezier(.2,.8,.2,1)';
    const totalVelocity=velocityX*1000;
    const shouldSwipe=Math.abs(curX)>SWIPE_THRESHOLD||Math.abs(totalVelocity)>SWIPE_VELOCITY_THRESHOLD*1000;
    if(shouldSwipe){
      doSwipe(curX>0);
    } else {
      card.style.transform='translateX(0px) translateY(0px) rotate(0deg) scale(1)';
      if(likeBadge){ likeBadge.style.opacity=0; likeBadge.classList.remove('visible'); }
      if(nopeBadge){ nopeBadge.style.opacity=0; nopeBadge.classList.remove('visible'); }
      const stack=card.parentElement?.querySelectorAll('.swipe-peek');
      stack?.forEach(pk=>{
        const depth=parseInt(pk.getAttribute('data-depth'))||1;
        pk.style.transition='transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s ease';
        pk.style.transform=`translateY(${depth*8}px) scale(${1-depth*0.04})`;
        pk.style.opacity=Math.max(0,1-depth*0.3);
      });
    }
    curX=0;curY=0;
  };
  card.addEventListener('pointerdown',onDown);
  card.addEventListener('pointermove',onMove);
  card.addEventListener('pointerup',onUp);
  card.addEventListener('pointercancel',onUp);
  card.addEventListener('touchstart',onDown,{passive:true});
  card.addEventListener('touchmove',onMove,{passive:false});
  card.addEventListener('touchend',onUp);
}
function undoSwipe(){
  if(!swipeHistory.length) return;
  const prev=swipeHistory.pop();
  swipeIndex=prev.index;
  renderSwipeCard();
  showToast('Undone \u21A9');
}
async function doSwipe(interested){
  const p=swipeStack[swipeIndex];
  if(!p) return;
  const deck=document.querySelector('#swipe-deck');
  const card=deck?.querySelector('.swipe-stack-card[data-depth="0"]');
  if(card){
    card.style.transition='transform .4s cubic-bezier(.2,.8,.2,1), opacity .4s ease';
    const flyX=interested? window.innerWidth*0.8 : -window.innerWidth*0.8;
    const flyRot=interested?25:-25;
    card.style.transform=`translateX(${flyX}px) rotate(${flyRot}deg) scale(0.9)`;
    card.style.opacity='0';
  }
  swipeHistory.push({index:swipeIndex, plan:p});
  if(supabase && p.id){
    if(interested){
      savedEventIds.add(p.id);
      localStorage.setItem('evenit-saved-events', JSON.stringify([...savedEventIds]));
      try{ await supabase.from('plan_swipes').upsert({user_id: currentUser?.id, plan_id: p.id, interested: true, updated_at: new Date().toISOString()}); }catch{}
      const matching=posts.find(post=>post.id===p.id);if(matching){matching.swipeInterest=true;matching.interested=true;matching.saved=true;}renderPulseBar();
    } else {
      try{ await supabase.from('plan_swipes').upsert({user_id: currentUser?.id, plan_id: p.id, interested: false, updated_at: new Date().toISOString()}); }catch{}
      const matching=posts.find(post=>post.id===p.id);if(matching){matching.swipeInterest=false;matching.interested=false;}
    }
  }
  if(interested){
    // A positive swipe expresses intent, then opens the same complete request
    // page as the Interested button. It does not silently submit or bypass
    // the host's questions and verification requirements.
    const matching=posts.find(post=>post.id===p.id)||p;
    swipeIndex++;
    renderSwipeCard();
    await requestPlanInterest(matching);
    return;
  }
  showToast(interested?'Interested \u2713 — added to your timeline':'Passed — we’ll show you less like this');
  await new Promise(r=>setTimeout(r,380));
  if(!interested){
    const remaining=swipeStack.slice(swipeIndex+1);
    const category=String(p.category||'').toLowerCase();
    const different=remaining.filter(item=>String(item.category||'').toLowerCase()!==category);
    const similar=remaining.filter(item=>String(item.category||'').toLowerCase()===category);
    swipeStack=[...swipeStack.slice(0,swipeIndex+1),...different,...similar];
  }
  swipeIndex++;
  renderSwipeCard();
}
 async function renderNotifications(){if(!supabase||!currentUser){pageView.innerHTML=pageTemplates.notifications;applyAdminContent();applyAdminStyles();return}const {data,error}=await supabase.from('notifications').select('id,message,created_at,actor_id,kind').order('created_at',{ascending:false}).limit(20);const message=error?`<div class="empty-message">Notifications could not load.<br><span>${escapeHtml(error.message)}</span></div>`:data?.length?data.map(item=>`<div class="activity"><span class="notification-mark">✦</span><p>${escapeHtml(item.message)}<small>${new Date(item.created_at).toLocaleString()}</small></p>${item.kind==='follow_request'?`<div class="follow-request-actions"><button data-follow-response="approve" data-follower-id="${escapeHtml(item.actor_id)}">Allow</button><button data-follow-response="decline" data-follower-id="${escapeHtml(item.actor_id)}">Decline</button></div>`:''}</div>`).join(''):'<div class="empty-message">No notifications yet.<br><span>Join a plan or follow a topic to get updates.</span></div>';pageView.innerHTML=`<div class="page-header"><p class="overline">Stay in the loop</p><h2>Notifications</h2></div><div class="activity-list">${message}</div>`;document.querySelectorAll('[data-follow-response]').forEach(button=>button.onclick=async()=>{const {error}=await supabase.rpc('respond_to_follow_request',{p_follower_id:button.dataset.followerId,p_approve:button.dataset.followResponse==='approve'});if(error){showToast(error.message);return}showToast(button.dataset.followResponse==='approve'?'Follow request approved':'Follow request declined');renderNotifications();});applyAdminContent();applyAdminStyles()}
function setPage(page){const from=!pageView.hidden?(document.querySelector('[data-page].active')?.dataset.page||'home'):null;if(from&&from!==page)pushNav(from);homeElements.forEach(element=>element.hidden=page!=='home');pageView.hidden=page==='home';document.querySelectorAll('[data-page]').forEach(link=>link.classList.toggle('active',link.dataset.page===page));updateMobileHeader(page);if(page==='home'){navHistory=[];loadAftermathFeed();}else{if(page==='profile')renderProfile();else if(page==='discover')renderDiscover();else if(page==='notifications')renderNotifications();else if(page==='saved')renderSavedPage();else if(page==='messages'||page==='groups'){pageView.innerHTML=pageTemplates.messages;loadGroupMessagesPreview();loadGroups();}else pageView.innerHTML=pageTemplates[page]||pageTemplates.settings}window.scrollTo({top:0,behavior:'smooth'})}
const evenitSetPage=setPage;
setPage=function(page){
  evenitSetPage(page);
  if(page==='home'){
    // render the plan board after any previous aftermath refresh resolves
    setTimeout(()=>{ if(pageView.hidden)renderPlanBoard(); },0);
  }
  if(page==='messages'||page==='groups'){
    const header=document.querySelector('.message-header');
    if(header&&!document.querySelector('.messages-topbar'))header.insertAdjacentHTML('beforebegin','<div class="page-topbar messages-topbar"><button class="topbar-brand" type="button" data-page="home">evenit</button><div class="message-filter"><button class="filter-chip active" data-message-filter="all">All</button><button class="filter-chip" data-message-filter="unread">Unread</button></div><button class="topbar-icon" type="button" aria-label="Filter messages">☷</button></div>');
    if(page==='groups')document.querySelector('.msg-tab[data-msg-tab="groups"]')?.click();
    document.querySelector('#open-group-create')?.addEventListener('click',()=>currentUser?document.querySelector('#group-modal')?.classList.add('open'):loginModal?.classList.add('open'));
  }
};
function renderProfileTab(tab){const content=document.querySelector('.profile-empty');if(!content)return;const key=tab.textContent.toLowerCase();
if(key.includes('lived')){ renderLivedOn(content); return; }
const items=key.includes('saved')?posts.filter(post=>savedEventIds.has(post.id||post.title)):posts.filter(post=>post.user_id===currentUser?.id);
if(!items.length){content.innerHTML=`<span>✦</span><h3>No ${key} events yet</h3><p>Your ${key} events will appear here.</p>${key.includes('plans')?'<button class="publish-button" id="profile-post">Create plan <span>→</span></button>' :''}`;const create=document.querySelector('#profile-post');if(create)create.onclick=()=>modal.classList.add('open');return}
content.innerHTML=items.map(post=>{const owner=post.user_id===currentUser?.id;const attendedBadge=post.entryPass?.checked_in_at?' \u00b7 Attended \u2713':'';return`<button class="profile-event ${post.entryPass?.checked_in_at?'is-attended':''}" ${owner?`data-insights-id="${escapeHtml(post.id)}"`:''}><span>\u2726</span><div><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.location)} \u00b7 ${post.joinedCount||0}${post.capacity?`/${post.capacity}`:''} joined${attendedBadge}</small></div>${owner?'<b>Insights \u2197</b>':''}</button>`}).join('');
const create=document.querySelector('#profile-post');if(create)create.onclick=()=>modal.classList.add('open');
}
document.querySelectorAll('[data-page]').forEach(link=>link.onclick=e=>{e.preventDefault();setPage(link.dataset.page)});
if(supabase){supabase.auth.getSession().then(({data})=>{currentUser=data.session?.user||null;updateAccountUI();loadPlans();loadAftermathFeed();});supabase.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;updateAccountUI();if(session?.user&&pageView&&!pageView.hidden)renderProfile();loadAftermathFeed();})}else{updateAccountUI();loadPlans();loadAftermathFeed();}
const modal=document.querySelector('#modal');document.querySelector('#open-modal').onclick=()=>modal.classList.add('open');document.querySelector('#open-modal-header')?.addEventListener('click',()=>modal.classList.add('open'));document.querySelector('#open-modal-mobile')?.addEventListener('click',()=>modal.classList.add('open'));document.querySelector('#close-modal').onclick=()=>modal.classList.remove('open');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('open')};
const loginModal=document.querySelector('#login-modal');const openLogin=()=>loginModal.classList.add('open');document.querySelector('#open-login')?.addEventListener('click',openLogin);document.querySelector('#open-login-mobile')?.addEventListener('click',openLogin);document.querySelector('#close-login').onclick=()=>loginModal.classList.remove('open');loginModal.onclick=e=>{if(e.target===loginModal)loginModal.classList.remove('open')};document.querySelector('#login-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {data:result,error}=await supabase.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});if(error){showToast(error.message);return}currentUser=result.user;updateAccountUI();loginModal.classList.remove('open');showToast('Welcome back to upneXt ✦')};document.querySelector('#signup-link').onclick=e=>{e.preventDefault();loginModal.classList.remove('open');signupModal.classList.add('open')};
const signupModal=document.querySelector('#signup-modal');document.querySelector('#close-signup').onclick=()=>signupModal.classList.remove('open');signupModal.onclick=e=>{if(e.target===signupModal)signupModal.classList.remove('open')};document.querySelector('#signup-link').onclick=e=>{e.preventDefault();loginModal.classList.remove('open');signupModal.classList.add('open')};document.querySelector('#back-to-login').onclick=e=>{e.preventDefault();signupModal.classList.remove('open');loginModal.classList.add('open')};document.querySelector('#signup-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {data:result,error}=await supabase.auth.signUp({email:data.get('email'),password:data.get('password'),options:{emailRedirectTo:window.location.href,data:{username:data.get('username'),full_name:data.get('full_name'),neighborhood:data.get('neighborhood'),interest:data.get('interest')}}});if(error){showToast(error.message);return}currentUser=result.session?result.user:null;updateAccountUI();signupModal.classList.remove('open');showToast(result.session?'Profile created and you are signed in ✦':'Check your email to verify your profile, then log in ✦');setPage('profile')};
document.querySelector('#post-form').onsubmit=async e=>{e.preventDefault();const form=e.target;const data=new FormData(form);const publishButton=form.querySelector('[type="submit"]');if(!supabase){showToast('Connection setup is unavailable. Reopen the app while online.');return}if(!navigator.onLine){showToast('You are offline. Connect to Wi-Fi or mobile data, then try again.');return}const {data:sessionData,error:sessionError}=await supabase.auth.getSession();const liveUser=sessionData?.session?.user;if(sessionError||!liveUser){currentUser=null;updateAccountUI();showToast('Your login expired. Please log in again before publishing.');loginModal.classList.add('open');return}currentUser=liveUser;const capacityValue=String(data.get('capacity')||'').trim();const capacity=capacityValue?Number(capacityValue):null;if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1)){showToast('Attendance limit must be a whole number greater than zero');return}const startsValue=String(data.get('when')||'').trim();const startsAt=startsValue?new Date(startsValue):null;if(!startsAt||Number.isNaN(startsAt.getTime())){showToast('Choose a valid date and time for the event.');return}publishButton.disabled=true;publishButton.textContent='Publishing…';try{let {data:profile,error:profileError}=await supabase.from('profiles').select('neighborhood,latitude,longitude').eq('id',currentUser.id).maybeSingle();if(profileError)throw profileError;if(!profile){const metadata=currentUser.user_metadata||{};const {error:createProfileError}=await supabase.from('profiles').upsert({id:currentUser.id,username:metadata.username||currentUser.email.split('@')[0],full_name:metadata.full_name||null});if(createProfileError)throw new Error('Your profile needs to finish syncing: '+createProfileError.message);const result=await supabase.from('profiles').select('neighborhood,latitude,longitude').eq('id',currentUser.id).maybeSingle();profile=result.data}const {data:plan,error}=await supabase.from('plans').insert({user_id:currentUser.id,title:String(data.get('title')).trim(),location:String(data.get('where')).trim(),starts_at:startsAt.toISOString(),caption:String(data.get('caption')||'').trim()||null,category:data.get('category'),capacity,neighborhood:profile?.neighborhood||null,requires_college_verification:data.get('requires_college_verification')==='on'}).select('id').single();if(error)throw error;if(profile?.latitude!==null&&profile?.latitude!==undefined&&profile?.longitude!==null&&profile?.longitude!==undefined){const {error:locationError}=await supabase.from('plan_locations').upsert({plan_id:plan.id,latitude:profile.latitude,longitude:profile.longitude,updated_at:new Date().toISOString()});if(locationError)showToast('Plan published; nearby-distance matching is still syncing.')}const passMemo=String(data.get('pass_memo')||'').trim();if(passMemo){const {error:passError}=await supabase.from('plan_passes').upsert({plan_id:plan.id,memo:passMemo,updated_at:new Date().toISOString()});if(passError)showToast('Plan published; the entry note could not be saved.')}modal.classList.remove('open');form.reset();await loadPlans();showToast('Your plan is live on Evenit ✦')}catch(error){console.error('Plan publish failed',error);showToast(`Could not publish: ${error?.message||'Please try again.'}`)}finally{publishButton.disabled=false;publishButton.innerHTML='Create plan <span>→</span>'}};
function showToast(message){const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2400)}
function withEvenitTimeout(promise,ms,message){let timeout;return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error(message)),ms)})]).finally(()=>clearTimeout(timeout))}
document.querySelector('#post-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const button=form.querySelector('[type="submit"]');try{if(!navigator.onLine)throw new Error('You are offline. Connect to Wi-Fi or mobile data, then try again.');const user=await withEvenitTimeout(getFreshEvenitUser(),8000,'Your login check took too long. Please try again.');const startsValue=String(data.get('when')||'').trim();const startsAt=startsValue?new Date(startsValue):null;if(!startsAt||Number.isNaN(startsAt.getTime()))throw new Error('Choose a valid date and time for the event.');const capacityValue=String(data.get('capacity')||'').trim();const capacity=capacityValue?Number(capacityValue):null;if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1))throw new Error('Attendance limit must be a whole number greater than zero.');button.disabled=true;button.textContent='Publishing…';const {data:planId,error}=await withEvenitTimeout(supabase.rpc('create_plan_atomically',{p_title:String(data.get('title')||''),p_location:String(data.get('where')||''),p_starts_at:startsAt.toISOString(),p_caption:String(data.get('caption')||''),p_category:String(data.get('category')||'Social'),p_capacity:capacity,p_requires_college_verification:data.get('requires_college_verification')==='on'}),15000,'Publishing timed out. Check your connection and try again.');if(error)throw error;if(!planId)throw new Error('The event was not confirmed by the database.');modal.classList.remove('open');form.reset();await refreshEvenitLiveData({quiet:true});showToast('Your event is live everywhere ✦')}catch(error){showToast(`Could not publish: ${error?.message||'Please try again.'}`)}finally{button.disabled=false;button.innerHTML='Create plan <span>→</span>'}};
document.querySelectorAll('.story').forEach(story=>story.onclick=()=>{ if(story.classList.contains('add-story')){ modal.classList.add('open'); } else { showToast('Stories are coming next \u2726'); } });
document.querySelectorAll('.suggestion button').forEach(button=>button.onclick=()=>{button.textContent=button.textContent==='Follow'?'Following':'Follow';showToast(button.textContent==='Following'?'You are now following this profile ✦':'Profile unfollowed')});
document.querySelectorAll('.rail-heading a').forEach(link=>link.onclick=e=>{e.preventDefault();setPage('discover')});
document.querySelectorAll('.trend').forEach(trend=>trend.onclick=()=>showToast('Opening this trending plan ✦'));
document.querySelector('#mobile-menu')?.addEventListener('click',()=>document.querySelector('.sidebar')?.classList.toggle('mobile-open'));
document.querySelector('#forgot-password').onclick=async e=>{e.preventDefault();const email=document.querySelector('#login-form input[name=email]').value;if(!email){showToast('Enter your email address first');return}if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});showToast(error?error.message:'Password reset email sent ✦')};
document.addEventListener('click',e=>{const settings=e.target.closest('[data-settings-panel]');if(!settings)return;const panel=settings.dataset.settingsPanel;if(panel==='account'){setPage('profile');requestAnimationFrame(()=>document.querySelector('.edit-profile')?.click());return}renderSettingsPanel(panel);});
function renderSettingsPanel(panel){const content={notifications:{eyebrow:'Your attention',title:'Notifications',body:'Choose the updates that are useful to you.',items:[['Plan activity','Joins, comments, and changes to plans you host'],['Following','New plans from people you follow'],['Follow requests','Requests and approvals for private profiles']]},privacy:{eyebrow:'Your boundaries',title:'Privacy & safety',body:'Your profile privacy is managed from Edit profile. Your college and enrollment information stays private until you choose to use it for a verified event.',items:[['Profile visibility','Public profiles are followed instantly; private profiles require approval.'],['Location sharing','Your approximate location is only used to surface nearby plans.'],['Event verification','College and enrollment details are never displayed publicly.']]},help:{eyebrow:'Need a hand?',title:'Help center',body:'A few answers for making plans feel easy.',items:[['Creating a plan','Set a clear time, place and guest limit so people know what to expect.'],['Joining safely','Review the event details and only share private credentials when an event specifically requests verification.'],['Contact support','Email support@evenit.app and include a screenshot if something is not working.']]}}[panel];if(!content)return;pageView.innerHTML=`<div class="settings-panel"><button class="back-link" id="back-to-settings">← Settings</button><p class="overline">${content.eyebrow}</p><h2>${content.title}</h2><p>${content.body}</p><div class="settings-detail-list">${content.items.map(([title,detail])=>`<article><strong>${title}</strong><span>${detail}</span>${panel==='notifications'?'<label class="settings-switch"><input type="checkbox" checked><i></i></label>':''}</article>`).join('')}</div></div>`;document.querySelector('#back-to-settings').onclick=()=>setPage('settings');}

document.addEventListener('click',e=>{const tab=e.target.closest('.profile-tabs button');if(tab)renderProfileTab(tab)});
document.addEventListener('click',e=>{const tab=e.target.closest('.msg-tab');if(tab){document.querySelectorAll('.msg-tab').forEach(t=>t.classList.toggle('active',t===tab));document.querySelectorAll('.msg-pane').forEach(p=>p.hidden=p.id!==`msg-${tab.dataset.msgTab}-pane`);}},undefined);
document.querySelectorAll('[data-saved-open]').forEach(button=>button.onclick=()=>{activeSavedCollection='plans';setPage('saved');});
document.addEventListener('click',e=>{const saved=e.target.closest('[data-saved-collection]');if(!saved)return;activeSavedCollection=saved.dataset.savedCollection;setPage('saved');});
function renderSavedPage(){pageView.innerHTML=`<div class="page-header saved-header"><p class="overline">Keep it close</p><h2>Saved</h2><p>Plans, people, and groups you want to return to.</p></div><div class="saved-tabs"><button class="${activeSavedCollection==='plans'?'active':''}" data-saved-collection="plans">Plans</button><button class="${activeSavedCollection==='people'?'active':''}" data-saved-collection="people">People</button><button class="${activeSavedCollection==='groups'?'active':''}" data-saved-collection="groups">Groups</button></div><div id="saved-content"></div>`;renderSavedCollection(activeSavedCollection);}
function renderSavedCollection(collection){activeSavedCollection=collection;const content=document.querySelector('#saved-content');if(!content)return;document.querySelectorAll('.saved-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.savedCollection===collection));const labels={plans:'Saved plans',people:'Saved people',groups:'Saved groups'};if(collection!=='plans'){content.innerHTML=`<div class="aftermath-empty"><div class="aftermath-empty-icon">✦</div><h3>No ${labels[collection].toLowerCase()} yet</h3><p>When you save ${collection}, they’ll be collected here.</p></div>`;return;}const items=posts.filter(post=>savedEventIds.has(post.id||post.title));content.innerHTML=items.length?`<div class="saved-events">${items.map(post=>`<button class="profile-event"><span>✦</span><div><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.location)} · ${post.joinedCount||0} joined</small></div></button>`).join('')}</div>`:`<div class="aftermath-empty"><div class="aftermath-empty-icon">✦</div><h3>No saved plans yet</h3><p>Save an event from Discover and it will stay here.</p></div>`;}
const editModal=document.querySelector('#edit-modal');const editForm=document.querySelector('#edit-form');document.addEventListener('click',e=>{const identity=e.target.closest('.post-head img,.post-head strong,.suggestion img,.suggestion strong');if(identity){e.preventDefault();setPage('profile')}if(e.target.closest('.edit-profile')){const meta=currentUser?.user_metadata||{};editForm.full_name.value=meta.full_name||'';editForm.username.value=meta.username||'';editForm.email.value=currentUser?.email||'';editModal.classList.add('open');loadProfileDetails()}});document.querySelector('#close-edit').onclick=()=>editModal.classList.remove('open');editModal.onclick=e=>{if(e.target===editModal)editModal.classList.remove('open')};
const planVerificationModal=document.querySelector('#plan-verification-modal');const planVerificationForm=document.querySelector('#plan-verification-form');let pendingVerificationPlanId=null;async function openPlanVerification(post){if(!post||!currentUser)return;pendingVerificationPlanId=post.id;const missingDetails=!post.hasCollegeDetails;document.querySelector('#plan-verification-copy').textContent=missingDetails?`${post.title} requires your college and enrollment ID before you can join. These details stay private on your profile and are shared only with this event’s organizer after you approve it below.`:`${post.title} requires your approval before the organizer can view your saved college and enrollment details. They are shared only for this event.`;planVerificationForm.reset();planVerificationModal.classList.add('open');const {data}=await supabase.from('profiles').select('college,enrollment_id').eq('id',currentUser.id).maybeSingle();if(data){planVerificationForm.college.value=data.college||'';planVerificationForm.enrollment_id.value=data.enrollment_id||'';}}document.querySelector('#close-plan-verification').onclick=()=>planVerificationModal.classList.remove('open');planVerificationModal.onclick=event=>{if(event.target===planVerificationModal)planVerificationModal.classList.remove('open')};planVerificationForm.onsubmit=async event=>{event.preventDefault();if(!currentUser||!pendingVerificationPlanId)return;const button=planVerificationForm.querySelector('[type=submit]');const data=new FormData(planVerificationForm);const college=String(data.get('college')||'').trim();const enrollmentId=String(data.get('enrollment_id')||'').trim();if(!college||!enrollmentId||data.get('share_verification')!=='on'){showToast('Add both details and confirm access for this organizer.');return}button.disabled=true;button.textContent='Authorizing…';try{const {error}=await supabase.from('profiles').update({college,enrollment_id:enrollmentId}).eq('id',currentUser.id);if(error)throw error;const {error:accessError}=await supabase.rpc('grant_plan_verification_access',{p_plan_id:pendingVerificationPlanId});if(accessError)throw accessError;collegeVerificationReady=true;const planId=pendingVerificationPlanId;planVerificationModal.classList.remove('open');await loadPlans();const plan=posts.find(post=>post.id===planId);if(plan?.membershipStatus==='confirmed'||plan?.membershipStatus==='waitlisted')showAgendaDetail(planId);else if(plan)await joinTimelinePlan(planId);showToast('Verification saved — finishing your join now.')}catch(error){showToast(`Could not save verification: ${error?.message||'Try again.'}`)}finally{button.disabled=false;button.innerHTML='Share and join <span>→</span>'}};
async function getFreshEvenitUser(){if(!supabase)throw new Error('Live database connection is unavailable.');const {data,error}=await supabase.auth.refreshSession();const user=data?.user||data?.session?.user;if(error||!user)throw new Error('Your login expired. Please log in again.');currentUser=user;return user}
async function uploadProfileMedia(file,type,userId){if(!file||!file.name)return null;const extension=file.name.split('.').pop().toLowerCase();const path=`${userId}/${type}-${Date.now()}.${extension}`;const {error}=await supabase.storage.from('profile-media').upload(path,file,{upsert:true,contentType:file.type});if(error)throw error;return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl}
editForm.onsubmit=async e=>{e.preventDefault();const saveButton=editForm.querySelector('[type="submit"]');try{if(!navigator.onLine)throw new Error('You are offline. Connect to Wi-Fi or mobile data, then save.');const user=await getFreshEvenitUser();const data=new FormData(editForm);saveButton.disabled=true;saveButton.textContent='Saving…';const avatarUrl=await uploadProfileMedia(data.get('avatar'),'avatar',user.id);const bannerUrl=await uploadProfileMedia(data.get('banner'),'banner',user.id);const profile={id:user.id,full_name:String(data.get('full_name')||'').trim(),username:String(data.get('username')||'').trim(),about:String(data.get('about')||'').trim()||null,neighborhood:String(data.get('neighborhood')||'').trim()||null,college:String(data.get('college')||'').trim()||null,enrollment_id:String(data.get('enrollment_id')||'').trim()||null,is_private:data.get('profile_visibility')==='private',...(avatarUrl?{avatar_url:avatarUrl}:{}),...(bannerUrl?{banner_url:bannerUrl}:{})};if(!profile.full_name||!profile.username)throw new Error('Full name and username are required.');const {error:profileError}=await supabase.from('profiles').upsert(profile,{onConflict:'id'});if(profileError)throw profileError;const metadata={...user.user_metadata,full_name:profile.full_name,username:profile.username,...(avatarUrl?{avatar_url:avatarUrl}:{}),...(bannerUrl?{banner_url:bannerUrl}:{})};const {data:result,error:authError}=await supabase.auth.updateUser({data:metadata});if(authError)throw authError;currentUser=result.user||user;updateAccountUI();editModal.classList.remove('open');renderProfile();showToast('Profile updated everywhere ✦')}catch(error){showToast(`Could not save profile: ${error?.message||'Try again.'}`)}finally{saveButton.disabled=false;saveButton.innerHTML='Save profile <span>✓</span>'}};
document.addEventListener('click',e=>{if(e.target.closest('.edit-profile')){const meta=currentUser?.user_metadata||{};editForm.full_name.value=meta.full_name||'';editForm.username.value=meta.username||'';editForm.email.value=currentUser?.email||'';editModal.classList.add('open');loadProfileDetails()}});
async function loadProfileDetails(){if(!supabase||!currentUser)return;const {data}=await supabase.from('profiles').select('college,enrollment_id,about,is_private,banner_url,avatar_url,neighborhood').eq('id',currentUser.id).maybeSingle();if(!data)return;if(data.banner_url){const cover=document.querySelector('.profile-cover');if(cover)cover.style.backgroundImage=`url("${data.banner_url}")`}if(data.avatar_url){const profileImage=document.querySelector('.profile-intro img');if(profileImage)profileImage.src=data.avatar_url;const navImage=document.querySelector('#nav-avatar img');if(navImage)navImage.src=data.avatar_url}const about=document.querySelector('.profile-about-own');if(about){about.hidden=!data.about;about.textContent=data.about||''}if(editModal.classList.contains('open')){editForm.college.value=data.college||'';editForm.enrollment_id.value=data.enrollment_id||'';editForm.about.value=data.about||'';editForm.neighborhood.value=data.neighborhood||'';editForm.profile_visibility.value=data.is_private?'private':'public'}}
document.addEventListener('click',e=>{if(e.target.closest('[data-page="profile"]')||e.target.closest('#edit-profile'))setTimeout(loadProfileDetails,100)});
document.querySelector('#use-location').onclick=()=>{const status=document.querySelector('#location-status');if(!navigator.geolocation){status.textContent='Location is not available in this browser.';return}status.textContent='Requesting your approximate location...';navigator.geolocation.getCurrentPosition(async position=>{currentLocation={latitude:position.coords.latitude,longitude:position.coords.longitude};const {error}=await supabase.from('profiles').update(currentLocation).eq('id',currentUser.id);status.textContent=error?'Could not save location.': 'Approximate location saved for nearby event distance.';if(error)showToast(error.message)},()=>{status.textContent='Location permission was not granted.'},{enableHighAccuracy:false,maximumAge:300000,timeout:10000})};
const photoViewer=document.querySelector('#photo-viewer');document.addEventListener('click',e=>{const photo=e.target.closest('.profile-intro img');if(!photo)return;document.querySelector('#expanded-photo').src=photo.src;photoViewer.classList.add('open')});document.querySelector('#close-photo').onclick=()=>photoViewer.classList.remove('open');photoViewer.onclick=e=>{if(e.target===photoViewer)photoViewer.classList.remove('open')};
document.title='Evenit | Make plans happen';
 function applyExperienceControls(settings){const experience=settings?.experience||{};const name=experience.brand_name||settings?.site_name||'Evenit';const logoUrl=experience.logo_url?.trim();document.querySelectorAll('.logo').forEach(logo=>{logo.replaceChildren();if(logoUrl){const image=document.createElement('img');image.className='brand-logo-image';image.src=logoUrl;image.alt='';image.onerror=()=>image.remove();logo.append(image)}const label=document.createElement('span');label.textContent=name;logo.append(label)});const favicon=document.querySelector('#site-favicon');if(favicon&&experience.app_icon_url?.trim())favicon.href=experience.app_icon_url.trim();const root=document.documentElement;root.style.setProperty('--admin-surface-opacity',`${Math.min(100,Math.max(65,Number(experience.surface_opacity??92)))/100}`);root.style.setProperty('--admin-radius',`${Math.min(34,Math.max(10,Number(experience.corner_radius??22)))}px`);root.style.setProperty('--admin-shadow-opacity',`${Math.min(45,Math.max(0,Number(experience.shadow_strength??8)))/100}`);root.dataset.contentDensity=experience.content_density||'balanced';const kicker=document.querySelector('.feed-kicker');if(kicker&&experience.header_tagline)kicker.textContent=experience.header_tagline;const footer=document.querySelector('#site-footer');if(footer){footer.hidden=experience.show_footer===false;if(experience.footer_text)footer.textContent=experience.footer_text}const dock={home:['home','dock_home'],discover:['discover','dock_discover'],messages:['messages','dock_messages'],profile:['profile','dock_profile']};Object.entries(dock).forEach(([page,[key,labelKey]])=>{const item=document.querySelector(`.mobile-dock [data-page="${page}"]`);if(!item)return;const label=experience[labelKey];if(label){item.querySelector('small').textContent=label;item.setAttribute('aria-label',label)}const icon=experience[`icon_${page}`];if(icon)item.querySelector('span').textContent=icon});const create=document.querySelector('[data-dock-create]');if(create&&experience.dock_create){create.querySelector('small').textContent=experience.dock_create;create.setAttribute('aria-label',experience.dock_create)}const homeHeart=document.querySelector('.home-notification-link');if(homeHeart)homeHeart.hidden=experience.show_home_heart===false;const sync=document.querySelector('#connection-refresh');if(sync)sync.hidden=experience.show_sync_control===false;const stories=document.querySelector('#pulse-bar');if(stories)stories.hidden=experience.show_stories===false||document.querySelector('[data-page].active')?.dataset.page!=='home';const nearby=document.querySelector('.right-rail');if(nearby)nearby.hidden=experience.show_right_rail===false;}
 async function loadSiteSettings(){if(!supabase)return;const {data}=await supabase.from('site_settings').select('*').single();if(!data)return;document.title=`${data.site_name} | Make plans happen`;document.documentElement.style.setProperty('--violet',data.primary_color);document.documentElement.style.setProperty('--gold',data.accent_color);applyExperienceControls(data);document.querySelectorAll('.like').forEach(button=>button.textContent=data.reaction_icon);const notification=document.querySelector('[data-page="notifications"]');if(notification){const label=[...notification.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.nodeValue.includes('Notifications'));if(label)label.nodeValue=label.nodeValue.replace('Notifications',data.notification_label)}}
loadSiteSettings();
 if(supabase){supabase.channel('evenit-site-settings').on('postgres_changes',{event:'UPDATE',schema:'public',table:'site_settings'},()=>{loadSiteSettings();applyAdminContent();applyAdminStyles();showToast('Live design update applied ✦')}).subscribe()}
 async function applyAdminContent(){if(!supabase)return;const {data}=await supabase.from('site_settings').select('*').single();const content=data?.content||{};adminContent=content;const setText=(selector,value)=>{if(!value)return;document.querySelectorAll(selector).forEach(element=>{const text=[...element.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.nodeValue.trim());if(text)text.nodeValue=` ${value}`})};const setValue=(selector,value)=>{if(value)document.querySelectorAll(selector).forEach(element=>element.value=value)};setText('.post-button span',content.post_button);setText('.feed-top h1',content.home_title);setText('.feed-filter',content.home_filter);setText('[data-page="discover"]',content.discover_tab);setText('[data-page="notifications"]',content.notification_tab);setText('[data-page="messages"]',content.messages_tab);setText('[data-page="settings"]',content.settings_tab);setText('.stories .add-story small',content.home_story_label);setText('#login-form .publish-button',content.login_button);setText('#signup-form .publish-button',content.signup_button);setText('#edit-form .publish-button',content.save_button);document.querySelectorAll('.join-plan').forEach(button=>{const label=button.classList.contains('joined')?'Confirmed ✓':button.classList.contains('waitlisted')?'On waitlist':content.join_button||'Join in';button.childNodes[0].nodeValue=`${label} `});document.querySelectorAll('.like').forEach(button=>button.textContent=data.reaction_icon||content.reaction_icon||'👍🏻');setValue('.search-box input',content.discover_search);refreshPageCopy();document.title=`${data.site_name||'Evenit'} | Make plans happen`}
 applyAdminContent();
 async function applyAdminStyles(){if(!supabase)return;const {data}=await supabase.from('site_settings').select('ui_styles').single();const styles=data?.ui_styles||{};const set=(selector,key,property='color')=>{if(styles[key])document.querySelectorAll(selector).forEach(element=>element.style[property]=styles[key])};set('[data-page="home"]','nav_home');set('[data-page="discover"]','nav_discover');set('[data-page="notifications"]','nav_notifications');set('[data-page="messages"]','nav_messages');set('[data-page="profile"]','nav_profile');set('[data-page="settings"]','nav_settings');set('.post-button,.publish-button','post_button','backgroundColor');set('.join-plan','join_button','backgroundColor');set('.login-link,.profile-login-button','login_button');set('.feed-filter','feed_filter');set('.page-header h2,.feed-top h1,.profile-intro h2','page_heading');set('.post-body,.page-view,.sidebar-bottom p','body_text');set('.post,.profile-empty,.discover-result,.activity-list,.message-list,.settings-list','card_background','backgroundColor');set('.like,.notification-mark,.profile-event>span','reaction');}
 applyAdminStyles();
 function refreshPageCopy(){if(pageView.hidden)return;const page=document.querySelector('[data-page].active')?.dataset.page;const copy={discover:[adminContent.discover_eyebrow||'Find your people',adminContent.discover_title||'Discover plans worth joining.'],notifications:[adminContent.notification_eyebrow||'Stay in the loop',adminContent.notification_title||'Notifications'],messages:[adminContent.messages_eyebrow||'Keep the plan moving',adminContent.messages_title||'Messages'],settings:[adminContent.settings_eyebrow||'Make it yours',adminContent.settings_title||'Settings']};const values=copy[page];if(values){const heading=pageView.querySelector('.page-header h2');const eyebrow=pageView.querySelector('.page-header .overline');if(heading)heading.textContent=values[1];if(eyebrow)eyebrow.textContent=values[0]}if(page==='profile'){const eyebrow=pageView.querySelector('.profile-intro .overline');const emptyTitle=pageView.querySelector('.profile-empty h3');const emptyDescription=pageView.querySelector('.profile-empty>p');const create=pageView.querySelector('#profile-post');const edit=pageView.querySelector('.edit-profile');if(eyebrow&&adminContent.profile_eyebrow)eyebrow.textContent=adminContent.profile_eyebrow;if(emptyTitle&&adminContent.profile_empty_title)emptyTitle.textContent=adminContent.profile_empty_title;if(emptyDescription&&adminContent.profile_empty_description)emptyDescription.textContent=adminContent.profile_empty_description;if(create&&adminContent.create_event_button)create.firstChild.nodeValue=`${adminContent.create_event_button} `;if(edit&&adminContent.edit_profile_button)edit.textContent=adminContent.edit_profile_button}}
 function showInsightsShell(){pushNav('profile');homeElements.forEach(element=>element.hidden=true);pageView.hidden=false}
 async function renderInsights(planId){const post=posts.find(item=>item.id===planId);if(!supabase||!currentUser||!post||!post.isOwner){showToast('Only the person who created this event can view insights');return}activeInsightsPlanId=planId;showInsightsShell();pageView.innerHTML='<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back</button><p class="overline">Event insights</p><h2>Loading your numbers...</h2></div>';const {data,error}=await supabase.rpc('get_plan_insights',{p_plan_id:planId});if(error){pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back</button><p class="overline">Event insights</p><h2>Insights unavailable</h2><p class="insights-error">${escapeHtml(error.message)}</p></div>`;return}const info=typeof data==='string'?JSON.parse(data):data;const plan=info?.plan||post;const metrics=info?.metrics||{};const attendees=Array.isArray(info?.attendees)?info.attendees:[];const confirmed=attendees.filter(item=>item.status==='confirmed'&&!item.attended);const attended=attendees.filter(item=>item.attended);const waitlisted=attendees.filter(item=>item.status==='waitlisted');const attendeeCard=item=>{const distance=item.distance_miles!==null&&item.distance_miles!==undefined?`${item.distance_miles} mi away`:item.neighborhood?(item.nearby?'Nearby \u00b7 same neighborhood':`Based in ${escapeHtml(item.neighborhood)}`):'Distance not shared';const state=item.attended?'Attended \u2713':item.status==='confirmed'?'Confirmed':'Waitlist #'+(item.queue_position||'');const cardClass=item.attended?'is-attended':item.status==='waitlisted'?'is-waitlisted':'';return`<button class="attendee-card ${cardClass}" data-public-profile-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt="${escapeHtml(item.full_name||item.username)}"><span><strong>${escapeHtml(item.full_name||item.username||'Evenit member')}</strong><small>@${escapeHtml(item.username||'member')} \u00b7 ${distance}</small></span><b>${state}</b></button>`};const hostedCount=attended.length;const confirmedCount=confirmed.length+attended.length;pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back to your feed</button><div class="insights-header"><div><p class="overline">Event insights</p><h2>${escapeHtml(plan.title||post.title)}</h2><p class="insights-subtitle">${escapeHtml(plan.location||post.location)} \u00b7 ${formatDateTime(plan.starts_at||post.starts_at)}</p></div></div><div class="insights-metrics"><div class="insights-metric"><strong>${confirmedCount}</strong><span>Confirmed</span></div><div class="insights-metric"><strong>${hostedCount}</strong><span>Attended</span></div><div class="insights-metric"><strong>${waitlisted.length}</strong><span>Waitlisted</span></div><div class="insights-metric"><strong>${metrics.reach||0}</strong><span>Reach</span></div></div><div class="insights-actions"><button class="scan-button" id="open-scan">Scan entry pass <span>\u2197</span></button><span class="insights-help">Guest shows QR \u00b7 host scans once to mark Attended</span></div><div class="insights-section"><h3>Attended (${attended.length})</h3>${attended.length?attended.map(attendeeCard).join(''):'<div class="insights-empty">No one checked in yet. Scan a guest QR to mark them as attended.</div>'}</div><div class="insights-section"><h3>Confirmed (${confirmed.length})</h3>${confirmed.length?confirmed.map(attendeeCard).join(''):'<div class="insights-empty">No pending confirmed guests.</div>'}</div><div class="insights-section"><h3>Waitlisted (${waitlisted.length})</h3>${waitlisted.length?waitlisted.map(attendeeCard).join(''):'<div class="insights-empty">No one on waitlist.</div>'}</div></div>`;document.querySelector('#open-scan').onclick=()=>openScanModal(planId);document.querySelector('#back-from-insights').onclick=()=>goBack();}
async function renderPublicProfile(profileId){
  if(!supabase||!profileId)return;
  setInsightsDockScan(null);
  pushNav('profile');
  updateMobileHeader('profile');
  showInsightsShell();
  pageView.innerHTML='<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><p class="overline">Public profile</p><h2>Loading profile...</h2></div>';
  const {data,error}=await supabase.rpc('get_public_profile',{p_user_id:profileId});
  if(error||!data||!data.id){pageView.innerHTML='<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><p class="overline">Public profile</p><h2>Profile unavailable</h2><p>'+escapeHtml(error?.message||'This profile could not be loaded.')+'</p></div>';return}
  const profile=data;
  const isSelf=currentUser?.id===profile.id;
  pageView.innerHTML='<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><div class="public-profile-cover" style="'+(profile.banner_url?"background-image:url('"+escapeHtml(profile.banner_url)+"')":'')+'"></div><div class="public-profile-intro"><img src="'+escapeHtml(profile.avatar_url||'https://i.pravatar.cc/160?img=68')+'" alt="'+escapeHtml(profile.full_name||profile.username)+'"><div><p class="overline">'+(profile.is_private?'Private profile':'Public profile')+'</p><h2>'+escapeHtml(profile.full_name||profile.username||'Evenit member')+'</h2><p>@'+escapeHtml(profile.username||'member')+'</p></div></div><div class="public-profile-meta"><span>'+(profile.plans_posted||0)+'<small>plans posted</small></span><span>'+(profile.joined_count||0)+'<small>events joined</small></span><span>'+escapeHtml(profile.neighborhood||'Location private')+'<small>neighborhood</small></span></div>'+(profile.about?'<p class="profile-about">'+escapeHtml(profile.about)+'</p>':'')+'<section class="public-aftermath"><div class="lived-events-label">Lived On</div><div class="lived-loading">Loading their aftermath…</div></section></div>';
  document.querySelector('#back-from-profile').onclick=()=>goBack();
  loadPublicAftermath(profile.id);
  if(!isSelf&&currentUser){
    const intro=document.querySelector('.public-profile-intro');
    if(intro){
      const actions=document.createElement('div');
      actions.className='profile-contact-actions';
      const btn=document.createElement('button');
      btn.className='follow-btn';
      btn.dataset.followId=profile.id;
      btn.textContent='Loading...';
      const messageBtn=document.createElement('button');
      messageBtn.className='message-profile-btn';
      messageBtn.textContent='Message';
      actions.append(btn,messageBtn);
      intro.appendChild(actions);
      const setActionState=status=>{
        btn.textContent=status==='following'?'Following':status==='pending'?'Requested':'Follow';
        btn.classList.toggle('following',status==='following');
        btn.classList.toggle('requested',status==='pending');
        messageBtn.hidden=profile.is_private&&status!=='following';
      };
      supabase.rpc('get_follow_state',{p_following_id:profile.id}).then(({data:state})=>setActionState(state?.status));
      btn.onclick=async()=>{
        if(!currentUser){showToast('Log in to follow');return;}
        const {data}=await supabase.rpc('toggle_follow',{p_following_id:profile.id});
        if(data?.error){showToast(data.error);return;}
        if(data?.status==='followed'){setActionState('following');showToast('Following ✓');}
        else if(data?.status==='requested'){setActionState('pending');showToast('Follow request sent');}
        else{setActionState('none');showToast(data?.status==='request_cancelled'?'Request cancelled':'Unfollowed');}
      };
      messageBtn.onclick=()=>openDirectConversation(profile);
    }
  }
}
async function openDirectConversation(profile){
  if(!supabase||!currentUser){showToast('Log in to message');return;}
  pushNav('messages');showInsightsShell();
  pageView.innerHTML='<div class="direct-message-page"><button class="back-link" id="back-from-direct-message">← Messages</button><div class="direct-message-heading"><img src="'+escapeHtml(profile.avatar_url||'https://i.pravatar.cc/100?img=68')+'" alt=""><div><p class="overline">Direct message</p><h2>'+escapeHtml(profile.full_name||profile.username||'Evenit member')+'</h2><p>@'+escapeHtml(profile.username||'member')+'</p></div></div><div class="direct-thread" id="direct-thread"><p>Loading conversation…</p></div><form class="direct-message-form" id="direct-message-form"><input name="body" maxlength="1000" placeholder="Write a message…" required><button class="publish-button" type="submit">Send <span>→</span></button></form></div>';
  document.querySelector('#back-from-direct-message').onclick=()=>setPage('messages');
  const thread=document.querySelector('#direct-thread');
  const loadThread=async()=>{const {data,error}=await supabase.rpc('get_direct_messages',{p_other_id:profile.id});if(error){thread.innerHTML='<p class="direct-message-note">'+escapeHtml(error.message)+'</p>';return;}thread.innerHTML=data?.length?data.map(message=>'<article class="direct-bubble '+(message.sender_id===currentUser.id?'mine':'theirs')+'"><p>'+escapeHtml(message.body)+'</p><small>'+new Date(message.created_at).toLocaleString()+'</small></article>').join(''):'<p class="direct-message-note">Start the conversation.</p>';thread.scrollTop=thread.scrollHeight;};
  window.refreshEvenitDirectThread=loadThread;
  await loadThread();
  document.querySelector('#direct-message-form').onsubmit=async event=>{event.preventDefault();const form=new FormData(event.target);const body=String(form.get('body')||'').trim();if(!body)return;const {data,error}=await supabase.rpc('send_direct_message',{p_recipient_id:profile.id,p_body:body});if(error||data?.error){showToast(data?.error||error.message);return;}event.target.reset();await loadThread();};
}
async function loadPublicAftermath(profileId){const target=document.querySelector('.public-aftermath');if(!target||!supabase)return;const {data,error}=await supabase.from('plan_aftermath_posts').select('id,body,hashtags,created_at,plan_id').eq('author_id',profileId).order('created_at',{ascending:false}).limit(20);if(error||!data?.length){target.innerHTML='<div class="lived-events-label">Lived On</div><div class="lived-empty compact"><p>No aftermath shared yet.</p></div>';return;}const cards=data.map(post=>`<article class="aftermath-card lived-card"><div class="aftermath-body">${escapeHtml(post.body)}</div>${post.hashtags?.length?`<div class="aftermath-tags">${post.hashtags.map(tag=>`<span class="aftermath-tag">#${escapeHtml(tag)}</span>`).join('')}</div>`:''}<div class="aftermath-stats"><span>${formatPostTime(post.created_at)}</span></div></article>`).join('');target.innerHTML='<div class="lived-events-label">Lived On</div>'+cards;}
 document.addEventListener('click',e=>{const insights=e.target.closest('[data-insights-id]');if(insights){e.preventDefault();e.stopImmediatePropagation();renderInsights(insights.dataset.insightsId);return}const profile=e.target.closest('[data-public-profile-id],[data-profile-id]');if(profile&&profile.dataset.profileId||profile&&profile.dataset.publicProfileId){e.preventDefault();e.stopImmediatePropagation();renderPublicProfile(profile.dataset.publicProfileId||profile.dataset.profileId)}},true);
 if(supabase)supabase.auth.onAuthStateChange(()=>loadPlans());
  document.querySelectorAll('[data-page]').forEach(link=>link.addEventListener('click',()=>setTimeout(()=>{applyAdminContent();applyAdminStyles();refreshPageCopy()},150)));
 function replaceBrand(){document.querySelectorAll('body *').forEach(element=>element.childNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE&&node.nodeValue.includes('upneXt'))node.nodeValue=node.nodeValue.replaceAll('upneXt','Evenit')}))}
replaceBrand();
 const brandObserver=new MutationObserver(replaceBrand);
 brandObserver.observe(document.body,{childList:true,subtree:true});
 const entryPassModal=document.querySelector('#entry-pass-modal');
 const entryPassTitle=document.querySelector('#entry-pass-title');
 const entryPassDetails=document.querySelector('#entry-pass-details');
 const entryPassQr=document.querySelector('#entry-pass-qr');
 const entryPassState=document.querySelector('#entry-pass-state');
 const entryVerificationModal=document.querySelector('#entry-verification-modal');
 const entryVerificationTitle=document.querySelector('#entry-verification-title');
 const entryVerificationState=document.querySelector('#entry-verification-state');
 const entryVerificationGuest=document.querySelector('#entry-verification-guest');
 const entryVerificationDetails=document.querySelector('#entry-verification-details');

 function entryPassUrl(token){
   const url=new URL(window.location.href);
   url.hash='';
   url.searchParams.set('entry_pass',token);
   return url.href;
 }

 function openEntryPass(post,pass){
   if(!pass?.entry_token)return;
   entryPassTitle.textContent=pass.plan_title||post.title||'Your entry pass';
   entryPassDetails.textContent=[post.location,formatDateTime(post.starts_at)].filter(Boolean).join(' · ');
   entryPassState.textContent=pass.checked_in_at?'Already checked in':'Confirmed guest · one-time door check';
   entryPassQr.replaceChildren();
   if(window.QRCode){
     const options={text:entryPassUrl(pass.entry_token),width:220,height:220,colorDark:'#172522',colorLight:'#f7f2e8'};
     if(window.QRCode.CorrectLevel)options.correctLevel=window.QRCode.CorrectLevel.M;
     new window.QRCode(entryPassQr,options);
   }else{
     entryPassQr.textContent='QR code is still loading. Please try again.';
   }
   entryPassModal.classList.add('open');
 }

 function renderEntryPassButtons(){
   document.querySelectorAll('.post[data-plan-id]').forEach(card=>{
     const post=posts.find(item=>item.id===card.dataset.planId);
     const body=card.querySelector('.post-body');
     if(!body)return;
     body.querySelector('.entry-pass-button')?.remove();
     if(!post?.entryPass||post.membershipStatus!=='confirmed')return;
     const button=document.createElement('button');
     button.type='button';
     button.className='entry-pass-button';
     button.textContent=post.entryPass.checked_in_at?'View entry pass · Checked in':'View QR entry pass';
     button.onclick=()=>openEntryPass(post,post.entryPass);
     body.append(button);
   });
 }

 async function loadEntryPasses(){
   if(!supabase||!currentUser)return;
   const {data,error}=await supabase.rpc('get_my_entry_passes');
   if(error)return;
   const passes=new Map((data||[]).map(pass=>[pass.plan_id,pass]));
   posts=posts.map(post=>({...post,entryPass:passes.get(post.id)||null}));
   renderPosts();
   renderEntryPassButtons();
   if(!pageView.hidden&&document.querySelector('[data-page].active')?.dataset.page==='discover')renderDiscover();
   applyAdminContent();
   applyAdminStyles();
 }

 const originalLoadPlans=loadPlans;
 loadPlans=async()=>{await originalLoadPlans();await loadEntryPasses()};
  entryPassModal.querySelector('#close-entry-pass').onclick=()=>entryPassModal.classList.remove('open');
  entryPassModal.onclick=event=>{if(event.target===entryPassModal)entryPassModal.classList.remove('open')};
  entryVerificationModal.querySelector('#close-entry-verification').onclick=()=>entryVerificationModal.classList.remove('open');
  entryVerificationModal.onclick=event=>{if(event.target===entryVerificationModal)entryVerificationModal.classList.remove('open')};

  const scanModal=document.querySelector('#scan-modal');
  const scanReader=document.querySelector('#scan-reader');
  const scanStatus=document.querySelector('#scan-status');
  const scanInput=document.querySelector('#scan-input');
  const scanSubmit=document.querySelector('#scan-submit');
  const scanResult=document.querySelector('#scan-result');
  let activeScanPlanId=null;
  let html5Scanner=null;
  let scanBusy=false;
  function extractToken(raw){
    if(!raw) return '';
    const value=String(raw).trim();
    if(!value) return '';
    try{
      const url=new URL(value);
      const token=url.searchParams.get('entry_pass');
      if(token) return token.trim();
    }catch(e){}
    const match=value.match(/entry_pass=([^&\s]+)/);
    if(match) return decodeURIComponent(match[1]).trim();
    return value;
  }
  function setScanStatus(text, kind){
    scanStatus.textContent=text;
    scanStatus.className='scan-status'+(kind?' '+kind:'');
  }
  function setScanResult(text, kind){
    scanResult.textContent=text;
    scanResult.className='scan-result'+(kind?' '+kind:'');
  }
  async function verifyScannedToken(token){
    if(scanBusy) return;
    const clean=extractToken(token);
    if(!clean){ setScanResult('Enter a pass code first', 'invalid'); return; }
    if(!supabase||!currentUser){ setScanResult('Host sign-in required', 'invalid'); showToast('Log in as host to verify'); return; }
    scanBusy=true;
    setScanResult('Verifying...', '');
    const {data,error}=await supabase.rpc('verify_entry_pass',{p_entry_token:clean});
    const row=error?{valid:false,reason:error.message}: (Array.isArray(data)?data[0]:data);
    if(row?.valid){
      setScanResult(`Entry verified: ${row.attendee_name} for ${row.plan_title}`, 'valid');
      showToast(`Checked in ${row.attendee_name} \u2713`);
      const planId=row.plan_id||activeScanPlanId;
      await closeScanModal({returnToInsights:false});
      if(planId) await renderInsights(planId);
      await loadEntryPasses();
    }else{
      const reason=row?.reason||'Pass could not be verified';
      setScanResult(reason, 'invalid');
      showToast(reason);
      if(row?.plan_id) setScanStatus(`Last check: ${reason}`, 'invalid');
    }
    scanBusy=false;
  }
  async function startScanner(){
    setScanStatus('Starting camera...', '');
    setScanResult('', '');
    if(!window.Html5Qrcode){
      setScanStatus('Camera scanner unavailable, use paste field', 'invalid');
      return;
    }
    try{
      if(html5Scanner){
        try{ await html5Scanner.stop(); }catch(e){}
        try{ html5Scanner.clear(); }catch(e){}
      }
      html5Scanner=new window.Html5Qrcode('scan-reader');
      await html5Scanner.start({facingMode:'environment'}, {fps:10, qrbox:{width:250,height:250}}, async decoded=>{
        await verifyScannedToken(decoded);
      }, ()=>{});
      setScanStatus('Camera active \u00b7 point at guest QR', 'valid');
    }catch(err){
      setScanStatus(err?.message||'Camera not available', 'invalid');
    }
  }
  async function stopScanner(){
    if(html5Scanner){
      try{ await html5Scanner.stop(); }catch(e){}
      try{ html5Scanner.clear(); }catch(e){}
      html5Scanner=null;
    }
    setScanStatus('Camera idle', '');
  }
  async function closeScanModal({returnToInsights=true}={}){
    const planId=activeScanPlanId;
    await stopScanner();
    scanModal.classList.remove('open');
    activeScanPlanId=null;
    if(returnToInsights&&window.history.state?.evenitAppView?.type==='host-scan'){
      window.history.back();
      return;
    }
    if(returnToInsights&&planId&&!pageView?.querySelector('.host-approval-insights'))await renderInsights(planId);
  }
  function openScanModal(planId,options={}){
    activeScanPlanId=planId;
    scanInput.value='';
    setScanResult('', '');
    scanModal.classList.add('open');
    if(!options.restore)pushHostWorkspaceView({type:'host-scan',planId});
    startScanner();
  }
  scanModal.querySelector('#close-scan').onclick=()=>closeScanModal();
  scanModal.onclick=event=>{ if(event.target===scanModal)closeScanModal(); };
  scanSubmit.onclick=()=>verifyScannedToken(scanInput.value);
  scanInput.addEventListener('keydown', event=>{ if(event.key==='Enter'){ event.preventDefault(); verifyScannedToken(scanInput.value); } });

 function showEntryVerification(result){
   const approved=result?.valid===true;
   entryVerificationTitle.textContent=result?.plan_title||'Entry check';
   entryVerificationState.className=`verification-state ${approved?'valid':'invalid'}`;
   entryVerificationState.textContent=approved?'Entry verified':'Entry not approved';
   entryVerificationGuest.textContent=result?.attendee_name||result?.reason||'This pass could not be verified.';
   entryVerificationDetails.textContent=approved||result?.plan_id?[result.plan_title,result.location,formatDateTime(result.starts_at)].filter(Boolean).join(' · '):result?.reason||'';
   entryVerificationModal.classList.add('open');
    if(approved&&result?.plan_id){ loadEntryPasses(); if(activeInsightsPlanId===result.plan_id) renderInsights(result.plan_id); }
 }

 const entryTokenFromUrl=new URLSearchParams(window.location.search).get('entry_pass');
 let entryVerificationHandled=false;
 async function verifyIncomingEntryPass(){
   if(!entryTokenFromUrl||entryVerificationHandled)return;
   if(!currentUser){
     showToast('Log in as the event host to verify this pass');
     loginModal.classList.add('open');
     return;
   }
   entryVerificationHandled=true;
   const {data,error}=await supabase.rpc('verify_entry_pass',{p_entry_token:entryTokenFromUrl});
   showEntryVerification(error?{valid:false,reason:error.message}:rpcRow(data));
   const cleanUrl=new URL(window.location.href);
   cleanUrl.searchParams.delete('entry_pass');
   window.history.replaceState(window.history.state,'',cleanUrl.href);
 }
 if(supabase&&entryTokenFromUrl){
   supabase.auth.onAuthStateChange(()=>verifyIncomingEntryPass());
   setTimeout(verifyIncomingEntryPass,0);
 }
 
// Nearby people — real location
async function loadNearbyPeople(){
  const statusEl=document.querySelector('#nearby-status');
  const container=document.querySelector('#nearby-people');
  const railGroups=document.querySelector('#rail-groups');
  if(!container) return;
  const setStatus=(html)=>{ if(statusEl) statusEl.innerHTML=html; };
  if(!supabase||!currentUser){
    container.innerHTML='<div class="nearby-empty" style="padding:18px;text-align:center;color:#6E6E73;font-size:12px;border:1px dashed #E8E8ED;border-radius:14px;background:#fff">Log in to see nearby people.</div>';
    setStatus('Log in to see people near you');
    return;
  }
  // Try to use stored location or request
  let loc=currentLocation;
  if(!loc){
    const {data:prof}=await supabase.from('profiles').select('latitude,longitude').eq('id',currentUser.id).maybeSingle();
    if(prof?.latitude && prof?.longitude) loc={latitude:prof.latitude, longitude:prof.longitude};
  }
  if(!loc){
    container.innerHTML='<div class="nearby-empty" style="padding:18px;text-align:center;color:#6E6E73;font-size:12px;border:1px dashed #E8E8ED;border-radius:14px;background:#fff">Share location to see neighbors.<br><button id="enable-nearby-inline" style="margin-top:8px;background:#1D1D1F;color:#fff;border:none;border-radius:999px;padding:8px 14px;font:600 12px -apple-system,sans-serif;cursor:pointer">Enable location</button></div>';
    setStatus('Enable location to see people near you \u00b7 <button id="enable-nearby" style="background:none;border:none;color:#5E5CE6;font-weight:600;cursor:pointer;padding:0">Enable</button>');
    document.querySelector('#enable-nearby-inline')?.addEventListener('click', requestNearbyLocation);
    return;
  }
  setStatus('Finding people near you...');
  try{
    const {data,error}=await supabase.rpc('get_nearby_profiles',{p_limit:6});
    if(error) throw error;
    if(!data||!data.length){
      container.innerHTML='<div class="nearby-empty" style="padding:18px;text-align:center;color:#6E6E73;font-size:12px;border:1px dashed #E8E8ED;border-radius:14px;background:#fff">No nearby people yet.<br><small style="font-size:11px">Invite friends to join Evenit.</small></div>';
      setStatus('No neighbors sharing location yet');
      return;
    }
    container.innerHTML=data.map(p=>{
      const dist=p.distance_km!=null?`${p.distance_km.toFixed(1)} km away`:(p.neighborhood? `\u00b7 ${escapeHtml(p.neighborhood)}`:'');
      return `<div class="suggestion" style="padding:12px 0"><img src="${escapeHtml(p.avatar_url||'https://i.pravatar.cc/100?img=68')}" style="width:34px;height:34px;border-radius:50%;object-fit:cover"><div style="flex:1;min-width:0"><strong style="font:600 13px -apple-system,sans-serif;letter-spacing:-0.01em">${escapeHtml(p.full_name||p.username||'Evenit member')}</strong><small style="color:#6E6E73;font-size:11px">@${escapeHtml(p.username||'member')} ${dist}</small></div><button data-profile-id="${escapeHtml(p.id)}" style="border:1px solid #E8E8ED;background:#fff;border-radius:999px;padding:6px 12px;font:600 11px -apple-system,sans-serif;cursor:pointer">View</button></div>`;
    }).join('');
    setStatus(`${data.length} nearby · updated just now`);
  }catch(e){
    container.innerHTML=`<div style="padding:14px;color:#b00020;font-size:12px">${escapeHtml(e.message)}</div>`;
    setStatus('Could not load nearby');
  }
}
async function requestNearbyLocation(){
  const statusEl=document.querySelector('#nearby-status');
  if(!navigator.geolocation){ if(statusEl) statusEl.textContent='Location not available'; showToast('Location not available'); return; }
  if(statusEl) statusEl.textContent='Requesting location...';
  navigator.geolocation.getCurrentPosition(async pos=>{
    currentLocation={latitude:pos.coords.latitude, longitude:pos.coords.longitude};
    if(supabase&&currentUser){
      const {error}=await supabase.from('profiles').update(currentLocation).eq('id', currentUser.id);
      if(error){ showToast(error.message); if(statusEl) statusEl.textContent='Could not save location'; return; }
      showToast('Location saved — finding neighbors');
      await loadNearbyPeople();
      await loadGroups();
    }
  }, ()=>{ if(statusEl) statusEl.textContent='Permission denied — enable in browser settings'; showToast('Location permission denied'); }, {enableHighAccuracy:false, timeout:10000, maximumAge:300000});
}
document.querySelector('#enable-nearby')?.addEventListener('click', requestNearbyLocation);
document.querySelector('#nearby-refresh')?.addEventListener('click', loadNearbyPeople);

// Groups
async function loadGroups(){
  const list=document.querySelector('#groups-list');
  const rail=document.querySelector('#rail-groups');
  if(!list) return;
  if(!supabase||!currentUser){
    list.innerHTML='<div class="nearby-empty" style="padding:22px;text-align:center;color:#6E6E73;border:1px dashed #E8E8ED;border-radius:16px;background:#fff">Log in to see your groups.</div>';
    if(rail) rail.innerHTML='<div class="nearby-empty" style="padding:14px;text-align:center;color:#6E6E73;font-size:11px;border:1px dashed #E8E8ED;border-radius:14px;background:#fff">Log in to see groups.</div>';
    return;
  }
  list.innerHTML='<div style="padding:20px;text-align:center;color:#6E6E73">Loading groups...</div>';
  const {data,error}=await supabase.rpc('get_user_groups');
  if(error){ list.innerHTML=`<div style="padding:16px;color:#b00020">${escapeHtml(error.message)}</div>`; return; }
  if(!data||!data.length){
    list.innerHTML='<div class="nearby-empty" style="padding:28px;text-align:center;color:#6E6E73;border:1px dashed #E8E8ED;border-radius:16px;background:#fff"><div style="font-size:28px;margin-bottom:8px">◎</div><div style="font-weight:600;color:#1D1D1F">No groups yet</div><div style="font-size:12px;margin-top:6px">Create a private circle for your people. Max 150.</div><button id="empty-create-group" class="publish-button" style="margin:16px auto 0;border-radius:999px;width:auto">＋ Create group</button></div>';
    document.querySelector('#empty-create-group')?.addEventListener('click', ()=>document.querySelector('#group-modal')?.classList.add('open'));
    if(rail) rail.innerHTML='<div class="nearby-empty" style="padding:14px;text-align:center;color:#6E6E73;font-size:11px;border:1px dashed #E8E8ED;border-radius:14px;background:#fff">No groups yet.<br><small><a href="#messages" data-page="messages" style="color:#5E5CE6;font-weight:600;text-decoration:none">Create one</a></small></div>';
    return;
  }
  list.innerHTML=data.map(g=>`
    <div class="group-card" data-group-id="${escapeHtml(g.id)}" style="background:#fff;border:1px solid #E8E8ED;border-radius:18px;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:12px;box-shadow:0 2px 10px rgba(0,0,0,0.04)">
      <div style="min-width:0;flex:1"><div style="display:flex;gap:8px;align-items:center"><strong style="font:600 15px -apple-system,sans-serif;letter-spacing:-0.02em;overflow-wrap:anywhere">${escapeHtml(g.name)}</strong><span style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${g.is_private?'#5E5CE6':'#6E6E73'};background:${g.is_private?'#F2F0FF':'#F5F5F7'};border-radius:999px;padding:4px 8px">${g.is_private?'Private':'Open'}</span></div><div style="font-size:12px;color:#6E6E73;margin-top:4px;line-height:1.4;overflow-wrap:anywhere">${escapeHtml(g.description||'No description')}</div><div style="font-size:11px;color:#6E6E73;margin-top:6px">${g.member_count}/${g.max_members} members ${g.is_member?'· You’re in':''}</div></div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:0 0 auto">${g.is_member?`<button class="publish-button" data-open-group="${escapeHtml(g.id)}" style="border-radius:999px;padding:10px 16px;font-size:13px">Open</button>`:`<button class="publish-button" data-join-group="${escapeHtml(g.id)}" style="border-radius:999px;padding:10px 16px;font-size:13px;background:#1D1D1F">Join</button>`}</div>
    </div>
  `).join('');
  // rail preview
  if(rail){
    const top=data.slice(0,3);
    rail.innerHTML=top.map(g=>`<div class="suggestion" style="padding:10px 0"><div style="width:32px;height:32px;border-radius:50%;background:#F2F0FF;color:#5E5CE6;display:grid;place-items:center;font-weight:700;font-size:12px">${escapeHtml(g.name.slice(0,2).toUpperCase())}</div><div style="flex:1;min-width:0"><strong style="font:600 12px -apple-system,sans-serif">${escapeHtml(g.name)}</strong><small style="color:#6E6E73;font-size:10px">${g.member_count} members</small></div><button data-open-group="${escapeHtml(g.id)}" style="border:1px solid #E8E8ED;background:#fff;border-radius:999px;padding:5px 10px;font:600 10px -apple-system,sans-serif;cursor:pointer">Open</button></div>`).join('') || '<div class="nearby-empty" style="padding:12px;text-align:center;color:#6E6E73;font-size:11px">No groups</div>';
  }
  list.querySelectorAll('[data-join-group]').forEach(b=>b.onclick=async()=>{
    const gid=b.dataset.joinGroup;
    b.disabled=true; b.textContent='Joining...';
    const {error}=await supabase.rpc('join_group',{p_group_id:gid});
    if(error){ showToast(error.message); b.disabled=false; b.textContent='Join'; return; }
    showToast('Joined group ✓'); await loadGroups();
  });
  list.querySelectorAll('[data-open-group]').forEach(b=>b.onclick=()=>openGroup(b.dataset.openGroup));
  rail?.querySelectorAll('[data-open-group]').forEach(b=>b.onclick=()=>{ setPage('groups'); setTimeout(()=>openGroup(b.dataset.openGroup), 300); });
}
async function openGroup(groupId){
  window.evenitActiveGroupId=groupId;
  if(!supabase) return;
  const {data:group}=await supabase.from('groups').select('id,name,description').eq('id',groupId).maybeSingle();
  const {data:messages}=await supabase.from('group_messages').select('id,body,created_at,user_id').eq('group_id',groupId).order('created_at',{ascending:true}).limit(50);
  const title=group?.name||'Group';
  const listId='group-messages-'+groupId;
  pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-group">← Back to messages</button><div class="insights-header"><div><p class="overline">Private group</p><h2>${escapeHtml(title)}</h2><p style="color:#6E6E73;font-size:12px">${escapeHtml(group?.description||'Only members see messages')}</p></div><span style="background:#F2F0FF;color:#5E5CE6;border-radius:999px;padding:8px 12px;font:700 11px -apple-system,sans-serif">Private</span></div><div id="${listId}" style="margin-top:18px;display:grid;gap:10px;min-height:200px">${!messages||!messages.length?'<div style="padding:24px;text-align:center;color:#6E6E73;border:1px dashed #E8E8ED;border-radius:16px;background:#fff">No messages yet. Say hi.</div>':messages.map(m=>`<div style="background:#fff;border:1px solid #E8E8ED;border-radius:16px;padding:12px 14px"><div style="font:600 12px -apple-system,sans-serif">${escapeHtml(m.user_id.slice(0,8))}</div><div style="font-size:14px;line-height:1.45;margin-top:2px">${escapeHtml(m.body)}</div><small style="color:#6E6E73;font-size:10px">${formatPostTime(m.created_at)}</small></div>`).join('')}</div><form id="group-message-form" style="display:flex;gap:10px;margin-top:16px;position:sticky;bottom:0;background:#F5F5F7;padding:12px 0"><input id="group-message-input" placeholder="Message to group..." maxlength="500" style="flex:1;border:1px solid #E8E8ED;border-radius:999px;padding:12px 16px;font:500 14px -apple-system,sans-serif"><button type="submit" class="publish-button" style="border-radius:999px;padding:12px 18px">Send</button></form></div>`;
  document.querySelector('#back-from-group').onclick=()=>goBack();
  document.querySelector('#group-message-form').onsubmit=async (e)=>{
    e.preventDefault();
    const input=document.querySelector('#group-message-input');
    const body=input.value.trim(); if(!body) return;
    const {error}=await supabase.from('group_messages').insert({group_id:groupId, user_id:currentUser.id, body});
    if(error){ showToast(error.message); return; }
    input.value=''; openGroup(groupId);
  };
}
function renderGroups(){
  const list=document.querySelector('#groups-list');
  if(!list) return;
  document.querySelector('#open-group-create')?.addEventListener('click',()=>document.querySelector('#group-modal')?.classList.add('open'));
  loadGroups();
}
document.querySelector('#close-group-modal')?.addEventListener('click', ()=>document.querySelector('#group-modal')?.classList.remove('open'));
document.querySelector('#group-modal')?.addEventListener('click', e=>{ if(e.target.id==='group-modal') e.currentTarget.classList.remove('open'); });
document.querySelector('#group-form')?.addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const name=String(fd.get('name')||'').trim();
  const description=String(fd.get('description')||'').trim();
  const max_members=Number(fd.get('max_members')||50);
  const is_private=fd.get('is_private')!==null;
  const status=document.querySelector('#group-form-status');
  status.textContent='Creating...';
  const {data,error}=await supabase.rpc('create_group',{p_name:name, p_description:description, p_is_private:is_private, p_max_members:max_members});
  if(error){ status.textContent=error.message; showToast(error.message); return; }
  status.textContent='Group created ✓';
  showToast('Group created');
  document.querySelector('#group-modal')?.classList.remove('open');
  e.target.reset();
  renderGroups();
});
function loadGroupMessagesPreview(){ /* placeholder for messages preview */ }

// Comment sheet wiring
document.querySelector('#close-comments')?.addEventListener('click', closeComments);
document.querySelector('#comment-sheet')?.addEventListener('click', e=>{ if(e.target.id==='comment-sheet') closeComments(); });
document.querySelector('#comment-form')?.addEventListener('submit', submitComment);

// Share sheet wiring already above

// Ensure nearby and groups load after auth
const _origLoadPlans2 = loadPlans;
loadPlans = async()=>{ await _origLoadPlans2(); await loadNearbyPeople(); await loadGroups(); if(!pageView.hidden && (document.querySelector('[data-page].active')?.dataset.page==='messages'||document.querySelector('[data-page].active')?.dataset.page==='groups')) renderGroups(); };

// Fix create plan top button already handled via story, but also ensure open-modal works on top
document.querySelector('#open-modal')?.addEventListener('click', ()=>{ modal.classList.add('open'); });



async function renderLivedOn(container){
  if(!supabase||!currentUser){ container.innerHTML='<div class="lived-empty"><div class="lived-empty-icon">\u25CE</div><h3>No lived events yet</h3><p>Log in to see events you attended and stories you shared.</p></div>'; return; }
  container.innerHTML='<div class="lived-loading">Loading your stories...</div>';
  const {data,error}=await supabase.rpc('get_lived_on',{p_user_id:currentUser.id});
  if(error){ container.innerHTML=`<div class="lived-empty"><div class="lived-empty-icon">\u26A0</div><h3>Could not load</h3><p>${escapeHtml(error.message)}</p></div>`; return; }
  if(!data||!data.length){
    container.innerHTML=`<div class="lived-empty"><div class="lived-empty-icon">\u25CE</div><h3>No lived events yet</h3><p>Attend an event and get checked in by the host. After it ends, you can share your aftermath here.</p><button onclick="document.querySelector('[data-page=discover]')?.click()">Discover upcoming</button></div>`;
    return;
  }
  let allPosts=[];
  for(const row of data){
    const {data:aft}=await supabase.rpc('get_aftermath_for_plan',{p_plan_id: row.plan_id});
    if(aft){
      for(const post of aft.filter(post=>post.author_id===currentUser.id)){
        const {data:media}=await supabase.from('plan_aftermath_media').select('file_url,file_type,file_name').eq('post_id', post.id);
        allPosts.push({...post, media: media||[], plan_title:row.title, plan_location:row.location});
      }
    }
  }
  allPosts.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const livedAuthor=currentUser.user_metadata?.username?`@${currentUser.user_metadata.username}`:(currentUser.user_metadata?.full_name||'You');
  if(!allPosts.length){
    container.innerHTML=`<div class="lived-header"><div><p class="lived-label">Your stories</p><p class="lived-sub">Share the moments that stayed with you.</p></div><button class="lived-share-button" type="button" data-lived-share>Share a lived event</button></div><div class="lived-empty"><div class="lived-empty-icon">\u25CE</div><h3>Your aftermath starts here</h3><p>Only stories you share from events you attended appear on your profile.</p><div class="lived-events-list">${data.map(row=>`<div class="lived-event-item" data-lived-add="${escapeHtml(row.plan_id)}"><span class="lived-event-dot">\u2713</span><div><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.location||'')} \u00b7 ${new Date(row.starts_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div><button class="lived-add-btn">Share</button></div>`).join('')}</div></div>`;
    container.querySelector('[data-lived-share]')?.addEventListener('click',()=>openAftermathPlanPicker(data));
    container.querySelectorAll('[data-lived-add]').forEach(el=>{
      el.onclick=()=>openAftermathComposer(el.dataset.livedAdd);
    });
    return;
  }
  const livedPostsHtml=allPosts.map(post=>{
    const tags=(post.hashtags||[]).map(h=>`<span class="aftermath-tag">#${escapeHtml(h)}</span>`).join(' ');
    const mediaHtml=(post.media||[]).map(m=>{
      if(m.file_type==='image') return `<div class="aftermath-media-item image"><img src="${escapeHtml(m.file_url)}" alt="Event photo" loading="lazy"></div>`;
      if(m.file_type==='video') return `<div class="aftermath-media-item video"><video src="${escapeHtml(m.file_url)}" controls preload="none"></video></div>`;
      if(m.file_type==='pdf') return `<a class="aftermath-media-item pdf" href="${escapeHtml(m.file_url)}" target="_blank" rel="noreferrer"><span class="pdf-icon">\uD83D\uDCC4</span><span class="pdf-name">${escapeHtml(m.file_name||'PDF document')}</span></a>`;
      return '';
    }).join('');
    const gridClass=(post.media||[]).length>=2?'grid-2':(post.media||[]).length>=3?'grid-3':'';
    return`<article class="aftermath-card lived-card" data-aftermath-id="${escapeHtml(post.id)}">
      <button class="aftermath-author-line" type="button" data-public-profile-id="${escapeHtml(currentUser.id)}">${escapeHtml(livedAuthor)}</button>
      <button class="aftermath-event-context" type="button" data-aftermath-event="${escapeHtml(post.plan_id||'')}" data-event-title="${escapeHtml(post.plan_title||'')}" data-event-location="${escapeHtml(post.plan_location||'')}">
        <span class="aftermath-event-badge lived">Lived</span>
        <span class="aftermath-event-info">
          <span class="aftermath-event-title">${escapeHtml(post.plan_title||'')}</span>
          ${post.plan_location?`<span class="aftermath-event-loc">\uD83D\uDCCD ${escapeHtml(post.plan_location)}</span>`:''}
        </span><span class="aftermath-event-arrow" aria-hidden="true">›</span>
      </button>
      <div class="aftermath-body">${escapeHtml(post.body)}</div>
      ${tags?`<div class="aftermath-tags">${tags}</div>`:''}
      ${mediaHtml?`<div class="aftermath-media ${gridClass}">${mediaHtml}</div>`:''}
      <div class="aftermath-stats"><span>${formatPostTime(post.created_at)}</span></div>
    </article>`;
  }).join('');
  const postedPlanIds=new Set(allPosts.map(post=>post.plan_id));
  const eventsWithout=data.filter(row=>!postedPlanIds.has(row.plan_id));
  let eventsHtml='';
  if(eventsWithout.length){
    eventsHtml=`<div class="lived-events-section"><div class="lived-events-label">Events waiting for your story</div>${eventsWithout.map(row=>`<div class="lived-event-item" data-lived-add="${escapeHtml(row.plan_id)}"><span class="lived-event-dot">\u2713</span><div><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.location||'')} \u00b7 ${new Date(row.starts_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div><button class="lived-add-btn">+ Share</button></div>`).join('')}</div>`;
  }
  container.innerHTML=`<div class="lived-header"><div><p class="lived-label">Your stories</p><p class="lived-sub">${allPosts.length} aftermath ${allPosts.length===1?'post':'posts'} from ${data.length} event${data.length===1?'':'s'}</p></div><button class="lived-share-button" type="button" data-lived-share>Share a lived event</button></div><div class="lived-feed">${livedPostsHtml}</div>${eventsHtml}`;
  container.querySelector('[data-lived-share]')?.addEventListener('click',()=>openAftermathPlanPicker(data));
  container.querySelectorAll('[data-lived-add]').forEach(el=>{
    el.onclick=()=>openAftermathComposer(el.dataset.livedAdd);
  });
}
let activeAftermathPlanId=null;
function openAftermathComposer(planId){
  activeAftermathPlanId=planId;
  const m=document.querySelector('#aftermath-modal');
  if(m){ m.querySelector('#aftermath-plan-picker').hidden=true; m.querySelector('#aftermath-form').hidden=false; m.classList.add('open'); m.querySelector('#aftermath-status').textContent=''; m.querySelector('#aftermath-body').value=''; m.querySelector('#aftermath-tags').value=''; const list=m.querySelector('#aftermath-file-list'); if(list) list.innerHTML=''; const inp=m.querySelector('#aftermath-files'); if(inp) inp.value=''; }
}
function openAftermathPlanPicker(events){
  const available=(events||[]).filter(event=>event?.plan_id);
  if(!available.length){showToast('There are no lived events ready to share yet.');return;}
  if(available.length===1){openAftermathComposer(available[0].plan_id);return;}
  const modal=document.querySelector('#aftermath-modal');
  const picker=document.querySelector('#aftermath-plan-picker');
  const options=document.querySelector('#aftermath-plan-options');
  if(!modal||!picker||!options)return;
  options.innerHTML=available.map(event=>`<button class="aftermath-plan-option" type="button" data-aftermath-plan="${escapeHtml(event.plan_id)}"><span><strong>${escapeHtml(event.title||'Untitled event')}</strong><small>${escapeHtml(event.location||'Location to be announced')} · ${escapeHtml(formatDateTime(event.starts_at))}</small></span><b>›</b></button>`).join('');
  picker.hidden=false;
  modal.querySelector('#aftermath-form').hidden=true;
  modal.classList.add('open');
  options.querySelectorAll('[data-aftermath-plan]').forEach(button=>button.onclick=()=>openAftermathComposer(button.dataset.aftermathPlan));
}
async function submitAftermath(e){
  e.preventDefault();
  if(!supabase||!currentUser){ showToast('Log in'); return; }
  if(!activeAftermathPlanId){ showToast('Pick an event'); return; }
  const body=document.querySelector('#aftermath-body')?.value?.trim();
  const tagsRaw=document.querySelector('#aftermath-tags')?.value||'';
  const hashtags=tagsRaw.split(/[#,\s]+/).map(s=>s.trim().replace(/^#/,'')).filter(Boolean).slice(0,10);
  const files=document.querySelector('#aftermath-files')?.files;
  const status=document.querySelector('#aftermath-status');
  if(!body){ status.textContent='Write something'; return; }
  status.textContent='Posting...';
  const {data:post,error}=await supabase.from('plan_aftermath_posts').insert({plan_id:activeAftermathPlanId, author_id:currentUser.id, body, hashtags}).select('id').single();
  if(error){ status.textContent=error.message; showToast(error.message); return; }
  if(files && files.length){
    for(const file of files){
      const ext=file.name.split('.').pop().toLowerCase();
      const type=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':ext==='pdf'?'pdf':'other';
      const path=`${currentUser.id}/${post.id}-${Date.now()}-${file.name}`;
      const {error:upErr}=await supabase.storage.from('aftermath-media').upload(path, file, {upsert:true, contentType:file.type});
      if(upErr){ status.textContent=upErr.message; continue; }
      const {data:pub}=supabase.storage.from('aftermath-media').getPublicUrl(path);
      await supabase.from('plan_aftermath_media').insert({post_id:post.id, file_url:pub.publicUrl, file_type:type, file_name:file.name});
    }
  }
  status.textContent='Posted ✓';
  showToast('Aftermath shared');
  setTimeout(()=>{ document.querySelector('#aftermath-modal')?.classList.remove('open'); const tab=[...document.querySelectorAll('.profile-tabs button')].find(button=>button.textContent.includes('Lived')); if(tab) renderProfileTab(tab); }, 600);
}
document.querySelector('#close-aftermath-modal')?.addEventListener('click', ()=>document.querySelector('#aftermath-modal')?.classList.remove('open'));
document.querySelector('#aftermath-modal')?.addEventListener('click', e=>{ if(e.target.id==='aftermath-modal') e.currentTarget.classList.remove('open'); });
document.querySelector('#aftermath-form')?.addEventListener('submit', submitAftermath);
document.querySelector('#aftermath-files')?.addEventListener('change', e=>{
  const list=document.querySelector('#aftermath-file-list');
  if(!list) return;
  list.innerHTML=[...e.target.files].map(f=>`<span style="font:500 11px -apple-system,sans-serif;background:#F5F5F7;border:1px solid #E8E8ED;border-radius:999px;padding:6px 10px">${escapeHtml(f.name)} · ${(f.size/1024).toFixed(0)}KB</span>`).join('');
});


let evenitLiveChannel=null;
let evenitLiveRefreshTimer=null;
function scheduleEvenitLiveRefresh(kind){
  clearTimeout(evenitLiveRefreshTimer);
  evenitLiveRefreshTimer=setTimeout(()=>{
    const activePage=document.querySelector('[data-page].active')?.dataset.page;
    if(kind==='plans'){loadPlansPreservingHostWorkspace();if(activePage==='discover')renderDiscover();}
    if(kind==='insights'&&activeInsightsPlanId&&pageView?.querySelector('.host-approval-insights')){
      renderInsights(activeInsightsPlanId);
    }
    if(kind==='aftermath'&&pageView.hidden)loadAftermathFeed();
    if(kind==='notifications'&&activePage==='notifications')renderNotifications();
    if(kind==='messages'){
      if(typeof window.refreshEvenitDirectThread==='function')window.refreshEvenitDirectThread();
      else if(activePage==='messages')showToast('You have a new message');
    }
    if(kind==='groups'&&window.evenitActiveGroupId)openGroup(window.evenitActiveGroupId);
  },260);
}
function subscribeToEvenitLiveUpdates(){
  if(!supabase||!currentUser)return;
  if(evenitLiveChannel)supabase.removeChannel(evenitLiveChannel);
  evenitLiveChannel=supabase.channel('evenit-live-'+currentUser.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'plans'},()=>scheduleEvenitLiveRefresh('plans'))
    .on('postgres_changes',{event:'*',schema:'public',table:'plan_members',filter:'user_id=eq.'+currentUser.id},()=>scheduleEvenitLiveRefresh('plans'))
    .on('postgres_changes',{event:'*',schema:'public',table:'plan_members'},payload=>{
      const membership=payload.new?.plan_id?payload.new:payload.old;
      const hostedPlan=posts.find(plan=>plan.id===membership?.plan_id&&plan.user_id===currentUser.id);
      if(hostedPlan)scheduleEvenitLiveRefresh('insights');
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'plan_entry_passes',filter:'user_id=eq.'+currentUser.id},()=>scheduleEvenitLiveRefresh('plans'))
    .on('postgres_changes',{event:'*',schema:'public',table:'plan_swipes',filter:'user_id=eq.'+currentUser.id},()=>scheduleEvenitLiveRefresh('plans'))
    .on('postgres_changes',{event:'*',schema:'public',table:'plan_verification_access',filter:'user_id=eq.'+currentUser.id},()=>scheduleEvenitLiveRefresh('plans'))
    .on('postgres_changes',{event:'*',schema:'public',table:'plan_aftermath_posts'},()=>scheduleEvenitLiveRefresh('aftermath'))
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+currentUser.id},()=>scheduleEvenitLiveRefresh('notifications'))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages',filter:'recipient_id=eq.'+currentUser.id},()=>scheduleEvenitLiveRefresh('messages'))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'group_messages'},()=>scheduleEvenitLiveRefresh('groups'))
    .subscribe();
}
if(supabase){
  supabase.auth.getSession().then(({data})=>{if(data.session?.user){loadEntryPasses();subscribeToEvenitLiveUpdates();}});
  supabase.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;if(currentUser)subscribeToEvenitLiveUpdates();else if(evenitLiveChannel){supabase.removeChannel(evenitLiveChannel);evenitLiveChannel=null;}});
}
let evenitRefreshing=false;
let evenitRefreshInterval=null;
let evenitRefreshQueued=false;
let evenitRefreshPromise=null;
function setEvenitConnectionState(online,message){
  const control=document.querySelector('#connection-refresh');
  if(!control)return;
  control.classList.toggle('offline',online===false);
  control.classList.toggle('syncing',evenitRefreshing);
  control.title=message|| (online===false?'You are offline. Reconnect to refresh.':'Live updates are connected');
  control.querySelector('span').textContent=online===false?'Offline':evenitRefreshing?'Syncing':'Live';
}
function refreshEvenitLiveData({quiet=false}={}){
  if(!supabase){setEvenitConnectionState(false,'Database connection is unavailable');return Promise.resolve();}
  if(!navigator.onLine){setEvenitConnectionState(false,'You are offline. Reconnect to refresh.');if(!quiet)showToast('You are offline — changes will refresh when you reconnect');return Promise.resolve();}
  // Never discard a refresh requested by a successful Join. A second pass is
  // queued if a polling or realtime refresh is already in flight.
  if(evenitRefreshing){evenitRefreshQueued=true;return evenitRefreshPromise||Promise.resolve();}
  evenitRefreshing=true;
  setEvenitConnectionState(true,'Refreshing your live data…');
  const cycle=(async()=>{
    try{
      await Promise.all([loadPlansPreservingHostWorkspace(),loadAftermathFeed()]);
      const activePage=document.querySelector('[data-page].active')?.dataset.page;
      if(activePage==='discover')await loadFollowingEvents();
      if(activePage==='notifications')await renderNotifications();
      if(activePage==='messages')await loadGroups();
      setEvenitConnectionState(true,'Live updates are connected');
      if(!quiet)showToast('Everything is up to date');
    }catch(error){
      setEvenitConnectionState(false,'Could not reach the live database');
      if(!quiet)showToast('Could not refresh. Check your connection and try again.');
    }finally{
      evenitRefreshing=false;
      setEvenitConnectionState(navigator.onLine);
      if(evenitRefreshQueued){
        evenitRefreshQueued=false;
        await refreshEvenitLiveData({quiet:true});
      }
    }
  })();
  const promise=cycle.finally(()=>{if(evenitRefreshPromise===promise)evenitRefreshPromise=null;});
  evenitRefreshPromise=promise;
  return promise;
}
document.querySelector('#connection-refresh')?.addEventListener('click',()=>refreshEvenitLiveData());

// Home is a vertical, individual event stream. Each plan can be acted on from
// its own card without turning the feed into a stacked swipe deck.
const renderPostsForHome=renderPosts;
renderPosts=function(){
  const activeHomes=[...document.querySelectorAll('[data-page="home"].active')];
  activeHomes.forEach(link=>link.classList.remove('active'));
  renderPostsForHome();
  activeHomes.forEach(link=>link.classList.add('active'));
  if(pageView?.hidden)enhanceHomePlanCards();
};
function dismissHomePlan(card,index){
  const post=posts[index];
  if(!post)return;
  const finish=()=>{card.classList.add('plan-dismissed');setTimeout(()=>card.remove(),220);};
  if(supabase&&currentUser&&post.id){
    supabase.from('plan_swipes').upsert({plan_id:post.id,user_id:currentUser.id,interested:false},{onConflict:'plan_id,user_id'}).then(finish);
  }else finish();
}
function enhanceHomePlanCards(){
  document.querySelectorAll('#posts .post').forEach(card=>{
    if(card.dataset.homeActionsReady)return;
    card.dataset.homeActionsReady='true';
    const index=Number(card.querySelector('.join-plan')?.dataset.index);
    if(!Number.isFinite(index))return;
    const dismiss=document.createElement('button');
    dismiss.type='button';dismiss.className='plan-dismiss';dismiss.setAttribute('aria-label','Not interested');dismiss.textContent='×';
    dismiss.onclick=event=>{event.stopPropagation();dismissHomePlan(card,index);};
    card.querySelector('.post-body')?.append(dismiss);
    let startX=0,startY=0,dragging=false;
    card.addEventListener('pointerdown',event=>{if(event.target.closest('button,a,input,textarea,select'))return;startX=event.clientX;startY=event.clientY;dragging=true;card.setPointerCapture?.(event.pointerId);});
    card.addEventListener('pointermove',event=>{if(!dragging)return;const dx=event.clientX-startX,dy=event.clientY-startY;if(Math.abs(dx)<Math.abs(dy))return;card.style.transform=`translateX(${Math.max(-105,Math.min(105,dx))}px) rotate(${dx/28}deg)`;card.classList.toggle('swipe-join-preview',dx>42);card.classList.toggle('swipe-dismiss-preview',dx<-42);});
    card.addEventListener('pointerup',event=>{if(!dragging)return;dragging=false;const dx=event.clientX-startX;card.style.transform='';card.classList.remove('swipe-join-preview','swipe-dismiss-preview');if(dx>92){toggleJoin(index);showToast('Joining this event…');}else if(dx<-92)dismissHomePlan(card,index);});
    card.addEventListener('pointercancel',()=>{dragging=false;card.style.transform='';card.classList.remove('swipe-join-preview','swipe-dismiss-preview');});
  });
}
renderPosts();

// The mobile app bar has one purpose per page; it never duplicates controls
// already available below it.
const baseUpdateMobileHeader=updateMobileHeader;
let mobileMessageFilter='all';
updateMobileHeader=function(page){
  baseUpdateMobileHeader(page);
  const activePage=page||document.querySelector('[data-page].active')?.dataset.page||'home';
  const header=document.querySelector('.mobile-header');
  const action=document.querySelector('#mobile-header-action');
  const searchPanel=document.querySelector('#mobile-search-panel');
  if(!header||!action)return;
  header.classList.toggle('page-profile',activePage==='profile');
  header.classList.toggle('page-discover',activePage==='discover');
  header.classList.toggle('page-messages',activePage==='messages'||activePage==='groups');
  if(activePage!=='discover'&&searchPanel)searchPanel.hidden=true;
  if(activePage==='discover'){
    action.innerHTML='<span>⌕</span>';
    action.setAttribute('aria-label','Search events');
  }else if(activePage==='messages'||activePage==='groups'){
    action.innerHTML='<span>☷</span>';
    action.setAttribute('aria-label','Filter messages');
  }else{
    action.innerHTML='<span>♡</span><b class="badge">3</b>';
    action.setAttribute('aria-label','Open notifications');
  }
};
document.querySelector('#mobile-header-action')?.addEventListener('click',()=>{
  const page=document.querySelector('[data-page].active')?.dataset.page||'home';
  if(page==='discover'){
    const panel=document.querySelector('#mobile-search-panel');
    panel.hidden=!panel.hidden;
    if(!panel.hidden)document.querySelector('#mobile-search-input')?.focus();
    return;
  }
  if(page==='messages'||page==='groups'){
    mobileMessageFilter=mobileMessageFilter==='all'?'unread':'all';
    document.querySelectorAll('.message').forEach((message,index)=>message.hidden=mobileMessageFilter==='unread'&&index>0);
    showToast(mobileMessageFilter==='unread'?'Showing unread messages':'Showing all messages');
    return;
  }
  setPage('notifications');
});
document.querySelector('#mobile-search-input')?.addEventListener('input',event=>{
  const query=event.target.value.trim().toLowerCase();
  document.querySelectorAll('#following-events .following-card,#discover-aftermath-feed .aftermath-card').forEach(card=>{card.hidden=Boolean(query)&&!card.textContent.toLowerCase().includes(query)});
});
updateMobileHeader();

// Discover is the aftermath space. Upcoming events and the swipe mechanism
// belong exclusively to Home, so they are not repeated here.
const renderAftermathOnlyDiscover=renderDiscover;
renderDiscover=function(){
  pageView.innerHTML=`<div class="page-topbar discover-topbar"><label class="topbar-search">⌕<input id="discover-search" placeholder="Search aftermath, people, places"></label></div><section class="discover-aftermath"><div class="discover-section-heading"><h3>Aftermath</h3></div><div id="discover-aftermath-feed"></div></section>`;
  loadAftermathFeed(document.querySelector('#discover-aftermath-feed'));
  document.querySelector('#discover-search')?.addEventListener('input',event=>{
    const query=event.target.value.trim().toLowerCase();
    document.querySelectorAll('#discover-aftermath-feed .aftermath-card').forEach(card=>{card.hidden=Boolean(query)&&!card.textContent.toLowerCase().includes(query)});
  });
  applyAdminContent();applyAdminStyles();
};

// Home is a quiet, scrollable event board. Each card has one primary action:
// join. Swiping right invokes the same verified join path; swiping left passes.
function renderHomeEventCards(){
  if(!postsEl)return;
  const now=Date.now();
  postsEl.innerHTML=posts.map((post,index)=>{
    const isOwner=Boolean(currentUser?.id&&post.user_id&&post.user_id===currentUser.id);
    const isMember=post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted';
    const isPast=post.starts_at&&new Date(post.starts_at).getTime()<now;
    const requirement=joinRequirement(post);
    const attendance=post.capacity?`${post.joinedCount||0} / ${post.capacity} confirmed`:`${post.joinedCount||0} joined`;
    const buttonLabel=isOwner?'Your event':post.membershipStatus==='confirmed'?'Joined ✓':post.membershipStatus==='waitlisted'?'Waitlisted':isPast?'Event ended':'Interested';
    const disabled=isOwner||isMember||isPast;
    return `<article class="home-event-card" data-plan-index="${index}" data-plan-id="${escapeHtml(post.id||'')}">
      <header class="home-event-host" data-profile-id="${escapeHtml(post.user_id||'')}">
        <img src="${escapeHtml(post.avatar)}" alt="${escapeHtml(post.name)}">
        <div><strong>${escapeHtml(post.user)}</strong><span>${escapeHtml(post.category||'Community event')}</span></div>
      </header>
      <div class="home-event-art ${escapeHtml(post.image||'pic-one')}">
        <span>${escapeHtml(post.category||'Event')}</span>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.location||'Location to be announced')}</p>
      </div>
      <div class="home-event-content">
        <p class="home-event-when">${escapeHtml(post.starts_at?formatDateTime(post.starts_at):'Date to be announced')}</p>
        ${post.caption?`<p class="home-event-description">${escapeHtml(post.caption)}</p>`:''}
        <div class="home-event-details"><span>${escapeHtml(attendance)}</span>${requirement?`<span class="home-event-requirement">${escapeHtml(requirement.label)}</span>`:''}</div>
        <button class="home-join-button ${isMember?'is-joined':''} ${requirement?'has-requirement':''}" data-home-join="${index}" ${disabled?'disabled':''}>${buttonLabel}</button>
      </div>
    </article>`;
  }).join('')||'<div class="aftermath-empty"><div class="aftermath-empty-icon">◌</div><h3>No events yet</h3><p>New plans will appear here as soon as they are published.</p></div>';
  document.querySelectorAll('[data-home-join]').forEach(button=>button.addEventListener('click',()=>startHomeJoin(Number(button.dataset.homeJoin),button)));
  enhanceHomePlanCards();
}
// Never redraw the Home board while another page owns the content area.
// This keeps live refreshes from visually overtaking Discover, Messages, or Profile.
renderPosts=function(){if(!pageView?.hidden)return;renderHomeEventCards();};
function enhanceHomePlanCards(){
  document.querySelectorAll('#posts .home-event-card').forEach(card=>{
    if(card.dataset.homeActionsReady)return;
    card.dataset.homeActionsReady='true';
    const index=Number(card.dataset.planIndex);
    if(!Number.isFinite(index))return;
    let startX=0,startY=0,dragging=false;
    card.addEventListener('pointerdown',event=>{
      if(event.target.closest('button,a,input,textarea,select,[data-profile-id]'))return;
      startX=event.clientX;startY=event.clientY;dragging=true;card.setPointerCapture?.(event.pointerId);
    });
    card.addEventListener('pointermove',event=>{
      if(!dragging)return;
      const dx=event.clientX-startX,dy=event.clientY-startY;
      if(Math.abs(dx)<Math.abs(dy))return;
      card.style.transform=`translateX(${Math.max(-105,Math.min(105,dx))}px) rotate(${dx/28}deg)`;
      card.classList.toggle('swipe-join-preview',dx>42);
      card.classList.toggle('swipe-dismiss-preview',dx<-42);
    });
    card.addEventListener('pointerup',async event=>{
      if(!dragging)return;
      dragging=false;
      const dx=event.clientX-startX;
      card.style.transform='';card.classList.remove('swipe-join-preview','swipe-dismiss-preview');
      if(dx>92)await startHomeJoin(index,card.querySelector('[data-home-join]'));
      else if(dx<-92){dismissHomePlan(card,index);showToast('Not interested — we will show you less like this.');}
    });
    card.addEventListener('pointercancel',()=>{dragging=false;card.style.transform='';card.classList.remove('swipe-join-preview','swipe-dismiss-preview');});
  });
}
renderPosts();
window.addEventListener('online',()=>{setEvenitConnectionState(true,'Connection restored — refreshing now');refreshEvenitLiveData({quiet:true});});
window.addEventListener('offline',()=>setEvenitConnectionState(false,'You are offline. Reconnect to refresh.'));
window.addEventListener('evenit:network',event=>{const connected=Boolean(event.detail?.connected);setEvenitConnectionState(connected,connected?'Connection restored — refreshing now':'You are offline. Reconnect to refresh.');if(connected)refreshEvenitLiveData({quiet:true});});
window.addEventListener('evenit:native-back',()=>{if(scanModal?.classList.contains('open')){closeScanModal();return;}if(entryVerificationModal?.classList.contains('open')){entryVerificationModal.classList.remove('open');return;}if(document.querySelector('.modal-backdrop.open,.login-backdrop.open,.edit-backdrop.open,.sheet-backdrop.open')){document.querySelectorAll('.modal-backdrop.open,.login-backdrop.open,.edit-backdrop.open,.sheet-backdrop.open').forEach(element=>element.classList.remove('open'));return;}goBack();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshEvenitLiveData({quiet:true});});
// Host-approved requests and entry passes. This layer intentionally replaces
// the older auto-confirm path while retaining legacy confirmed memberships.
const planQuestionsModal=document.querySelector('#plan-questions-modal');
const planQuestionsForm=document.querySelector('#plan-questions-form');
const planQuestionsFields=document.querySelector('#plan-questions-fields');
let pendingPlanRequest=null;

document.querySelector('#close-plan-questions')?.addEventListener('click',()=>{planQuestionsModal?.classList.remove('open');pendingPlanRequest=null;});
planQuestionsModal?.addEventListener('click',event=>{if(event.target===planQuestionsModal){planQuestionsModal.classList.remove('open');pendingPlanRequest=null;}});

async function loadPlanJoinQuestions(planId){
  const {data,error}=await supabase.rpc('get_plan_join_questions',{p_plan_id:planId});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

function renderJoinQuestions(post,questions,button,afterRequest){
  pendingPlanRequest={postId:post.id,button,afterRequest};
  document.querySelector('#plan-questions-title').innerHTML=`Request a place at<br><em>${escapeHtml(post.title)}</em>`;
  document.querySelector('#plan-questions-copy').textContent='Answer the organizer’s questions, then send your interest request.';
  planQuestionsFields.innerHTML=questions.map((question,index)=>{
    const type=question.question_type||'short_text';
    const options=Array.isArray(question.options)?question.options:[];
    const required=question.required?'required':'';
    const name=`request-${escapeHtml(question.id)}`;
    const prompt=`<legend><span class="request-question-number">${String(index+1).padStart(2,'0')}</span><span class="request-question-copy"><strong>${escapeHtml(question.prompt)}</strong>${question.required?'<small class="is-required">Required</small>':'<small class="is-optional">Optional</small>'}</span></legend>`;
    let control='';
    if(type==='long_text')control=`<label class="request-answer-field"><span class="sr-only">Your answer</span><textarea class="request-long-answer" data-request-control rows="4" maxlength="1000" ${required} placeholder="Write your answer"></textarea></label>`;
    else if(type==='multiple_choice')control=`<div class="request-choice-list" role="radiogroup" aria-label="${escapeHtml(question.prompt)}">${options.map(option=>`<label class="request-choice"><input data-request-control type="radio" name="${name}" value="${escapeHtml(option)}" ${required}><span class="request-choice-copy">${escapeHtml(option)}</span></label>`).join('')}</div>`;
    else if(type==='checkboxes')control=`<div class="request-choice-list" aria-label="${escapeHtml(question.prompt)}">${options.map(option=>`<label class="request-choice"><input data-request-control type="checkbox" value="${escapeHtml(option)}"><span class="request-choice-copy">${escapeHtml(option)}</span></label>`).join('')}</div>`;
    else control=`<label class="request-answer-field"><span class="sr-only">Your answer</span><input class="request-short-answer" data-request-control type="text" maxlength="1000" ${required} placeholder="Write a short answer"></label>`;
    const guidance=type==='multiple_choice'?'Choose one option.':type==='checkboxes'?'Choose every option that applies.':type==='long_text'?'A little detail helps the host get to know you.':'Keep it short and clear.';
    return `<fieldset class="request-question" data-request-question="${escapeHtml(question.id)}" data-request-type="${escapeHtml(type)}" data-request-required="${question.required?'true':'false'}">${prompt}<p class="request-answer-help">${guidance}</p>${control}</fieldset>`;
  }).join('');
  planQuestionsModal.classList.add('open');
}

function reflectPlanInterest(post,row){
  const target=posts.find(item=>item.id===post?.id)||post;
  if(!target)return;
  const status=row?.status||'interested';
  target.membershipStatus=status;
  target.joined=status==='confirmed';
  target.interested=status==='interested';
  if(Number.isFinite(Number(row?.confirmed_count)))target.joinedCount=Number(row.confirmed_count);
  // Update every visible representation before the follow-up database refresh.
  renderPulseBar();
  if(pageView?.hidden&&typeof renderHomeEventCards==='function')renderHomeEventCards();
}

async function completePlanInterest(post,button,answers=null){
  if(button){button.disabled=true;button.textContent='Sending…';}
  try{
    if(!navigator.onLine)throw new Error('You are offline. Connect to Wi-Fi or mobile data, then try again.');
    await withEvenitTimeout(getFreshEvenitUser(),8000,'Your login check took too long. Please try again.');
    const result=answers===null
      ?await withEvenitTimeout(supabase.rpc('join_plan',{p_plan_id:post.id}),15000,'Your request took too long. Please try again.')
      :await withEvenitTimeout(supabase.rpc('submit_plan_join_request',{p_plan_id:post.id,p_answers:answers}),15000,'Your request took too long. Please try again.');
    if(result.error)throw result.error;
    // The security-definer RPC is the authoritative write and response. A
    // second direct plan_members read can be rejected by RLS even when the
    // request was successfully recorded, which incorrectly made Send request
    // look broken. Only accept a valid server-confirmed membership result.
    const row=rpcRow(result.data);
    if(!row||!['interested','waitlisted','confirmed'].includes(row.status)){
      throw new Error('The request was not confirmed by the database. Please try again.');
    }
    reflectPlanInterest(post,row);
    await refreshEvenitLiveData({quiet:true});
    if(row?.status==='confirmed')showToast('You are confirmed — your entry pass is ready.');
    else showToast('Interest sent. The organizer will choose who receives an entry pass.');
    return true;
  }catch(error){
    showToast(`Could not send your request: ${error?.message||'Please try again.'}`);
    return false;
  }finally{
    // A successful optimistic redraw replaces this element. Do not overwrite
    // a card whose request has already been accepted.
    if(button&&button.isConnected&&!post.membershipStatus){button.disabled=false;button.textContent='Interested';}
  }
}

async function requestPlanInterest(post,button,afterRequest){
  if(!post)return false;
  if(post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'||post.membershipStatus==='interested')return true;
  if(!supabase||!currentUser){showToast('Log in to show interest in this event');loginModal?.classList.add('open');return false;}
  return openPlanRequestPage(post,{afterRequest});
}

let activePlanRequestId=null;
function renderPlanRequestQuestions(questions){
  if(!questions.length)return '<div class="request-page-empty"><strong>No questions from the host</strong><span>You can send your interest request when you are ready.</span></div>';
  return questions.map((question,index)=>{
    const type=question.question_type||'short_text';
    const options=Array.isArray(question.options)?question.options:[];
    const required=question.required?'required':'';
    const fieldName=`plan-request-${escapeHtml(question.id)}`;
    let control='';
    if(type==='long_text')control=`<textarea class="request-long-answer" data-request-control rows="5" maxlength="1000" ${required} placeholder="Write your answer"></textarea>`;
    else if(type==='multiple_choice')control=`<div class="request-choice-list" role="radiogroup" aria-label="${escapeHtml(question.prompt)}">${options.map(option=>`<label class="request-choice"><input data-request-control type="radio" name="${fieldName}" value="${escapeHtml(option)}" ${required}><span class="request-choice-copy">${escapeHtml(option)}</span></label>`).join('')}</div>`;
    else if(type==='checkboxes')control=`<div class="request-choice-list" aria-label="${escapeHtml(question.prompt)}">${options.map(option=>`<label class="request-choice"><input data-request-control type="checkbox" value="${escapeHtml(option)}"><span class="request-choice-copy">${escapeHtml(option)}</span></label>`).join('')}</div>`;
    else control=`<input class="request-short-answer" data-request-control type="text" maxlength="1000" ${required} placeholder="Write a short answer">`;
    const hint=type==='multiple_choice'?'Choose one option.':type==='checkboxes'?'Select every option that applies.':type==='long_text'?'A little detail helps the host get to know you.':'Keep it short and clear.';
    return `<fieldset class="request-question request-page-question" data-request-question="${escapeHtml(question.id)}" data-request-type="${escapeHtml(type)}" data-request-required="${question.required?'true':'false'}"><legend><span class="request-question-number">${String(index+1).padStart(2,'0')}</span><span class="request-question-copy"><strong>${escapeHtml(question.prompt)}</strong>${question.required?'<small class="is-required">Required</small>':'<small class="is-optional">Optional</small>'}</span></legend><p class="request-answer-help">${hint}</p><div class="request-page-control">${control}</div></fieldset>`;
  }).join('');
}

function renderPlanRequestSuccess(post){
  pageView.innerHTML=`<section class="plan-request-page request-page-success"><span class="request-success-mark">✓</span><p class="overline">Interest sent</p><h2>Your request is with the host.</h2><p>The organizer can now review your details in Insights and choose whether to issue an entry pass.</p><div class="request-success-event"><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(post.location||'Location to be announced')} · ${escapeHtml(formatDateTime(post.starts_at))}</span></div><button class="publish-button" id="view-request-timeline" type="button">View your plans <span>→</span></button></section>`;
  pageView.querySelector('#view-request-timeline')?.addEventListener('click',()=>showJoinedPage());
}

async function savePlanRequestVerification(post,form){
  if(!post.requiresCollegeVerification)return;
  const college=String(new FormData(form).get('college')||'').trim();
  const enrollmentId=String(new FormData(form).get('enrollment_id')||'').trim();
  const allowed=form.querySelector('[name="share_verification"]')?.checked;
  if(!college||!enrollmentId||!allowed){
    throw new Error('Add your college and enrollment ID, then approve access for this event.');
  }
  const {error:profileError}=await supabase.from('profiles').update({college,enrollment_id:enrollmentId}).eq('id',currentUser.id);
  if(profileError)throw profileError;
  const {error:accessError}=await supabase.rpc('grant_plan_verification_access',{p_plan_id:post.id});
  if(accessError)throw accessError;
  collegeVerificationReady=true;
  post.hasCollegeDetails=true;
  post.verificationShared=true;
  post.verificationComplete=true;
}

async function openPlanRequestPage(post,options={}){
  if(!post||!supabase||!currentUser)return false;
  activePlanRequestId=post.id;
  if(!options.restore)pushAppView({type:'plan-request',planId:post.id});
  homeElements.forEach(element=>element.hidden=true);
  pageView.hidden=false;
  pageView.dataset.planRequestId=post.id;
  document.querySelectorAll('[data-page]').forEach(link=>link.classList.remove('active'));
  updateMobileHeader('home');
  pageView.innerHTML='<section class="plan-request-page plan-request-loading"><p class="overline">Show interest</p><h2>Preparing the event details…</h2></section>';
  try{
    const [questionsResult,profileResult]=await Promise.all([
      loadPlanJoinQuestions(post.id),
      supabase.from('profiles').select('college,enrollment_id').eq('id',currentUser.id).maybeSingle()
    ]);
    if(activePlanRequestId!==post.id||pageView.dataset.planRequestId!==post.id)return false;
    const questions=questionsResult||[];
    const profile=profileResult.data||{};
    const description=post.caption||'The host has not added a longer description for this event.';
    const verification=post.requiresCollegeVerification?`<section class="request-verification-section"><div class="request-section-heading"><p class="overline">Required for this event</p><h3>College verification</h3><p>Your details stay private on your profile. They are shared only with this event’s organizer after you approve access below.</p></div><div class="request-verification-fields"><label>College<input name="college" value="${escapeHtml(profile.college||'')}" autocomplete="organization" required placeholder="Your college"></label><label>Enrollment ID<input name="enrollment_id" value="${escapeHtml(profile.enrollment_id||'')}" required placeholder="Your enrollment ID"></label></div><label class="request-consent"><input type="checkbox" name="share_verification" required><span><strong>Share these details with this organizer</strong><small>Only for ${escapeHtml(post.title)}. They will not appear publicly.</small></span></label></section>`:'';
    pageView.innerHTML=`<section class="plan-request-page"><header class="request-page-hero"><p class="overline">Show interest</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(description)}</p></header><section class="request-scene"><div><span>Scene</span><strong>${escapeHtml(post.category||'Community event')}</strong></div><div><span>Date &amp; time</span><strong>${escapeHtml(formatDateTime(post.starts_at))}</strong></div><div><span>Location</span><a href="${mapUrl(post.location||'')}" target="_blank" rel="noreferrer">${escapeHtml(post.location||'Location to be announced')} ↗</a></div></section><form id="plan-request-page-form" novalidate><section class="request-form-section"><div class="request-section-heading"><p class="overline">Hosted questions</p><h3>Tell the host a little about you</h3><p>These answers are visible only to the organizer of this event.</p></div><div class="request-page-question-list">${renderPlanRequestQuestions(questions)}</div></section>${verification}<div class="request-submit-area"><p>Sending this request does not issue a pass. The organizer chooses who receives one.</p><button class="publish-button" type="submit">Send request <span>→</span></button></div></form></section>`;
    const form=pageView.querySelector('#plan-request-page-form');
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const currentPost=posts.find(item=>item.id===post.id)||post;
      const fields=[...form.querySelectorAll('[data-request-question]')];
      const missing=fields.find(field=>{
        if(field.dataset.requestRequired!=='true')return false;
        const controls=[...field.querySelectorAll('[data-request-control]')];
        return ['checkboxes','multiple_choice'].includes(field.dataset.requestType)
          ?!controls.some(control=>control.checked)
          :!String(controls[0]?.value||'').trim();
      });
      if(missing){
        missing.classList.add('has-answer-error');
        missing.scrollIntoView({behavior:'smooth',block:'center'});
        missing.querySelector('[data-request-control]')?.focus();
        showToast('Answer the required question before sending your request.');
        return;
      }
      fields.forEach(field=>field.classList.remove('has-answer-error'));
      const answers=fields.map(field=>{
        const controls=[...field.querySelectorAll('[data-request-control]')];
        const type=field.dataset.requestType;
        const answer=type==='checkboxes'?controls.filter(control=>control.checked).map(control=>control.value):type==='multiple_choice'?(controls.find(control=>control.checked)?.value||''):(controls[0]?.value.trim()||'');
        return {question_id:field.dataset.requestQuestion,answer};
      });
      const submit=form.querySelector('[type="submit"]');
      submit.disabled=true;
      submit.textContent='Sending…';
      try{
        await savePlanRequestVerification(currentPost,form);
        const sent=await completePlanInterest(currentPost,null,questions.length?answers:null);
        if(!sent)return;
        renderPlanRequestSuccess(currentPost);
        if(options.afterRequest)options.afterRequest(currentPost.id);
      }catch(error){
        showToast(`Could not send your request: ${error?.message||'Please try again.'}`);
      }finally{
        if(submit.isConnected){submit.disabled=false;submit.innerHTML='Send request <span>→</span>';}
      }
    });
  }catch(error){
    pageView.innerHTML=`<section class="plan-request-page request-page-error"><p class="overline">Show interest</p><h2>We could not prepare this request.</h2><p>${escapeHtml(error?.message||'Please check your connection and try again.')}</p><button class="publish-button" id="retry-plan-request" type="button">Try again</button></section>`;
    pageView.querySelector('#retry-plan-request')?.addEventListener('click',()=>openPlanRequestPage(post,{...options,restore:true}));
    return false;
  }
  window.scrollTo({top:0,behavior:'smooth'});
  return true;
}

planQuestionsForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!pendingPlanRequest)return;
  const pending=pendingPlanRequest;
  const post=posts.find(item=>item.id===pending.postId);
  if(!post){showToast('This event is no longer available.');return;}
  const questionFields=[...planQuestionsFields.querySelectorAll('[data-request-question]')];
  const unansweredRequired=questionFields.find(field=>{
    if(field.dataset.requestRequired!=='true')return false;
    const controls=[...field.querySelectorAll('[data-request-control]')];
    return ['checkboxes','multiple_choice'].includes(field.dataset.requestType)
      ?!controls.some(control=>control.checked)
      :!String(controls[0]?.value||'').trim();
  });
  if(unansweredRequired){
    unansweredRequired.classList.add('has-answer-error');
    unansweredRequired.querySelector('[data-request-control]')?.focus();
    showToast('Answer the required question before sending your request.');
    return;
  }
  questionFields.forEach(field=>field.classList.remove('has-answer-error'));
  const answers=questionFields.map(field=>{
    const type=field.dataset.requestType;
    const controls=[...field.querySelectorAll('[data-request-control]')];
    let answer='';
    if(type==='checkboxes')answer=controls.filter(control=>control.checked).map(control=>control.value);
    else if(type==='multiple_choice')answer=controls.find(control=>control.checked)?.value||'';
    else answer=controls[0]?.value.trim()||'';
    return{question_id:field.dataset.requestQuestion,answer};
  });
  const submit=planQuestionsForm.querySelector('[type=submit]');
  submit.disabled=true;
  submit.textContent='Sending…';
  const sent=await completePlanInterest(post,null,answers);
  submit.disabled=false;
  submit.innerHTML='Send request <span>→</span>';
  if(!sent)return;
  planQuestionsModal.classList.remove('open');
  pendingPlanRequest=null;
  if(pending.afterRequest)pending.afterRequest(post.id);
});

startHomeJoin=async function(index,button){
  return requestPlanInterest(posts[index],button);
};

joinTimelinePlan=async function(planId,button){
  const post=posts.find(item=>item.id===planId);
  if(!post)return false;
  return requestPlanInterest(post,button,id=>showAgendaDetail(id));
};

const evenitAgendaPlans=getAgendaPlans;
getAgendaPlans=function(){
  return posts.filter(post=>post.user_id===currentUser?.id||post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'||post.membershipStatus==='interested'||post.interested);
};

agendaStatus=function(post){
  if(post.entryPass?.checked_in_at)return {label:'Attended',className:'attended'};
  if(post.user_id===currentUser?.id)return {label:'Hosting',className:'owned'};
  if(post.membershipStatus==='confirmed')return {label:'Confirmed',className:'confirmed'};
  if(post.membershipStatus==='interested')return {label:'Request sent',className:'interested'};
  if(post.interested)return {label:'Interested',className:'interested'};
  return {label:'Waitlisted',className:'waitlisted'};
};

const evenitShowAgendaDetail=showAgendaDetail;
showAgendaDetail=function(planId,options={}){
  evenitShowAgendaDetail(planId,options);
  const post=posts.find(item=>item.id===planId);
  if(post?.membershipStatus!=='interested')return;
  const entry=pageView.querySelector('.agenda-entry-panel');
  if(!entry)return;
  const primary=entry.querySelector('.agenda-primary-action');
  if(primary)primary.innerHTML='<p class="interest-sent-state">Interest sent ✓<small>The organizer will notify you if they issue an entry pass.</small></p>';
  entry.querySelector('.agenda-panel-heading span')?.replaceChildren(document.createTextNode('Request pending'));
};

const evenitRenderHomeEventCards=renderHomeEventCards;
renderHomeEventCards=function(){
  if(!postsEl)return;
  const now=Date.now();
  postsEl.innerHTML=posts.map((post,index)=>{
    const isOwner=Boolean(currentUser?.id&&post.user_id&&post.user_id===currentUser.id);
    const isMember=post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'||post.membershipStatus==='interested';
    const isPast=post.starts_at&&new Date(post.starts_at).getTime()<now;
    const requirement=joinRequirement(post);
    const attendance=post.capacity?`${post.joinedCount||0} / ${post.capacity} confirmed`:`${post.joinedCount||0} confirmed`;
    const buttonLabel=isOwner?'Your event':post.membershipStatus==='confirmed'?'Joined ✓':post.membershipStatus==='waitlisted'?'Waitlisted':post.membershipStatus==='interested'?'Request sent':isPast?'Event ended':'Interested';
    const disabled=isOwner||isMember||isPast;
    return `<article class="home-event-card" data-plan-index="${index}" data-plan-id="${escapeHtml(post.id||'')}">
      <header class="home-event-host" data-profile-id="${escapeHtml(post.user_id||'')}">
        <img src="${escapeHtml(post.avatar)}" alt="${escapeHtml(post.name)}">
        <div><strong>${escapeHtml(post.user)}</strong><span>${escapeHtml(post.category||'Community event')}</span></div>
      </header>
      <div class="home-event-art ${escapeHtml(post.image||'pic-one')}">
        <span>${escapeHtml(post.category||'Event')}</span>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.location||'Location to be announced')}</p>
      </div>
      <div class="home-event-content">
        <p class="home-event-when">${escapeHtml(post.starts_at?formatDateTime(post.starts_at):'Date to be announced')}</p>
        ${post.caption?`<p class="home-event-description">${escapeHtml(post.caption)}</p>`:''}
        <div class="home-event-details"><span>${escapeHtml(attendance)}</span>${requirement&&!isMember?`<span class="home-event-requirement">${escapeHtml(requirement.label)}</span>`:''}</div>
        <button class="home-join-button ${isMember?'is-joined':''} ${requirement&&!isMember?'has-requirement':''}" data-home-join="${index}" ${disabled?'disabled':''}>${buttonLabel}</button>
      </div>
    </article>`;
  }).join('')||'<div class="aftermath-empty"><div class="aftermath-empty-icon">◌</div><h3>No events yet</h3><p>New plans will appear here as soon as they are published.</p></div>';
  document.querySelectorAll('[data-home-join]').forEach(button=>button.addEventListener('click',()=>startHomeJoin(Number(button.dataset.homeJoin),button)));
  enhanceHomePlanCards();
};

renderInsights=async function(planId){
  const post=posts.find(item=>item.id===planId);
  if(!supabase||!currentUser||!post||!post.isOwner){showToast('Only the person who created this event can view insights');return;}
  activeInsightsPlanId=planId;
  showInsightsShell();
  pageView.innerHTML='<div class="insights-page"><button class="back-link" id="back-from-insights">← Back</button><p class="overline">Event insights</p><h2>Loading requests...</h2></div>';
  const {data,error}=await supabase.rpc('get_plan_insights',{p_plan_id:planId});
  if(error){pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-insights">← Back</button><p class="overline">Event insights</p><h2>Insights unavailable</h2><p class="insights-error">${escapeHtml(error.message)}</p></div>`;return;}
  const info=typeof data==='string'?JSON.parse(data):data;
  const plan=info?.plan||post;
  const metrics=info?.metrics||{};
  const attendees=Array.isArray(info?.attendees)?info.attendees:[];
  const interested=attendees.filter(item=>item.status==='interested'||item.status==='waitlisted');
  const confirmed=attendees.filter(item=>item.status==='confirmed'&&!item.attended);
  const attended=attendees.filter(item=>item.attended);
  const answerList=item=>Array.isArray(item.answers)&&item.answers.length?`<dl class="request-answers">${item.answers.map(answer=>`<div><dt>${escapeHtml(answer.question||'Question')}</dt><dd>${escapeHtml(answer.answer||'—')}</dd></div>`).join('')}</dl>`:'';
  const person=item=>`<button class="attendee-card ${item.attended?'is-attended':''}" data-public-profile-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt="${escapeHtml(item.full_name||item.username)}"><span><strong>${escapeHtml(item.full_name||item.username||'Evenit member')}</strong><small>@${escapeHtml(item.username||'member')}${item.neighborhood?` · ${escapeHtml(item.neighborhood)}`:''}</small></span><b>${item.attended?'Attended ✓':'Pass sent'}</b></button>`;
  const candidate=item=>`<label class="pass-candidate"><input type="checkbox" data-pass-candidate value="${escapeHtml(item.id)}"><span class="pass-candidate-avatar"><img src="${escapeHtml(item.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt=""></span><span class="pass-candidate-main"><strong>${escapeHtml(item.full_name||item.username||'Evenit member')}</strong><small>@${escapeHtml(item.username||'member')} · ${item.status==='waitlisted'?'Waitlisted':'Interest request'}</small>${answerList(item)}</span></label>`;
  pageView.innerHTML=`<div class="insights-page host-approval-insights"><button class="back-link" id="back-from-insights">← Back to your feed</button><div class="insights-header"><div><p class="overline">Host approvals</p><h2>${escapeHtml(plan.title||post.title)}</h2><p class="insights-subtitle">${escapeHtml(plan.location||post.location)} · ${formatDateTime(plan.starts_at||post.starts_at)}</p></div></div><div class="insights-metrics"><div class="insights-metric"><strong>${interested.length}</strong><span>Requests</span></div><div class="insights-metric"><strong>${metrics.joined||0}</strong><span>Passes sent</span></div><div class="insights-metric"><strong>${attended.length}</strong><span>Attended</span></div><div class="insights-metric"><strong>${metrics.reach||0}</strong><span>Reach</span></div></div><section class="insights-section pass-approval-section"><div class="approval-heading"><div><h3>Interest requests (${interested.length})</h3><p>Select the people who should receive a QR entry pass.</p></div><button id="issue-selected-passes" class="publish-button" type="button" ${interested.length?'':'disabled'}>Send passes <span>→</span></button></div><div class="pass-candidate-list">${interested.length?interested.map(candidate).join(''):'<div class="insights-empty">No interest requests yet. People appear here after they request a place.</div>'}</div></section><div class="insights-actions"><button class="scan-button" id="open-scan">Scan entry pass <span>↗</span></button><span class="insights-help">Only people you approve receive a scannable QR pass.</span></div><div class="insights-section"><h3>Pass holders (${confirmed.length})</h3>${confirmed.length?confirmed.map(person).join(''):'<div class="insights-empty">No passes sent yet.</div>'}</div><div class="insights-section"><h3>Attended (${attended.length})</h3>${attended.length?attended.map(person).join(''):'<div class="insights-empty">No one checked in yet.</div>'}</div></div>`;
  document.querySelector('#open-scan')?.addEventListener('click',()=>openScanModal(planId));
  document.querySelector('#back-from-insights')?.addEventListener('click',()=>goBack());
  document.querySelector('#issue-selected-passes')?.addEventListener('click',async event=>{
    const selected=[...pageView.querySelectorAll('[data-pass-candidate]:checked')].map(input=>input.value);
    if(!selected.length){showToast('Select at least one request first.');return;}
    const button=event.currentTarget;
    button.disabled=true;button.textContent=`Sending ${selected.length}…`;
    let issued=0;const failures=[];
    for(const userId of selected){
      const result=await supabase.rpc('issue_plan_entry_pass',{p_plan_id:planId,p_user_id:userId});
      if(result.error)failures.push(result.error.message);else issued++;
    }
    await refreshEvenitLiveData({quiet:true});
    await renderInsights(planId);
    showToast(issued?`${issued} ${issued===1?'entry pass':'entry passes'} sent.${failures.length?' Some requests could not be approved.':''}`:failures[0]||'No passes were sent.');
  });
};

// Host approvals are a dedicated review workspace. The assignment below is
// intentionally the final Insights renderer used by every host entry point.
function setInsightsDockScan(planId=null){
  const dock=document.querySelector('.mobile-dock button[data-dock-create],.mobile-dock button[data-insights-scan]');
  if(!dock)return;
  const icon=dock.querySelector('span');
  const label=dock.querySelector('small');
  if(planId){
    if(!dock.dataset.createLabel)dock.dataset.createLabel=label?.textContent.trim()||'Create';
    dock.dataset.insightsScan=planId;
    dock.removeAttribute('data-dock-create');
    dock.removeAttribute('onclick');
    if(icon)icon.textContent='▣';
    if(label)label.textContent='Scan';
    dock.setAttribute('aria-label','Scan an event pass');
    dock.onclick=event=>{event.preventDefault();event.stopPropagation();openScanModal(planId);};
    return;
  }
  if(!dock.dataset.insightsScan)return;
  delete dock.dataset.insightsScan;
  dock.setAttribute('data-dock-create','');
  if(icon)icon.textContent='＋';
  if(label)label.textContent=dock.dataset.createLabel||'Create';
  dock.setAttribute('aria-label','Create a plan');
  dock.onclick=()=>document.querySelector('#open-modal')?.click();
}

async function loadHostVerificationDetails(planId){
  const {data,error}=await supabase.rpc('get_plan_verification_details',{p_plan_id:planId});
  if(error)return new Map();
  return new Map((data||[]).map(item=>[item.user_id,item]));
}

function renderRequestAnswers(answers){
  return Array.isArray(answers)&&answers.length
    ?`<dl class="request-answers">${answers.map(answer=>`<div><dt>${escapeHtml(answer.question||'Question')}</dt><dd>${escapeHtml(answer.answer||'—')}</dd></div>`).join('')}</dl>`
    :'<p class="request-answer-empty">No additional answers for this request.</p>';
}

async function openHostRequestReview(planId,userId,options={}){
  const post=posts.find(item=>item.id===planId);
  if(!supabase||!currentUser||!post||!post.isOwner)return;
  activeInsightsPlanId=planId;
  showInsightsShell();
  setInsightsDockScan(planId);
  if(!options.restore)pushHostWorkspaceView({type:'host-request-review',planId,userId});
  pageView.innerHTML='<section class="host-request-review"><p class="overline">Host review</p><h2>Loading request…</h2></section>';
  const [insightResult,verificationByUser]=await Promise.all([
    supabase.rpc('get_plan_insights',{p_plan_id:planId}),
    loadHostVerificationDetails(planId)
  ]);
  if(insightResult.error){
    pageView.innerHTML=`<section class="host-request-review"><p class="overline">Host review</p><h2>Request unavailable</h2><p>${escapeHtml(insightResult.error.message)}</p></section>`;
    return;
  }
  const info=typeof insightResult.data==='string'?JSON.parse(insightResult.data):insightResult.data;
  const attendee=(info?.attendees||[]).find(item=>item.id===userId);
  if(!attendee){
    pageView.innerHTML='<section class="host-request-review"><p class="overline">Host review</p><h2>This request is no longer pending.</h2></section>';
    return;
  }
  const profileResult=await supabase.rpc('get_public_profile',{p_user_id:userId});
  const profile=profileResult.data||{};
  const verification=verificationByUser.get(userId);
  const plan=info?.plan||post;
  const verificationSection=post.requiresCollegeVerification?`<section class="request-review-section verification-review"><p class="approval-eyebrow">Event-only verification</p><h3>College details</h3>${verification?`<dl class="review-detail-list"><div><dt>College</dt><dd>${escapeHtml(verification.college||'Not provided')}</dd></div><div><dt>Enrollment ID</dt><dd>${escapeHtml(verification.enrollment_id||'Not provided')}</dd></div></dl><p>Shared by the guest specifically for this event.</p>`:'<p class="review-pending-note">This guest has not shared verification details for this event.</p>'}</section>`:'';
  pageView.innerHTML=`<section class="host-request-review"><header class="request-review-hero"><div><p class="overline">Host review</p><h2>${escapeHtml(attendee.full_name||attendee.username||'Event guest')}</h2><p>Request for ${escapeHtml(plan.title||post.title)}</p></div><button class="request-review-close" id="close-request-review" type="button" aria-label="Back to requests">×</button></header><section class="request-review-profile"><img src="${escapeHtml(attendee.avatar_url||'https://i.pravatar.cc/160?img=68')}" alt=""><div><strong>${escapeHtml(attendee.full_name||attendee.username||'Evenit member')}</strong><span>@${escapeHtml(attendee.username||'member')}${attendee.neighborhood?` · ${escapeHtml(attendee.neighborhood)}`:''}</span>${profile.about?`<p>${escapeHtml(profile.about)}</p>`:''}</div><button class="request-review-profile-link" id="open-review-profile" type="button">View profile</button></section><section class="request-review-section"><p class="approval-eyebrow">Request details</p><h3>Guest answers</h3>${renderRequestAnswers(attendee.answers)}</section>${verificationSection}<section class="request-review-section review-event-context"><p class="approval-eyebrow">Event</p><h3>${escapeHtml(plan.title||post.title)}</h3><p>${escapeHtml(plan.location||post.location||'Location to be announced')} · ${escapeHtml(formatDateTime(plan.starts_at||post.starts_at))}</p></section><div class="request-review-actions"><button class="request-review-secondary" id="back-to-requests" type="button">Back to requests</button><button class="publish-button" id="issue-single-pass" type="button">Send pass <span>→</span></button></div></section>`;
  const returnToRequests=()=>{
    if(window.history.state?.evenitAppView?.type==='host-request-review')window.history.back();
    else renderInsights(planId);
  };
  pageView.querySelector('#close-request-review')?.addEventListener('click',returnToRequests);
  pageView.querySelector('#back-to-requests')?.addEventListener('click',returnToRequests);
  pageView.querySelector('#open-review-profile')?.addEventListener('click',()=>{
    setInsightsDockScan(null);
    renderPublicProfile(userId);
  });
  pageView.querySelector('#issue-single-pass')?.addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    button.textContent='Sending…';
    const result=await supabase.rpc('issue_plan_entry_pass',{p_plan_id:planId,p_user_id:userId});
    if(result.error){button.disabled=false;button.innerHTML='Send pass <span>→</span>';showToast(result.error.message);return;}
    await refreshEvenitLiveData({quiet:true});
    showToast('Entry pass sent.');
    returnToRequests();
  });
}

renderInsights=async function(planId){
  const post=posts.find(item=>item.id===planId);
  if(!supabase||!currentUser||!post||!post.isOwner){showToast('Only the person who created this event can view insights');return;}
  activeInsightsPlanId=planId;
  showInsightsShell();
  setInsightsDockScan(planId);
  pageView.innerHTML='<div class="insights-page host-approval-insights"><p class="overline">Host approvals</p><h2>Loading insights…</h2></div>';
  const [insightResult,verificationByUser]=await Promise.all([
    supabase.rpc('get_plan_insights',{p_plan_id:planId}),
    loadHostVerificationDetails(planId)
  ]);
  if(insightResult.error){
    pageView.innerHTML=`<div class="insights-page host-approval-insights"><p class="overline">Host approvals</p><h2>Insights unavailable</h2><p class="insights-error">${escapeHtml(insightResult.error.message)}</p></div>`;
    return;
  }
  const info=typeof insightResult.data==='string'?JSON.parse(insightResult.data):insightResult.data;
  const plan=info?.plan||post;
  const metrics=info?.metrics||{};
  const attendees=Array.isArray(info?.attendees)?info.attendees:[];
  const interested=attendees.filter(item=>item.status==='interested'||item.status==='waitlisted');
  const confirmed=attendees.filter(item=>item.status==='confirmed'&&!item.attended);
  const attended=attendees.filter(item=>item.attended);
  const passesIssued=confirmed.length+attended.length;
  const person=item=>`<button class="attendee-card ${item.attended?'is-attended':''}" data-public-profile-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt="${escapeHtml(item.full_name||item.username)}"><span><strong>${escapeHtml(item.full_name||item.username||'Evenit member')}</strong><small>@${escapeHtml(item.username||'member')}${item.neighborhood?` · ${escapeHtml(item.neighborhood)}`:''}</small></span><b>${item.attended?'Attended ✓':'Pass sent'}</b></button>`;
  const candidate=item=>{const verification=verificationByUser.get(item.id);const answerCount=Array.isArray(item.answers)?item.answers.length:0;return`<article class="pass-candidate"><label class="pass-candidate-select"><input type="checkbox" data-pass-candidate value="${escapeHtml(item.id)}" aria-label="Select ${escapeHtml(item.full_name||item.username||'request')}"></label><button class="pass-candidate-review" type="button" data-request-review="${escapeHtml(item.id)}"><span class="pass-candidate-avatar"><img src="${escapeHtml(item.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt=""></span><span class="pass-candidate-main"><span class="pass-candidate-title"><strong>${escapeHtml(item.full_name||item.username||'Evenit member')}</strong><em>${item.status==='waitlisted'?'Waitlisted':'New request'}</em></span><small>@${escapeHtml(item.username||'member')}${item.neighborhood?` · ${escapeHtml(item.neighborhood)}`:''}</small><span class="pass-candidate-summary">${answerCount?`${answerCount} ${answerCount===1?'answer':'answers'} ready to review`:'No guest questions'}${post.requiresCollegeVerification?verification?' · Verification shared':' · Verification pending':''}</span></span><span class="pass-candidate-open">Review <b>→</b></span></button></article>`;};
  pageView.innerHTML=`<div class="insights-page host-approval-insights"><header class="insights-hero"><div><p class="overline">Host approvals</p><h2>${escapeHtml(plan.title||post.title)}</h2><p class="insights-subtitle">${escapeHtml(plan.location||post.location)} · ${formatDateTime(plan.starts_at||post.starts_at)}</p></div><span class="insights-live-state"><i></i>Live</span></header><section class="insight-metric-grid" aria-label="Event performance"><div class="insights-metric"><strong>${metrics.reach||0}</strong><span>Reached</span></div><div class="insights-metric primary"><strong>${Number(metrics.interested??interested.length)}</strong><span>Interested</span></div><div class="insights-metric"><strong>${Number(metrics.waitlisted||0)}</strong><span>Waitlisted</span></div><div class="insights-metric"><strong>${passesIssued}</strong><span>Passes sent</span></div><div class="insights-metric"><strong>${attended.length}</strong><span>Checked in</span></div></section><section class="insights-utility insights-scan-priority"><div><p class="approval-eyebrow">At the door</p><strong>Scan guest pass</strong><span>Check in an approved guest in seconds.</span></div><button class="scan-button" id="open-scan">Scan pass <span>↗</span></button></section><section class="insights-section pass-approval-section"><div class="approval-heading"><div><p class="approval-eyebrow">Requests</p><h3>People waiting for a pass</h3><p>Open any request to review the guest’s profile, answers, and event-only verification. Or select several people and approve them together.</p></div><div class="approval-actions"><span id="pass-selection-count" aria-live="polite">Select requests</span><button id="issue-selected-passes" class="publish-button" type="button" ${interested.length?'':'disabled'}>Send passes <span>→</span></button></div></div><div class="pass-candidate-list">${interested.length?interested.map(candidate).join(''):'<div class="insights-empty"><strong>No requests yet</strong><span>New interest requests will appear here automatically.</span></div>'}</div></section><section class="insights-section insights-roster"><div class="roster-heading"><div><p class="approval-eyebrow">Issued</p><h3>Pass holders</h3></div><span>${confirmed.length}</span></div>${confirmed.length?confirmed.map(person).join(''):'<div class="insights-empty"><strong>No passes sent</strong><span>Approved guests will appear here.</span></div>'}</section><section class="insights-section insights-roster"><div class="roster-heading"><div><p class="approval-eyebrow">Attendance</p><h3>Checked in</h3></div><span>${attended.length}</span></div>${attended.length?attended.map(person).join(''):'<div class="insights-empty"><strong>No one checked in yet</strong><span>Use Scan pass at the door to record attendance.</span></div>'}</section></div>`;
  pageView.querySelector('#open-scan')?.addEventListener('click',()=>openScanModal(planId));
  pageView.querySelectorAll('[data-request-review]').forEach(button=>button.addEventListener('click',()=>openHostRequestReview(planId,button.dataset.requestReview)));
  const updatePassSelection=()=>{
    const total=pageView.querySelectorAll('[data-pass-candidate]:checked').length;
    const label=pageView.querySelector('#pass-selection-count');
    if(label)label.textContent=total?`${total} selected`:'Select requests';
  };
  pageView.querySelectorAll('[data-pass-candidate]').forEach(input=>input.addEventListener('change',updatePassSelection));
  pageView.querySelector('#issue-selected-passes')?.addEventListener('click',async event=>{
    const selected=[...pageView.querySelectorAll('[data-pass-candidate]:checked')].map(input=>input.value);
    if(!selected.length){showToast('Select at least one request first.');return;}
    const button=event.currentTarget;
    button.disabled=true;
    button.textContent=`Sending ${selected.length}…`;
    let issued=0;
    const failures=[];
    for(const userId of selected){
      const result=await supabase.rpc('issue_plan_entry_pass',{p_plan_id:planId,p_user_id:userId});
      if(result.error)failures.push(result.error.message);else issued++;
    }
    await refreshEvenitLiveData({quiet:true});
    await renderInsights(planId);
    showToast(issued?`${issued} ${issued===1?'entry pass':'entry passes'} sent.${failures.length?' Some requests could not be approved.':''}`:failures[0]||'No passes were sent.');
  });
};

document.querySelector('#post-form').onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const data=new FormData(form);
  const button=form.querySelector('[type="submit"]');
  try{
    if(!navigator.onLine)throw new Error('You are offline. Connect to Wi-Fi or mobile data, then try again.');
    await withEvenitTimeout(getFreshEvenitUser(),8000,'Your login check took too long. Please try again.');
    const startsAt=new Date(String(data.get('when')||''));
    if(Number.isNaN(startsAt.getTime()))throw new Error('Choose a valid date and time for the event.');
    const questions=typeof window.getPlanFormQuestions==='function'?window.getPlanFormQuestions():[];
    if(questions.length>10)throw new Error('You can add up to 10 guest questions.');
    const invalidQuestion=questions.find(question=>!question.prompt||(['multiple_choice','checkboxes'].includes(question.type)&&question.options.length<2));
    if(invalidQuestion)throw new Error('Choice questions need at least two answer options.');
    const latitudeValue=String(data.get('plan_latitude')||'').trim();
    const longitudeValue=String(data.get('plan_longitude')||'').trim();
    const latitude=latitudeValue?Number(latitudeValue):null;
    const longitude=longitudeValue?Number(longitudeValue):null;
    if((latitude===null)!==(longitude===null)||!Number.isFinite(latitude??0)||!Number.isFinite(longitude??0))throw new Error('The selected location is not valid.');
    button.disabled=true;button.textContent='Publishing…';
    const {data:planId,error}=await withEvenitTimeout(supabase.rpc('create_plan_with_question_form',{p_title:String(data.get('title')||''),p_location:String(data.get('where')||''),p_starts_at:startsAt.toISOString(),p_caption:String(data.get('caption')||''),p_category:String(data.get('category')||'Social'),p_requires_college_verification:data.get('requires_college_verification')==='on',p_questions:questions,p_latitude:latitude,p_longitude:longitude}),15000,'Publishing timed out. Check your connection and try again.');
    if(error)throw error;
    if(!planId)throw new Error('The event was not confirmed by the database.');
    modal.classList.remove('open');
    form.reset();
    await refreshEvenitLiveData({quiet:true});
    showToast('Your plan is live everywhere ✦');
  }catch(error){showToast(`Could not publish: ${error?.message||'Please try again.'}`);}
  finally{button.disabled=false;button.innerHTML='Create plan <span>→</span>';}
};

// navigation.js starts before this file. Re-apply the address route after all
// page handlers exist so a direct Discover/Profile/Messages link cannot leave
// the Home board visible underneath it.
function syncInitialPageFromAddress(){
  const [route,tab]=decodeURIComponent(window.location.hash.replace(/^#/,'')).split('/');
  const pages=new Set(['home','discover','groups','notifications','messages','profile','saved','settings']);
  if(!pages.has(route)||route==='home')return;
  const sharedProfileId=new URLSearchParams(window.location.search).get('profile');
  if(route==='profile'&&sharedProfileId){setPage('profile');setTimeout(()=>renderPublicProfile(sharedProfileId),0);return;}
  setPage(route);
  if(route==='profile'&&tab){
    setTimeout(()=>{
      const target=[...document.querySelectorAll('.profile-tabs button')].find(button=>button.textContent.trim().toLowerCase().includes(tab.toLowerCase()));
      target?.click();
    },0);
  }
}
setTimeout(syncInitialPageFromAddress,0);

setEvenitConnectionState(navigator.onLine);
evenitRefreshInterval=setInterval(()=>{if(document.visibilityState==='visible')refreshEvenitLiveData({quiet:true});},20000);
async function showNativeUpdatePrompt(){const capacitor=window.Capacitor;if(!capacitor?.isNativePlatform?.())return;try{const app=capacitor.Plugins?.App||capacitor.getPlugin?.('App');const info=await app?.getInfo?.();const current=Number(info?.build||0);const manifest=await fetch(`app-update.json?ts=${Date.now()}`,{cache:'no-store'}).then(response=>response.ok?response.json():null);if(!manifest||Number(manifest.versionCode)<=current)return;const banner=document.querySelector('#app-update-banner');if(!banner||sessionStorage.getItem(`evenit-update-dismissed-${manifest.versionCode}`))return;banner.querySelector('#app-update-message').textContent=manifest.message||'A new Evenit version is ready.';banner.querySelector('#app-update-link').href=manifest.apkUrl;banner.hidden=false;document.querySelector('#dismiss-app-update').onclick=()=>{sessionStorage.setItem(`evenit-update-dismissed-${manifest.versionCode}`,'true');banner.hidden=true}}catch(error){console.info('Update check unavailable',error)}}showNativeUpdatePrompt();

// Create Plan and Edit Profile are full application views, not overlays. The
// existing forms are moved into the workspace so their validation, uploads,
// and database behavior remain exactly the same.
let activeWorkspace=null;
const workspaceDefinitions={
  plan:{surface:document.querySelector('#modal .composer-modal'),host:modal,destination:'home',label:'Create plan'},
  profile:{surface:document.querySelector('#edit-modal .edit-modal'),host:editModal,destination:'profile',label:'Edit profile'}
};
document.querySelector('input[name="banner"]')?.closest('.upload-card')?.remove();

function restoreWorkspaceSurface(kind){
  const definition=workspaceDefinitions[kind];
  if(!definition?.surface)return;
  definition.host.append(definition.surface);
  definition.host.classList.remove('open');
  definition.surface.classList.remove('workspace-surface',`workspace-${kind}`);
  definition.surface.setAttribute('role','dialog');
  definition.surface.setAttribute('aria-modal','true');
}

function closeWorkspace({destination}={}){
  const kind=activeWorkspace;
  if(!kind)return;
  const definition=workspaceDefinitions[kind];
  restoreWorkspaceSurface(kind);
  activeWorkspace=null;
  document.body.classList.remove('workspace-open');
  pageView.classList.remove('workspace-view');
  setPage(destination||definition.destination);
}

function initializeProfileEditor(){
  const meta=currentUser?.user_metadata||{};
  editForm.full_name.value=meta.full_name||'';
  editForm.username.value=meta.username||'';
  editForm.email.value=currentUser?.email||'';
  // The established loader also supplies private college data and visibility.
  editModal.classList.add('open');
  loadProfileDetails().finally(()=>editModal.classList.remove('open'));
}

function openWorkspace(kind,{restore=false}={}){
  if(activeWorkspace===kind)return;
  if(activeWorkspace)closeWorkspace();
  const definition=workspaceDefinitions[kind];
  if(!definition?.surface)return;
  if(kind==='profile')initializeProfileEditor();
  if(!restore)pushAppView({type:'workspace',kind});
  activeWorkspace=kind;
  definition.host.classList.remove('open');
  homeElements.forEach(element=>element.hidden=true);
  pageView.hidden=false;
  pageView.className='page-view workspace-view';
  document.querySelectorAll('[data-page]').forEach(link=>link.classList.remove('active'));
  updateMobileHeader(kind==='profile'?'profile':'home');
  document.body.classList.add('workspace-open');
  pageView.innerHTML=`<section class="workspace-shell workspace-shell-${kind}"><header class="workspace-bar"><button class="workspace-cancel" type="button" data-workspace-cancel>Cancel</button><strong>${definition.label}</strong><span class="workspace-bar-spacer" aria-hidden="true"></span></header><div class="workspace-mount"></div></section>`;
  definition.surface.classList.add('workspace-surface',`workspace-${kind}`);
  definition.surface.removeAttribute('aria-modal');
  definition.surface.removeAttribute('role');
  pageView.querySelector('.workspace-mount').append(definition.surface);
  pageView.querySelector('[data-workspace-cancel]')?.addEventListener('click',()=>{
    if(window.history.state?.evenitAppView?.type==='workspace')window.history.back();
    else closeWorkspace();
  });
  window.scrollTo({top:0,behavior:'smooth'});
}

document.addEventListener('click',event=>{
  const editTrigger=event.target.closest('.edit-profile');
  const planTrigger=event.target.closest('#open-modal,#open-modal-header,#open-modal-mobile,[data-dock-create],.add-story,#profile-post,.topbar-plus');
  if(!editTrigger&&!planTrigger)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openWorkspace(editTrigger?'profile':'plan');
},true);

window.addEventListener('popstate',event=>{
  const workspace=event.state?.evenitAppView;
  if(workspace?.type==='workspace'){openWorkspace(workspace.kind,{restore:true});return;}
  if(activeWorkspace)closeWorkspace();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeWorkspace)closeWorkspace();});

const establishedProfileSubmit=editForm.onsubmit;
editForm.onsubmit=async event=>{
  const establishedRenderProfile=renderProfile;
  let saved=false;
  renderProfile=()=>{saved=true;};
  try{await establishedProfileSubmit(event);}finally{renderProfile=establishedRenderProfile;editForm.querySelector('[type="submit"]').textContent='Save changes';}
  if(saved&&activeWorkspace==='profile')closeWorkspace({destination:'profile'});
};
const establishedPlanSubmit=document.querySelector('#post-form').onsubmit;
document.querySelector('#post-form').onsubmit=async event=>{
  const form=event.currentTarget;
  const startedWithTitle=Boolean(form.elements.title?.value.trim());
  await establishedPlanSubmit(event);
  if(startedWithTitle&&activeWorkspace==='plan'&&!form.elements.title?.value)closeWorkspace({destination:'home'});
};

const establishedLoadProfileDetails=loadProfileDetails;
loadProfileDetails=async function(){
  await establishedLoadProfileDetails();
  const about=document.querySelector('.profile-about-own');
  const aboutSection=document.querySelector('.profile-about-section');
  if(aboutSection)aboutSection.hidden=!about?.textContent.trim();
};
const establishedProfileRenderer=renderProfile;
renderProfile=function(){
  establishedProfileRenderer();
  if(activeWorkspace)return;
  pageView.classList.add('profile-page-refined');
  wirePremiumProfileInteractions();
};

async function loadOwnProfileFollowStats(){
  const profileId=currentUser?.id;
  if(!supabase||!profileId)return;
  const [followers,following]=await Promise.all([
    supabase.from('user_follows').select('*',{count:'exact',head:true}).eq('following_id',profileId),
    supabase.from('user_follows').select('*',{count:'exact',head:true}).eq('follower_id',profileId)
  ]);
  if(currentUser?.id!==profileId)return;
  if(!followers.error){const count=document.querySelector('#profile-followers-count');if(count)count.textContent=String(followers.count||0);}
  if(!following.error){const count=document.querySelector('#profile-following-count');if(count)count.textContent=String(following.count||0);}
}

function activatePremiumProfileTab(view,{motion=false}={}){
  const tab=document.querySelector(`.profile-tabs [data-profile-tab="${view}"]`);
  if(!tab)return;
  document.querySelectorAll('.profile-tabs [data-profile-tab]').forEach(button=>{
    const active=button===tab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
  });
  const stage=document.querySelector('.profile-tab-stage');
  if(motion&&stage){stage.classList.remove('is-switching');requestAnimationFrame(()=>stage.classList.add('is-switching'));}
  renderProfileTab(tab);
}

async function shareCurrentProfile(){
  if(!currentUser?.id)return;
  const url=`${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(currentUser.id)}#profile`;
  const title=`${currentUser.user_metadata?.full_name||'My'} Evenit profile`;
  try{
    if(navigator.share){await navigator.share({title,text:'Find my plans and updates on Evenit.',url});return;}
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);showToast('Profile link copied');return;}
    showToast('Profile link is ready to share');
  }catch(error){if(error?.name!=='AbortError')showToast('Could not open sharing. Please try again.');}
}

function wirePremiumProfileInteractions(){
  const profile=document.querySelector('.profile-instagram');
  if(!profile)return;
  document.querySelector('#profile-menu')?.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();toggleProfileMenu(event.currentTarget);
  });
  document.querySelector('#share-profile')?.addEventListener('click',shareCurrentProfile);
  document.querySelectorAll('.profile-tabs [data-profile-tab]').forEach(tab=>{
    tab.onclick=event=>{event.preventDefault();event.stopPropagation();activatePremiumProfileTab(tab.dataset.profileTab,{motion:true});};
  });
  const stage=profile.querySelector('.profile-tab-stage');
  if(!stage)return;
  let startX=0,startY=0;
  stage.onpointerdown=event=>{startX=event.clientX;startY=event.clientY;};
  stage.onpointerup=event=>{
    const dx=event.clientX-startX;
    const dy=event.clientY-startY;
    if(Math.abs(dx)<48||Math.abs(dx)<Math.abs(dy))return;
    activatePremiumProfileTab(dx<0?'lived':'plans',{motion:true});
  };
}

function closeProfileMenu(){
  document.querySelector('#profile-menu-panel')?.remove();
  document.querySelector('#profile-menu')?.setAttribute('aria-expanded','false');
}

function toggleProfileMenu(trigger){
  const existing=document.querySelector('#profile-menu-panel');
  if(existing){closeProfileMenu();return;}
  const signedIn=Boolean(currentUser);
  const panel=document.createElement('div');
  panel.id='profile-menu-panel';
  panel.className='profile-menu-panel';
  panel.setAttribute('role','menu');
  panel.innerHTML=`
    <button type="button" role="menuitem" data-profile-menu-action="settings"><span>⚙</span>Settings</button>
    <button type="button" role="menuitem" data-profile-menu-action="saved"><span>◇</span>Saved</button>
    <a role="menuitem" href="https://github.com/letsberesponsiblenafar-cmyk/Evenit/releases/latest/download/Evenit.apk" target="_blank" rel="noreferrer"><span>↓</span>Download Android app</a>
    <div class="profile-menu-divider"></div>
    <button type="button" role="menuitem" class="profile-menu-account" data-profile-menu-action="${signedIn?'logout':'login'}"><span>${signedIn?'↗':'→'}</span>${signedIn?'Log out':'Log in'}</button>`;
  trigger.parentElement?.append(panel);
  trigger.setAttribute('aria-expanded','true');
  panel.querySelectorAll('[data-profile-menu-action]').forEach(button=>button.addEventListener('click',async()=>{
    const action=button.dataset.profileMenuAction;
    if(action==='saved'){activeSavedCollection='plans';closeProfileMenu();setPage('saved');return;}
    if(action==='settings'){closeProfileMenu();setPage('settings');return;}
    if(action==='login'){closeProfileMenu();loginModal?.classList.add('open');return;}
    if(action==='logout'){
      button.disabled=true;
      const {error}=await supabase?.auth.signOut()||{};
      if(error){button.disabled=false;showToast(`Could not log out: ${error.message}`);return;}
      currentUser=null;
      closeProfileMenu();
      updateAccountUI();
      setPage('home');
      showToast('You are logged out.');
    }
  }));
}

document.addEventListener('click',event=>{
  const panel=document.querySelector('#profile-menu-panel');
  if(panel&&!panel.contains(event.target)&&!event.target.closest('#profile-menu'))closeProfileMenu();
});

let publicEventSource=null;
function restorePublicEventSource(){
  const source=publicEventSource;
  publicEventSource=null;
  if(!source)return;
  if(source.page==='home'){goHome();return;}
  setPage(source.page||'discover');
  if(source.page==='profile'&&source.tab==='lived'){
    setTimeout(()=>activatePremiumProfileTab('lived',{motion:true}),0);
  }
}

window.addEventListener('popstate',()=>{
  if(publicEventSource&&document.querySelector('.public-event-page'))restorePublicEventSource();
});

async function openPublicEventDetails(planId,fallback={}){
  if(!planId){showToast('This event is no longer available.');return;}
  const activePage=pageView.hidden?'home':(document.querySelector('[data-page].active')?.dataset.page||'discover');
  publicEventSource={page:activePage,tab:activePage==='profile'?'lived':null};
  window.history.pushState({...window.history.state,evenitPublicEvent:true},'',window.location.href);
  homeElements.forEach(element=>element.hidden=true);
  pageView.hidden=false;
  document.querySelectorAll('[data-page]').forEach(link=>link.classList.remove('active'));
  pageView.innerHTML='<section class="public-event-page public-event-loading"><span class="public-event-kicker">Lived</span><h2>Loading event details…</h2></section>';
  const known=posts.find(post=>post.id===planId);
  let plan={...fallback,...known,id:planId};
  if(supabase){
    const {data,error}=await supabase.from('plans').select('id,title,location,starts_at,caption,category,capacity,user_id').eq('id',planId).maybeSingle();
    if(!error&&data)plan={...plan,...data};
    const {data:summary}=await supabase.rpc('get_plan_summaries',{p_plan_ids:[planId]});
    const counts=rpcRow(summary)||{};
    if(Number.isFinite(Number(counts.confirmed_count)))plan.joinedCount=Number(counts.confirmed_count);
  }
  const when=plan.starts_at?formatDateTime(plan.starts_at):'Date to be announced';
  const attendance=plan.capacity?`${plan.joinedCount||0} of ${plan.capacity} confirmed`:`${plan.joinedCount||0} confirmed`;
  const isPast=plan.starts_at&&new Date(plan.starts_at)<new Date();
  const canRequest=known&&!isPast&&!known.isOwner&&!known.membershipStatus;
  pageView.innerHTML=`<section class="public-event-page"><span class="public-event-kicker">Lived</span><h2>${escapeHtml(plan.title||'Event details')}</h2><p class="public-event-lead">Everything the host chose to make public about this event.</p><div class="public-event-detail-grid"><section><span>When</span><strong>${escapeHtml(when)}</strong></section><section><span>Where</span><a href="${mapUrl(plan.location||'')}" target="_blank" rel="noreferrer">${escapeHtml(plan.location||'Location to be announced')} ↗</a></section><section><span>Attendance</span><strong>${escapeHtml(attendance)}</strong></section></div>${plan.caption?`<section class="public-event-note"><h3>About this event</h3><p>${escapeHtml(plan.caption)}</p></section>`:''}<p class="public-event-privacy">Private requests, guest answers, and host insights are not shown here.</p>${canRequest?'<button class="public-event-join" type="button" data-public-event-join>Request to join</button>':''}</section>`;
  pageView.querySelector('[data-public-event-join]')?.addEventListener('click',event=>requestPlanInterest(known,event.currentTarget));
}

document.addEventListener('click',event=>{
  const eventLink=event.target.closest('[data-aftermath-event]');
  if(!eventLink)return;
  event.preventDefault();
  event.stopPropagation();
  openPublicEventDetails(eventLink.dataset.aftermathEvent,{title:eventLink.dataset.eventTitle,location:eventLink.dataset.eventLocation});
});

// The Plan Board belongs to Home only. It sits outside the main page view, so
// explicitly keep it in sync whenever navigation changes pages.
const profileAwareSetPage=setPage;
setPage=function(page){
  setInsightsDockScan(null);
  document.querySelector('#pulse-bar')?.toggleAttribute('hidden',page!=='home');
  profileAwareSetPage(page);
};
})();
