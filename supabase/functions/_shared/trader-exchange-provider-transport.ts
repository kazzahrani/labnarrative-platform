import type { Db, LaunchExchangeProvider } from "./trader-exchange.ts";

export type ExchangeCredentials = Record<string, string>;
export type ProviderResponse = Record<string, unknown>;

const GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
let cachedGatewaySigningKey: CryptoKey | null = null;

function text(value: unknown) { return String(value ?? ""); }
function numberValue(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function nonceHex() { const bytes = crypto.getRandomValues(new Uint8Array(24)); return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function pemBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function base64(bytes: Uint8Array) { let out = ""; for (const b of bytes) out += String.fromCharCode(b); return btoa(out); }
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function hmacHexBytes(bytes: Uint8Array) { return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }

async function gatewaySigningKey(db: Db) {
  if (cachedGatewaySigningKey) return cachedGatewaySigningKey;
  const { data, error } = await db.rpc("trader_gateway_read_signing_private_key");
  if (error || !data) throw new Error("gateway_signing_key_not_configured");
  cachedGatewaySigningKey = await crypto.subtle.importKey("pkcs8", pemBytes(String(data)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return cachedGatewaySigningKey;
}

async function gatewayBaseUrl(db: Db) {
  const { data, error } = await db.from("trader_gateway_config").select("base_url,status").eq("name", "binance").single();
  if (error || !data || data.status !== "ready" || !data.base_url) throw new Error("gateway_not_ready");
  const origin = new URL(String(data.base_url)).origin;
  if (origin !== GATEWAY_ORIGIN) throw new Error("gateway_origin_not_allowed");
  return origin;
}

export async function loadExchangeCredentials(db: Db, accountId: string, provider: Exclude<LaunchExchangeProvider, "binance">): Promise<ExchangeCredentials> {
  const { data, error } = await db.rpc("trader_exchange_read_secret", { p_account_id: accountId, p_provider: provider });
  if (error || !data) throw new Error("credential_not_found");
  try {
    const parsed = JSON.parse(String(data));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("credential_not_found");
    return parsed as ExchangeCredentials;
  } catch {
    throw new Error("credential_not_found");
  }
}

export async function providerGatewayRequest(
  db: Db,
  input: {
    upstream: string;
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: string;
    headers?: Record<string, string>;
    body?: string | null;
  },
): Promise<{ status: number; body: ProviderResponse }> {
  const origin = await gatewayBaseUrl(db);
  const payload = {
    requestId: crypto.randomUUID(),
    upstream: input.upstream,
    method: input.method,
    path: input.path,
    query: input.query ?? "",
    headers: input.headers ?? {},
    body: input.body ?? null,
    timeoutMs: 10000,
  };
  const raw = JSON.stringify(payload);
  const timestamp = Date.now();
  const nonce = nonceHex();
  const key = await gatewaySigningKey(db);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${timestamp}\n${nonce}\n${raw}`)));
  const response = await fetch(`${origin}/relay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ln-timestamp": String(timestamp),
      "x-ln-nonce": nonce,
      "x-ln-signature": base64(signature),
    },
    body: raw,
    signal: AbortSignal.timeout(12000),
  });
  const envelope = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`gateway_${response.status}:${text(envelope.error) || "relay_failed"}`);
  const upstreamStatus = numberValue(envelope.upstreamStatus);
  const upstreamBody = text(envelope.upstreamBody);
  let body: ProviderResponse = {};
  try { body = upstreamBody ? object(JSON.parse(upstreamBody)) : {}; } catch { throw new Error("provider_invalid_json"); }
  return { status: upstreamStatus, body };
}

export async function bybitPrivateRequest(
  db: Db,
  accountId: string,
  method: "GET" | "POST",
  path: string,
  queryValues: Record<string, string | number> = {},
  bodyValue: Record<string, unknown> | null = null,
): Promise<ProviderResponse> {
  const credentials = await loadExchangeCredentials(db, accountId, "bybit");
  const apiKey = text(credentials.apiKey);
  const apiSecret = text(credentials.apiSecret);
  if (!apiKey || !apiSecret) throw new Error("credential_not_found");

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(queryValues)) query.set(key, String(value));
  const queryText = query.toString();
  const body = bodyValue ? JSON.stringify(bodyValue) : "";
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const payloadToSign = method === "GET" ? queryText : body;
  const signature = hmacHexBytes(await hmac(apiSecret, `${timestamp}${apiKey}${recvWindow}${payloadToSign}`));
  const response = await providerGatewayRequest(db, {
    upstream: "https://api.bybit.com",
    method,
    path,
    query: queryText,
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": signature,
      "content-type": "application/json",
    },
    body: method === "POST" ? body : null,
  });
  const root = response.body;
  if (response.status < 200 || response.status >= 300) throw new Error(`bybit_http_${response.status}`);
  if (numberValue(root.retCode) !== 0) throw new Error(`bybit_${text(root.retCode)}:${text(root.retMsg)}`);
  return root;
}
