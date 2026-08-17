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

const PORTAL_THEME = `<link rel="stylesheet" href="/experience-client-portal.css?v=20260817-1" /><link rel="stylesheet" href="/experience-sidebar-compact.css?v=20260817-1" /><script defer src="/experience-client-portal.js?v=20260817-1"></script>`;

function assetUrl(path: string) {
  return `/api/experience-asset?path=${encodeURIComponent(path)}`;
}

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(UPSTREAM, { cache: "no-store" });
    if (!res.ok) return new Response("Workspace shell unavailable", { status: res.status });
    let html = await res.text();

    html = html.replace(/(src|href)="\/([^\"]+)"/g, (_match, attr, path) => {
      return `${attr}="${assetUrl(`/${path}`)}"`;
    });

    // The legacy shell lazily injects enhancement scripts after the core workspace becomes visible.
    // Rewrite those string-literal paths too, otherwise the new LabNarrative domain would request
    // non-existent root files such as /experience-conversion.js.
    html = html.replace(/inject\('([^']+)'\s*,/g, (_match, path) => {
      const originalPath = String(path || "");
      return `inject('${assetUrl(originalPath)}',`;
    });

    const injected = `${FETCH_BRIDGE}${PORTAL_THEME}`;
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
