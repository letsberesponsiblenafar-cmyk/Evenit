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
async function toggleJoin(index){const post=posts[index];if(!supabase||!currentUser){showToast('Create a profile before joining this event');signupModal.classList.add('open');return}if(!post.id){post.joined=!post.joined;renderPosts();return}const result=post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'?await supabase.rpc('leave_plan',{p_plan_id:post.id}):await supabase.rpc('join_plan',{p_plan_id:post.id});if(result.error){showToast(result.error.message);return}const row=rpcRow(result.data);if(post.membershipStatus==='confirmed'||post.membershipStatus==='waitlisted'){showToast(row?.promoted_user_id?'You left the event. A person from the waitlist was promoted.':'You left this event');}else if(row?.status==='confirmed'){showToast(row.confirmation_memo?`You’re confirmed. ${row.confirmation_memo}`:'You’re confirmed for this event ✦')}else{showToast(`You’re on the waitlist${row?.queue_position?` at #${row.queue_position}`:''}. Confirmed guests receive the entry pass.`)}await loadPlans()}
async function addPlanComment(index){const post=posts[index];if(!supabase||!currentUser){showToast('Log in to leave a comment');loginModal.classList.add('open');return}const body=window.prompt('Write a comment');if(!body?.trim())return;const {error}=await supabase.rpc('add_plan_comment',{p_plan_id:post.id,p_body:body.trim()});if(error){showToast(error.message);return}showToast('Comment added ✦');await loadPlans()}
function renderPosts(){postsEl.innerHTML=posts.map((post,index)=>{const attendance=post.capacity?`${post.joinedCount||0} / ${post.capacity} confirmed`:`${post.joinedCount||0} joined`;const membership=post.entryPass?.checked_in_at?'Attended \u2713':post.membershipStatus==='confirmed'?'Confirmed \u2713':post.membershipStatus==='waitlisted'?'On waitlist':'Join in';const membershipClass=post.entryPass?.checked_in_at?' attended':post.membershipStatus==='confirmed'?' joined':post.membershipStatus==='waitlisted'?' waitlisted':'';return`<article class="post" data-plan-id="${escapeHtml(post.id||'')}"><header class="post-head"><img data-profile-id="${escapeHtml(post.user_id||'')}" src="${escapeHtml(post.avatar)}" alt="${escapeHtml(post.name)}"><div><strong data-profile-id="${escapeHtml(post.user_id||'')}">${escapeHtml(post.user)}</strong><small>${escapeHtml(post.time)} · <a class="place" href="${mapUrl(post.location)}" target="_blank" rel="noreferrer">${escapeHtml(post.location)} ↗</a></small></div><button class="more" data-index="${index}">•••</button></header><div class="post-visual ${escapeHtml(post.image)}" data-plan-id="${escapeHtml(post.id||'')}" ><div class="visual-label"><small class="visual-category">${escapeHtml(post.category||'COMMUNITY EVENT')}</small><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.location)}</p></div></div><div class="post-actions"><button class="action like ${post.liked?'liked':''}" data-index="${index}">${post.liked?'👍':'👍🏻'}</button><button class="action comment" data-index="${index}">◯</button><button class="action share" data-index="${index}">⌁</button><button class="action save ${post.saved?'saved':''}" data-index="${index}">${post.saved?'◆':'◇'}</button></div><div class="post-body"><p class="likes">${post.likes+(post.liked?1:0)} people are interested</p><p class="caption"><strong>${escapeHtml(post.user)}</strong> ${escapeHtml(post.caption)} <a href="#">#${escapeHtml(post.title.replaceAll(' ',''))}</a></p><p class="comments">View all ${post.comments||0} comments</p><p class="plan-attendance">${attendance}${post.capacity&&post.joinedCount>=post.capacity?' · Full':''}</p><button class="join-plan${membershipClass}" data-index="${index}">${membership} <span>→</span></button>${post.isOwner?`<button class="insights-button" data-insights-id="${escapeHtml(post.id)}">View insights <span>↗</span></button>`:''}</div></article>`}).join('');document.querySelectorAll('.like').forEach(btn=>btn.onclick=()=>{const p=posts[btn.dataset.index];p.liked=!p.liked;renderPosts()});document.querySelectorAll('.save').forEach(btn=>btn.onclick=()=>{const post=posts[btn.dataset.index];post.saved=!post.saved;post.saved?savedEventIds.add(post.id||post.title):savedEventIds.delete(post.id||post.title);localStorage.setItem('evenit-saved-events',JSON.stringify([...savedEventIds]));showToast(post.saved?'Saved to your events':'Removed from saved events');renderPosts()});document.querySelectorAll('.share').forEach(btn=>btn.onclick=async()=>{const post=posts[btn.dataset.index];if(post.id)recordPlanInteraction(post.id,'share');const url=`${window.location.origin}${window.location.pathname}#plan-${post.id||post.title}`;try{await navigator.clipboard?.writeText(url)}catch{}showToast('Event link copied to clipboard ✦')});document.querySelectorAll('.comment').forEach(btn=>btn.onclick=()=>addPlanComment(btn.dataset.index));document.querySelectorAll('.join-plan').forEach(btn=>btn.onclick=()=>toggleJoin(btn.dataset.index));document.querySelectorAll('.more').forEach(btn=>btn.onclick=()=>showToast('More event actions are coming next ✦'));document.querySelectorAll('.post-visual[data-plan-id]').forEach(visual=>visual.onclick=()=>recordPlanInteraction(visual.dataset.planId,'click'));trackPostImpressions()}
renderPosts();
const pageView=document.querySelector('#page-view');
const homeElements=[document.querySelector('.feed-top'),document.querySelector('.stories'),postsEl];
const pageTemplates={
  discover:`<div class="page-header"><p class="overline">Find your people</p><h2>Discover plans<br><em>worth joining.</em></h2><div class="search-box">⌕ <input placeholder="Search plans, places, or people..."></div></div><div class="discover-grid"><div class="discover-tile tile-violet"><small>OUTDOORS</small><strong>Golden hour<br>on the water</strong><span>16 people going →</span></div><div class="discover-tile tile-gold"><small>FOOD & DRINK</small><strong>Sunday supper<br>club</strong><span>12 people going →</span></div><div class="discover-tile tile-ink"><small>CREATIVE</small><strong>Make a tiny<br>zine together</strong><span>8 people going →</span></div></div>`,
  notifications:`<div class="page-header"><p class="overline">Stay in the loop</p><h2>Notifications</h2></div><div class="activity-list"><div class="activity"><img src="https://i.pravatar.cc/100?img=47"><p><strong>ari.makes</strong> joined your plan <b>Sunset picnic</b><small>12 minutes ago</small></p></div><div class="activity"><img src="https://i.pravatar.cc/100?img=25"><p><strong>maya.rose</strong> liked your plan <b>Saturday sketch walk</b><small>1 hour ago</small></p></div><div class="activity"><img src="https://i.pravatar.cc/100?img=44"><p><strong>theo.walks</strong> started following you<small>Yesterday</small></p></div></div>`,
  messages:`<div class="page-header"><p class="overline">Keep the plan moving</p><h2>Messages</h2></div><div class="message-list"><div class="message"><img src="https://i.pravatar.cc/100?img=25"><div><strong>maya.rose</strong><p>Should we bring extra blankets for the picnic?</p></div><small>2m</small></div><div class="message"><img src="https://i.pravatar.cc/100?img=47"><div><strong>ari.makes</strong><p>That coffee walk sounds perfect.</p></div><small>1h</small></div><div class="empty-message">Your conversations will live here.<br><span>Join a plan to meet someone new.</span></div></div>`,
  settings:`<div class="page-header"><p class="overline">Make it yours</p><h2>Settings</h2></div><div class="settings-list"><button>Account details <span>→</span></button><button>Notification preferences <span>→</span></button><button>Privacy and safety <span>→</span></button><button>Help center <span>→</span></button></div>`,
};
  function renderProfile(){const loggedIn=Boolean(currentUser);const name=currentUser?.user_metadata?.full_name||currentUser?.email?.split('@')[0]||'Your profile';const username=currentUser?.user_metadata?.username||'create your username';pageView.innerHTML=`<div class="profile-cover"></div><div class="profile-intro"><img src="${currentUser?.user_metadata?.avatar_url||'https://i.pravatar.cc/160?img=68'}"><div><p class="overline">Your profile</p><h2>${escapeHtml(name)}</h2><p class="profile-handle">${loggedIn?'@'+escapeHtml(username):'Start your upneXt story'}</p></div>${loggedIn?'<button class="edit-profile">Edit profile</button>':''}</div><div class="profile-stats"><span><strong>${posts.filter(post=>post.user_id===currentUser?.id).length}</strong> plans posted</span><span><strong>${posts.filter(post=>post.joined).length}</strong> joined</span><span><strong>0</strong> followers</span></div><div class="profile-tabs"><button class="active">Your plans</button><button>Joined</button><button>Saved</button></div><div class="profile-empty"><span>✦</span><h3>${loggedIn?'Your plans will appear here':'Join the community'}</h3><p>${loggedIn?'Share an idea and give people a reason to show up.':'Create your profile to post events and join other people’s plans.'}</p>${loggedIn?'<button class="publish-button" id="profile-post">Create plan <span>→</span></button>':'<div class="profile-actions"><button class="publish-button" id="profile-signup">Create a profile</button><button class="profile-login-button" id="profile-login">Log in</button></div>'}</div>`;if(loggedIn)document.querySelector('#profile-post').onclick=()=>modal.classList.add('open');else{document.querySelector('#profile-signup').onclick=()=>signupModal.classList.add('open');document.querySelector('#profile-login').onclick=()=>loginModal.classList.add('open')}renderProfileTab(document.querySelector('.profile-tabs button'));applyAdminContent();applyAdminStyles()}
  function renderDiscover(){pageView.innerHTML=pageTemplates.discover+`<div class="discover-results"><div class="section-label">Live plans from the community</div>${posts.map((post,index)=>`<article class="discover-result" data-plan-id="${escapeHtml(post.id||'')}"><div><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.location)} · ${post.joinedCount||0}${post.capacity?`/${post.capacity}`:''} joined</small><p>${escapeHtml(post.caption)}</p></div><div class="discover-actions"><button class="join-plan${post.membershipStatus==='confirmed'?' joined':post.membershipStatus==='waitlisted'?' waitlisted':''}" data-index="${index}">${post.membershipStatus==='confirmed'?'Confirmed ✓':post.membershipStatus==='waitlisted'?'On waitlist':'Join in'} <span>→</span></button>${post.isOwner?`<button class="insights-button" data-insights-id="${escapeHtml(post.id)}">Insights <span>↗</span></button>`:''}${post.entryPass?`<button type="button" class="entry-pass-button discover-pass-button" data-plan-id="${escapeHtml(post.id)}">View QR pass ↗</button>`:''}</div></article>`).join('')}</div>`;document.querySelectorAll('.join-plan').forEach(btn=>btn.onclick=()=>toggleJoin(btn.dataset.index));document.querySelectorAll('.discover-pass-button').forEach(button=>button.onclick=()=>{const post=posts.find(item=>item.id===button.dataset.planId);if(post)openEntryPass(post,post.entryPass)});applyAdminContent();applyAdminStyles()}
 async function renderNotifications(){if(!supabase||!currentUser){pageView.innerHTML=pageTemplates.notifications;applyAdminContent();applyAdminStyles();return}const {data}=await supabase.from('notifications').select('message,created_at').order('created_at',{ascending:false}).limit(20);pageView.innerHTML=`<div class="page-header"><p class="overline">Stay in the loop</p><h2>Notifications</h2></div><div class="activity-list">${data?.length?data.map(item=>`<div class="activity"><span class="notification-mark">✦</span><p>${item.message}<small>${new Date(item.created_at).toLocaleString()}</small></p></div>`).join(''):'<div class="empty-message">No notifications yet.<br><span>Join a plan or follow a topic to get updates.</span></div>'}</div>`;applyAdminContent();applyAdminStyles()}
