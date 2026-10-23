(function(root){
  const toLocalDateTime=value=>{
    const date=new Date(value);
    if(!value||Number.isNaN(date.getTime()))return '';
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  };
  function canEdit(plan,userId,now=Date.now()){
    return Boolean(userId&&plan?.user_id===userId&&Number.isFinite(Date.parse(plan.starts_at))&&Date.parse(plan.starts_at)>now);
  }
  function editPayload(plan,values,questions,imageUrl,now=Date.now()){
    const start=new Date(values.when);
    if(!Number.isFinite(start.getTime())||start.getTime()<=now)throw new Error('Choose a future event date and time.');
    const limits={title:160,where:300,tagline:120,caption:2000,category:60};
    for(const [field,max] of Object.entries(limits)){
      const value=String(values[field]||'').trim();
      if(!value||value.length>max)throw new Error(`Check ${field==='where'?'the meeting place':field}: use 1–${max} characters.`);
    }
    const capacity=String(values.capacity??'').trim()===''?null:Number(values.capacity);
    if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<Math.max(1,plan.confirmed_count||0)))throw new Error(`Guest limit must be at least ${Math.max(1,plan.confirmed_count||0)}.`);
    const latitude=String(values.plan_latitude??'').trim()===''?null:Number(values.plan_latitude);
    const longitude=String(values.plan_longitude??'').trim()===''?null:Number(values.plan_longitude);
    if((latitude===null)!==(longitude===null)||latitude!==null&&(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180))throw new Error('Choose a valid location, or clear the device coordinates.');
    if(!Array.isArray(questions)||questions.length>10)throw new Error('Use up to 10 guest questions.');
    const ids=new Set();
    for(const q of questions){
      if(!q.prompt?.trim()||q.prompt.length>280||!['short_text','long_text','multiple_choice','checkboxes'].includes(q.type))throw new Error('Check the wording and type of each guest question.');
      if(q.id){if(ids.has(q.id))throw new Error('A guest question appears twice.');ids.add(q.id);}
      if(['multiple_choice','checkboxes'].includes(q.type)&&(!Array.isArray(q.options)||q.options.length<2||q.options.length>10||q.options.some(option=>typeof option!=='string'||!option.trim()||option.length>120)))throw new Error('Choice questions need 2–10 options, each up to 120 characters.');
    }
    return {p_plan_id:plan.id,p_title:values.title.trim(),p_location:values.where.trim(),p_starts_at:start.toISOString(),p_caption:values.caption.trim(),p_category:values.category,p_requires_college_verification:values.requires_college_verification==='on',p_questions:questions,p_latitude:latitude,p_longitude:longitude,p_tagline:values.tagline.trim(),p_image_url:imageUrl||null,p_cover_style:values.cover_style||'aurora',p_capacity:capacity};
  }
  const api={toLocalDateTime,canEdit,editPayload};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.EvenitEventTools=api;
})(typeof window!=='undefined'?window:globalThis);
