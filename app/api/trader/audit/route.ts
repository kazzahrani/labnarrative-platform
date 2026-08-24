import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set(["first_bot_snapshot"]);
const MAX_BODY_BYTES = 20_000;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      const sameHost = originHost === host;
      const trustedProduction = originHost === "platform.labnarrative.com";
      const trustedPreview = originHost.endsWith(".vercel.app");
      if (!sameHost && !trustedProduction && !trustedPreview) {
        return NextResponse.json({ ok: false, error: "origin_not_allowed" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
    }
  }

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    }
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const event = typeof payload.event === "string" ? payload.event : "";
    if (!ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
    }

    // One compact structured line makes the running paper bot inspectable in Vercel
    // without allowing telemetry to mutate trading state.
    console.info("TRADER_AUDIT", JSON.stringify(payload));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
}
