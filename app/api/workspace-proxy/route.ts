import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_FUNCTIONS = "https://pryezqkkildppjxbdrsj.supabase.co/functions/v1";
const ALLOWED = new Set([
  "client-experience",
  "client-experience-preview",
  "client-conversion",
  "client-monitoring",
  "client-activity",
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
  const token = req.headers.get("x-workspace-token");
  if (contentType) headers.set("content-type", contentType);
  if (token) headers.set("x-workspace-token", token);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (!/[G|H]ET/.test(req.method)) {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(upstream, init);
    const body = await res.arrayBuffer();
    const outHeaders = new Headers();
    outHeaders.set("content-type", res.headers.get("content-type") || "application/json; charset=utf-8");
    outHeaders.set("cache-control", "no-store");
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
