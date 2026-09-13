(function(){
  const form=document.querySelector('#post-form');
  if(!form)return;

  const title=document.querySelector('#preview-title');
  const category=document.querySelector('#preview-category');
  const location=document.querySelector('#preview-location');
  const when=document.querySelector('#preview-when');
  const capacity=document.querySelector('#preview-capacity');
  const caption=document.querySelector('#preview-caption');
  form.elements.pass_memo?.closest('label')?.remove();

  const questionList=document.querySelector('#plan-question-list');
  const addQuestion=document.querySelector('#add-plan-question');
  const usePlanLocation=document.querySelector('#use-plan-location');
  const planLocationStatus=document.querySelector('#plan-location-status');

  function updateQuestionControls(){
    const rows=[...questionList?.querySelectorAll('.plan-question-row')||[]];
    if(addQuestion){
      addQuestion.disabled=rows.length>=10;
      addQuestion.textContent=rows.length>=10?'10 questions added':'+ Add question';
    }
  }

  function addQuestionRow(value=''){
    if(!questionList||questionList.querySelectorAll('.plan-question-row').length>=10)return;
    const row=document.createElement('div');
    row.className='plan-question-row';
    row.innerHTML=`<label>Question ${questionList.querySelectorAll('.plan-question-row').length+1}<input data-plan-question type="text" maxlength="280" placeholder="e.g. What would you like to bring?" value="${String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></label><button type="button" class="remove-plan-question" aria-label="Remove question">×</button>`;
    questionList.append(row);
    row.querySelector('.remove-plan-question').addEventListener('click',()=>{row.remove();updateQuestionControls();});
    updateQuestionControls();
  }

  addQuestion?.addEventListener('click',()=>addQuestionRow());

  usePlanLocation?.addEventListener('click',()=>{
    if(!navigator.geolocation){
      planLocationStatus.textContent='Current location is not available in this browser. Add the meeting place manually.';
      return;
    }
    usePlanLocation.disabled=true;
    usePlanLocation.textContent='Finding your location…';
    planLocationStatus.textContent='Waiting for your device location permission…';
    navigator.geolocation.getCurrentPosition(position=>{
      const {latitude,longitude}=position.coords;
      form.elements.plan_latitude.value=String(latitude);
      form.elements.plan_longitude.value=String(longitude);
      const currentLabel=`Current location · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      if(!form.elements.where.value.trim())form.elements.where.value=currentLabel;
      planLocationStatus.textContent='Current location selected. You can still edit the meeting-place name above.';
      usePlanLocation.disabled=false;
      usePlanLocation.textContent='✓ Current location selected';
      updatePreview();
    },error=>{
      const message={1:'Location permission was not allowed.',2:'Your location is unavailable.',3:'Location lookup took too long.'}[error.code]||'Location lookup failed.';
      planLocationStatus.textContent=`${message} Add the meeting place manually instead.`;
      usePlanLocation.disabled=false;
      usePlanLocation.textContent='◎ Use my current location';
    },{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  });

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
  form.addEventListener('reset',()=>requestAnimationFrame(()=>{
    questionList?.replaceChildren();
    form.elements.plan_latitude.value='';
    form.elements.plan_longitude.value='';
    if(planLocationStatus)planLocationStatus.textContent='Choose a place, or use your device location to make nearby suggestions more accurate.';
    if(usePlanLocation){usePlanLocation.disabled=false;usePlanLocation.textContent='◎ Use my current location';}
    updateQuestionControls();
    updatePreview();
  }));
  updateQuestionControls();
  updatePreview();
})();
