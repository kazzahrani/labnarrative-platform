import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_FUNCTIONS = "https://pryezqkkildppjxbdrsj.supabase.co/functions/v1";
const WORKSPACE_COOKIE = "__Host-ln_workspace_token";
const COOKIE_MARKER = "__cookie__";
const ALLOWED = new Set([
  "client-experience",
  "client-experience-preview",
  "client-opportunity-v3",
  "client-conversion",
  "client-monitoring",
  "client-activity",
  "client-mailbox",
  "contact-enrichment-worker",
  "commercial-intelligence-worker",
]);

async function forward(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const fn = String(requestUrl.searchParams.get("fn") || "").trim();
  if (!ALLOWED.has(fn)) {
    return Response.json({ error: "workspace_function_not_allowed" }, { status: 400 });
  }

  const upstream = new URL(`${SUPABASE_FUNCTIONS}/${fn}`);
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key !== "fn") upstream.searchParams.append(key, value);
  }

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  const headerToken = String(req.headers.get("x-workspace-token") || "").trim();
  const cookieToken = String(req.cookies.get(WORKSPACE_COOKIE)?.value || "").trim();
  const token = !headerToken || headerToken === COOKIE_MARKER ? cookieToken : headerToken;
  if (contentType) headers.set("content-type", contentType);
  if (token) headers.set("x-workspace-token", token);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(upstream, init);
    const body = await res.arrayBuffer();
    const outHeaders = new Headers();
    outHeaders.set("content-type", res.headers.get("content-type") || "application/json; charset=utf-8");
    outHeaders.set("cache-control", "no-store");
    const location = res.headers.get("location");
    if (location) outHeaders.set("location", location);
    return new Response(body, { status: res.status, headers: outHeaders });
  } catch (error) {
    console.error("workspace proxy failed", error);
    return Response.json({ error: "workspace_proxy_failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return forward(req);
}

export async function POST(req: NextRequest) {
  return forward(req);
}
