import "server-only";

const PUBLIC_MARKET_RELAY = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-bybit-public-market";
const PUBLIC_BYBIT_KLINE = "https://trader-gateway.labnarrative.com/public/bybit/kline";
const ALLOWED_PUBLIC_UPSTREAMS = new Set(["https://api.bybit.com", "https://api.bytick.com"]);
const MAX_PUBLIC_BATCH = 6;

function text(value: unknown) {
  return String(value ?? "");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relayRequest(url: string) {
  const parsed = new URL(url);
  if (!ALLOWED_PUBLIC_UPSTREAMS.has(parsed.origin)) throw new Error("gateway_public_upstream_not_allowed");
  return { path: parsed.pathname, query: parsed.searchParams.toString() };
}

function directBybitKlineUrl(request: { path: string; query: string }) {
  if (request.path !== "/v5/market/kline") return null;
  const source = new URLSearchParams(request.query);
  if (source.get("category") !== "spot") return null;
  const params = new URLSearchParams();
  for (const key of ["symbol", "interval", "limit", "end"] as const) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  return `${PUBLIC_BYBIT_KLINE}?${params.toString()}`;
}

function validBybitKlineBody(value: unknown) {
  const body = object(value);
  const result = object(body.result);
  return Number(body.retCode) === 0 && Array.isArray(result.list);
}

async function directBybitKline(request: { path: string; query: string }): Promise<unknown> {
  const url = directBybitKlineUrl(request);
  if (!url) throw new Error("direct_kline_not_applicable");
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !validBybitKlineBody(body)) throw new Error(`direct_market_data_${response.status}`);
  return body;
}

async function signedRelayGet(request: { path: string; query: string }): Promise<unknown> {
  const response = await fetch(PUBLIC_MARKET_RELAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(text(body.error) || `market_data_${response.status}`);
  return body;
}

export async function traderGatewayPublicGet(url: string): Promise<unknown> {
  const request = relayRequest(url);
  if (request.path === "/v5/market/kline") {
    try {
      return await directBybitKline(request);
    } catch {
      // Preserve the existing signed Supabase -> Oracle route as an availability fallback.
    }
  }
  return await signedRelayGet(request);
}

export async function traderGatewayPublicBatchGet(urls: string[]): Promise<unknown[]> {
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_PUBLIC_BATCH) throw new Error("gateway_public_invalid_batch");
  const requests = urls.map(relayRequest);

  if (requests.every(request => request.path === "/v5/market/kline")) {
    try {
      return await Promise.all(requests.map(request => directBybitKline(request)));
    } catch {
      // Fall through to the already deployed signed batch relay if the direct read path is unavailable.
    }
  }

  const response = await fetch(PUBLIC_MARKET_RELAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(text(body.error) || `market_data_${response.status}`);
  const results = Array.isArray(body.results) ? body.results : null;
  if (!results || results.length !== urls.length) throw new Error("gateway_public_invalid_batch_response");
  return results;
}
