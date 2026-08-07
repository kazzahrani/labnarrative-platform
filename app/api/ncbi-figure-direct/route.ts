import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(message: string, status = 502) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function timed(url: URL, init: RequestInit = {}, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

function exactPmcFigure(url: URL) {
  return url.protocol === "https:"
    && url.hostname.toLowerCase() === "pmc.ncbi.nlm.nih.gov"
    && /^\/articles\/PMC\d+\/figure\/[^/]+\/?$/i.test(url.pathname);
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return fail("Missing figure URL.", 400);

  let source: URL;
  try {
    source = new URL(raw);
  } catch {
    return fail("Invalid figure URL.", 400);
  }
  if (!exactPmcFigure(source)) return fail("Only exact PMC figure pages are accepted.", 400);

  try {
    const endpoint = new URL("/api/ncbi-figure-oa", request.nextUrl.origin);
    endpoint.searchParams.set("url", source.toString());
    const response = await timed(endpoint, {
      headers: { Accept: "image/png,image/jpeg,image/webp,image/*" },
    });
    if (!response.ok) return fail(`NCBI OA fallback failed: ${(await response.text()).slice(0, 500)}`);

    const headers = new Headers(response.headers);
    headers.set("X-LabNarrative-Resolver-Chain", "ncbi-archive->ncbi-oa-package");
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "NCBI OA fallback timed out."
      : error instanceof Error ? error.message : "NCBI OA fallback failed.";
    return fail(message);
  }
}
