(function(app){
  const form=document.querySelector('#post-form');
  if(!form)return;
  const originalSubmit=form.onsubmit;
  let editing=null,dirty=false,saving=false,opening=0,editorHistory=null,confirmingBack=false;
  const note=document.createElement('div');note.className='event-editor-note';note.hidden=true;
  const status=document.createElement('p');status.className='composer-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.tabIndex=-1;
  const capacityLabel=document.createElement('label');capacityLabel.className='edit-capacity';capacityLabel.hidden=true;
  capacityLabel.innerHTML='Guest limit <span class="optional">optional</span><input name="capacity" type="number" min="1" step="1" placeholder="No limit"><small id="edit-capacity-help">Leave empty for no limit.</small>';
  form.prepend(note,status);form.querySelector('.composer-entry-section').append(capacityLabel);
  const submitButton=()=>form.querySelector('[type="submit"]');
  const setStatus=(text,error=false)=>{status.textContent=text;status.classList.toggle('is-error',error);if(error)status.focus();};
  function clearEdit(){
    editing=null;dirty=false;delete form.dataset.editPlanId;note.hidden=true;capacityLabel.hidden=true;
    app.workspaceDefinitions.plan.surface.setAttribute('aria-label','Create a plan.');
    app.workspaceDefinitions.plan.label='Create plan';submitButton().innerHTML='Create plan <span>→</span>';setStatus('');
  }
  window.prepareEventCreate=()=>{opening++;if(editing){form.reset();clearEdit();}};
  window.openEventEditor=async function(planId){
    if(saving)return;
    if(!app.currentUser){app.openLogin();return;}
    const request=++opening,origin=window.location.href;
    setStatus('');app.showToast('Opening event editor…');
    try{
      const {data,error}=await app.withEvenitTimeout(app.supabase.rpc('get_plan_for_edit',{p_plan_id:planId}),12000,'The editor could not load. Try again.');
      if(request!==opening||origin!==window.location.href)return;
      if(error)throw error;
      const plan=typeof data==='string'?JSON.parse(data):data;
      if(!EvenitEventTools.canEdit(plan,app.currentUser.id))throw new Error('Editing closes when the event starts.');
      await window.evenitComposer.load(plan);
      if(request!==opening||origin!==window.location.href)return;
      editing=plan;dirty=false;form.dataset.editPlanId=plan.id;
      capacityLabel.hidden=false;form.elements.capacity.value=plan.capacity??'';
      document.querySelector('#edit-capacity-help').textContent=`${plan.confirmed_count||0} confirmed guests. Existing passes and answers are kept.`;
      note.hidden=false;note.innerHTML=`<strong>Edit your event</strong><span>Available until ${app.escapeHtml(app.formatDateTime(plan.starts_at))}. Changes apply when you save.</span><small>Changed questions apply to new requests. Previously submitted answers keep their original wording. Verification changes apply to new approvals.</small>`;
      app.workspaceDefinitions.plan.label='Edit event';
      app.openWorkspace('plan');
      editorHistory={state:window.history.state,url:window.location.href};
      app.workspaceDefinitions.plan.surface.setAttribute('aria-label','Edit event');
      const heading=app.pageView.querySelector('.workspace-bar strong');if(heading)heading.textContent='Edit event';
      submitButton().innerHTML='Save changes <span>✓</span>';
      form.elements.title.focus();
    }catch(error){app.showToast(error.message||'The event editor could not load.');}
  };
  form.addEventListener('input',()=>{if(editing)dirty=true;setStatus('');});
  form.addEventListener('change',()=>{if(editing)dirty=true;setStatus('');});
  form.addEventListener('click',event=>{if(editing&&event.target.closest('.remove-plan-question,#add-plan-question,.remove-question-option,.add-question-option'))dirty=true;});
  form.onsubmit=async event=>{
    if(!editing){await originalSubmit(event);return;}
    event.preventDefault();
    if(saving)return;
    let uploadedPath=null,committed=false;
    const plan=editing;
    try{
      if(!navigator.onLine)throw new Error('You are offline. Reconnect to save. Your changes are still here.');
      if(!EvenitEventTools.canEdit(plan,app.currentUser?.id))throw new Error('This event has started. Editing is now closed.');
      const values=Object.fromEntries(new FormData(form));
      let payload=EvenitEventTools.editPayload(plan,values,getPlanFormQuestions(),window.evenitComposer.currentCover());
      saving=true;submitButton().disabled=true;submitButton().textContent='Saving changes…';setStatus('Saving your event…');form.setAttribute('aria-busy','true');
      const user=await app.withEvenitTimeout(app.getFreshEvenitUser(),8000,'Please log in again before saving.');
      const file=values.cover_image;
      if(file?.size){const upload=await app.uploadPlanCoverImage(file,user.id);uploadedPath=upload.path;payload.p_image_url=upload.url;}
      // Keep the request alive until its outcome is known; a timeout must not delete
      // an image that a slow successful database transaction now references.
      const {data,error}=await app.supabase.rpc('update_plan_details',payload);
      if(error)throw error;
      committed=true;dirty=false;clearEdit();form.reset();
      await app.loadPlans();app.closeWorkspace({destination:'profile'});
      await app.renderInsights(plan.id,{restore:true});
      window.history.replaceState({...window.history.state,evenitAppView:{type:'insights',planId:plan.id}},'',app.insightsUrl(plan.id));
      app.showToast('Event updated. Existing passes are still valid.');
    }catch(error){
      // On an unknown network outcome keep uploaded assets; they may be in use.
      if(uploadedPath&&!committed&&error.code)await app.supabase.storage.from('plan-covers').remove([uploadedPath]);
      setStatus(committed?'Your event was saved. Reopen Insights to see the latest details.':error.message||'Could not save. Your changes are still here. Try again.',true);
    }finally{saving=false;form.removeAttribute('aria-busy');submitButton().disabled=false;submitButton().innerHTML=editing?'Save changes <span>✓</span>':'Create plan <span>→</span>';}
  };
  let replaying=false;
  window.addEventListener('click',async event=>{
    if(replaying||!editing||app.activeWorkspace!=='plan')return;
    const target=event.target.closest('[data-workspace-cancel],[data-page],[data-saved-open],[data-experience-page],[data-event-details],#open-modal,#open-modal-header,#open-modal-mobile,[data-dock-create],.add-story,#profile-post,.topbar-plus,.edit-profile,.logo');
    if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(saving){setStatus('Please wait while your changes are saved.');return;}
    if(dirty&&!await app.requestDestructiveConfirmation({eyebrow:'Unsaved event changes',title:'Discard your changes?',message:'The published event stays as it was. Your edits will be lost.',confirmLabel:'Discard changes'}))return;
    const cancel=target.matches('[data-workspace-cancel]');const id=editing.id;
    clearEdit();form.reset();
    if(cancel){app.closeWorkspace({destination:'profile'});await app.renderInsights(id,{restore:true});window.history.replaceState({...window.history.state,evenitAppView:{type:'insights',planId:id}},'',app.insightsUrl(id));return;}
    replaying=true;try{target.click();}finally{replaying=false;}
  },true);
  // popstate fires after the browser moves its history pointer. Restore the
  // editor entry while asking, then replay Back only after discard is accepted.
  window.evenitEditorBeforeBack=event=>{
    if(!editing||app.activeWorkspace!=='plan')return false;
    if(!dirty&&!saving){clearEdit();form.reset();return false;}
    event.stopImmediatePropagation();
    window.history.pushState(editorHistory.state,'',editorHistory.url);
    if(saving){setStatus('Please wait while your changes are saved.');return true;}
    if(!confirmingBack){
      confirmingBack=true;
      app.requestDestructiveConfirmation({eyebrow:'Unsaved event changes',title:'Discard your changes?',message:'The published event stays as it was. Your edits will be lost.',confirmLabel:'Discard changes'}).then(discard=>{
        if(discard){clearEdit();form.reset();window.history.back();}
      }).finally(()=>{confirmingBack=false;});
    }
    return true;
  };
  window.addEventListener('keydown',async event=>{
    if(event.key!=='Escape'||!editing||app.activeWorkspace!=='plan'||document.querySelector('#destructive-confirmation'))return;
    event.preventDefault();event.stopImmediatePropagation();app.pageView.querySelector('[data-workspace-cancel]')?.click();
  },true);
  window.addEventListener('beforeunload',event=>{if(editing&&(dirty||saving)){event.preventDefault();event.returnValue='';}});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-edit-event]');if(button)window.openEventEditor(button.dataset.editEvent);});
})(window.evenitApp);
