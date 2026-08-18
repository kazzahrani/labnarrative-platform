import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://labintelligence-production-v2-lab-narrative.vercel.app/experience-v2";

function assetUrl(path: string) {
  return `/api/experience-asset?path=${encodeURIComponent(path)}`;
}

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(UPSTREAM, { cache: "no-store" });
    if (!res.ok) {
      return new Response("Workspace shell unavailable", { status: res.status });
    }

    let html = await res.text();

    html = html.replace(/(src|href)="\/([^\"]+)"/g, (_match, attr, path) => {
      return `${attr}="${assetUrl(`/${path}`)}"`;
    });

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("experience V2 shell proxy failed", error);
    return new Response("LabNarrative workspace is temporarily unavailable.", {
      status: 502,
    });
  }
}
