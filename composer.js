(function(){
  const form=document.querySelector('#post-form');
  if(!form)return;

  const preview={
    title:document.querySelector('#preview-title'), category:document.querySelector('#preview-category'),
    location:document.querySelector('#preview-location'), when:document.querySelector('#preview-when'),
    requests:document.querySelector('#preview-capacity'), caption:document.querySelector('#preview-caption')
  };
  const usePlanLocation=document.querySelector('#use-plan-location');
  const planLocationStatus=document.querySelector('#plan-location-status');

  function formatDate(value){
    if(!value)return'Choose a date';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return'Choose a date';
    return date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+' · '+date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  }
  function updatePreview(){
    if(preview.title)preview.title.textContent=form.title.value.trim()||'Your plan title';
    if(preview.category)preview.category.textContent=(form.category.value||'Social').toUpperCase();
    if(preview.location)preview.location.textContent=form.where.value.trim()||'Choose a meeting place';
    if(preview.when)preview.when.textContent=formatDate(form.when.value);
    if(preview.caption)preview.caption.textContent=form.caption.value.trim()||'Your reason to join will appear here.';
    const count=document.querySelectorAll('#plan-question-list .plan-question-row').length;
    if(preview.requests)preview.requests.textContent=count?`${count} ${count===1?'question':'questions'}`:'No questions';
  }
  function setComposerCopy(){
    document.querySelector('.composer-header .overline').textContent='Evenit plan studio';
    document.querySelector('.composer-intro').textContent='A calm place to set the scene, ask the right questions, and invite your people.';
    const stamp=document.querySelector('.composer-stamp');
    if(stamp)stamp.innerHTML='<span>EVENIT</span><strong>MAKE<br>IT HAPPEN</strong><small>Every good plan<br>starts here</small>';
    const steps=document.querySelector('.composer-steps');
    if(steps)steps.innerHTML='<span class="active"><b>01</b> Basics</span><span><b>02</b> Guest questions</span><span><b>03</b> Scene</span><span><b>04</b> Entry</span>';
    const requestPreview=preview.requests?.parentElement;
    if(requestPreview){requestPreview.querySelector('span').textContent='REQUESTS';preview.requests.id='preview-requests';}
  }
  function mountQuestionSection(){
    const sections=[...form.querySelectorAll(':scope > fieldset.composer-section')];
    const basics=sections[0];
    const scene=sections.find(section=>section.textContent.includes('Set the scene'));
    const entry=sections.find(section=>section.textContent.includes('Requests & entry'));
    if(!basics||!scene||!entry)return;
    form.elements.capacity?.closest('.composer-capacity,.capacity-panel')?.remove();
    scene.querySelector('legend').innerHTML='<b>03</b> Set the scene';
    entry.classList.add('composer-entry-section');
    entry.querySelector('legend').innerHTML='<b>04</b> Entry details';
    const existingQuestions=entry.querySelector('.plan-questions');
    const questionSection=document.createElement('fieldset');
    questionSection.className='composer-section composer-question-section';
    questionSection.innerHTML='<legend><b>02</b> Questions for guests</legend><p class="composer-section-copy">Optional. Build a short request form before guests show interest. Choose a response type for every question.</p>';
    existingQuestions?.remove();
    questionSection.append(existingQuestions||document.createElement('div'));
    const panel=questionSection.querySelector('.plan-questions');
    if(panel)panel.innerHTML='<div class="plan-questions-heading"><div><strong>Guest request form</strong><small>Add up to 10 thoughtful questions — like Google Forms, but made for your plan.</small></div><button id="add-plan-question" type="button">＋ Add question</button></div><div id="plan-question-list" aria-live="polite"></div><div class="plan-question-empty" id="plan-question-empty"><span>✦</span><p>No questions yet. Add one if you need a little more context before approving guests.</p></div>';
    const intro=document.createElement('p');
    intro.className='composer-section-copy';
    intro.textContent='People first send an interest request. You choose who receives a QR entry pass in Insights.';
    entry.insertBefore(intro,entry.querySelector('.verification-choice'));
    scene.before(questionSection);
  }

  setComposerCopy();mountQuestionSection();
  const questionList=document.querySelector('#plan-question-list');
  const questionEmpty=document.querySelector('#plan-question-empty');
  const addQuestion=document.querySelector('#add-plan-question');
  const questionTypes={short_text:'Short answer',long_text:'Long answer',multiple_choice:'Multiple choice',checkboxes:'Checkboxes'};
  const questionRows=()=>[...questionList?.querySelectorAll('.plan-question-row')||[]];
  function updateQuestionControls(){
    const rows=questionRows();
    if(addQuestion){addQuestion.disabled=rows.length>=10;addQuestion.textContent=rows.length>=10?'10 questions added':'＋ Add question';}
    if(questionEmpty)questionEmpty.hidden=rows.length>0;
    rows.forEach((row,index)=>row.querySelector('.question-number').textContent=String(index+1).padStart(2,'0'));
    updatePreview();
  }
  function addOption(row,value=''){
    const options=row.querySelector('[data-question-options]');
    if(!options||options.querySelectorAll('[data-question-option]').length>=10)return;
    const option=document.createElement('div');option.className='question-option-row';
    const input=document.createElement('input');input.type='text';input.maxLength=120;input.placeholder=`Option ${options.querySelectorAll('[data-question-option]').length+1}`;input.dataset.questionOption='';input.value=value;
    const remove=document.createElement('button');remove.type='button';remove.className='remove-question-option';remove.setAttribute('aria-label','Remove option');remove.textContent='×';
    option.append(input,remove);options.append(option);
  }
  function renderOptions(row,initialOptions=[]){
    const type=row.querySelector('[data-plan-question-type]').value;
    const holder=row.querySelector('.question-options-editor');holder.replaceChildren();
    if(!['multiple_choice','checkboxes'].includes(type)){holder.hidden=true;return;}
    holder.hidden=false;
    holder.innerHTML=`<p>${type==='multiple_choice'?'Guests choose one option.':'Guests can choose more than one option.'}</p><div data-question-options></div><button type="button" class="add-question-option">＋ Add option</button>`;
    (initialOptions.length?initialOptions:['Option 1','Option 2']).forEach(option=>addOption(row,option));
  }
  function addQuestionRow(question={}){
    if(!questionList||questionRows().length>=10)return;
    const row=document.createElement('article');row.className='plan-question-row';
    row.innerHTML='<div class="question-row-top"><span class="question-number">01</span><label class="question-prompt"><span class="sr-only">Question prompt</span><input data-plan-question type="text" maxlength="280" placeholder="Ask your guests a question"></label><label class="question-type"><span class="sr-only">Answer type</span><select data-plan-question-type><option value="short_text">Short answer</option><option value="long_text">Long answer</option><option value="multiple_choice">Multiple choice</option><option value="checkboxes">Checkboxes</option></select></label></div><div class="question-options-editor" hidden></div><div class="question-row-footer"><label class="question-required"><input data-plan-question-required type="checkbox" checked><span>Required</span></label><button type="button" class="remove-plan-question" aria-label="Remove question">Remove</button></div>';
    const prompt=row.querySelector('[data-plan-question]');const type=row.querySelector('[data-plan-question-type]');
    prompt.value=question.prompt||'';type.value=questionTypes[question.type]?question.type:'short_text';row.querySelector('[data-plan-question-required]').checked=question.required!==false;
    type.addEventListener('change',()=>{renderOptions(row);updateQuestionControls();});prompt.addEventListener('input',updatePreview);
    questionList.append(row);renderOptions(row,Array.isArray(question.options)?question.options:[]);updateQuestionControls();
  }
  addQuestion?.addEventListener('click',()=>addQuestionRow());
  questionList?.addEventListener('click',event=>{
    const row=event.target.closest('.plan-question-row');if(!row)return;
    if(event.target.closest('.remove-plan-question')){row.remove();updateQuestionControls();return;}
    if(event.target.closest('.add-question-option')){addOption(row);return;}
    if(event.target.closest('.remove-question-option'))event.target.closest('.question-option-row').remove();
  });
  window.getPlanFormQuestions=()=>questionRows().map(row=>{
    const type=row.querySelector('[data-plan-question-type]').value;
    return{prompt:row.querySelector('[data-plan-question]').value.trim(),type,required:row.querySelector('[data-plan-question-required]').checked,options:[...row.querySelectorAll('[data-question-option]')].map(option=>option.value.trim()).filter(Boolean)};
  }).filter(question=>question.prompt);

  usePlanLocation?.addEventListener('click',()=>{
    if(!navigator.geolocation){planLocationStatus.textContent='Current location is not available in this browser. Add the meeting place manually.';return;}
    usePlanLocation.disabled=true;usePlanLocation.textContent='Finding your location…';planLocationStatus.textContent='Waiting for your device location permission…';
    navigator.geolocation.getCurrentPosition(position=>{
      const {latitude,longitude}=position.coords;form.elements.plan_latitude.value=String(latitude);form.elements.plan_longitude.value=String(longitude);
      if(!form.elements.where.value.trim())form.elements.where.value=`Current location · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      planLocationStatus.textContent='Current location selected. You can still edit the meeting-place name above.';usePlanLocation.disabled=false;usePlanLocation.textContent='✓ Current location selected';updatePreview();
    },error=>{const message={1:'Location permission was not allowed.',2:'Your location is unavailable.',3:'Location lookup took too long.'}[error.code]||'Location lookup failed.';planLocationStatus.textContent=`${message} Add the meeting place manually instead.`;usePlanLocation.disabled=false;usePlanLocation.textContent='◎ Use my current location';},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  });
  document.addEventListener('click',event=>{if(event.target.closest('#open-modal,#profile-post'))document.querySelector('.sidebar')?.classList.remove('mobile-open');},true);
  form.addEventListener('input',updatePreview);form.addEventListener('change',updatePreview);
  form.addEventListener('reset',()=>requestAnimationFrame(()=>{questionList?.replaceChildren();form.elements.plan_latitude.value='';form.elements.plan_longitude.value='';if(planLocationStatus)planLocationStatus.textContent='Choose a place, or use your device location to make nearby suggestions more accurate.';if(usePlanLocation){usePlanLocation.disabled=false;usePlanLocation.textContent='◎ Use my current location';}updateQuestionControls();updatePreview();}));
  updateQuestionControls();updatePreview();
})();
