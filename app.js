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
let joinedEventIds=new Set(JSON.parse(localStorage.getItem('evenit-joined-events')||'[]'));
let adminContent={};
let activeInsightsPlanId=null;
let currentLocation=null;
let navHistory=[];
function pushNav(from){navHistory.push(from);if(navHistory.length>10)navHistory.shift()}
function goBack(){const prev=navHistory.pop();if(prev==='home'||!prev)goHome();else setPage(prev)}
function goHome(){
  navHistory=[];
  pageView.hidden=true;
  homeElements.forEach(e=>e.hidden=false);
  document.querySelectorAll('[data-page]').forEach(l=>l.classList.remove('active'));
  document.querySelector('[data-page="home"]')?.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}
const analyticsSessionId=localStorage.getItem('evenit-analytics-session')||(()=>{const id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem('evenit-analytics-session',id);return id})();
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const formatPostTime=value=>{if(!value)return'New';const date=new Date(value);const seconds=Math.max(1,Math.floor((Date.now()-date.getTime())/1000));if(seconds<60)return'just now';if(seconds<3600)return`${Math.floor(seconds/60)}m`;if(seconds<86400)return`${Math.floor(seconds/3600)}h`;if(seconds<604800)return`${Math.floor(seconds/86400)}d`;return date.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
const formatDateTime=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not scheduled';
const rpcRow=data=>Array.isArray(data)?data[0]:data;
async function recordPlanInteraction(planId,kind){if(!supabase||!planId)return;await supabase.rpc('record_plan_interaction',{p_plan_id:planId,p_kind:kind,p_session_id:analyticsSessionId})}
async function trackPostImpressions(){if(!window.IntersectionObserver)return;const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){recordPlanInteraction(entry.target.dataset.planId,'impression');observer.unobserve(entry.target)}}),{threshold:.45});document.querySelectorAll('[data-plan-id].post').forEach(post=>observer.observe(post))}
 function updateAccountUI(){const loginButton=document.querySelector('#open-login');const navAvatar=document.querySelector('#nav-avatar');if(currentUser){const name=currentUser.user_metadata?.full_name||currentUser.email?.split('@')[0]||'Evenit member';const avatar=currentUser.user_metadata?.avatar_url;loginButton.hidden=true;navAvatar.textContent=name.slice(0,2).toUpperCase();if(avatar)navAvatar.innerHTML=`<img src="${avatar}" alt="">`}else{loginButton.hidden=false;navAvatar.textContent='EV'}}
const mapUrl=place=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
async function loadPlans(){if(!supabase)return;const {data,error}=await supabase.from('plans').select('id,title,location,starts_at,caption,category,user_id,created_at,capacity,neighborhood').order('created_at',{ascending:false});if(error){showToast('Could not load plans: '+error.message);return}if(data?.length){const ids=data.map(plan=>plan.id);const authorIds=[...new Set(data.map(plan=>plan.user_id).filter(Boolean))];const [summaryResult,authorResult,membershipResult]=await Promise.all([supabase.rpc('get_plan_summaries',{p_plan_ids:ids}),authorIds.length?supabase.rpc('get_public_profiles',{p_user_ids:authorIds}):Promise.resolve({data:[]}),currentUser?supabase.from('plan_members').select('plan_id,status').eq('user_id',currentUser.id).in('plan_id',ids):Promise.resolve({data:[]})]);const summaries=new Map((summaryResult.data||[]).map(item=>[item.plan_id,item]));const authors=new Map((authorResult.data||[]).map(item=>[item.id,item]));const memberships=new Map((membershipResult.data||[]).map(item=>[item.plan_id,item.status]));posts=data.map(plan=>{const author=authors.get(plan.user_id)||{};const status=memberships.get(plan.id)||null;const summary=summaries.get(plan.id)||{};return{id:plan.id,user:author.username||author.full_name||'Evenit member',name:author.full_name||author.username||'Evenit member',avatar:author.avatar_url||'https://i.pravatar.cc/100?img=68',user_id:plan.user_id,time:formatPostTime(plan.created_at),created_at:plan.created_at,starts_at:plan.starts_at,image:'pic-one',category:plan.category||'Community event',title:plan.title,location:plan.location,caption:plan.caption||'A new event is taking shape. Come as you are and make it yours. ✦',likes:0,comments:Number(summary.comment_count||0),joined:status==='confirmed',membershipStatus:status,joinedCount:Number(summary.confirmed_count||0),capacity:plan.capacity,isOwner:currentUser?.id===plan.user_id,saved:savedEventIds.has(plan.id)}})}renderPosts();applyAdminContent();applyAdminStyles();if(!pageView.hidden&&document.querySelector('[data-page].active')?.dataset.page==='profile')renderProfile()}
async function loadPlans(){if(!supabase)return;const {data,error}=await supabase.from('plans').select('id,title,location,starts_at,caption,category,user_id,created_at,capacity,neighborhood').order('created_at',{ascending:false});if(error){showToast('Could not load plans: '+error.message);return}if(data?.length){const ids=data.map(plan=>plan.id);const authorIds=[...new Set(data.map(plan=>plan.user_id).filter(Boolean))];const [summaryResult,authorResult,membershipResult]=await Promise.all([supabase.rpc('get_plan_summaries',{p_plan_ids:ids}),authorIds.length?supabase.rpc('get_public_profiles',{p_user_ids:authorIds}):Promise.resolve({data:[]}),currentUser?supabase.from('plan_members').select('plan_id,status').eq('user_id',currentUser.id).in('plan_id',ids):Promise.resolve({data:[]})]);const summaries=new Map((summaryResult.data||[]).map(item=>[item.plan_id,item]));const authors=new Map((authorResult.data||[]).map(item=>[item.id,item]));const memberships=new Map((membershipResult.data||[]).map(item=>[item.plan_id,item.status]));posts=data.map(plan=>{const author=authors.get(plan.user_id)||{};const status=memberships.get(plan.id)||null;const summary=summaries.get(plan.id)||{};return{id:plan.id,user:author.username||author.full_name||'Evenit member',name:author.full_name||author.username||'Evenit member',avatar:author.avatar_url||'https://i.pravatar.cc/100?img=68',user_id:plan.user_id,time:formatPostTime(plan.created_at),created_at:plan.created_at,starts_at:plan.starts_at,image:'pic-one',category:plan.category||'Community event',title:plan.title,location:plan.location,caption:plan.caption||'A new event is taking shape. Come as you are and make it yours. ✦',likes:0,comments:Number(summary.comment_count||0),joined:status==='confirmed',membershipStatus:status,joinedCount:Number(summary.confirmed_count||0),capacity:plan.capacity,isOwner:currentUser?.id===plan.user_id,saved:savedEventIds.has(plan.id)}})}renderPosts();applyAdminContent();applyAdminStyles();if(!pageView.hidden&&document.querySelector('[data-page].active')?.dataset.page==='profile')renderProfile();renderPulseBar()}

function renderPulseBar(){
  const bar=document.querySelector('#pulse-bar');
  if(!bar) return;
  bar.querySelectorAll('.pulse-card').forEach(el=>el.remove());
  if(!currentUser) return;
  const now=new Date();
  const upcoming=posts.filter(p=>p.starts_at&&new Date(p.starts_at)>now&&(p.joined||p.user_id===currentUser.id));
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
    const isOwned=p.user_id===currentUser.id;
    el.innerHTML=`<span class="pulse-time">${timeLabel}</span><strong>${escapeHtml(p.title)}</strong><small>${escapeHtml(p.location||'')}</small>`;
    el.onclick=()=>{
      showJoinedPage();
    };
    bar.appendChild(el);
  });
}

