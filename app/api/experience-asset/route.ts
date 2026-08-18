import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://labintelligence-production-v2-lab-narrative.vercel.app";
const ALLOWED = new Set([
  "/experience-v2.css",
  "/experience-v2-communications.css",
  "/experience-v2.js",
  "/experience.css",
  "/experience-outreach-controls.css",
  "/experience-activity.css",
  "/experience-monitoring.css",
  "/experience-conversion.css",
  "/labnarrative-modern.css",
  "/experience-overview-minimal.css",
  "/experience-preview-mode.js",
  "/experience.js",
  "/experience-brand-lite.js",
  "/experience-monitoring.js",
  "/experience-outreach-controls.js",
  "/experience-activity.js",
  "/experience-conversion.js",
  "/experience-telemetry.js",
]);

const MINIMAL_CONVERSION = `;(function(){
  const END='https://pryezqkkildppjxbdrsj.supabase.co/functions/v1/client-conversion';
  let data=null,loading=false;
  const token=()=>sessionStorage.getItem('li_x_token')||'';
  function style(){if(document.getElementById('ln-conversion-minimal'))return;const s=document.createElement('style');s.id='ln-conversion-minimal';s.textContent='.x-convert-side{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;margin:10px 0!important}.x-convert-side .x-upgrade-only{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;min-height:42px!important;border-radius:12px!important;background:#24533f!important;color:#fff!important;font-weight:700!important;text-decoration:none!important;border:0!important;box-shadow:none!important}.x-convert-side .x-upgrade-only:hover{background:#17382d!important}';document.head.appendChild(s)}
  async function call(){const t=token();if(!t)return null;const r=await fetch(END,{method:'POST',headers:{'content-type':'application/json','x-workspace-token':t},body:JSON.stringify({action:'offer'}),cache:'no-store'}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||j.error||'Conversion offer unavailable');return j}
  async function load(){if(data||loading)return;loading=true;try{data=await call()}catch(e){console.warn('conversion offer',e)}finally{loading=false;render()}}
  function side(){const host=document.querySelector('.sidebar-bottom');if(!host||!data)return;host.querySelector('[data-x-convert-side]')?.remove();document.querySelector('[data-x-convert-main]')?.remove();if(data.paid_portfolio)return;const el=document.createElement('div');el.dataset.xConvertSide='1';el.className='x-convert-side';el.innerHTML=data.converted?'<a class="x-upgrade-only" href="https://labnarrative.com/client">Client Portal</a>':'<a class="x-upgrade-only" href="https://labnarrative.com/plans">Upgrade</a>';host.prepend(el)}
  function render(){style();document.querySelector('[data-x-convert-main]')?.remove();side()}
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-s],[data-x-monitoring],#refresh'))setTimeout(render,160)},true);
  style();if(document.readyState==='complete')load();else window.addEventListener('load',load,{once:true});setTimeout(load,350);
})();`;

export async function GET(req: NextRequest) {
  const raw = String(new URL(req.url).searchParams.get("path") || "");
  if (!raw.startsWith("/")) return new Response("Invalid asset path", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw, UPSTREAM);
  } catch {
    return new Response("Invalid asset path", { status: 400 });
  }
  if (!ALLOWED.has(target.pathname)) return new Response("Asset not allowed", { status: 403 });

  if (target.pathname === "/experience-conversion.js") {
    return new Response(MINIMAL_CONVERSION, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  try {
    const res = await fetch(target, { cache: "no-store" });
    if (!res.ok) return new Response("Upstream asset unavailable", { status: res.status });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": res.headers.get("content-type") || "application/octet-stream",
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("experience asset proxy failed", error);
    return new Response("Workspace asset unavailable", { status: 502 });
  }
}
