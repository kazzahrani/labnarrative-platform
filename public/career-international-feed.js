/* International opportunities from verified public vacancy records.
   The private App2 applications database is untouched. */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const countries = ['Ireland','United Kingdom','Germany','Austria','Switzerland','Netherlands','Finland','Canada','New Zealand','Australia','Norway'];
  let rows = [];
  let status = 'idle';
  function install() {
    const radar = document.querySelector('#radar');
    if (!radar || document.querySelector('#internationalRadar')) return;
    const style = document.createElement('style');
    style.textContent = '.intl-feed{margin:0 0 18px}.intl-feed-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;padding:15px}.intl-job{border:1px solid #2b3949;background:#0c151e;border-radius:11px;padding:14px;display:flex;flex-direction:column;gap:9px}.intl-job h4{font-size:15px;line-height:1.4;margin:0}.intl-job p{font-size:12px;color:#bdc9d4;margin:0;line-height:1.6}.intl-job .meta{font-size:11px;color:#93a4b5}.intl-job .strong{color:#91e6c5;font-weight:800}.intl-job .warn{color:#e3c179}.intl-job .job-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:auto}.intl-feed-msg{padding:22px;color:#aab8c8;font-size:12px}.intl-feed-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}.intl-feed .card-head{gap:12px}.intl-note{padding:0 16px 16px;color:#8e9cab;font-size:11px}.intl-filter{max-width:230px}';
    document.head.appendChild(style);
    const section = document.createElement('div');
    section.id = 'internationalRadar';
    section.className = 'card intl-feed';
    section.innerHTML = '<div class="card-head intl-feed-head"><div><h3>Verified International Opportunities</h3><span id="intlFeedCount">Loading verified international vacancies…</span></div><div class="actions"><select id="intlFeedCountry" class="select intl-filter"><option value="">All 11 countries</option>'+countries.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('')+'</select><button id="intlFeedRefresh" class="btn small" type="button">Refresh international jobs</button></div></div><div id="intlFeedList" class="intl-feed-msg">Checking international vacancies…</div><div class="intl-note">Verified public vacancy records, separate from your private App2 application pipeline. Fit scores were assigned when each vacancy was published and may precede your new industry-first search priorities. Visa sponsorship is unknown unless explicitly stated by the employer. Confirm availability and requirements before applying.</div>';
    // The verified vacancy feed is the primary Opportunity Radar view.
    // The existing private App2 table stays untouched, but appears second and is labeled.
    const oldFilters = radar.querySelector('.filters');
    if (oldFilters) radar.insertBefore(section, oldFilters);
    else radar.appendChild(section);
    const heading = radar.querySelector('.hero h1');
    const description = radar.querySelector('.hero p');
    if (heading) heading.textContent = 'International opportunities — industry first, academia also considered.';
    if (description) description.textContent = 'Current verified vacancies across your 11 target countries. This list is separate from your private application records, and the hourly search continues independently.';
    const privateCard = oldFilters?.nextElementSibling;
    const privateTitle = privateCard?.querySelector('.card-head h3');
    if (privateTitle) privateTitle.textContent = 'Private application pipeline (App2)';
    const privateRefresh = radar.querySelector('#refreshRadarBtn');
    if (privateRefresh) privateRefresh.textContent = 'Refresh private pipeline';
    document.getElementById('intlFeedCountry').addEventListener('change', render);
    document.getElementById('intlFeedRefresh').addEventListener('click', load);
    load();
  }
  async function load() {
    const list = document.getElementById('intlFeedList');
    const btn = document.getElementById('intlFeedRefresh');
    if (!list) return;
    if (btn) btn.disabled=true;
    status='loading'; list.className='intl-feed-msg'; list.textContent='Loading verified vacancies…';
    try {
      const response=await fetch('/api/career/international',{cache:'no-store',headers:{Accept:'application/json'}});
      const payload=await response.json();
      if (!response.ok || !payload.ok || !Array.isArray(payload.jobs)) throw new Error('Job feed unavailable');
      rows=payload.jobs;
      status='ready';
      render();
    } catch {
      status='error';
      list.className='intl-feed-msg';
      list.textContent='The international feed is unavailable. Try refreshing. Existing Career Agent applications are not affected.';
    } finally { if(btn)btn.disabled=false; }
  }
  function render() {
    const list=document.getElementById('intlFeedList');
    if(!list || status!=='ready')return;
    const country=document.getElementById('intlFeedCountry').value;
    const jobs=rows.filter(j=>!country || j.country===country);
    const count=document.getElementById('intlFeedCount');
    if(count) count.textContent=jobs.length+' verified vacancies'+(country?' in '+country:' across 11 eligible countries')+' · '+rows.length+' total in feed';
    if(!jobs.length){
      list.className='intl-feed-msg';
      list.textContent='No verified international vacancies recorded for this selection yet. The scheduled search continues independently.';
      return;
    }
    list.className='intl-feed-grid';
    list.innerHTML=jobs.map(j=>{
      const salary=j.salary?' · '+esc(j.salary):'';
      const deadline=j.deadline?'Deadline: '+esc(j.deadline):'Deadline not confirmed';
      const visa=j.visa_status==='confirmed_sponsorship'?'Sponsorship expressly stated':j.visa_status==='restricted'?'Work authorization restriction':'Visa sponsorship not stated';
      const href=String(j.source_url).startsWith('https://')?esc(j.source_url):'#';
      const gap=j.gaps?'<p><span class="warn">Check: </span>'+esc(j.gaps)+'</p>':'';
      return '<article class="intl-job"><div class="meta">'+esc(j.country)+(j.city?' · '+esc(j.city):'')+' · <span class="strong">'+esc(j.fit_score)+'/100 fit</span></div><h4>'+esc(j.title)+'</h4><p>'+esc(j.organization)+' · '+esc(j.track)+'</p><p>'+esc(j.fit_reason)+'</p>'+gap+'<div class="meta">'+deadline+salary+'</div><div class="meta">'+visa+' · Verified '+esc(j.verified_on)+'</div><div class="job-actions"><a class="btn primary small" href="'+href+'" target="_blank" rel="noopener noreferrer">Original vacancy</a></div></article>';
    }).join('');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
})();