function showJoinedPage(){
  pushNav('home');
  homeElements.forEach(e=>e.hidden=true);
  pageView.hidden=false;
  document.querySelectorAll('[data-page]').forEach(l=>l.classList.remove('active'));
  pageView.innerHTML='<div class="joined-page-loading">Loading your plans...</div>';
  const joined=posts.filter(p=>p.joined||p.user_id===currentUser?.id);
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
    const hasPass=post.entryPass&&post.membershipStatus==='confirmed';
    const attended=post.entryPass?.checked_in_at;
    const statusBadge=attended?'<span class="joined-badge attended">Attended</span>':post.membershipStatus==='confirmed'?'<span class="joined-badge confirmed">Confirmed</span>':post.membershipStatus==='waitlisted'?'<span class="joined-badge waitlisted">Waitlisted</span>':isOwned?'<span class="joined-badge owned">Host</span>':'';
    return`<div class="joined-card" data-joined-id="${escapeHtml(post.id||'')}">
      <div class="joined-card-top" data-joined-detail="${escapeHtml(post.id||'')}">
        <div class="joined-card-info">
          <div class="joined-card-title">${escapeHtml(post.title)}</div>
          <div class="joined-card-meta">
            <span class="joined-card-loc">\uD83D\uDCCD ${escapeHtml(post.location||'')}</span>
            ${when?`<span class="joined-card-when">${escapeHtml(when)}</span>`:''}
          </div>
          <div class="joined-card-footer">
            ${statusBadge}
            <span class="joined-card-count">${post.joinedCount||0}${post.capacity?`/${post.capacity}`:''} joined</span>
          </div>
        </div>
        <div class="joined-card-arrow">\u2192</div>
      </div>
      <div class="joined-card-actions">
        ${hasPass?`<button class="joined-action-btn pass-btn" data-joined-pass="${escapeHtml(post.id||'')}">View Your Pass</button>`:''}
        ${isOwned&&!isPast?`<button class="joined-action-btn insights-btn" data-insights-id="${escapeHtml(post.id||'')}">Insights \u2197</button>`:''}
        ${!isPast&&post.membershipStatus!=='attended'&&!isOwned?`<button class="joined-action-btn leave-btn" data-joined-leave="${escapeHtml(post.id||'')}">Leave Event</button>`:''}
      </div>
    </div>`}).join('');
  pageView.innerHTML=`<div class="page-header"><button class="back-to-home" onclick="goBack()">\u2190 Back</button><p class="overline">Your plans</p><h2>Joined</h2><p style="font-size:13px;color:#6E6E73;margin:4px 0 0">${joined.length} plan${joined.length===1?'':'s'}</p></div><div class="joined-page-list">${cardsHtml}</div>`;
  pageView.querySelectorAll('[data-joined-detail]').forEach(el=>{
    el.style.cursor='pointer';
    el.onclick=()=>{
      const pid=el.dataset.joinedDetail;
      const post=posts.find(p=>p.id===pid);
      if(!post) return;
      homeElements.forEach(e=>e.hidden=true);
      pageView.hidden=false;
      pageView.innerHTML='';
      renderPosts();
      setTimeout(()=>{
        const target=document.querySelector(`[data-plan-id="${pid}"]`);
        if(target) target.scrollIntoView({behavior:'smooth',block:'center'});
      },100);
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

function goHome(){
  pageView.hidden=true;
  homeElements.forEach(e=>e.hidden=false);
  document.querySelectorAll('[data-page]').forEach(l=>l.classList.remove('active'));
  document.querySelector('[data-page="home"]')?.classList.add('active');
}

async function loadAftermathFeed(){
  if(!supabase){ renderAftermathFeed([]); return; }
  const {data,error}=await supabase.rpc('get_aftermath_feed',{p_limit:20});
  if(error){ console.error(error); renderAftermathFeed([]); return; }
  const withMedia = await Promise.all((data||[]).map(async post=>{
    const {data:media}=await supabase.from('plan_aftermath_media').select('file_url,file_type,file_name').eq('post_id', post.id);
    return {...post, media: media||[]};
  }));
  renderAftermathFeed(withMedia);
}
function renderAftermathFeed(items){
  if(!postsEl) return;
  if(!items || !items.length){
    postsEl.innerHTML=`<div class="aftermath-empty"><div class="aftermath-empty-icon">\u25CE</div><h3>No stories yet</h3><p>When events end, their stories appear here. Join an upcoming plan and get checked in to share yours.</p><button onclick="document.querySelector('[data-page=discover]')?.click()">Discover upcoming</button></div>`;
    return;
  }
  postsEl.innerHTML=items.map((post)=>{
    const tags=(post.hashtags||[]).map(h=>`<span class="aftermath-tag">#${escapeHtml(h)}</span>`).join(' ');
    const mediaHtml=(post.media||[]).map(m=>{
      if(m.file_type==='image') return `<div class="aftermath-media-item image"><img src="${escapeHtml(m.file_url)}" alt="Event photo" loading="lazy"></div>`;
      if(m.file_type==='video') return `<div class="aftermath-media-item video"><video src="${escapeHtml(m.file_url)}" controls preload="none" poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='60'%3E%3Crect fill='%231D1D1F' width='100' height='60'/%3E%3Ctext x='50' y='34' text-anchor='middle' fill='%23fff' font-size='14'%3E\u25B6%3C/text%3E%3C/svg%3E"></video></div>`;
      if(m.file_type==='pdf') return `<a class="aftermath-media-item pdf" href="${escapeHtml(m.file_url)}" target="_blank" rel="noreferrer"><span class="pdf-icon">\uD83D\uDCC4</span><span class="pdf-name">${escapeHtml(m.file_name||'PDF document')}</span></a>`;
      return `<a class="aftermath-media-item link" href="${escapeHtml(m.file_url)}" target="_blank" rel="noreferrer">${escapeHtml(m.file_name||'Link')}</a>`;
    }).join('');
    const gridClass=(post.media||[]).length>=2?'grid-2':(post.media||[]).length>=3?'grid-3':'';
    const authorName=escapeHtml(post.full_name||post.username||'Evenit member');
    const authorHandle=escapeHtml(post.username?'@'+post.username:'');
    const avatarUrl=escapeHtml(post.avatar_url||'https://i.pravatar.cc/100?img=68');
    const planTitle=escapeHtml(post.plan_title||'');
    const planLocation=escapeHtml(post.plan_location||'');
    const timeAgo=formatPostTime(post.created_at);
    const likeCount=post.like_count||0;
    const commentCount=post.comment_count||0;
    const isLiked=post.liked;
    return`<article class="aftermath-card" data-aftermath-id="${escapeHtml(post.id)}">
      <div class="aftermath-header">
        <img class="aftermath-avatar" src="${avatarUrl}" alt="${authorName}">
        <div class="aftermath-author">
          <div class="aftermath-name">${authorName}</div>
          <div class="aftermath-handle">${authorHandle}</div>
        </div>
        <div class="aftermath-time">${timeAgo}</div>
      </div>
      <div class="aftermath-event-context">
        <div class="aftermath-event-badge">LIVED</div>
        <div class="aftermath-event-info">
          <span class="aftermath-event-title">${planTitle}</span>
          ${planLocation?`<span class="aftermath-event-loc">\uD83D\uDCCD ${planLocation}</span>`:''}
        </div>
      </div>
      <div class="aftermath-body">${escapeHtml(post.body)}</div>
      ${tags?`<div class="aftermath-tags">${tags}</div>`:''}
      ${mediaHtml?`<div class="aftermath-media ${gridClass}">${mediaHtml}</div>`:''}
      <div class="aftermath-stats">
        ${likeCount?`<span>${likeCount} ${likeCount===1?'like':'likes'}</span>`:''}
        ${commentCount?`<span>${commentCount} ${commentCount===1?'comment':'comments'}</span>`:''}
      </div>
      <div class="aftermath-actions">
        <button class="aftermath-action ${isLiked?'liked':''}" data-aftermath-like="${escapeHtml(post.id)}">
          <span class="action-icon">${isLiked?'\u2665':'\u2661'}</span>
          <span class="action-label">${isLiked?'Liked':'Like'}</span>
        </button>
        <button class="aftermath-action" data-aftermath-comment="${escapeHtml(post.id)}">
          <span class="action-icon">\uD83D\uDCAC</span>
          <span class="action-label">Comment</span>
        </button>
        <button class="aftermath-action" data-aftermath-share="${escapeHtml(post.id)}">
          <span class="action-icon">\u2197</span>
          <span class="action-label">Share</span>
        </button>
        <button class="aftermath-action save" data-aftermath-save="${escapeHtml(post.id)}">
          <span class="action-icon">\u25C7</span>
        </button>
      </div>
    </article>`;
  }).join('');
  document.querySelectorAll('[data-aftermath-like]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.aftermathLike;
    const liked=b.classList.contains('liked');
    if(!supabase||!currentUser){ showToast('Log in to like'); return; }
    if(liked){ await supabase.from('plan_aftermath_likes').delete().eq('post_id', id).eq('user_id', currentUser.id); } else { await supabase.from('plan_aftermath_likes').insert({post_id:id, user_id:currentUser.id}); }
    loadAftermathFeed();
  });
  document.querySelectorAll('[data-aftermath-comment]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.aftermathComment;
    activeAftermathCommentId=id;
    document.querySelector('#comment-sheet')?.classList.add('open');
    document.querySelector('#comment-list').innerHTML='<div style="padding:20px;text-align:center;color:#6E6E73">Loading comments...</div>';
    supabase.from('plan_aftermath_comments').select('id,body,created_at,user_id').eq('post_id', id).order('created_at',{ascending:true}).then(async ({data})=>{
      const list=document.querySelector('#comment-list');
      if(!data||!data.length){ list.innerHTML='<div style="padding:24px;text-align:center;color:#6E6E73">No comments yet. Be first to share your thoughts.</div>'; return; }
      const uids=[...new Set(data.map(c=>c.user_id))];
      const {data:profs}=await supabase.rpc('get_public_profiles',{p_user_ids:uids});
      const mp=new Map((profs||[]).map(p=>[p.id,p]));
      list.innerHTML=data.map(c=>{
        const p=mp.get(c.user_id)||{};
        return `<div class="comment-item"><img src="${escapeHtml(p.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt=""><div><div class="comment-header"><strong>${escapeHtml(p.full_name||p.username||'Member')}</strong><small>${formatPostTime(c.created_at)}</small></div><div class="comment-body">${escapeHtml(c.body)}</div></div></div>`;
      }).join('');
    });
  });
  document.querySelectorAll('[data-aftermath-share]').forEach(b=>b.onclick=()=>{
    const url=`${location.origin}${location.pathname}#aftermath-${b.dataset.aftermathShare}`;
    document.querySelector('#share-url').textContent=url;
    document.querySelector('#share-sheet')?.classList.add('open');
  });
  document.querySelectorAll('[data-aftermath-save]').forEach(b=>b.onclick=()=>{
    b.classList.toggle('saved');
    try{ navigator.vibrate?.(12);}catch{}
    showToast(b.classList.contains('saved')?'Saved \u2713':'Unsaved');
  });
}
let activeAftermathCommentId=null;
async function toggleJoin(index){const post=posts[index];if(!supabase||!currentUser){showToast('Create a profile before joining this event');signupModal.classList.add('open');return}if(!post.id){post.joined=!post.joined;renderPosts();return}const result=post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'?await supabase.rpc('leave_plan',{p_plan_id:post.id}):await supabase.rpc('join_plan',{p_plan_id:post.id});if(result.error){showToast(result.error.message);return}const row=rpcRow(result.data);if(post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'){showToast(row?.promoted_user_id?'You left the event. A person from the waitlist was promoted.':'You left this event');}else if(row?.status==='confirmed'){showToast(row.confirmation_memo?`You’re confirmed. ${row.confirmation_memo}`:'You’re confirmed for this event ✦')}else{showToast(`You’re on the waitlist${row?.queue_position?` at #${row.queue_position}`:''}. Confirmed guests receive the entry pass.`)}await loadPlans()}
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
        return `<div style="display:flex;gap:10px;padding:12px 16px;align-items:flex-start"><img src="${escapeHtml(p.avatar_url||'https://i.pravatar.cc/100?img=68')}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex:0 0 32px"><div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:baseline"><strong style="font:600 13px -apple-system,sans-serif;letter-spacing:-0.01em">${escapeHtml(name)}</strong><small style="color:#6E6E73;font-size:11px">${escapeHtml(time)}</small></div><div style="font-size:14px;line-height:1.45;margin-top:2px;letter-spacing:-0.01em;overflow-wrap:anywhere">${escapeHtml(c.body)}</div></div></div>`;
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
const pageTemplates={
  discover:`<div class="page-header"><p class="overline">Find your people</p><h2>Discover plans<br><em>worth joining.</em></h2><div class="search-box">⌕ <input placeholder="Search plans, places, or people..."></div></div><div class="discover-grid"><div class="discover-tile tile-violet"><small>OUTDOORS</small><strong>Golden hour<br>on the water</strong><span>16 people going →</span></div><div class="discover-tile tile-gold"><small>FOOD & DRINK</small><strong>Sunday supper<br>club</strong><span>12 people going →</span></div><div class="discover-tile tile-ink"><small>CREATIVE</small><strong>Make a tiny<br>zine together</strong><span>8 people going →</span></div></div>`,
  notifications:`<div class="page-header"><p class="overline">Stay in the loop</p><h2>Notifications</h2></div><div class="activity-list"><div class="activity"><img src="https://i.pravatar.cc/100?img=47"><p><strong>ari.makes</strong> joined your plan <b>Sunset picnic</b><small>12 minutes ago</small></p></div><div class="activity"><img src="https://i.pravatar.cc/100?img=25"><p><strong>maya.rose</strong> liked your plan <b>Saturday sketch walk</b><small>1 hour ago</small></p></div><div class="activity"><img src="https://i.pravatar.cc/100?img=44"><p><strong>theo.walks</strong> started following you<small>Yesterday</small></p></div></div>`,
  messages:`<div class="page-header"><p class="overline">Keep the plan moving</p><h2>Messages</h2></div><div class="message-list"><div class="message"><img src="https://i.pravatar.cc/100?img=25"><div><strong>maya.rose</strong><p>Should we bring extra blankets for the picnic?</p></div><small>2m</small></div><div class="message"><img src="https://i.pravatar.cc/100?img=47"><div><strong>ari.makes</strong><p>That coffee walk sounds perfect.</p></div><small>1h</small></div><div class="empty-message">Your conversations will live here.<br><span>Join a plan to meet someone new.</span></div></div>`,
  groups:`<div class="page-header"><p class="overline">Private circles</p><h2>Groups</h2><p style="color:#6E6E73;font-size:13px;line-height:1.5;margin:8px 0 18px">Telegram-like, private, only members see messages. Create up to 150.</p><button class="publish-button" id="open-group-create" style="width:auto;border-radius:999px">＋ Create group</button></div><div id="groups-list" class="groups-list" style="margin-top:18px"></div>`,
  settings:`<div class="page-header"><p class="overline">Make it yours</p><h2>Settings</h2></div><div class="settings-list"><button>Account details <span>→</span></button><button>Notification preferences <span>→</span></button><button>Privacy and safety <span>→</span></button><button>Help center <span>→</span></button></div>`,
};
  function renderProfile(){const loggedIn=Boolean(currentUser);const name=currentUser?.user_metadata?.full_name||currentUser?.email?.split('@')[0]||'Your profile';const username=currentUser?.user_metadata?.username||'create your username';pageView.innerHTML=`<div class="profile-cover"></div><div class="profile-intro"><img src="${currentUser?.user_metadata?.avatar_url||'https://i.pravatar.cc/160?img=68'}"><div><p class="overline">Your profile</p><h2>${escapeHtml(name)}</h2><p class="profile-handle">${loggedIn?'@'+escapeHtml(username):'Start your upneXt story'}</p></div>${loggedIn?'<button class="edit-profile">Edit profile</button>':''}</div><div class="profile-stats"><span><strong>${posts.filter(post=>post.user_id===currentUser?.id).length}</strong> plans posted</span><span><strong>${posts.filter(post=>post.joined).length}</strong> joined</span><span><strong>0</strong> followers</span></div><div class="profile-tabs"><button class="active">Your plans</button><button>Saved</button><button>Lived On</button></div><div class="profile-empty"><span>✦</span><h3>${loggedIn?'Your plans will appear here':'Join the community'}</h3><p>${loggedIn?'Share an idea and give people a reason to show up.':'Create your profile to post events and join other people’s plans.'}</p>${loggedIn?'<button class="publish-button" id="profile-post">Create plan <span>→</span></button>':'<div class="profile-actions"><button class="publish-button" id="profile-signup">Create a profile</button><button class="profile-login-button" id="profile-login">Log in</button></div>'}</div>`;if(loggedIn)document.querySelector('#profile-post').onclick=()=>modal.classList.add('open');else{document.querySelector('#profile-signup').onclick=()=>signupModal.classList.add('open');document.querySelector('#profile-login').onclick=()=>loginModal.classList.add('open')}renderProfileTab(document.querySelector('.profile-tabs button'));applyAdminContent();applyAdminStyles()}
  function renderDiscover(){
  pageView.innerHTML=`<div class="page-header"><p class="overline">Find your people</p><h2>Discover<br><em>swipe to choose.</em></h2><p style="color:#6E6E73;font-size:13px;line-height:1.5;margin:8px 0 0">Right = interested \u00b7 Left = pass \u00b7 Upcoming events only</p></div><div id="swipe-deck" class="swipe-deck-wrap"></div><div id="swipe-actions-row" class="swipe-actions"></div><div id="swipe-progress-row" class="swipe-progress"></div>`;
  loadSwipeDeck();
  applyAdminContent();applyAdminStyles();
}
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
  let data=[];
  if(supabase){
    const {data:d,error}=await supabase.rpc('get_upcoming_for_discover',{p_limit:20});
    if(!error && d) data=d;
  }
  if(!data.length){
    const now=Date.now();
    data=posts.filter(p=>p.starts_at && new Date(p.starts_at).getTime() > now).slice(0,10);
  }
  swipeStack=data;
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
    } else {
      try{ await supabase.from('plan_swipes').upsert({user_id: currentUser?.id, plan_id: p.id, interested: false, updated_at: new Date().toISOString()}); }catch{}
    }
  }
  showToast(interested?'Interested \u2713 \u2014 saved':'Passed');
  await new Promise(r=>setTimeout(r,380));
  swipeIndex++;
  renderSwipeCard();
}
 async function renderNotifications(){if(!supabase||!currentUser){pageView.innerHTML=pageTemplates.notifications;applyAdminContent();applyAdminStyles();return}const {data}=await supabase.from('notifications').select('message,created_at').order('created_at',{ascending:false}).limit(20);pageView.innerHTML=`<div class="page-header"><p class="overline">Stay in the loop</p><h2>Notifications</h2></div><div class="activity-list">${data?.length?data.map(item=>`<div class="activity"><span class="notification-mark">✦</span><p>${item.message}<small>${new Date(item.created_at).toLocaleString()}</small></p></div>`).join(''):'<div class="empty-message">No notifications yet.<br><span>Join a plan or follow a topic to get updates.</span></div>'}</div>`;applyAdminContent();applyAdminStyles()}
