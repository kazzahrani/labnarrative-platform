import { NextRequest, NextResponse } from "next/server";

const LEGACY_HOST = "https://bourdon.labnarrative.com";
const NEW_HOST = "https://bourdon.labnarrative.site";

function safePath(value: string | null) {
  const raw = value || "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

async function proxyRequest(request: NextRequest) {
  const path = safePath(request.nextUrl.searchParams.get("path"));
  const upstreamUrl = new URL(path, LEGACY_HOST);

  const headers = new Headers();
  for (const key of ["accept", "accept-language", "user-agent", "rsc", "next-router-state-tree", "next-url", "purpose"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }

  const upstream = await fetch(upstreamUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "manual",
    cache: "no-store",
  });

  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("location");
    if (location) {
      const target = new URL(location, LEGACY_HOST);
      if (target.origin === LEGACY_HOST) {
        target.protocol = "https:";
        target.host = "bourdon.labnarrative.site";
      }
      return NextResponse.redirect(target, upstream.status);
    }
  }

  const responseHeaders = new Headers();
  for (const key of ["content-type", "cache-control", "etag", "last-modified"]) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("X-Robots-Tag", "noindex, nofollow");

  const contentType = upstream.headers.get("content-type") || "";
  if (request.method !== "HEAD" && contentType.includes("text/html")) {
    let html = await upstream.text();
    html = html.replaceAll(LEGACY_HOST, NEW_HOST);
    return new NextResponse(html, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new NextResponse(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function HEAD(request: NextRequest) {
  return proxyRequest(request);
}
