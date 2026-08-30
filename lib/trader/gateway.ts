import "server-only";

const PUBLIC_MARKET_RELAY = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-bybit-public-market";
const ALLOWED_PUBLIC_UPSTREAMS = new Set(["https://api.bybit.com", "https://api.bytick.com"]);

function text(value: unknown) {
  return String(value ?? "");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function traderGatewayPublicGet(url: string): Promise<unknown> {
  const parsed = new URL(url);
  if (!ALLOWED_PUBLIC_UPSTREAMS.has(parsed.origin)) throw new Error("gateway_public_upstream_not_allowed");

  const response = await fetch(PUBLIC_MARKET_RELAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: parsed.pathname, query: parsed.searchParams.toString() }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(text(body.error) || `market_data_${response.status}`);
  return body;
}