function setPage(page){homeElements.forEach(element=>element.hidden=page!=='home');pageView.hidden=page==='home';document.querySelectorAll('[data-page]').forEach(link=>link.classList.toggle('active',link.dataset.page===page));if(page!=='home'){if(page==='profile')renderProfile();else if(page==='discover')renderDiscover();else if(page==='notifications')renderNotifications();else pageView.innerHTML=pageTemplates[page]||pageTemplates.settings}window.scrollTo({top:0,behavior:'smooth'})}
  function renderProfileTab(tab){const content=document.querySelector('.profile-empty');if(!content)return;const key=tab.textContent.toLowerCase();const items=key.includes('joined')?posts.filter(post=>post.joined):key.includes('saved')?posts.filter(post=>savedEventIds.has(post.id||post.title)):posts.filter(post=>post.user_id===currentUser?.id);content.innerHTML=items.length?items.map(post=>{const owner=post.user_id===currentUser?.id;const attendedBadge=post.entryPass?.checked_in_at?' · Attended ✓':'';return`<button class="profile-event ${post.entryPass?.checked_in_at?'is-attended':''}" ${owner?`data-insights-id="${escapeHtml(post.id)}"`:''}><span>✦</span><div><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.location)} · ${post.joinedCount||0}${post.capacity?`/${post.capacity}`:''} joined${post.entryPass?.checked_in_at?' · Attended ✓':''}</small></div>${owner?'<b>Insights ↗</b>':''}</button>`}).join(''):`<span>✦</span><h3>No ${key} events yet</h3><p>Your ${key} events will appear here.</p>${key==='your plans'?'<button class="publish-button" id="profile-post">Create plan <span>→</span></button>':''}`;const create=document.querySelector('#profile-post');if(create)create.onclick=()=>modal.classList.add('open')}
