import "server-only";

const PUBLIC_MARKET_RELAY = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-bybit-public-market";
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

export async function traderGatewayPublicGet(url: string): Promise<unknown> {
  const request = relayRequest(url);
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

export async function traderGatewayPublicBatchGet(urls: string[]): Promise<unknown[]> {
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_PUBLIC_BATCH) throw new Error("gateway_public_invalid_batch");
  const requests = urls.map(relayRequest);
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
