import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const WEBHOOK = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-tradingview-webhook";
const ADD_FUNDS_WEBHOOK = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-tradingview-add-funds";
const STRATEGY_WEBHOOK = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-tradingview-strategy-gateway";

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (!raw || raw.length > 16_384) return Response.json({ error: "invalid_webhook_message" }, { status: 400 });
    let target = WEBHOOK;
    try {
      const parsed = JSON.parse(raw) as { action?: unknown };
      const action = String(parsed.action ?? "").trim().toLowerCase().replace(/\s+/g, "_");
      if (action === "add_funds") target = ADD_FUNDS_WEBHOOK;
      else if (action === "buy" || action === "sell") target = STRATEGY_WEBHOOK;
    } catch {}
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") || "application/json" },
      body: raw,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("trader-tradingview-proxy", error);
    return Response.json({ error: "webhook_proxy_unavailable" }, { status: 502 });
  }
}
