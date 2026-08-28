(function(){
  const form=document.querySelector('#post-form');
  if(!form)return;

  const title=document.querySelector('#preview-title');
  const category=document.querySelector('#preview-category');
  const location=document.querySelector('#preview-location');
  const when=document.querySelector('#preview-when');
  const capacity=document.querySelector('#preview-capacity');
  const caption=document.querySelector('#preview-caption');

  function formatDate(value){
    if(!value)return'Choose a date';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return'Choose a date';
    return date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+' · '+date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  }

  function updatePreview(){
    title.textContent=form.title.value.trim()||'Your plan title';
    category.textContent=(form.category.value||'Social').toUpperCase();
    location.textContent=form.where.value.trim()||'Choose a meeting place';
    when.textContent=formatDate(form.when.value);
    capacity.textContent=form.capacity.value.trim()?`${form.capacity.value.trim()} spots`:'Open invite';
    caption.textContent=form.caption.value.trim()||'Your reason to join will appear here.';
  }

  document.addEventListener('click',event=>{
    if(event.target.closest('#open-modal,#profile-post'))document.querySelector('.sidebar')?.classList.remove('mobile-open');
  },true);

  form.addEventListener('input',updatePreview);
  form.addEventListener('change',updatePreview);
  form.addEventListener('reset',()=>requestAnimationFrame(updatePreview));
  updatePreview();
})();
