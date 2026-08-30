import "server-only";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import { traderAdmin } from "./server";

const EXPECTED_GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
const ALLOWED_PUBLIC_UPSTREAMS = new Set(["https://api.bybit.com", "https://api.bytick.com"]);
let cachedSigningKey: Awaited<ReturnType<typeof webcrypto.subtle.importKey>> | null = null;

function text(value: unknown) {
  return String(value ?? "");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pemBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const raw = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(raw, "base64");
}

async function signingKey() {
  if (cachedSigningKey) return cachedSigningKey;
  const db = traderAdmin();
  const { data, error } = await db.rpc("trader_gateway_read_signing_private_key");
  if (error || !data) throw new Error("gateway_signing_key_not_configured");
  cachedSigningKey = await webcrypto.subtle.importKey(
    "pkcs8",
    pemBytes(String(data)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedSigningKey;
}

async function gatewayOrigin() {
  const db = traderAdmin();
  const { data, error } = await db
    .from("trader_gateway_config")
    .select("base_url,status")
    .eq("name", "binance")
    .single();
  if (error || !data || data.status !== "ready" || !data.base_url) throw new Error("gateway_not_ready");
  const origin = new URL(String(data.base_url)).origin;
  if (origin !== EXPECTED_GATEWAY_ORIGIN) throw new Error("gateway_origin_not_allowed");
  return origin;
}

export async function traderGatewayPublicGet(url: string): Promise<unknown> {
  const parsed = new URL(url);
  if (!ALLOWED_PUBLIC_UPSTREAMS.has(parsed.origin)) throw new Error("gateway_public_upstream_not_allowed");

  const payload = {
    requestId: randomUUID(),
    upstream: parsed.origin,
    method: "GET",
    path: parsed.pathname,
    query: parsed.searchParams.toString(),
    headers: { accept: "application/json" },
    body: null,
    timeoutMs: 10000,
  };
  const raw = JSON.stringify(payload);
  const timestamp = Date.now();
  const nonce = randomBytes(24).toString("hex");
  const key = await signingKey();
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${timestamp}\n${nonce}\n${raw}`),
  );
  const response = await fetch(`${await gatewayOrigin()}/relay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ln-timestamp": String(timestamp),
      "x-ln-nonce": nonce,
      "x-ln-signature": Buffer.from(new Uint8Array(signature)).toString("base64"),
    },
    body: raw,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const envelope = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`gateway_${response.status}:${text(envelope.error) || "relay_failed"}`);
  const upstreamStatus = Number(envelope.upstreamStatus ?? 0);
  if (!Number.isFinite(upstreamStatus) || upstreamStatus < 200 || upstreamStatus >= 300) {
    throw new Error(`market_data_${upstreamStatus || 502}`);
  }
  const upstreamBody = text(envelope.upstreamBody);
  try {
    return upstreamBody ? JSON.parse(upstreamBody) : {};
  } catch {
    throw new Error("market_data_invalid_json");
  }
}
