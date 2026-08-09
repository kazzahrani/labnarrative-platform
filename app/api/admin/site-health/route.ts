import { NextResponse } from "next/server";

type Target = { id?: string; url?: string };

function allowedUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host !== "labnarrative.com" && !host.endsWith(".labnarrative.com")) return null;
    return url;
  } catch {
    return null;
  }
}

async function checkTarget(target: Target) {
  const id = String(target.id || "");
  const url = allowedUrl(String(target.url || ""));
  if (!id || !url) return { id, ok: false, status: 0, error: "Invalid LabNarrative URL." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "LabNarrative-Website-Monitor/3.0" },
    });
    return {
      id,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      finalUrl: response.url,
      error: response.status >= 400 ? `HTTP ${response.status}` : "",
    };
  } catch (error) {
    return {
      id,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Health check failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const targets = Array.isArray(body?.targets) ? (body.targets as Target[]).slice(0, 25) : [];
  if (!targets.length) return NextResponse.json({ results: [] });
  const results = await Promise.all(targets.map(checkTarget));
  return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
}
