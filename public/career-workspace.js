;(function(){
  const WORKSPACE_URL='https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/career-workspace';
  const TOKEN_KEY='career_workspace_token';
  const stageLabels=['Qualified','Application Ready','Sent','Reply','Interview','Offer'];
  const statusToLabel={qualified:'Qualified',application_ready:'Application Ready',sent:'Sent',reply:'Reply',interview:'Interview',offer:'Offer'};
  const labelToStatus={'Qualified':'qualified','Application Ready':'application_ready','Sent':'sent','Reply':'reply','Interview':'interview','Offer':'offer'};
  const draftKeys={cv:'cv_strategy',cover:'cover_letter',email:'email',linkedin:'linkedin',interview:'interview_prep',whyme:'why_me'};
  let workspaceToken='';
  let workspaceData={applications:[],candidate:null,profile:null};

  const style=document.createElement('style');
  style.textContent='.workspace-state{font-size:9px;color:var(--muted);margin-top:2px}.workspace-state.on{color:#8cdfb5}.application-status{margin-top:5px}.pipeline{grid-template-columns:repeat(6,minmax(190px,1fr))}.locked-note{padding:12px;border:1px solid #443a28;background:#1d1911;border-radius:9px;color:#dbc47f;font-size:10px;margin-top:10px}';
  document.head.appendChild(style);

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function captureAccess(){
    const raw=location.hash.startsWith('#')?location.hash.slice(1):'';
    if(raw){
      const params=new URLSearchParams(raw);
      const incoming=params.get('access');
      if(incoming&&incoming.length>24){localStorage.setItem(TOKEN_KEY,incoming);}
      if(incoming)history.replaceState(null,'',location.pathname+location.search);
    }
    workspaceToken=localStorage.getItem(TOKEN_KEY)||'';
  }
  function accessState(){
    const small=document.querySelector('.user small');
    if(small){small.textContent=workspaceToken?'Private workspace · connected':'Read-only · private workspace locked';small.classList.toggle('workspace-state',true);small.classList.toggle('on',!!workspaceToken)}
  }
  function locked(){toast('Private workspace locked','Open your private Career Agent access link once in this browser to prepare, save, or move applications.');}
  async function workspaceRequest(body){
    if(!workspaceToken)throw new Error('WORKSPACE_LOCKED');
    const response=await fetch(WORKSPACE_URL,{method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${workspaceToken}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
    const result=await response.json().catch(()=>({ok:false,error:'Workspace returned an invalid response.'}));
    if(response.status===401){localStorage.removeItem(TOKEN_KEY);workspaceToken='';accessState();throw new Error('WORKSPACE_LOCKED')}
    if(!response.ok||result.ok===false)throw new Error(result.error||'Workspace action failed.');
    return result;
  }
  async function waitForLive(){
    for(let i=0;i<120;i++){if(document.getElementById('careerSourceHealth'))return;await sleep(100)}
  }
  function fallbackJob(opp){
    return {id:opp.id,title:opp.title,org:opp.organization,city:opp.city||'',country:opp.country||'',type:opp.opportunity_type==='open_vacancy'?'Open vacancy':'Hidden opportunity',track:opp.track||'Translational R&D',fit:Number(opp.fit_score||0),priority:'Review',breakdown:{Domain:Number(opp.fit_score||0),Evidence:Number(opp.fit_score||0),Seniority:75,Location:75},reasons:Array.isArray(opp.reasons)?opp.reasons:[],gaps:Array.isArray(opp.gaps)?opp.gaps:[],strategy:opp.strategy||'',sourceUrl:opp.source_url||'',verificationState:opp.verification_state||'',verifiedAt:'',datePosted:'',description:opp.description_excerpt||''};
  }
  function appJob(app){
    const base=jobs.find(j=>j.id===app.opportunity_id)||fallbackJob(app.opportunity);
    const draftMap={};(app.drafts||[]).forEach(d=>draftMap[d.draft_type]=d);
    return {...base,_applicationId:app.id,_status:app.status,_drafts:draftMap,_updatedAt:app.updated_at};
  }
  function preparedList(){return workspaceData.applications.filter(a=>a.status!=='qualified'&&a.status!=='withdrawn').map(appJob)}
  function syncPipeline(){
    const byOpportunity=new Map(workspaceData.applications.map(a=>[a.opportunity_id,a]));
    const rows=[];
    for(const j of jobs){
      const app=byOpportunity.get(j.id);
      if(app&&(app.status==='rejected'||app.status==='withdrawn'))continue;
      rows.push({id:j.id,status:app?(statusToLabel[app.status]||'Qualified'):'Qualified'});
    }
    for(const app of workspaceData.applications){
      if(jobs.some(j=>j.id===app.opportunity_id)||app.status==='rejected'||app.status==='withdrawn')continue;
      rows.push({id:app.opportunity_id,status:statusToLabel[app.status]||'Qualified'});
    }
    pipeline.splice(0,pipeline.length,...rows);
  }
  function updateMetrics(){
    const ready=document.getElementById('readyCount');if(ready)ready.textContent=String(workspaceData.applications.filter(a=>a.status==='application_ready').length);
    const metrics=[...document.querySelectorAll('.metric')];
    const interviewMetric=metrics.find(m=>m.querySelector('span')?.textContent==='Interviews');
    if(interviewMetric){const strong=interviewMetric.querySelector('strong');if(strong)strong.textContent=String(workspaceData.applications.filter(a=>a.status==='interview'||a.status==='offer').length);}
  }
  function installTabs(){
    const tabs=document.querySelector('#applications .tabs');if(!tabs)return;
    if(!tabs.querySelector('[data-draft="linkedin"]'))tabs.insertAdjacentHTML('beforeend','<button data-draft="linkedin">LinkedIn</button><button data-draft="whyme">Why Me</button>');
    tabs.querySelectorAll('button').forEach(b=>{b.onclick=()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeDraft=b.dataset.draft;loadDraft();}});
  }
  function emptyApplicationView(message){
    const list=document.getElementById('appList');if(list)list.innerHTML=`<div class="empty-application"><b>No application prepared yet.</b><br>${esc(message||'Review an opportunity and choose Prepare application when you want to work on it.')}</div>`;
    const draft=document.getElementById('draft');if(draft){draft.value='No application selected.\n\nApplications are created only after your explicit Prepare application action.';draft.disabled=true;}
    const save=document.getElementById('saveBtn');if(save)save.disabled=true;
    const send=document.getElementById('sendBtn');if(send)send.disabled=true;
  }

  renderApps=function(){
    const list=document.getElementById('appList');
    if(!applications.length){emptyApplicationView(workspaceToken?'Review an opportunity and choose Prepare application when you want to work on it.':'Opportunity discovery is available, but the private application workspace is locked in this browser.');return;}
    if(!activeApp||!applications.some(j=>j.id===activeApp.id))activeApp=applications[0];
    if(list)list.innerHTML=applications.map(j=>`<div class="appitem ${j.id===activeApp.id?'active':''}" onclick="selectApp('${j.id}')"><b>${esc(j.title)}</b><p>${esc(j.org)} · Fit ${j.fit}</p><div class="application-status"><span class="pill good">${esc(statusToLabel[j._status]||j._status)}</span></div></div>`).join('');
    const draft=document.getElementById('draft');if(draft)draft.disabled=false;
    const save=document.getElementById('saveBtn');if(save)save.disabled=false;
    const send=document.getElementById('sendBtn');if(send)send.disabled=false;
    loadDraft();
  };
  selectApp=function(id){activeApp=applications.find(j=>j.id===id)||applications[0]||null;renderApps();};
  loadDraft=function(){
    const field=document.getElementById('draft');if(!field)return;
    if(!activeApp){field.value='';field.disabled=true;return;}
    const type=draftKeys[activeDraft]||'cv_strategy';
    field.value=activeApp._drafts?.[type]?.content||'';
    field.disabled=false;
  };
  renderPipeline=function(){
    const board=document.getElementById('pipelineBoard');if(!board)return;
    board.innerHTML=stageLabels.map(stage=>`<div class="col"><h3>${stage}<span>${pipeline.filter(x=>x.status===stage).length}</span></h3>${pipeline.filter(x=>x.status===stage).map(x=>{const j=jobs.find(z=>z.id===x.id)||applications.find(z=>z.id===x.id);if(!j)return'';return `<div class="pcard"><b>${esc(j.title)}</b><p>${esc(j.org)}</p><span class="pill good">Fit ${j.fit}</span><div style="margin-top:8px"><select onchange="moveStage('${j.id}',this.value)">${stageLabels.map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></div></div>`}).join('')}</div>`).join('');
  };

  async function loadWorkspace(preferredOpportunityId){
    if(!workspaceToken){workspaceData={applications:[],candidate:null,profile:null};applications.splice(0,applications.length);activeApp=null;syncPipeline();renderApps();renderPipeline();updateMetrics();return workspaceData;}
    try{
      const data=await workspaceRequest({action:'workspace'});workspaceData=data;
      const appJobs=preparedList();applications.splice(0,applications.length,...appJobs);
      activeApp=appJobs.find(j=>j.id===preferredOpportunityId)||appJobs[0]||null;
      syncPipeline();renderApps();renderPipeline();updateMetrics();accessState();return data;
    }catch(error){
      if(error instanceof Error&&error.message==='WORKSPACE_LOCKED'){applications.splice(0,applications.length);activeApp=null;syncPipeline();renderApps();renderPipeline();updateMetrics();locked();return null;}
      console.error('Career workspace load failed',error);toast('Workspace needs attention',error instanceof Error?error.message:'Unable to load saved applications.');return null;
    }
  }

  async function prepareSelected(){
    if(!selected)return;if(!workspaceToken){locked();return;}
    const button=document.getElementById('prepareBtn');const old=button?.textContent;if(button){button.disabled=true;button.textContent='Preparing…'}
    try{
      await workspaceRequest({action:'prepare',opportunity_id:selected.id});
      await loadWorkspace(selected.id);
      document.getElementById('drawerWrap')?.classList.remove('open');showPage('applications');
      toast('Application prepared','Six grounded drafts were created and saved to your private workspace.');
    }catch(error){if(error instanceof Error&&error.message==='WORKSPACE_LOCKED')locked();else toast('Could not prepare application',error instanceof Error?error.message:'Workspace action failed.');}
    finally{if(button){button.disabled=false;button.textContent=old||'Prepare application'}}
  }

  moveStage=async function(opportunityId,label){
    if(!workspaceToken){locked();renderPipeline();return;}
    const target=labelToStatus[label];if(!target)return;
    try{
      let app=workspaceData.applications.find(a=>a.opportunity_id===opportunityId);
      if(!app&&target==='qualified')return;
      if(!app){const prepared=await workspaceRequest({action:'prepare',opportunity_id:opportunityId});app=prepared.application;}
      if(target!=='application_ready'||app.status!=='application_ready')await workspaceRequest({action:'status',application_id:app.id,status:target});
      await loadWorkspace(opportunityId);
      toast('Pipeline saved',`${(jobs.find(j=>j.id===opportunityId)||fallbackJob(app.opportunity)).org} moved to ${label}.`);
    }catch(error){if(error instanceof Error&&error.message==='WORKSPACE_LOCKED')locked();else toast('Pipeline update failed',error instanceof Error?error.message:'Unable to save the stage.');await loadWorkspace(opportunityId);}
  };

  async function saveCurrentDraft(){
    if(!workspaceToken){locked();return;}if(!activeApp)return;
    const type=draftKeys[activeDraft]||'cv_strategy';const content=document.getElementById('draft')?.value||'';
    const button=document.getElementById('saveBtn');const old=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…'}
    try{await workspaceRequest({action:'save_draft',application_id:activeApp._applicationId,draft_type:type,content});await loadWorkspace(activeApp.id);toast('Draft saved','Your edit is stored in the Career workspace.');}
    catch(error){if(error instanceof Error&&error.message==='WORKSPACE_LOCKED')locked();else toast('Save failed',error instanceof Error?error.message:'Unable to save the draft.');}
    finally{if(button){button.disabled=false;button.textContent=old||'Save draft'}}
  }

  async function boot(){
    captureAccess();accessState();await waitForLive();installTabs();
    const prepare=document.getElementById('prepareBtn');if(prepare)prepare.onclick=prepareSelected;
    const save=document.getElementById('saveBtn');if(save)save.onclick=saveCurrentDraft;
    const send=document.getElementById('sendBtn');if(send)send.onclick=()=>toast('Review gate is active','Gmail is not connected yet. Nothing will be sent automatically.');
    await loadWorkspace();
  }
  boot();
})();
