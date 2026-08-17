;(function(){
  let scheduled=false;

  function isOpportunities(){
    const crumb=String(document.getElementById('crumb')?.textContent||'');
    return /Opportunities/i.test(crumb);
  }

  function patch(){
    scheduled=false;
    if(!isOpportunities())return;

    const root=document.getElementById('content');
    if(!root)return;

    const h1=root.querySelector('.page-head h1');
    if(h1&&/Scientific buying opportunities/i.test(h1.textContent||'')){
      h1.textContent='Qualified product opportunities';
    }

    root.querySelectorAll('.opp-card').forEach(card=>{
      const meta=card.querySelector('.opp-meta');
      if(!meta)return;

      meta.querySelectorAll('.badge').forEach(badge=>{
        if(/Contacts pending/i.test(badge.textContent||'')){
          badge.textContent='Contacts verifying';
          badge.classList.remove('warn');
          badge.classList.add('contacts-verifying');
        }
      });

      if(!meta.querySelector('.opp-view')){
        const view=document.createElement('span');
        view.className='opp-view';
        view.textContent='View opportunity →';
        view.setAttribute('aria-hidden','true');
        meta.appendChild(view);
      }

      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      const pi=String(card.querySelector('h3')?.textContent||'opportunity').trim();
      card.setAttribute('aria-label',`View opportunity for ${pi}`);
    });
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(patch);
  }

  const root=document.getElementById('content');
  if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});

  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-s]'))setTimeout(schedule,0);
  });
  document.addEventListener('input',event=>{
    if(event.target?.id==='q')setTimeout(schedule,0);
  });
  document.addEventListener('keydown',event=>{
    const card=event.target.closest?.('.opp-card');
    if(!card||!isOpportunities())return;
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      card.click();
    }
  });

  window.addEventListener('load',schedule,{once:true});
  setTimeout(schedule,250);
})();
