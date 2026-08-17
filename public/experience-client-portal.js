;(function(){
  let accountName='';
  let productName='';
  let queued=false;

  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value}

  function apply(){
    queued=false;
    if(document.title!=='LabNarrative — Client Workspace')document.title='LabNarrative — Client Workspace';

    const brandSubtitle=document.querySelector('.brand span');
    if(brandSubtitle)setText(brandSubtitle,'Client Portal');

    const crumb=document.getElementById('crumb');
    let section='';
    if(crumb){
      const raw=(crumb.textContent||'').trim();
      section=(raw.split('/').pop()||'').trim();
      const next=section?`LabNarrative / ${section}`:'LabNarrative';
      setText(crumb,next);
      const sectionKey=section.toLowerCase().replace(/\s+/g,'-');
      if(document.body.dataset.workspaceSection!==sectionKey)document.body.dataset.workspaceSection=sectionKey;
    }

    const hero=document.querySelector('.content > .hero');
    if(hero){
      const originalHeading=hero.querySelector('h1');
      const product=hero.querySelector('.hero-product strong');
      if(!accountName&&originalHeading){
        const raw=(originalHeading.textContent||'').trim();
        if(raw.includes(' — '))accountName=raw.split(' — ')[0].trim();
      }
      if(!productName&&product)productName=(product.textContent||'').trim();

      const eyebrow=hero.querySelector('.eyebrow');
      const description=hero.querySelector('p');
      setText(eyebrow,'CLIENT COMMAND CENTER');
      setText(originalHeading,'Overview');
      setText(description,'Your scientific revenue intelligence for this product in one place.');
    }

    const tag=document.querySelector('.experience-tag');
    if(tag&&accountName){
      const wanted=`<span class="portal-dot"></span><div class="portal-account-copy"><small>CLIENT ACCOUNT</small><strong></strong><span>Free Product Proof · 1 product active</span></div>`;
      if(tag.dataset.portalized!=='1'){
        tag.innerHTML=wanted;
        tag.dataset.portalized='1';
      }
      const strong=tag.querySelector('strong');
      setText(strong,accountName);
      if(tag.getAttribute('title')!==accountName)tag.setAttribute('title',accountName);
    }

    const coverage=document.querySelector('.coverage-mini small');
    if(coverage)setText(coverage,productName?'Complete workflow · single product':'Complete workflow · one product');
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(apply);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',function(e){
    if(e.target&&e.target.closest&&e.target.closest('[data-s],#refresh,#themeToggle'))setTimeout(schedule,80);
  },true);
})();