document.querySelectorAll('[data-page]').forEach(link=>link.onclick=e=>{e.preventDefault();setPage(link.dataset.page)});
if(supabase){supabase.auth.getSession().then(({data})=>{currentUser=data.session?.user||null;updateAccountUI();loadPlans()});supabase.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;updateAccountUI();if(session?.user&&pageView&&!pageView.hidden)renderProfile()})}else{updateAccountUI();loadPlans()}
const modal=document.querySelector('#modal');document.querySelector('#open-modal').onclick=()=>modal.classList.add('open');document.querySelector('#close-modal').onclick=()=>modal.classList.remove('open');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('open')};
const loginModal=document.querySelector('#login-modal');const openLogin=()=>loginModal.classList.add('open');document.querySelector('#open-login').onclick=openLogin;document.querySelector('#open-login-mobile').onclick=openLogin;document.querySelector('#close-login').onclick=()=>loginModal.classList.remove('open');loginModal.onclick=e=>{if(e.target===loginModal)loginModal.classList.remove('open')};document.querySelector('#login-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {data:result,error}=await supabase.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});if(error){showToast(error.message);return}currentUser=result.user;updateAccountUI();loginModal.classList.remove('open');showToast('Welcome back to upneXt ✦')};document.querySelector('#signup-link').onclick=e=>{e.preventDefault();loginModal.classList.remove('open');signupModal.classList.add('open')};
const signupModal=document.querySelector('#signup-modal');document.querySelector('#close-signup').onclick=()=>signupModal.classList.remove('open');signupModal.onclick=e=>{if(e.target===signupModal)signupModal.classList.remove('open')};document.querySelector('#signup-link').onclick=e=>{e.preventDefault();loginModal.classList.remove('open');signupModal.classList.add('open')};document.querySelector('#back-to-login').onclick=e=>{e.preventDefault();signupModal.classList.remove('open');loginModal.classList.add('open')};document.querySelector('#signup-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {data:result,error}=await supabase.auth.signUp({email:data.get('email'),password:data.get('password'),options:{emailRedirectTo:window.location.href,data:{username:data.get('username'),full_name:data.get('full_name'),neighborhood:data.get('neighborhood'),interest:data.get('interest')}}});if(error){showToast(error.message);return}currentUser=result.session?result.user:null;updateAccountUI();signupModal.classList.remove('open');showToast(result.session?'Profile created and you are signed in ✦':'Check your email to verify your profile, then log in ✦');setPage('profile')};
document.querySelector('#post-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);if(!supabase||!currentUser){showToast('Log in before posting a plan');loginModal.classList.add('open');return}const capacityValue=String(data.get('capacity')||'').trim();const capacity=capacityValue?Number(capacityValue):null;if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1)){showToast('Attendance limit must be a whole number greater than zero');return}const startsValue=String(data.get('when')||'').trim();const startsAt=startsValue?new Date(startsValue).toISOString():null;const {data:profile}=await supabase.from('profiles').select('neighborhood,latitude,longitude').eq('id',currentUser.id).maybeSingle();const {data:plan,error}=await supabase.from('plans').insert({user_id:currentUser.id,title:data.get('title'),location:data.get('where'),starts_at:startsAt,caption:data.get('caption'),category:data.get('category'),capacity,neighborhood:profile?.neighborhood||null}).select('id').single();if(error){showToast(error.message);return}if(profile?.latitude!==null&&profile?.latitude!==undefined&&profile?.longitude!==null&&profile?.longitude!==undefined){const {error:locationError}=await supabase.from('plan_locations').upsert({plan_id:plan.id,latitude:profile.latitude,longitude:profile.longitude,updated_at:new Date().toISOString()});if(locationError)showToast('Plan created, but event distance matching is unavailable')}const passMemo=String(data.get('pass_memo')||'').trim();if(passMemo){const {error:passError}=await supabase.from('plan_passes').upsert({plan_id:plan.id,memo:passMemo,updated_at:new Date().toISOString()});if(passError){showToast('Plan created, but the confirmation memo could not be saved');return}}modal.classList.remove('open');e.target.reset();await loadPlans();showToast('Your plan is live on upneXt ✦')};
function showToast(message){const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2400)}
document.querySelectorAll('.story').forEach(story=>story.onclick=()=>showToast(story.classList.contains('add-story')?'Story posting is coming next ✦':'Stories are coming next ✦'));
document.querySelector('.feed-filter').onclick=()=>{const filter=document.querySelector('.feed-filter');filter.dataset.mode=filter.dataset.mode==='following'?'for-you':'following';filter.innerHTML=filter.dataset.mode==='following'?'Following <span>⌄</span>':'For you <span>⌄</span>';showToast(filter.dataset.mode==='following'?'Showing plans from people you follow':'Showing plans picked for you')};
document.querySelectorAll('.suggestion button').forEach(button=>button.onclick=()=>{button.textContent=button.textContent==='Follow'?'Following':'Follow';showToast(button.textContent==='Following'?'You are now following this profile ✦':'Profile unfollowed')});
document.querySelectorAll('.rail-heading a').forEach(link=>link.onclick=e=>{e.preventDefault();setPage('discover')});
document.querySelectorAll('.trend').forEach(trend=>trend.onclick=()=>showToast('Opening this trending plan ✦'));
document.querySelector('#mobile-menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('mobile-open');
document.querySelector('#forgot-password').onclick=async e=>{e.preventDefault();const email=document.querySelector('#login-form input[name=email]').value;if(!email){showToast('Enter your email address first');return}if(!supabase){showToast('Supabase is not available. Check the connection settings.');return}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});showToast(error?error.message:'Password reset email sent ✦')};
document.addEventListener('click',e=>{const settings=e.target.closest('.settings-list button');if(settings)showToast(`${settings.textContent.replace('→','').trim()} selected`);if(e.target.closest('.edit-profile'))showToast('Profile editing is coming next ✦');const tab=e.target.closest('.profile-tabs button');if(tab){document.querySelectorAll('.profile-tabs button').forEach(item=>item.classList.remove('active'));tab.classList.add('active');const empty=document.querySelector('.profile-empty h3');if(empty)empty.textContent=`${tab.textContent} will appear here`}});
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
 function showInsightsShell(){homeElements.forEach(element=>element.hidden=true);pageView.hidden=false}
 async function renderInsights(planId){const post=posts.find(item=>item.id===planId);if(!supabase||!currentUser||!post||!post.isOwner){showToast('Only the person who created this event can view insights');return}activeInsightsPlanId=planId;showInsightsShell();pageView.innerHTML='<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back to your feed</button><p class="overline">Event insights</p><h2>Loading your numbers...</h2></div>';const {data,error}=await supabase.rpc('get_plan_insights',{p_plan_id:planId});if(error){pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back to your feed</button><p class="overline">Event insights</p><h2>Insights unavailable</h2><p class="insights-error">${escapeHtml(error.message)}</p></div>`;return}const info=typeof data==='string'?JSON.parse(data):data;const plan=info?.plan||post;const metrics=info?.metrics||{};const attendees=Array.isArray(info?.attendees)?info.attendees:[];const confirmed=attendees.filter(item=>item.status==='confirmed'&&!item.attended);const attended=attendees.filter(item=>item.attended);const waitlisted=attendees.filter(item=>item.status==='waitlisted');const attendeeCard=item=>{const distance=item.distance_miles!==null&&item.distance_miles!==undefined?`${item.distance_miles} mi away`:item.neighborhood?(item.nearby?'Nearby \u00b7 same neighborhood':`Based in ${escapeHtml(item.neighborhood)}`):'Distance not shared';const state=item.attended?'Attended \u2713':item.status==='confirmed'?'Confirmed':'Waitlist #'+(item.queue_position||'');const cardClass=item.attended?'is-attended':item.status==='waitlisted'?'is-waitlisted':'';return`<button class="attendee-card ${cardClass}" data-public-profile-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.avatar_url||'https://i.pravatar.cc/100?img=68')}" alt="${escapeHtml(item.full_name||item.username)}"><span><strong>${escapeHtml(item.full_name||item.username||'Evenit member')}</strong><small>@${escapeHtml(item.username||'member')} \u00b7 ${distance}</small></span><b>${state}</b></button>`};const hostedCount=attended.length;const confirmedCount=confirmed.length+attended.length;pageView.innerHTML=`<div class="insights-page"><button class="back-link" id="back-from-insights">\u2190 Back to your feed</button><div class="insights-header"><div><p class="overline">Event insights</p><h2>${escapeHtml(plan.title||post.title)}</h2><p class="insights-subtitle">${escapeHtml(plan.location||post.location)} \u00b7 ${formatDateTime(plan.starts_at||post.starts_at)}</p></div></div><div class="insights-metrics"><div class="insights-metric"><strong>${confirmedCount}</strong><span>Confirmed</span></div><div class="insights-metric"><strong>${hostedCount}</strong><span>Attended</span></div><div class="insights-metric"><strong>${waitlisted.length}</strong><span>Waitlisted</span></div><div class="insights-metric"><strong>${metrics.reach||0}</strong><span>Reach</span></div></div><div class="insights-actions"><button class="scan-button" id="open-scan">Scan entry pass <span>\u2197</span></button><span class="insights-help">Guest shows QR \u00b7 host scans once to mark Attended</span></div><div class="insights-section"><h3>Attended (${attended.length})</h3>${attended.length?attended.map(attendeeCard).join(''):'<div class="insights-empty">No one checked in yet. Scan a guest QR to mark them as attended.</div>'}</div><div class="insights-section"><h3>Confirmed (${confirmed.length})</h3>${confirmed.length?confirmed.map(attendeeCard).join(''):'<div class="insights-empty">No pending confirmed guests.</div>'}</div><div class="insights-section"><h3>Waitlisted (${waitlisted.length})</h3>${waitlisted.length?waitlisted.map(attendeeCard).join(''):'<div class="insights-empty">No one on waitlist.</div>'}</div></div>`;document.querySelector('#open-scan').onclick=()=>openScanModal(planId);}
async function renderPublicProfile(profileId){if(!supabase||!profileId)return;const returnTo=activeInsightsPlanId;showInsightsShell();pageView.innerHTML='<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><p class="overline">Public profile</p><h2>Loading profile...</h2></div>';const {data,error}=await supabase.rpc('get_public_profile',{p_user_id:profileId});if(error||!data||!data.id){pageView.innerHTML=`<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><p class="overline">Public profile</p><h2>Profile unavailable</h2><p>${escapeHtml(error?.message||'This profile could not be loaded.')}</p></div>`;return}const profile=data;pageView.innerHTML=`<div class="public-profile-page"><button class="back-link" id="back-from-profile">← Back</button><div class="public-profile-cover" style="${profile.banner_url?`background-image:url('${escapeHtml(profile.banner_url)}')`:''}"></div><div class="public-profile-intro"><img src="${escapeHtml(profile.avatar_url||'https://i.pravatar.cc/160?img=68')}" alt="${escapeHtml(profile.full_name||profile.username)}"><div><p class="overline">Public profile</p><h2>${escapeHtml(profile.full_name||profile.username||'Evenit member')}</h2><p>@${escapeHtml(profile.username||'member')}</p></div></div><div class="public-profile-meta"><span>${profile.plans_posted||0}<small>plans posted</small></span><span>${profile.joined_count||0}<small>events joined</small></span><span>${escapeHtml(profile.neighborhood||'Location private')}<small>neighborhood</small></span></div>${profile.college?`<p class="profile-detail"><strong>College</strong>${escapeHtml(profile.college)}</p>`:''}</div>`;document.querySelector('#back-from-profile').onclick=()=>returnTo?renderInsights(returnTo):setPage('home')}
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
 const originalToggleJoin=toggleJoin;
 toggleJoin=async index=>{
   const planId=posts[index]?.id;
   await originalToggleJoin(index);
   const post=posts.find(item=>item.id===planId);
   if(post?.membershipStatus==='confirmed'&&post.entryPass)openEntryPass(post,post.entryPass);
 };
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
 if(supabase)supabase.auth.getSession().then(({data})=>{if(data.session?.user)loadEntryPasses()});
 })();
