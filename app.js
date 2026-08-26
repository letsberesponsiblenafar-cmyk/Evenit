const events = [
  {day:'31', month:'AUG', time:'5:00 PM', title:'Sunset picnic + sketch session', place:'Prospect Park', category:'Outdoors', description:'Bring a blanket, something to draw with, and your favorite snack. Beginners very welcome.', host:'Maya R.', initials:'MR', spots:'4 spots left', color:'#f5d47e', tags:['Today','Outdoors']},
  {day:'01', month:'SEP', time:'10:30 AM', title:'Coffee & a walk through Red Hook', place:'Red Hook Roasters', category:'Social', description:'A slow Sunday walk, good coffee, and a chance to meet some new neighborhood faces.', host:'Eli T.', initials:'ET', spots:'7 spots left', color:'#b4ced5', tags:['This week']},
  {day:'03', month:'SEP', time:'7:00 PM', title:'Make a tiny zine together', place:'Public Records', category:'Creative', description:'Collage, fold, repeat. All materials provided. Leave with a little book and hopefully a new friend.', host:'Noah K.', initials:'NK', spots:'2 spots left', color:'#d6b7c4', tags:['This week','Creative']}
];

const list = document.querySelector('#events-list');
const mapLink = place => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
function renderEvents(items = events) {
  list.innerHTML = items.length ? items.map(event => `<article class="event-card"><div class="date-block"><b>${event.day}</b><small>${event.month}</small></div><div><p class="event-meta">${event.time} · <a class="place-link" href="${mapLink(event.place)}" target="_blank" rel="noreferrer">${event.place} ↗</a></p><h3 class="event-title">${event.title}</h3><p class="event-description">${event.description}</p><div class="host-line"><span class="host-dot" style="background:${event.color}">${event.initials}</span> Hosted by ${event.host} · ${event.spots}</div></div><button class="join-button">Join plan</button></article>`).join('') : '<p class="event-description">No plans found here yet. Try another filter or be the first to post one.</p>';
  document.querySelectorAll('.join-button').forEach(button => button.addEventListener('click', () => { button.textContent = button.classList.toggle('joined') ? 'Joined ✓' : 'Join plan'; if (button.classList.contains('joined')) showToast('You’re on the list! ✦'); }));
}
renderEvents();

document.querySelectorAll('.filter').forEach(filter => filter.addEventListener('click', () => { document.querySelector('.filter.active').classList.remove('active'); filter.classList.add('active'); const value = filter.dataset.filter; renderEvents(value === 'all' ? events : events.filter(event => event.tags.includes(value))); }));
const modal = document.querySelector('#modal');
document.querySelectorAll('.create-event').forEach(button => button.addEventListener('click', () => modal.classList.add('open')));
document.querySelector('.close-modal').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });
document.querySelector('#event-form').addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.target); const newEvent = {day:'NEW',month:'PLAN',time:data.get('when'),title:data.get('title'),place:data.get('where'),category:data.get('category'),description:data.get('description') || 'A new plan is taking shape. Come as you are and make it yours.',host:'You',initials:'YO',spots:`${data.get('spots')} spots`,color:'#f0a08e',tags:['all',data.get('category')]}; events.unshift(newEvent); renderEvents(); document.querySelector('.filter.active').classList.remove('active'); document.querySelector('[data-filter="all"]').classList.add('active'); modal.classList.remove('open'); event.target.reset(); showToast('Your plan is live! ✦'); });
function showToast(message){const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2800)}
