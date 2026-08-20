import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://labintelligence-production-v2-lab-narrative.vercel.app/experience-v3";
const WORKSPACE_COOKIE = "__Host-ln_workspace_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

function assetUrl(path: string) {
  return `/api/experience-asset?path=${encodeURIComponent(path)}`;
}

function workspaceCookie(token: string, maxAge = COOKIE_MAX_AGE) {
  return `${WORKSPACE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function GET(req: NextRequest) {
  const suppliedToken = String(req.nextUrl.searchParams.get("token") || "").trim();

  // A private access link establishes a secure browser session and immediately
  // removes the credential from the visible URL/history.
  if (suppliedToken) {
    const cleanUrl = req.nextUrl.clone();
    cleanUrl.searchParams.delete("token");
    const headers = new Headers({
      location: cleanUrl.toString(),
      "cache-control": "no-store",
      "set-cookie": workspaceCookie(suppliedToken),
    });
    return new Response(null, { status: 302, headers });
  }

  try {
    const res = await fetch(UPSTREAM, { cache: "no-store" });
    if (!res.ok) {
      return new Response("Workspace shell unavailable", { status: res.status });
    }

    let html = await res.text();

    html = html.replace(/(src|href)="\/([^\"]+)"/g, (_match, attr, path) => {
      return `${attr}="${assetUrl(`/${path}`)}"`;
    });

    // V3 still uses a browser-side presence check before its first API call.
    // Only expose an opaque marker; the real workspace token remains HttpOnly
    // and is resolved by the same-origin workspace proxy.
    if (req.cookies.get(WORKSPACE_COOKIE)?.value) {
      html = html.replace(
        "</head>",
        '<script>try{sessionStorage.setItem("li_x_token","__cookie__")}catch(e){}</script></head>',
      );
    }

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("experience V3 shell proxy failed", error);
    return new Response("LabNarrative workspace is temporarily unavailable.", {
      status: 502,
    });
  }
}
