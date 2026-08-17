import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://labintelligence-production-v2-lab-narrative.vercel.app/experience";

const FETCH_BRIDGE = `<script>(function(){
  const host='pryezqkkildppjxbdrsj.supabase.co';
  const allowed=new Set(['client-experience','client-experience-preview','client-conversion','client-monitoring','client-activity']);
  const original=window.fetch.bind(window);
  window.fetch=function(input,init){
    try{
      const raw=typeof input==='string'?input:(input&&input.url)||String(input);
      const u=new URL(raw,location.href);
      if(u.hostname===host&&u.pathname.startsWith('/functions/v1/')){
        const fn=u.pathname.split('/').filter(Boolean).pop()||'';
        if(allowed.has(fn)){
          const proxy=new URL('/api/workspace-proxy',location.origin);
          proxy.searchParams.set('fn',fn);
          u.searchParams.forEach((v,k)=>proxy.searchParams.append(k,v));
          if(typeof Request!=='undefined'&&input instanceof Request)input=new Request(proxy.toString(),input);
          else input=proxy.toString();
        }
      }
    }catch{}
    return original(input,init);
  };
})();</script><style>[data-x-convert-main]{display:none!important}</style>`;

// Keep the classic Client Portal proportions, with moderate sidebar compaction and page-specific polish.
// Outreach is loaded locally and directly so the client controls are available even when the upstream
// delayed enhancement loader is skipped by the proxied workspace shell.
const PORTAL_THEME = `<link rel="stylesheet" href="/experience-client-portal.css?v=20260817-1" /><link rel="stylesheet" href="/experience-sidebar-compact.css?v=20260817-4" /><link rel="stylesheet" href="/experience-opportunities-polish.css?v=20260817-1" /><link rel="stylesheet" href="/experience-monitoring-minimal.css?v=20260817-1" /><link rel="stylesheet" href="/experience-outreach-client.css?v=20260817-1" /><script defer src="/experience-client-portal.js?v=20260817-1"></script><script defer src="/experience-opportunities-polish.js?v=20260817-1"></script><script defer src="/experience-outreach-client.js?v=20260817-1"></script>`;

// Defensive click-through for the upstream static Outreach list. This is intentionally independent
// of the richer Outreach controller: if that enhancement ever fails to replace the fallback list,
// clicking a prepared draft still opens the actual subject/body from the live workspace snapshot.
const OUTREACH_ROW_FALLBACK = `<style>#content .list-row{cursor:pointer}</style><script>(function(){
  if(window.__LN_OUTREACH_ROW_FALLBACK)return;window.__LN_OUTREACH_ROW_FALLBACK=true;
  const END='https://pryezqkkildppjxbdrsj.supabase.co/functions/v1/client-experience';
  const arr=v=>Array.isArray(v)?v:[];
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title=v=>String(v||'').replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase());
  const active=()=>/\/\\s*Outreach\\s*$/.test(String(document.getElementById('crumb')?.textContent||''));
  async function snapshot(){
    const token=sessionStorage.getItem('li_x_token')||'';if(!token)throw new Error('Workspace token unavailable.');
    const r=await fetch(END,{method:'POST',headers:{'content-type':'application/json','x-workspace-token':token},body:JSON.stringify({action:'snapshot'}),cache:'no-store'});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||j.error||'Draft unavailable');return j;
  }
  function drafts(data){return arr(data?.opportunities).flatMap(o=>arr(o.outreach).filter(m=>Number(m.sequence_step)===0).map(m=>({m,o,contact:arr(o.contacts).find(c=>c.id===m.contact_id)||null})));}
  function open(x){
    const d=document.getElementById('drawer'),b=document.getElementById('backdrop');if(!d||!b||!x)return;
    const m=x.m,o=x.o,c=x.contact;
    d.innerHTML='<div class="drawer-head"><div><div class="eyebrow">'+esc(title(m.channel))+' · '+esc(title(m.status))+'</div><h2>'+esc(c?.name||o.pi_name||'Outreach draft')+'</h2><p class="muted">'+esc(o.lab_name||'')+' · '+esc(o.institution||'')+'</p></div><button class="close" id="lnFallbackClose">×</button></div>'+
      '<div class="drawer-section"><h4>Recipient</h4><p>'+esc(c?.email||'Verified contact route')+'</p></div>'+
      (m.channel==='email'?'<div class="drawer-section"><h4>Subject</h4><div class="x-outreach-copy">'+esc(m.subject||'—')+'</div></div>':'')+
      '<div class="drawer-section"><h4>Message</h4><div class="x-outreach-copy">'+esc(m.body||'—').replace(/\\n/g,'<br>')+'</div></div>'+
      '<div class="drawer-section"><div class="x-human-gate"><b>Internal preview:</b> this opens the real prepared draft without changing client commercial state.</div></div>';
    d.classList.remove('hidden');b.classList.remove('hidden');
    document.getElementById('lnFallbackClose')?.addEventListener('click',()=>{d.classList.add('hidden');b.classList.add('hidden')},{once:true});
  }
  function toast(message){const t=document.getElementById('toast');if(!t)return;t.textContent=message;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2800)}
  document.addEventListener('click',async function(e){
    if(!active())return;
    const row=e.target?.closest?.('#content .list-row');if(!row||row.closest('[data-ln-outreach-root]'))return;
    const rows=Array.from(document.querySelectorAll('#content .list-row'));const index=rows.indexOf(row);if(index<0)return;
    e.preventDefault();
    try{const data=await snapshot();open(drafts(data)[index]);}catch(err){toast(err instanceof Error?err.message:String(err));}
  },true);
})();</script>`;

function assetUrl(path: string) {
  return `/api/experience-asset?path=${encodeURIComponent(path)}`;
}

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(UPSTREAM, { cache: "no-store" });
    if (!res.ok) return new Response("Workspace shell unavailable", { status: res.status });
    let html = await res.text();

    // The LabNarrative shell owns Outreach enhancement loading. Remove the delayed upstream copy so
    // only one controller can observe and render the page.
    html = html.replace(/\s*inject\('\/experience-outreach-controls\.js[^']*'\s*,\s*\d+\);?/g, "");

    html = html.replace(/(src|href)="\/([^\"]+)"/g, (_match, attr, path) => {
      return `${attr}="${assetUrl(`/${path}`)}"`;
    });

    html = html.replace(/inject\('([^']+)'\s*,/g, (_match, path) => {
      const originalPath = String(path || "");
      return `inject('${assetUrl(originalPath)}',`;
    });

    const injected = `${FETCH_BRIDGE}${PORTAL_THEME}${OUTREACH_ROW_FALLBACK}`;
    if (html.includes("</head>")) html = html.replace("</head>", `${injected}</head>`);
    else html = injected + html;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("experience shell proxy failed", error);
    return new Response("LabNarrative workspace is temporarily unavailable.", { status: 502 });
  }
}
