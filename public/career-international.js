/* International search setup for the existing private Career Agent App2.
   No credentials, applicant documents or private profile data are embedded here. */
(function () {
  'use strict';
  const countries = ['Ireland', 'United Kingdom', 'Germany', 'Austria', 'Switzerland', 'Netherlands', 'Finland', 'Canada', 'New Zealand', 'Australia', 'Norway'];
  const tracks = [
    {name:'Cancer Biology & Molecular Oncology', keywords:['cancer biology','molecular oncology','cell cycle','transcriptional regulation','postdoctoral researcher','research scientist'], rationale:'p53–RB/E2F, NRF1, cell-cycle regulation and experimentally grounded cancer research.'},
    {name:'Translational Pharmacology & Drug Discovery', keywords:['translational pharmacology','preclinical scientist','drug discovery','drug response','target validation'], rationale:'Pharmacology research with hands-on experimental disease models.'},
    {name:'Functional Genomics & Precision Oncology', keywords:['functional genomics','precision oncology','gene regulation','CRISPR','cancer genomics'], rationale:'Functional studies bridging mechanistic molecular biology and genomic evidence.'},
    {name:'Bioinformatics & Hybrid Multi-Omics', keywords:['bioinformatics','transcriptomics','ChIP-seq','RNA-seq','genomics analyst','computational oncology'], rationale:'Prioritize positions combining biological interpretation and data, rather than pure software engineering.'},
    {name:'Biotech R&D & Assay Development', keywords:['biotech scientist','assay development','cell-based assays','biomarker research','molecular pharmacology'], rationale:'Applied life-science research, assay optimization and translational R&D.'},
    {name:'Core Facility & Laboratory Leadership', keywords:['core facility scientist','laboratory manager','research facility','technical specialist','platform scientist'], rationale:'Laboratory workflow establishment, research mentoring, equipment and assay support.'},
    {name:'Academic Pharmacology & Biomedical Teaching', keywords:['lecturer pharmacology','assistant professor pharmacology','biomedical sciences lecturer','teaching researcher'], rationale:'Academic biomedical teaching and research roles with verified eligibility.'},
    {name:'Medical & Scientific Affairs', keywords:['medical affairs scientist','medical science liaison','scientific communications','medical writer','pharmacovigilance scientist'], rationale:'Transferable scientific communication and pharmacology; exclude posts requiring unsupported clinical or industry tenure.'},
    {name:'Scientific Product & Life Sciences AI', keywords:['scientific product specialist','field application scientist','life science AI','scientific solutions','bioinformatics application scientist'], rationale:'Domain-expert scientific software and technical product roles, not senior ML engineering.'}
  ];
  function htmlEscape(v) {
    return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function note(where, message) { const el=document.getElementById(where); if(el) el.textContent=message; }
  function style() {
    const s=document.createElement('style');
    s.textContent='.intl-panel{margin:0 0 18px}.intl-panel .card-body{padding:19px}.intl-countries{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px;margin:16px 0}.intl-country{display:flex;align-items:center;gap:9px;border:1px solid #314052;border-radius:10px;padding:10px 12px;color:#dce8ee;background:#0c151f;font-size:12px}.intl-country input{accent-color:#61d5b2}.intl-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.intl-help{color:#8e9aa7;font-size:12px;line-height:1.6}.intl-status{font-size:12px;color:#b9c9d7;margin-top:12px}.intl-links{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0}.intl-links a{color:#add6fb;text-decoration:none;border:1px solid #314052;border-radius:8px;padding:7px 9px;font-size:11px}.intl-links a:hover{border-color:#61d5b2}.intl-panel h3{margin:0 0 5px;font-size:16px}.intl-panel h4{font-size:12px;margin:18px 0 4px}.intl-strong{color:#b7e9d7}';
    document.head.appendChild(s);
  }
  function install() {
    if (!document.querySelector('#countriesInput') || document.querySelector('#internationalSetup')) return;
    style();
    const panel=document.createElement('div');
    panel.className='card intl-panel';
    panel.id='internationalSetup';
    panel.innerHTML='<div class="card-body"><div class="eyebrow">INTERNATIONAL RELOCATION · 2026</div><h3>Target 11 countries, not the Gulf</h3><p class="intl-help">Select the markets you want. Apply &amp; save changes the private App2 search settings only after your existing workspace authorization succeeds.</p><div class="intl-countries">'+countries.map((c,i)=>'<label class="intl-country"><input type="checkbox" data-intl-country="'+i+'" checked> '+htmlEscape(c)+'</label>').join('')+'</div><div class="intl-actions"><button type="button" class="btn primary" id="intlSaveCountries">Use these countries &amp; save</button><button type="button" class="btn" id="intlAll">Select all 11</button></div><div class="intl-status" id="intlCountryStatus">Country settings have not been changed yet.</div><h4>Where the scheduled international watch looks</h4><div class="intl-links"><a href="https://euraxess.ec.europa.eu/jobs/search" target="_blank" rel="noopener noreferrer">EURAXESS</a><a href="https://eures.europa.eu/" target="_blank" rel="noopener noreferrer">EURES</a><a href="https://www.jobs.ac.uk/" target="_blank" rel="noopener noreferrer">jobs.ac.uk</a><a href="https://academicpositions.com/" target="_blank" rel="noopener noreferrer">Academic Positions</a><a href="https://www.nature.com/naturecareers" target="_blank" rel="noopener noreferrer">Nature Careers</a></div><p class="intl-help">The ChatGPT international job watch is independent of the App2 database. Notifications are not automatically synced to Opportunity Radar unless the backend integration is connected.</p></div>';
    const settings=document.querySelector('#search-email .settings');
    if(settings) settings.parentNode.insertBefore(panel,settings);
    document.querySelector('#intlAll').addEventListener('click',()=>{
      panel.querySelectorAll('[data-intl-country]').forEach(x=>{x.checked=true});
    });
    document.querySelector('#intlSaveCountries').addEventListener('click',()=>{
      const chosen=[...panel.querySelectorAll('[data-intl-country]:checked')].map(x=>countries[Number(x.getAttribute('data-intl-country'))]);
      if(!chosen.length){note('intlCountryStatus','Select at least one country.');return}
      if(!localStorage.getItem('career_workspace_token')){note('intlCountryStatus','Open the private Career Agent access link before saving.');return}
      document.querySelector('#countriesInput').value=chosen.join(', ');
      const save=document.querySelector('#saveSearchBtn');
      if(save?.disabled){note('intlCountryStatus','Search settings are currently unavailable.');return}
      save?.click();
      note('intlCountryStatus','Save requested through App2. Confirm the success message shown by Career Agent before assuming it was saved.');
    });
    const tr=document.createElement('div');
    tr.className='card intl-panel';
    tr.id='intlTracks';
    tr.innerHTML='<div class="card-body"><div class="eyebrow">INTERNATIONAL CAREER TRACKS</div><h3>Expand beyond postdoc-only searches</h3><p class="intl-help">Installs nine complementary international tracks, retaining your existing tracks. The backend may reject duplicates; no applications are submitted.</p><div class="intl-actions"><button type="button" class="btn primary" id="intlInstallTracks">Add 9 international career tracks</button></div><div class="intl-status" id="intlTracksStatus">No tracks have been added by this panel.</div></div>';
    const trackGrid=document.querySelector('#trackGrid');
    if(trackGrid) trackGrid.parentNode.insertBefore(tr,trackGrid);
    document.querySelector('#intlInstallTracks').addEventListener('click',async()=>{
      const btn=document.querySelector('#intlInstallTracks');
      const token=localStorage.getItem('career_workspace_token');
      if(!token){note('intlTracksStatus','Open the private Career Agent access link before adding tracks.');return}
      const existing=new Set([...document.querySelectorAll('#trackGrid h3')].map(e=>e.textContent.toLowerCase()));
      btn.disabled=true;
      let added=0,failed=0,skipped=0;
      try{
        for(const t of tracks){
          if(existing.has(t.name.toLowerCase())){skipped++;continue}
          note('intlTracksStatus', 'Adding career tracks… '+(added+skipped+failed)+' / '+tracks.length);
          try{
            const res=await fetch('https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/career-app2',{
              method:'POST',cache:'no-store',
              headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+token},
              body:JSON.stringify({action:'add_track',name:t.name,search_keywords:t.keywords,rationale:t.rationale})
            });
            const body=await res.json().catch(()=>({}));
            if(!res.ok || body.ok===false) failed++; else added++;
          }catch { failed++ }
        }
        note('intlTracksStatus', 'Added '+added+'; already present '+skipped+'; unsuccessful '+failed+'. Reload to review the full list.');
      }finally{btn.disabled=false}
    });
    const radar=document.querySelector('#radar .hero p');
    if(radar) radar.textContent='Your private opportunity pipeline. International job alerts also arrive through ChatGPT; these are not automatically mirrored into this table until a verified integration is enabled.';
    const radarCard=document.querySelector('#radar .filters');
    if(radarCard){
      const msg=document.createElement('p');
      msg.className='intl-help';
      msg.textContent='Fit scores are not proof of visa eligibility, employer sponsorship or required language proficiency. Read the original vacancy before applying.';
      radarCard.parentNode.insertBefore(msg,radarCard);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();