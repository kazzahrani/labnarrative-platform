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

  try {
    const res = await fetch(UPSTREAM, { cache: "no-store" });
    if (!res.ok) {
      return new Response("Workspace shell unavailable", { status: res.status });
    }

    let html = await res.text();

    html = html.replace(/(src|href)="\/([^\"]+)"/g, (_match, attr, path) => {
      return `${attr}="${assetUrl(`/${path}`)}"`;
    });

    // Important: when a private link contains ?token=..., serve the V3 shell on
    // this same response. V3 reads the token from location.href, stores it in
    // first-party sessionStorage, and then removes it from the visible URL with
    // history.replaceState. Do not redirect first: some browsers may reject the
    // Set-Cookie on that redirect, which would otherwise lose the workspace.
    //
    // If no token is present but a secure session cookie already exists, expose
    // only an opaque marker so the same-origin workspace proxy resolves the real
    // token server-side.
    if (!suppliedToken && req.cookies.get(WORKSPACE_COOKIE)?.value) {
      html = html.replace(
        "</head>",
        '<script>try{sessionStorage.setItem("li_x_token","__cookie__")}catch(e){}</script></head>',
      );
    }

    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    });
    if (suppliedToken) headers.set("set-cookie", workspaceCookie(suppliedToken));

    return new Response(html, { status: 200, headers });
  } catch (error) {
    console.error("experience V3 shell proxy failed", error);
    return new Response("LabNarrative workspace is temporarily unavailable.", {
      status: 502,
    });
  }
}
