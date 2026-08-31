import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_FUNCTIONS = new Set([
  // Current Trader browser surface. Internal workers, webhook ingress and service-only
  // functions are intentionally excluded from this bridge.
  "trader-account-control",
  "trader-analytics",
  "trader-analytics-activity",
  "trader-analytics-benchmarks",
  "trader-analytics-capital",
  "trader-billing-canary-control",
  "trader-billing-control",
  "trader-billing-preflight",
  "trader-binance-control",
  "trader-bybit-control",
  "trader-chart-control",
  "trader-coinbase-control",
  "trader-dca-control",
  "trader-entitlements-control",
  "trader-kraken-control",
  "trader-kucoin-control",
  "trader-live-cancel-control",
  "trader-live-close-control",
  "trader-live-control",
  "trader-live-dca-control",
  "trader-live-portfolio",
  "trader-live-tp-control",
  "trader-live-trade-control",
  "trader-multiexchange-control",
  "trader-okx-control",
  "trader-pricing-control",
  "trader-referral-control",
  "trader-signal-monitor",
  "trader-trade-control",
  "trader-tradingview-control",
  "trader-tradingview-strategy-config",
  "trader-tradingview-strategy-control",

  // Owner-authenticated Core V2 browser endpoints used by the exact Trader shell.
  "trader-v2-account-bootstrap",
  "trader-v2-analytics-read",
  "trader-v2-automation-submit",
  "trader-v2-automations-read",
  "trader-v2-command-capabilities",
  "trader-v2-connections-control",
  "trader-v2-connections-read",
  "trader-v2-exit-plan-preview",
  "trader-v2-exit-plan-submit",
  "trader-v2-history-read",
  "trader-v2-portfolio-read",
  "trader-v2-portfolio-refresh",
  "trader-v2-positions-read",
  "trader-v2-reconciliation-read",
  "trader-v2-signal-monitor-read",
  "trader-v2-transfer-reconcile",
  "trader-v2-workspace-read",
]);

function permittedHost(host: string) {
  if (host === "app.labnarrative.com" || host === "localhost" || host === "127.0.0.1") return true;
  return process.env.VERCEL_ENV !== "production" && host.endsWith(".vercel.app");
}

function permittedOrigin(origin: string, host: string) {
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!permittedHost(host)) return json({ error: "not_found" }, 404);

  const origin = request.headers.get("origin") || "";
  if (!permittedOrigin(origin, host)) return json({ error: "origin_not_allowed" }, 403);

  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: "unauthorized" }, 401);

  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > 65_536) return json({ error: "invalid_request" }, 400);

  let requestBody: { name?: unknown; body?: unknown };
  try {
    requestBody = JSON.parse(raw) as { name?: unknown; body?: unknown };
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const name = String(requestBody.name || "").trim();
  if (!ALLOWED_FUNCTIONS.has(name)) return json({ error: "function_not_allowed" }, 403);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!supabaseUrl || !publishableKey) return json({ error: "server_configuration_missing" }, 500);

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        authorization,
        apikey: publishableKey,
        "content-type": "application/json",
        "x-client-info": "labnarrative-app-trader-shell/1",
      },
      body: JSON.stringify(requestBody.body ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(28_000),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.name : "function_proxy_failed";
    if (message === "TimeoutError" || message === "AbortError") return json({ error: "function_proxy_timeout" }, 504);
    return json({ error: "function_proxy_failed" }, 502);
  }
}
