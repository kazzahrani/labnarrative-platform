;(async function(){
  const liveStyle=document.createElement('style');
  liveStyle.textContent='.source-link{display:inline-flex;align-items:center;text-decoration:none}.live-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}.live-source{font-size:9px;color:#8e9aa7}.live-status{display:flex;gap:8px;align-items:center}.live-status .dot{margin-top:0}.source-health{padding:8px 0;border-bottom:1px solid var(--line)}.source-health:last-child{border-bottom:0}.source-health b{font-size:11px}.source-health p{font-size:10px;color:var(--muted);margin:3px 0 0}.error-dot{background:#e4c26d}.stale-dot{background:#8e9aa7}';
  document.head.appendChild(liveStyle);

  function arr(value){return Array.isArray(value)?value:[]}
  function toDate(value){if(!value)return'';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):''}
  function priority(score,type){if(score>=94)return type==='Open vacancy'?'Apply first':'Strategic outreach';if(score>=90)return type==='Open vacancy'?'High':'Strategic outreach';if(score>=85)return'Review';return'Explore'}
  function mapOpportunity(o){
    const type=o.opportunity_type==='open_vacancy'?'Open vacancy':'Hidden opportunity';
    const c=o.fit_components||{};
    return{
      id:o.id,
      title:o.title,
      org:o.organization,
      city:o.city||'',
      country:o.country||'',
      type,
      track:o.track||'Translational R&D',
      fit:Number(o.fit_score||0),
      priority:priority(Number(o.fit_score||0),type),
      breakdown:{Domain:Number(c.domain||o.fit_score||0),Evidence:Number(c.evidence||o.fit_score||0),Seniority:Number(c.seniority||75),Location:Number(c.location||75)},
      reasons:arr(o.reasons),
      gaps:arr(o.gaps),
      strategy:o.strategy||'Review the official source and tailor only verified experience to the role.',
      sourceUrl:o.source_url||'',
      verificationState:o.verification_state||'',
      verifiedAt:o.source_checked_at||o.last_seen_at||'',
      datePosted:o.date_posted||'',
      description:o.description_excerpt||''
    }
  }

  function sourceMeta(job){
    const type=job.type==='Open vacancy'?'Verified vacancy':'Strategic target';
    const verified=job.verifiedAt?`Checked ${toDate(job.verifiedAt)}`:'Source recorded';
    return `<div class="live-meta"><span class="pill ${job.type==='Open vacancy'?'good':'blue'}">${type}</span><span class="pill">${verified}</span>${job.datePosted?`<span class="pill">Posted ${job.datePosted}</span>`:''}</div>`
  }

  function refreshDashboard(data){
    const threshold=82;
    const high=jobs.filter(j=>j.fit>=threshold).length;
    const highEl=document.getElementById('highCount');if(highEl)highEl.textContent=String(high);
    const metric=highEl&&highEl.parentElement?highEl.parentElement.querySelector('small'):null;if(metric)metric.textContent='Live verified + strategic opportunities';
    const activityCard=[...document.querySelectorAll('.card-head h3')].find(x=>x.textContent==='Agent activity')?.closest('.card');
    if(activityCard){
      const body=activityCard.querySelector('.card-body');
      const run=data.discovery;
      const sourceErrors=(data.sources||[]).filter(s=>s.last_error);
      body.innerHTML=`<div class="activity"><span class="dot"></span><div><b>Live opportunity store connected</b><p>${jobs.length} high-fit or strategic opportunities are currently surfaced.</p></div></div><div class="activity"><span class="dot ${run&&run.status==='failed'?'error-dot':''}"></span><div><b>Last discovery: ${run?run.status:'not run yet'}</b><p>${run&&run.finished_at?toDate(run.finished_at):'A scheduled source scan is ready.'}</p></div></div><div class="activity"><span class="dot ${sourceErrors.length?'error-dot':''}"></span><div><b>Source health</b><p>${sourceErrors.length?`${sourceErrors.length} source${sourceErrors.length===1?'':'s'} need retry; existing verified records remain clearly labeled.`:'All configured sources currently report no stored error.'}</p></div></div>`;
    }
  }

  function renderSourceHealth(data){
    const settings=document.querySelector('#settings .settings .card-body');
    if(!settings||document.getElementById('careerSourceHealth'))return;
    const wrap=document.createElement('div');wrap.className='setting';wrap.id='careerSourceHealth';
    const sources=data.sources||[];
    wrap.innerHTML=`<div><h4>Discovery sources</h4><p>Official job pages and strategic institutional targets.</p></div><div>${sources.map(s=>`<div class="source-health"><div class="live-status"><span class="dot ${s.last_error?'error-dot':''}"></span><b>${s.organization}</b></div><p>${s.source_type==='hidden_target'?'Strategic target':s.last_success_at?`Official source checked ${toDate(s.last_success_at)}`:s.last_checked_at?'Source checked; no successful parse stored yet':'Awaiting first live scan'}${s.last_error?` · retry pending`:''}</p></div>`).join('')}</div>`;
    settings.appendChild(wrap);
  }

  const originalReviewJob=reviewJob;
  reviewJob=function(id){
    originalReviewJob(id);
    const job=jobs.find(j=>j.id===id);if(!job)return;
    const org=document.getElementById('drawerOrg');if(org)org.insertAdjacentHTML('afterend',sourceMeta(job));
    const actions=document.querySelector('#drawerWrap .drawer-body > .actions');
    if(actions){
      const old=actions.querySelector('.source-link');if(old)old.remove();
      if(job.sourceUrl){const a=document.createElement('a');a.className='btn source-link';a.href=job.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent=job.type==='Open vacancy'?'Open source posting':'Open institution';actions.prepend(a)}
    }
  };

  async function loadLive(){
    const response=await fetch('/api/career/opportunities',{cache:'no-store'});
    if(!response.ok)throw new Error('Opportunity API returned '+response.status);
    const data=await response.json();
    if(!data.ok)throw new Error(data.error||'Opportunity API unavailable');
    const mapped=(data.opportunities||[]).map(mapOpportunity).filter(j=>j.type==='Hidden opportunity'||j.fit>=82);
    if(mapped.length){
      jobs.splice(0,jobs.length,...mapped);
      const firstOpen=jobs.find(j=>j.type==='Open vacancy')||jobs[0];
      selected=firstOpen;
      applications.splice(0,applications.length,firstOpen);
      activeApp=firstOpen;
      pipeline.splice(0,pipeline.length,...jobs.slice(0,Math.min(5,jobs.length)).map((j,index)=>({id:j.id,status:index===0?'Application Ready':'Qualified'})));
      activeDraft='cv';
      renderJobs();renderApps();renderPipeline();
      const ready=document.getElementById('readyCount');if(ready)ready.textContent='1';
    }else{
      jobs.splice(0,jobs.length);
      renderJobs();
    }
    refreshDashboard(data);renderSourceHealth(data);
    return data;
  }

  const scan=document.getElementById('scanBtn');
  if(scan)scan.onclick=async()=>{
    const old=scan.textContent;scan.disabled=true;scan.textContent='Scanning official sources…';
    try{
      const response=await fetch('/api/career/scan',{method:'POST',headers:{'Content-Type':'application/json'}});
      const result=await response.json();
      if(!response.ok||result.ok===false)throw new Error(result.error||'Scan failed');
      await loadLive();
      const note=result.skipped?'A recent scan already exists; the latest verified results are loaded.':`${result.opportunities_upserted||0} vacancy records refreshed across ${result.sources_scanned||0} sources.`;
      toast('Opportunity scan complete',note);
    }catch(error){toast('Scan needs attention',error instanceof Error?error.message:'The live scan could not complete.');}
    finally{scan.disabled=false;scan.textContent=old;}
  };

  try{await loadLive();}
  catch(error){console.error('Career live data load failed',error);toast('Using interface fallback','The live Career database could not be loaded. No opportunity is being presented as newly verified.');}
})();
