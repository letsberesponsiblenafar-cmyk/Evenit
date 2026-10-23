// Loaded only by preview-fixture.mjs in place of supabase-config.js.
(function(){
  const owner='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
  const user={id:owner,email:'host@example.invalid',user_metadata:{username:'maya',full_name:'Maya Shah'}};
  const profiles=[{id:owner,username:'maya',full_name:'Maya Shah',about:'Good company, good plans.',college:'Test College',enrollment_id:'TEST-ONLY'},{id:other,username:'ravi',full_name:'Ravi Kumar'}];
  const day=86400000;
  const plans=[
    {id:'20000000-0000-0000-0000-000000000001',user_id:owner,title:'Golden hour picnic',tagline:'Good food, new friends, and a little fresh air.',location:'Riverside Park',starts_at:new Date(Date.now()+2*day).toISOString(),caption:'Bring a blanket and something to share. We will meet at the park entrance before walking down to the river.',category:'Social',cover_style:'aurora',image_url:null,capacity:12,created_at:new Date().toISOString(),requires_college_verification:false,latitude:34,longitude:74},
    {id:'20000000-0000-0000-0000-000000000002',user_id:other,title:'Sunday sketch walk',tagline:'See your neighborhood through a different lens.',location:'Old Town',starts_at:new Date(Date.now()+3*day).toISOString(),caption:'All skill levels welcome. Bring a sketchbook and meet us by the clock tower.',category:'Creative',cover_style:'sunset',image_url:null,capacity:null,created_at:new Date().toISOString(),requires_college_verification:false}
  ];
  const moments=[{id:'40000000-0000-0000-0000-000000000001',author_id:other,username:'ravi',full_name:'Ravi Kumar',plan_id:plans[1].id,plan_title:'Sunday sketch walk',plan_location:'Old Town',body:'A lovely afternoon sketching with new friends. Already looking forward to the next walk.',hashtags:['creative'],like_count:3,comment_count:0,created_at:new Date().toISOString()}];
  const messages=[{sender_id:other,body:'Looking forward to the picnic!',created_at:new Date().toISOString()}];
  const questions=[{id:'30000000-0000-0000-0000-000000000001',prompt:'Any dietary preferences?',type:'short_text',required:false,options:[]}];
  const swipes=[];
  const response=data=>({data,error:null});
  function query(table){
    const filters=[];let single=false,operation='select',payload;
    const chain={select(){return chain;},eq(key,value){filters.push(row=>row[key]===value);return chain;},in(key,values){filters.push(row=>values.includes(row[key]));return chain;},order(){return chain;},limit(){return chain;},maybeSingle(){single=true;return chain;},single(){single=true;return chain;},insert(value){operation='insert';payload=value;return chain;},upsert(value){operation='insert';payload=value;return chain;},update(){return chain;},delete(){operation='delete';return chain;},then(resolve,reject){
      let rows=table==='plans'?plans:table==='profiles'?profiles:table==='plan_swipes'?swipes:[];
      if(operation==='insert'&&table==='plan_swipes'){const index=swipes.findIndex(x=>x.plan_id===payload.plan_id);if(index>=0)swipes.splice(index,1);swipes.push(payload);}
      if(operation==='delete'&&table==='plan_swipes')for(let i=swipes.length-1;i>=0;i--)if(filters.every(filter=>filter(swipes[i])))swipes.splice(i,1);
      rows=rows.filter(row=>filters.every(filter=>filter(row)));
      return Promise.resolve(response(single?rows[0]||null:rows)).then(resolve,reject);
    }};return chain;
  }
  const client={from:query,auth:{getSession:async()=>({data:{session:{user}},error:null}),getUser:async()=>({data:{user},error:null}),refreshSession:async()=>({data:{user,session:{user}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel(){return{on(){return this;},subscribe(){return this;}};},removeChannel(){},storage:{from(){return{upload:async()=>response({}),remove:async()=>response({}),getPublicUrl:()=>({data:{publicUrl:'https://example.invalid/test-cover.jpg'}})};}},async rpc(name,args={}){
    const plan=plans.find(p=>p.id===args.p_plan_id);
    if(name==='get_plan_summaries')return response(plans.map(p=>({plan_id:p.id,confirmed_count:0,comment_count:0})));
    if(name==='get_public_profiles')return response(profiles);
    if(name==='get_public_profile')return response(profiles.find(p=>p.id===args.p_user_id));
    if(name==='get_plan_for_edit')return response({...plan,questions:JSON.parse(JSON.stringify(questions)),confirmed_count:0});
    if(name==='get_plan_insights')return response({plan,metrics:{reach:24,interested:0},attendees:[]});
    if(name==='get_plan_join_questions')return response(questions.map(q=>({...q,question_type:q.type})));
    if(name==='update_plan_details'){
      for(const key of ['title','location','starts_at','caption','category','requires_college_verification','latitude','longitude','tagline','image_url','cover_style','capacity'])plan[key]=args['p_'+key];
      questions.splice(0,questions.length,...args.p_questions);
      return response({...plan,questions,confirmed_count:0});
    }
    if(name==='get_aftermath_feed')return response(moments);
    if(name==='get_direct_message_inbox')return response([{other_id:other,username:'ravi',full_name:'Ravi Kumar',last_body:messages.at(-1).body,last_sender_id:messages.at(-1).sender_id,last_at:new Date().toISOString(),unread_count:1}]);
    if(name==='get_direct_messages')return response(messages);
    if(name==='send_direct_message'){messages.push({sender_id:owner,body:args.p_body,created_at:new Date().toISOString()});return response({});}
    if(name==='search_discover'){const query=args.p_query.toLowerCase();return response({events:plans.filter(p=>(p.title+' '+p.location+' '+p.category).toLowerCase().includes(query)),profiles:profiles.filter(p=>(p.full_name+' '+p.username).toLowerCase().includes(query)),aftermath:moments.filter(p=>(p.body+' '+p.plan_title).toLowerCase().includes(query))});}
    return response([]);
  }};
  window.SUPABASE_URL='https://fixture.invalid';window.SUPABASE_ANON_KEY='fixture-only';
  window.supabase={createClient:()=>client};
})();