function setPage(page){const from=!pageView.hidden?(document.querySelector('[data-page].active')?.dataset.page||'home'):null;if(from&&from!==page)pushNav(from);homeElements.forEach(element=>element.hidden=page!=='home');pageView.hidden=page==='home';document.querySelectorAll('[data-page]').forEach(link=>link.classList.toggle('active',link.dataset.page===page));if(page==='home'){navHistory=[];loadAftermathFeed();}else{if(page==='profile')renderProfile();else if(page==='discover')renderDiscover();else if(page==='notifications')renderNotifications();else if(page==='groups')renderGroups();else if(page==='messages'){pageView.innerHTML=pageTemplates.messages;loadGroupMessagesPreview();}else pageView.innerHTML=pageTemplates[page]||pageTemplates.settings}window.scrollTo({top:0,behavior:'smooth'})}
  function renderProfileTab(tab){const content=document.querySelector('.profile-empty');if(!content)return;const key=tab.textContent.toLowerCase();
if(key.includes('lived')){ renderLivedOn(content); return; }
const items=key.includes('saved')?posts.filter(post=>savedEventIds.has(post.id||post.title)):posts.filter(post=>post.user_id===currentUser?.id);
if(!items.length){content.innerHTML=`<span>✦</span><h3>No ${key} events yet</h3><p>Your ${key} events will appear here.</p>${key==='your plans'?'<button class="publish-button" id="profile-post">Create plan <span>→</span></button>' :''}`;const create=document.querySelector('#profile-post');if(create)create.onclick=()=>modal.classList.add('open');return}
content.innerHTML=items.map(post=>{const owner=post.user_id===currentUser?.id;const attendedBadge=post.entryPass?.checked_in_at?' \u00b7 Attended \u2713':'';return`<button class="profile-event ${post.entryPass?.checked_in_at?'is-attended':''}" ${owner?`data-insights-id="${escapeHtml(post.id)}"`:''}><span>\u2726</span><div><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.location)} \u00b7 ${post.joinedCount||0}${post.capacity?`/${post.capacity}`:''} joined${attendedBadge}</small></div>${owner?'<b>Insights \u2197</b>':''}</button>`}).join('');
const create=document.querySelector('#profile-post');if(create)create.onclick=()=>modal.classList.add('open');
}
document.querySelectorAll('[data-page]').forEach(link=>link.onclick=e=>{e.preventDefault();setPage(link.dataset.page)});
if(supabase){supabase.auth.getSession().then(({data})=>{currentUser=data.session?.user||null;updateAccountUI();loadPlans();loadAftermathFeed();});supabase.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;updateAccountUI();if(session?.user&&pageView&&!pageView.hidden)renderProfile();loadAftermathFeed();})}else{updateAccountUI();loadPlans();loadAftermathFeed();}
const modal=document.querySelector('#modal');document.querySelector('#open-modal').onclick=()=>modal.classList.add('open');document.querySelector('#close-modal').onclick=()=>modal.classList.remove('open');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('open')};
const loginModal=document.querySelector('#login-modal');const openLogin=()=>loginModal.classList.add('open');document.querySelector('#open-login').onclick=openLogin;document.querySelector('#open-login-mobile').onclick=openLogin;document.querySelector('#close-login').onclick=()=>loginModal.classList.remove('open');loginModal.onclick=e=>{if(e.target===loginModal)loginModal.classList.remove('open')};document.querySelector('#login-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {data:result,error}=await supabase.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});if(error){showToast(error.message);return}currentUser=result.user;updateAccountUI();loginModal.classList.remove('open');showToast('Welcome back to upneXt ✦')};document.querySelector('#signup-link').onclick=e=>{e.preventDefault();loginModal.classList.remove('open');signupModal.classList.add('open')};
const signupModal=document.querySelector('#signup-modal');document.querySelector('#close-signup').onclick=()=>signupModal.classList.remove('open');signupModal.onclick=e=>{if(e.target===signupModal)signupModal.classList.remove('open')};document.querySelector('#signup-link').onclick=e=>{e.preventDefault();loginModal.classList.remove('open');signupModal.classList.add('open')};document.querySelector('#back-to-login').onclick=e=>{e.preventDefault();signupModal.classList.remove('open');loginModal.classList.add('open')};document.querySelector('#signup-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {data:result,error}=await supabase.auth.signUp({email:data.get('email'),password:data.get('password'),options:{emailRedirectTo:window.location.href,data:{username:data.get('username'),full_name:data.get('full_name'),neighborhood:data.get('neighborhood'),interest:data.get('interest')}}});if(error){showToast(error.message);return}currentUser=result.session?result.user:null;updateAccountUI();signupModal.classList.remove('open');showToast(result.session?'Profile created and you are signed in ✦':'Check your email to verify your profile, then log in ✦');setPage('profile')};
document.querySelector('#post-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase||!currentUser){showToast('Log in before posting a plan');loginModal.classList.add('open');return}const capacityValue=String(data.get('capacity')||'').trim();const capacity=capacityValue?Number(capacityValue):null;if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1)){showToast('Attendance limit must be a whole number greater than zero');return}const startsValue=String(data.get('when')||'').trim();const startsAt=startsValue?new Date(startsValue).toISOString():null;const {data:profile}=await supabase.from('profiles').select('neighborhood,latitude,longitude').eq('id',currentUser.id).maybeSingle();const {data:plan,error}=await supabase.from('plans').insert({user_id:currentUser.id,title:data.get('title'),location:data.get('where'),starts_at:startsAt,caption:data.get('caption'),category:data.get('category'),capacity,neighborhood:profile?.neighborhood||null}).select('id').single();if(error){showToast(error.message);return}if(profile?.latitude!==null&&profile?.latitude!==undefined&&profile?.longitude!==null&&profile?.longitude!==undefined){const {error:locationError}=await supabase.from('plan_locations').upsert({plan_id:plan.id,latitude:profile.latitude,longitude:profile.longitude,updated_at:new Date().toISOString()});if(locationError)showToast('Plan created, but event distance matching is unavailable')}const passMemo=String(data.get('pass_memo')||'').trim();if(passMemo){const {error:passError}=await supabase.from('plan_passes').upsert({plan_id:plan.id,memo:passMemo,updated_at:new Date().toISOString()});if(passError){showToast('Plan created, but the confirmation memo could not be saved');return}}modal.classList.remove('open');e.target.reset();await loadPlans();showToast('Your plan is live on upneXt ✦')};
function showToast(message){const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2400)}
document.querySelectorAll('.story').forEach(story=>story.onclick=()=>{ if(story.classList.contains('add-story')){ modal.classList.add('open'); } else { showToast('Stories are coming next \u2726'); } });
document.querySelector('.feed-filter').onclick=()=>{const filter=document.querySelector('.feed-filter');filter.dataset.mode=filter.dataset.mode==='following'?'for-you':'following';filter.innerHTML=filter.dataset.mode==='following'?'Following <span>⌄</span>':'For you <span>⌄</span>';showToast(filter.dataset.mode==='following'?'Showing plans from people you follow':'Showing plans picked for you')};
document.querySelectorAll('.suggestion button').forEach(button=>button.onclick=()=>{button.textContent=button.textContent==='Follow'?'Following':'Follow';showToast(button.textContent==='Following'?'You are now following this profile ✦':'Profile unfollowed')});
document.querySelectorAll('.rail-heading a').forEach(link=>link.onclick=e=>{e.preventDefault();setPage('discover')});
document.querySelectorAll('.trend').forEach(trend=>trend.onclick=()=>showToast('Opening this trending plan ✦'));
document.querySelector('#mobile-menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('mobile-open');
document.querySelector('#forgot-password').onclick=async e=>{e.preventDefault();const email=document.querySelector('#login-form input[name=email]').value;if(!email){showToast('Enter your email address first');return}if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});showToast(error?error.message:'Password reset email sent ✦')};
document.addEventListener('click',e=>{const settings=e.target.closest('.settings-list button');if(settings){const label=settings.textContent.replace('→','').trim().toLowerCase(); if(label.includes('account')){ document.querySelector('#edit-profile')?.click(); showToast('Opening account details'); } else if(label.includes('notification')){ showToast('Notifications: all enabled'); } else if(label.includes('privacy')){ showToast('Privacy: location private until shared'); } else if(label.includes('help')){ showToast('Help: support@evenit.app'); } else { showToast(`${settings.textContent.replace('→','').trim()} selected`); } }});

document.addEventListener('click',e=>{const tab=e.target.closest('.profile-tabs button');if(tab)renderProfileTab(tab)});
const editModal=document.querySelector('#edit-modal');const editForm=document.querySelector('#edit-form');document.addEventListener('click',e=>{const identity=e.target.closest('.post-head img,.post-head strong,.suggestion img,.suggestion strong');if(identity){e.preventDefault();setPage('profile')}if(e.target.closest('#edit-profile')){const meta=currentUser?.user_metadata||{};editForm.full_name.value=meta.full_name||'';editForm.username.value=meta.username||'';editForm.email.value=currentUser?.email||'';editModal.classList.add('open')}});document.querySelector('#close-edit').onclick=()=>editModal.classList.remove('open');editModal.onclick=e=>{if(e.target===editModal)editModal.classList.remove('open')};editForm.onsubmit=async e=>{e.preventDefault();if(!supabase||!currentUser){showToast('Log in to edit your profile');return}const data=new FormData(editForm);const metadata={...currentUser.user_metadata,full_name:data.get('full_name'),username:data.get('username')};const {data:result,error:authError}=await supabase.auth.updateUser({data:metadata});if(authError){showToast(authError.message);return}const {error}=await supabase.from('profiles').update({full_name:data.get('full_name'),username:data.get('username'),college:data.get('college')||null,enrollment_id:data.get('enrollment_id')||null,education_public:data.get('college_visibility')==='public'}).eq('id',currentUser.id);if(error){showToast(error.message);return}currentUser=result.user;updateAccountUI();editModal.classList.remove('open');renderProfile();showToast('Profile updated ✦')};
async function uploadProfileMedia(file,type){if(!file)return null;const extension=file.name.split('.').pop().toLowerCase();const path=`${currentUser.id}/${type}-${Date.now()}.${extension}`;const {error}=await supabase.storage.from('profile-media').upload(path,file,{upsert:true,contentType:file.type});if(error)throw error;return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl}
editForm.onsubmit=async e=>{e.preventDefault();if(!supabase||!currentUser){showToast('Log in to edit your profile');return}const data=new FormData(editForm);try{const avatarUrl=await uploadProfileMedia(data.get('avatar'),'avatar');const bannerUrl=await uploadProfileMedia(data.get('banner'),'banner');const metadata={...currentUser.user_metadata,full_name:data.get('full_name'),username:data.get('username'),...(avatarUrl?{avatar_url:avatarUrl}:{}),...(bannerUrl?{banner_url:bannerUrl}:{})};const {data:result,error:authError}=await supabase.auth.updateUser({data:metadata});if(authError)throw authError;const {error}=await supabase.from('profiles').update({full_name:data.get('full_name'),username:data.get('username'),college:data.get('college')||null,enrollment_id:data.get('enrollment_id')||null,education_public:data.get('college_visibility')==='public',...(avatarUrl?{avatar_url:avatarUrl}:{}),...(bannerUrl?{banner_url:bannerUrl}:{})}).eq('id',currentUser.id);if(error)throw error;currentUser=result.user;updateAccountUI();editModal.classList.remove('open');renderProfile();showToast('Profile and media updated ✦')}catch(error){showToast(error.message||'Could not update profile media')}};
editForm.addEventListener('submit',async()=>{if(!supabase||!currentUser)return;const neighborhood=new FormData(editForm).get('neighborhood');const {error}=await supabase.from('profiles').update({neighborhood:neighborhood||null}).eq('id',currentUser.id);if(error)showToast(error.message)});
document.addEventListener('click',e=>{if(e.target.closest('.edit-profile')){const meta=currentUser?.user_metadata||{};editForm.full_name.value=meta.full_name||'';editForm.username.value=meta.username||'';editForm.email.value=currentUser?.email||'';editModal.classList.add('open')}});
async function loadProfileDetails(){if(!supabase||!currentUser)return;const {data}=await supabase.from('profiles').select('college,enrollment_id,education_public,banner_url,avatar_url').eq('id',currentUser.id).maybeSingle();if(!data)return;if(data.banner_url){const cover=document.querySelector('.profile-cover');if(cover)cover.style.backgroundImage=`url("${data.banner_url}")`}if(data.avatar_url){const profileImage=document.querySelector('.profile-intro img');if(profileImage)profileImage.src=data.avatar_url;const navImage=document.querySelector('#nav-avatar img');if(navImage)navImage.src=data.avatar_url}if(editModal.classList.contains('open')){editForm.college.value=data.college||'';editForm.enrollment_id.value=data.enrollment_id||'';editForm.college_visibility.value=data.education_public?'public':'private'}}
document.addEventListener('click',e=>{if(e.target.closest('[data-page="profile"]')||e.target.closest('#edit-profile'))setTimeout(loadProfileDetails,100)});
document.querySelector('#use-location').onclick=()=>{const status=document.querySelector('#location-status');if(!navigator.geolocation){status.textContent='Location is not available in this browser.';return}status.textContent='Requesting your approximate location...';navigator.geolocation.getCurrentPosition(async position=>{currentLocation={latitude:position.coords.latitude,longitude:position.coords.longitude};const {error}=await supabase.from('profiles').update(currentLocation).eq('id',currentUser.id);status.textContent=error?'Could not save location.': 'Approximate location saved for nearby event distance.';if(error)showToast(error.message)},()=>{status.textContent='Location permission was not granted.'},{enableHighAccuracy:false,maximumAge:300000,timeout:10000})};
const photoViewer=document.querySelector('#photo-viewer');document.addEventListener('click',e=>{const photo=e.target.closest('.profile-intro img');if(!photo)return;document.querySelector('#expanded-photo').src=photo.src;photoViewer.classList.add('open')});document.querySelector('#close-photo').onclick=()=>photoViewer.classList.remove('open');photoViewer.onclick=e=>{if(e.target===photoViewer)photoViewer.classList.remove('open')};
document.title='Evenit | Make plans happen';
 async function loadSiteSettings(){if(!supabase)return;const {data}=await supabase.from('site_settings').select('*').single();if(!data)return;document.title=`${data.site_name} | Make plans happen`;document.documentElement.style.setProperty('--violet',data.primary_color);document.documentElement.style.setProperty('--gold',data.accent_color);document.querySelectorAll('.logo').forEach(logo=>logo.textContent=data.site_name);document.querySelectorAll('.like').forEach(button=>button.textContent=data.reaction_icon);const notification=document.querySelector('[data-page="notifications"]');if(notification){const label=[...notification.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.nodeValue.includes('Notifications'));if(label)label.nodeValue=label.nodeValue.replace('Notifications',data.notification_label)}}
loadSiteSettings();
 async function applyAdminContent(){if(!supabase)return;const {data}=await supabase.from('site_settings').select('*').single();const content=data?.content||{};adminContent=content;const setText=(selector,value)=>{if(!value)return;document.querySelectorAll(selector).forEach(element=>{const text=[...element.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.nodeValue.trim());if(text)text.nodeValue=` ${value}`})};const setValue=(selector,value)=>{if(value)document.querySelectorAll(selector).forEach(element=>element.value=value)};setText('.post-button span',content.post_button);setText('.feed-top h1',content.home_title);setText('.feed-filter',content.home_filter);setText('[data-page="discover"]',content.discover_tab);setText('[data-page="notifications"]',content.notification_tab);setText('[data-page="messages"]',content.messages_tab);setText('[data-page="settings"]',content.settings_tab);setText('.stories .add-story small',content.home_story_label);setText('#login-form .publish-button',content.login_button);setText('#signup-form .publish-button',content.signup_button);setText('#edit-form .publish-button',content.save_button);document.querySelectorAll('.join-plan').forEach(button=>{const label=button.classList.contains('joined')?'Confirmed ✓':button.classList.contains('waitlisted')?'On waitlist':content.join_button||'Join in';button.childNodes[0].nodeValue=`${label} `});document.querySelectorAll('.like').forEach(button=>button.textContent=data.reaction_icon||content.reaction_icon||'👍🏻');setValue('.search-box input',content.discover_search);refreshPageCopy();document.title=`${data.site_name||'Evenit'} | Make plans happen`}
 applyAdminContent();
 async function applyAdminStyles(){if(!supabase)return;const {data}=await supabase.from('site_settings').select('ui_styles').single();const styles=data?.ui_styles||{};const set=(selector,key,property='color')=>{if(styles[key])document.querySelectorAll(selector).forEach(element=>element.style[property]=styles[key])};set('[data-page="home"]','nav_home');set('[data-page="discover"]','nav_discover');set('[data-page="notifications"]','nav_notifications');set('[data-page="messages"]','nav_messages');set('[data-page="profile"]','nav_profile');set('[data-page="settings"]','nav_settings');set('.post-button,.publish-button','post_button','backgroundColor');set('.join-plan','join_button','backgroundColor');set('.login-link,.profile-login-button','login_button');set('.feed-filter','feed_filter');set('.page-header h2,.feed-top h1,.profile-intro h2','page_heading');set('.post-body,.page-view,.sidebar-bottom p','body_text');set('.post,.profile-empty,.discover-result,.activity-list,.message-list,.settings-list','card_background','backgroundColor');set('.like,.notification-mark,.profile-event>span','reaction');}
 applyAdminStyles();
 function refreshPageCopy(){if(pageView.hidden)return;const page=document.querySelector('[data-page].active')?.dataset.page;const copy={discover:[adminContent.discover_eyebrow||'Find your people',adminContent.discover_title||'Discover plans worth joining.'],notifications:[adminContent.notification_eyebrow||'Stay in the loop',adminContent.notification_title||'Notifications'],messages:[adminContent.messages_eyebrow||'Keep the plan moving',adminContent.messages_title||'Messages'],settings:[adminContent.settings_eyebrow||'Make it yours',adminContent.settings_title||'Settings']};const values=copy[page];if(values){const heading=pageView.querySelector('.page-header h2');const eyebrow=pageView.querySelector('.page-header .overline');if(heading)heading.textContent=values[1];if(eyebrow)eyebrow.textContent=values[0]}if(page==='profile'){const eyebrow=pageView.querySelector('.profile-intro .overline');const emptyTitle=pageView.querySelector('.profile-empty h3');const emptyDescription=pageView.querySelector('.profile-empty>p');const create=pageView.querySelector('#profile-post');const edit=pageView.querySelector('.edit-profile');if(eyebrow&&adminContent.profile_eyebrow)eyebrow.textContent=adminContent.profile_eyebrow;if(emptyTitle&&adminContent.profile_empty_title)emptyTitle.textContent=adminContent.profile_empty_title;if(emptyDescription&&adminContent.profile_empty_description)emptyDescription.textContent=adminContent.profile_empty_description;if(create&&adminContent.create_event_button)create.firstChild.nodeValue=`${adminContent.create_event_button} `;if(edit&&adminContent.edit_profile_button)edit.textContent=adminContent.edit_profile_button}}
 function showInsightsShell(){pushNav('profile');homeElements.forEach(element=>element.hidden=true);pageView.hidden=false}
 async function renderInsights(planId){const post=posts.find(item=>item.id===planId);if(!supabase||!currentUser||!post||!post.isOwner){showToast('Only the person who created this event can view insights');return}activeInsightsPlanId=planId;showInsightsShell();pageView.innerHTML='<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back</button><p class="overline">Event insights</p><h2>Loading your numbers...</h2></div>';const {data,error}=await supabase.rpc('get_plan_insights',{p_plan_id:planId});if(error){pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back</button><p class="overline">Event insights</p><h2>Insights unavailable</h2><p class="insights-error">${escapeHtml(error.message)}</p></div>`;return}const info=typeof data==='string'?JSON.parse(data):data;const plan=info?.plan||post;const metrics=info?.metrics||{};const attendees=Array.isArray(info?.attendees)?info.attendees:[];const confirmed=attendees.filter(item=>item.status==='confirmed'&&!item.attended);const attended=attendees.filter(item=>item.attended);const waitlisted=attendees.filter(item=>item.status==='waitlisted');const attendeeCard=item=>{const distance=item.distance_miles!==null&&item.distance_miles!==undefined?`${item.distance_miles} mi away`:item.neighborhood?(item.nearby?'Nearby \u00b7 same neighborhood':`Based in ${escapeHtml(item.neighborhood)}`):'Distance not shared';const state=item.attended?'Attended \u2713':item.status==='confirmed'?'Confirmed':'Waitlist #'+(item.queue_position||'');const cardClass=item.attended?'is-attended':item.status==='waitlisted'?'is-waitlisted':'';return`<button class="attendee-card ${cardClass}" data-public-profile-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt="${escapeHtml(item.full_name||item.username)}"><span><strong>${escapeHtml(item.full_name||item.username||'Evenit member')}</strong><small>@${escapeHtml(item.username||'member')} \u00b7 ${distance}</small></span><b>${state}</b></button>`};const hostedCount=attended.length;const confirmedCount=confirmed.length+attended.length;pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back to your feed</button><div class="insights-header"><div><p class="overline">Event insights</p><h2>${escapeHtml(plan.title||post.title)}</h2><p class="insights-subtitle">${escapeHtml(plan.location||post.location)} \u00b7 ${formatDateTime(plan.starts_at||post.starts_at)}</p></div></div><div class="insights-metrics"><div class="insights-metric"><strong>${confirmedCount}</strong><span>Confirmed</span></div><div class="insights-metric"><strong>${hostedCount}</strong><span>Attended</span></div><div class="insights-metric"><strong>${waitlisted.length}</strong><span>Waitlisted</span></div><div class="insights-metric"><strong>${metrics.reach||0}</strong><span>Reach</span></div></div><div class="insights-actions"><button class="scan-button" id="open-scan">Scan entry pass <span>\u2197</span></button><span class="insights-help">Guest shows QR \u00b7 host scans once to mark Attended</span></div><div class="insights-section"><h3>Attended (${attended.length})</h3>${attended.length?attended.map(attendeeCard).join(''):'<div class="insights-empty">No one checked in yet. Scan a guest QR to mark them as attended.</div>'}</div><div class="insights-section"><h3>Confirmed (${confirmed.length})</h3>${confirmed.length?confirmed.map(attendeeCard).join(''):'<div class="insights-empty">No pending confirmed guests.</div>'}</div><div class="insights-section"><h3>Waitlisted (${waitlisted.length})</h3>${waitlisted.length?waitlisted.map(attendeeCard).join(''):'<div class="insights-empty">No one on waitlist.</div>'}</div></div>`;document.querySelector('#open-scan').onclick=()=>openScanModal(planId);document.querySelector('#back-from-insights').onclick=()=>goBack();}
async function renderPublicProfile(profileId){if(!supabase||!profileId)return;pushNav('profile');showInsightsShell();pageView.innerHTML='<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><p class="overline">Public profile</p><h2>Loading profile...</h2></div>';const {data,error}=await supabase.rpc('get_public_profile',{p_user_id:profileId});if(error||!data||!data.id){pageView.innerHTML=`<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><p class="overline">Public profile</p><h2>Profile unavailable</h2><p>${escapeHtml(error?.message||'This profile could not be loaded.')}</p></div>`;return}const profile=data;pageView.innerHTML=`<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><div class="public-profile-cover" style="${profile.banner_url?`background-image:url('${escapeHtml(profile.banner_url)}')`:''}"></div><div class="public-profile-intro"><img src="${escapeHtml(profile.avatar_url||'https://i.pravatar.cc/160?img=68')}" alt="${escapeHtml(profile.full_name||profile.username)}"><div><p class="overline">Public profile</p><h2>${escapeHtml(profile.full_name||profile.username||'Evenit member')}</h2><p>@${escapeHtml(profile.username||'member')}</p></div></div><div class="public-profile-meta"><span>${profile.plans_posted||0}<small>plans posted</small></span><span>${profile.joined_count||0}<small>events joined</small></span><span>${escapeHtml(profile.neighborhood||'Location private')}<small>neighborhood</small></span></div>${profile.college?`<p class="profile-detail"><strong>College</strong>${escapeHtml(profile.college)}</p>`:''}</div>`;document.querySelector('#back-from-profile').onclick=()=>goBack()}
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
      if(row.plan_id) await renderInsights(row.plan_id);
      else if(activeScanPlanId) await renderInsights(activeScanPlanId);
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
  function openScanModal(planId){
    activeScanPlanId=planId;
    scanInput.value='';
    setScanResult('', '');
    scanModal.classList.add('open');
    startScanner();
  }
  scanModal.querySelector('#close-scan').onclick=async()=>{ await stopScanner(); scanModal.classList.remove('open'); };
  scanModal.onclick=async event=>{ if(event.target===scanModal){ await stopScanner(); scanModal.classList.remove('open'); } };
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
    if(rail) rail.innerHTML='<div class="nearby-empty" style="padding:14px;text-align:center;color:#6E6E73;font-size:11px;border:1px dashed #E8E8ED;border-radius:14px;background:#fff">No groups yet.<br><small><a href="#groups" data-page="groups" style="color:#5E5CE6;font-weight:600;text-decoration:none">Create one</a></small></div>';
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
  if(!supabase) return;
  const {data:group}=await supabase.from('groups').select('id,name,description').eq('id',groupId).maybeSingle();
  const {data:messages}=await supabase.from('group_messages').select('id,body,created_at,user_id').eq('group_id',groupId).order('created_at',{ascending:true}).limit(50);
  const title=group?.name||'Group';
  const listId='group-messages-'+groupId;
  pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-group">← Back to groups</button><div class="insights-header"><div><p class="overline">Private group</p><h2>${escapeHtml(title)}</h2><p style="color:#6E6E73;font-size:12px">${escapeHtml(group?.description||'Only members see messages')}</p></div><span style="background:#F2F0FF;color:#5E5CE6;border-radius:999px;padding:8px 12px;font:700 11px -apple-system,sans-serif">Private</span></div><div id="${listId}" style="margin-top:18px;display:grid;gap:10px;min-height:200px">${!messages||!messages.length?'<div style="padding:24px;text-align:center;color:#6E6E73;border:1px dashed #E8E8ED;border-radius:16px;background:#fff">No messages yet. Say hi.</div>':messages.map(m=>`<div style="background:#fff;border:1px solid #E8E8ED;border-radius:16px;padding:12px 14px"><div style="font:600 12px -apple-system,sans-serif">${escapeHtml(m.user_id.slice(0,8))}</div><div style="font-size:14px;line-height:1.45;margin-top:2px">${escapeHtml(m.body)}</div><small style="color:#6E6E73;font-size:10px">${formatPostTime(m.created_at)}</small></div>`).join('')}</div><form id="group-message-form" style="display:flex;gap:10px;margin-top:16px;position:sticky;bottom:0;background:#F5F5F7;padding:12px 0"><input id="group-message-input" placeholder="Message to group..." maxlength="500" style="flex:1;border:1px solid #E8E8ED;border-radius:999px;padding:12px 16px;font:500 14px -apple-system,sans-serif"><button type="submit" class="publish-button" style="border-radius:999px;padding:12px 18px">Send</button></form></div>`;
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
  pageView.innerHTML=pageTemplates.groups;
  document.querySelector('#open-group-create')?.addEventListener('click', ()=>document.querySelector('#group-modal')?.classList.add('open'));
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
loadPlans = async()=>{ await _origLoadPlans2(); await loadNearbyPeople(); await loadGroups(); if(!pageView.hidden && document.querySelector('[data-page].active')?.dataset.page==='groups') renderGroups(); };

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
      for(const post of aft){
        const {data:media}=await supabase.from('plan_aftermath_media').select('file_url,file_type,file_name').eq('post_id', post.id);
        allPosts.push({...post, media: media||[], plan_title:row.title, plan_location:row.location});
      }
    }
  }
  allPosts.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(!allPosts.length){
    container.innerHTML=`<div class="lived-empty"><div class="lived-empty-icon">\u25CE</div><h3>No stories shared yet</h3><p>You have attended ${data.length} event${data.length===1?'':'s'}. Tap an event below to share your aftermath.</p><div class="lived-events-list">${data.map(row=>`<div class="lived-event-item" data-lived-add="${escapeHtml(row.plan_id)}"><span class="lived-event-dot">\u2713</span><div><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.location||'')} \u00b7 ${new Date(row.starts_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div><button class="lived-add-btn">+ Share</button></div>`).join('')}</div></div>`;
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
      <div class="aftermath-event-context">
        <div class="aftermath-event-badge lived">LIVED</div>
        <div class="aftermath-event-info">
          <span class="aftermath-event-title">${escapeHtml(post.plan_title||'')}</span>
          ${post.plan_location?`<span class="aftermath-event-loc">\uD83D\uDCCD ${escapeHtml(post.plan_location)}</span>`:''}
        </div>
      </div>
      <div class="aftermath-body">${escapeHtml(post.body)}</div>
      ${tags?`<div class="aftermath-tags">${tags}</div>`:''}
      ${mediaHtml?`<div class="aftermath-media ${gridClass}">${mediaHtml}</div>`:''}
      <div class="aftermath-stats"><span>${formatPostTime(post.created_at)}</span></div>
    </article>`;
  }).join('');
  const eventsWithData=data.filter(r=>r.aftermath_count>0);
  const eventsWithout=data.filter(r=>!r.aftermath_count||r.aftermath_count===0);
  let eventsHtml='';
  if(eventsWithout.length){
    eventsHtml=`<div class="lived-events-section"><div class="lived-events-label">Events waiting for your story</div>${eventsWithout.map(row=>`<div class="lived-event-item" data-lived-add="${escapeHtml(row.plan_id)}"><span class="lived-event-dot">\u2713</span><div><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.location||'')} \u00b7 ${new Date(row.starts_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div><button class="lived-add-btn">+ Share</button></div>`).join('')}</div>`;
  }
  container.innerHTML=`<div class="lived-header"><p class="lived-label">Your stories</p><p class="lived-sub">${allPosts.length} aftermath ${allPosts.length===1?'post':'posts'} from ${data.length} event${data.length===1?'':'s'}</p></div><div class="lived-feed">${livedPostsHtml}</div>${eventsHtml}`;
  container.querySelectorAll('[data-lived-add]').forEach(el=>{
    el.onclick=()=>openAftermathComposer(el.dataset.livedAdd);
  });
}
let activeAftermathPlanId=null;
function openAftermathComposer(planId){
  activeAftermathPlanId=planId;
  const m=document.querySelector('#aftermath-modal');
  if(m){ m.classList.add('open'); m.querySelector('#aftermath-status').textContent=''; m.querySelector('#aftermath-body').value=''; m.querySelector('#aftermath-tags').value=''; const list=m.querySelector('#aftermath-file-list'); if(list) list.innerHTML=''; const inp=m.querySelector('#aftermath-files'); if(inp) inp.value=''; }
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
  setTimeout(()=>{ document.querySelector('#aftermath-modal')?.classList.remove('open'); const tab=document.querySelector('.profile-tabs button:nth-child(3)'); if(tab) renderProfileTab(tab); }, 600);
}
document.querySelector('#close-aftermath-modal')?.addEventListener('click', ()=>document.querySelector('#aftermath-modal')?.classList.remove('open'));
document.querySelector('#aftermath-modal')?.addEventListener('click', e=>{ if(e.target.id==='aftermath-modal') e.currentTarget.classList.remove('open'); });
document.querySelector('#aftermath-form')?.addEventListener('submit', submitAftermath);
document.querySelector('#aftermath-files')?.addEventListener('change', e=>{
  const list=document.querySelector('#aftermath-file-list');
  if(!list) return;
  list.innerHTML=[...e.target.files].map(f=>`<span style="font:500 11px -apple-system,sans-serif;background:#F5F5F7;border:1px solid #E8E8ED;border-radius:999px;padding:6px 10px">${escapeHtml(f.name)} · ${(f.size/1024).toFixed(0)}KB</span>`).join('');
});


if(supabase)supabase.auth.getSession().then(({data})=>{if(data.session?.user)loadEntryPasses()});
 })();
