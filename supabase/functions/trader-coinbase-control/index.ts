import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const COINBASE_ORIGIN = "https://api.coinbase.com";
const COINBASE_HOST = "api.coinbase.com";
const PROVIDER = "coinbase";

type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
type RealAccount = { id: string; owner_user_id: string; account_kind: "real"; status: string };
type Connection = {
  id: string;
  account_id: string;
  status: string;
  environment: string;
  api_key_last4: string | null;
  permission_read: boolean;
  permission_trade: boolean;
  permission_withdraw: boolean;
  ip_restricted: boolean | null;
  external_uid_last4: string | null;
  capabilities: Json | null;
  metadata: Json | null;
  last_verified_at: string | null;
  last_error: string | null;
};
type CoinbaseCredentials = { keyName: string; keySecret: string };
type CoinbasePermissions = {
  can_view?: boolean;
  can_trade?: boolean;
  can_transfer?: boolean;
  can_receive?: boolean;
  portfolio_uuid?: string;
  portfolio_type?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}
function cleanError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}
function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function n(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function utf8(value: string) {
  return new TextEncoder().encode(value);
}
function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function randomHex(byteLength = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteLength))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function pemBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n").trim();
  const match = normalized.match(/-----BEGIN ([A-Z ]+)-----([\s\S]+?)-----END \1-----/);
  if (!match) throw new Error("coinbase_invalid_private_key");
  const raw = atob(match[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return { label: match[1], bytes };
}
function derLength(length: number) {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) { bytes.unshift(value & 0xff); value >>= 8; }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}
function concat(...chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
function der(tag: number, content: Uint8Array) {
  return concat(new Uint8Array([tag]), derLength(content.length), content);
}
function sec1ToPkcs8(sec1: Uint8Array) {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const ecPublicKeyOid = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const p256Oid = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  return der(0x30, concat(version, der(0x30, concat(ecPublicKeyOid, p256Oid)), der(0x04, sec1)));
}
function joseSignature(signature: Uint8Array) {
  if (signature.length === 64) return signature;
  if (signature[0] !== 0x30) throw new Error("coinbase_signature_format_failed");
  let offset = 1;
  const seqLength = signature[offset++];
  if (seqLength & 0x80) offset += seqLength & 0x7f;
  if (signature[offset++] !== 0x02) throw new Error("coinbase_signature_format_failed");
  let rLength = signature[offset++];
  if (rLength & 0x80) {
    const count = rLength & 0x7f; rLength = 0;
    for (let i = 0; i < count; i += 1) rLength = (rLength << 8) | signature[offset++];
  }
  let r = signature.slice(offset, offset + rLength); offset += rLength;
  if (signature[offset++] !== 0x02) throw new Error("coinbase_signature_format_failed");
  let sLength = signature[offset++];
  if (sLength & 0x80) {
    const count = sLength & 0x7f; sLength = 0;
    for (let i = 0; i < count; i += 1) sLength = (sLength << 8) | signature[offset++];
  }
  let s = signature.slice(offset, offset + sLength);
  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);
  if (r.length > 32 || s.length > 32) throw new Error("coinbase_signature_format_failed");
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length); raw.set(s, 64 - s.length);
  return raw;
}
async function importCoinbaseKey(secret: string) {
  const parsed = pemBytes(secret);
  const pkcs8 = parsed.label === "PRIVATE KEY" ? parsed.bytes : parsed.label === "EC PRIVATE KEY" ? sec1ToPkcs8(parsed.bytes) : null;
  if (!pkcs8) throw new Error("coinbase_invalid_private_key");
  try {
    return await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  } catch {
    throw new Error("coinbase_invalid_private_key");
  }
}
async function buildJwt(method: string, barePath: string, credentials: CoinbaseCredentials) {
  const key = await importCoinbaseKey(credentials.keySecret);
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(utf8(JSON.stringify({ alg: "ES256", typ: "JWT", kid: credentials.keyName, nonce: randomHex(16) })));
  const encodedPayload = base64Url(utf8(JSON.stringify({ iss: "cdp", nbf: now, exp: now + 120, sub: credentials.keyName, uri: `${method} ${COINBASE_HOST}${barePath}` })));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(signingInput)));
  return `${signingInput}.${base64Url(joseSignature(signature))}`;
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ownerRealAccount(admin: Db, userId: string) {
  const { data, error } = await admin.from("trader_accounts").select("id,owner_user_id,account_kind,status")
    .eq("owner_user_id", userId).eq("account_kind", "real").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("real_account_required");
  return data as RealAccount;
}
async function readConnection(admin: Db, accountId: string) {
  const { data, error } = await admin.from("trader_exchange_connections")
    .select("id,account_id,status,environment,api_key_last4,permission_read,permission_trade,permission_withdraw,ip_restricted,external_uid_last4,capabilities,metadata,last_verified_at,last_error")
    .eq("account_id", accountId).eq("provider", PROVIDER).maybeSingle();
  if (error) throw error;
  return data as Connection | null;
}
function publicConnection(connection: Connection | null) {
  if (!connection) return null;
  return {
    status: connection.status,
    environment: connection.environment,
    apiKeyLast4: connection.api_key_last4,
    permissionRead: connection.permission_read,
    permissionTrade: connection.permission_trade,
    permissionWithdraw: connection.permission_withdraw,
    ipRestricted: connection.ip_restricted,
    externalUidLast4: connection.external_uid_last4,
    capabilities: connection.capabilities ?? {},
    metadata: connection.metadata ?? {},
    lastVerifiedAt: connection.last_verified_at,
    lastError: connection.last_error,
  };
}
async function publicStatus(admin: Db, accountId: string) {
  return { connection: publicConnection(await readConnection(admin, accountId)) };
}
async function signedGet(requestPath: string, credentials: CoinbaseCredentials) {
  const barePath = requestPath.split("?")[0];
  const token = await buildJwt("GET", barePath, credentials);
  const response = await fetch(`${COINBASE_ORIGIN}${requestPath}`, {
    method: "GET",
    headers: { accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = String(obj(payload).message || obj(payload).error || "request_failed").replace(/[^a-zA-Z0-9 .:_-]/g, "").slice(0, 160);
    throw new Error(`coinbase_http_${response.status}:${message}`);
  }
  if (!payload || typeof payload !== "object") throw new Error("coinbase_invalid_response");
  return obj(payload);
}
async function keyPermissions(credentials: CoinbaseCredentials) {
  const payload = await signedGet("/api/v3/brokerage/key_permissions", credentials) as CoinbasePermissions;
  if (payload.can_view !== true) throw new Error("coinbase_view_permission_required");
  if (payload.can_trade === true || payload.can_transfer === true) throw new Error("coinbase_read_only_required");
  return payload;
}
async function resolvePortfolioUuid(credentials: CoinbaseCredentials, permissions: CoinbasePermissions) {
  if (permissions.portfolio_uuid) return permissions.portfolio_uuid;
  const payload = await signedGet("/api/v3/brokerage/portfolios", credentials);
  const portfolio = arr(payload.portfolios).map(obj).find((item) => !Boolean(item.deleted));
  const uuid = String(portfolio?.uuid || "");
  if (!uuid) throw new Error("coinbase_portfolio_required");
  return uuid;
}
async function portfolioSummary(credentials: CoinbaseCredentials, portfolioUuid?: string | null) {
  const permissions = portfolioUuid ? null : await keyPermissions(credentials);
  const uuid = portfolioUuid || await resolvePortfolioUuid(credentials, permissions ?? {});
  const payload = await signedGet(`/api/v3/brokerage/portfolios/${encodeURIComponent(uuid)}?currency=USD`, credentials);
  const breakdown = obj(payload.breakdown);
  const balances = obj(breakdown.portfolio_balances);
  const totalBalance = obj(balances.total_balance);
  const cashBalance = obj(balances.total_cash_equivalent_balance);
  const cryptoBalance = obj(balances.total_crypto_balance);
  const spotPositions = arr(breakdown.spot_positions).map(obj).map((position) => ({
    asset: String(position.asset || "").toUpperCase(),
    totalUsd: Math.max(0, n(position.total_balance_fiat)),
    availableUsd: Math.max(0, n(position.available_to_trade_fiat)),
    totalCrypto: Math.max(0, n(position.total_balance_crypto)),
    availableCrypto: Math.max(0, n(position.available_to_trade_crypto)),
    allocation: Math.max(0, n(position.allocation)),
  })).filter((position) => position.asset && (position.totalUsd > 0 || position.totalCrypto > 0)).sort((a, b) => b.totalUsd - a.totalUsd);
  return {
    portfolioUuid: uuid,
    totalUsd: Math.max(0, n(totalBalance.value)),
    cashUsd: Math.max(0, n(cashBalance.value)),
    cryptoUsd: Math.max(0, n(cryptoBalance.value)),
    availableUsd: Math.max(0, spotPositions.reduce((sum, position) => sum + position.availableUsd, 0)),
    assetCount: spotPositions.length,
    balances: spotPositions,
    currency: String(totalBalance.currency || "USD"),
  };
}
async function storedCredentials(admin: Db, accountId: string): Promise<CoinbaseCredentials> {
  const { data, error } = await admin.rpc("trader_exchange_read_secret", { p_account_id: accountId, p_provider: PROVIDER });
  if (error || !data) throw new Error("credential_not_found");
  let credentials: Partial<CoinbaseCredentials> = {};
  try { credentials = JSON.parse(String(data)); } catch { throw new Error("credential_not_found"); }
  if (!credentials.keyName || !credentials.keySecret) throw new Error("credential_not_found");
  return credentials as CoinbaseCredentials;
}
async function markConnectionError(admin: Db, accountId: string, message: string) {
  await admin.from("trader_exchange_connections").update({ status: "error", last_error: message.slice(0, 240), updated_at: new Date().toISOString() })
    .eq("account_id", accountId).eq("provider", PROVIDER);
}
async function verifyAndPersist(admin: Db, userId: string, accountId: string, credentials: CoinbaseCredentials) {
  const permissions = await keyPermissions(credentials);
  const portfolioUuid = await resolvePortfolioUuid(credentials, permissions);
  const summary = await portfolioSummary(credentials, portfolioUuid);
  const now = new Date().toISOString();
  const keyId = credentials.keyName.split("/").filter(Boolean).at(-1) || credentials.keyName;
  const baseRow = {
    account_id: accountId,
    owner_user_id: userId,
    provider: PROVIDER,
    environment: "mainnet",
    status: "pending",
    api_key_fingerprint: (await sha256(credentials.keyName)).slice(0, 16),
    api_key_last4: keyId.slice(-4),
    permission_read: true,
    permission_trade: false,
    permission_withdraw: false,
    ip_restricted: null,
    external_uid_last4: portfolioUuid.slice(-4) || null,
    capabilities: { balances: true, portfolioBreakdown: true, spotOrders: false, liveExecution: false, readOnly: true },
    metadata: {
      portfolioUuid,
      portfolioUuidLast4: portfolioUuid.slice(-4),
      portfolioType: permissions.portfolio_type ?? null,
      canReceive: permissions.can_receive === true,
      signatureAlgorithm: "ES256",
    },
    last_verified_at: now,
    last_error: null,
    updated_at: now,
  };
  const { error: upsertError } = await admin.from("trader_exchange_connections").upsert(baseRow, { onConflict: "account_id,provider" });
  if (upsertError) throw upsertError;
  const { error: secretError } = await admin.rpc("trader_exchange_store_secret", {
    p_account_id: accountId, p_owner_user_id: userId, p_provider: PROVIDER, p_secret: JSON.stringify(credentials),
  });
  if (secretError) {
    await markConnectionError(admin, accountId, "credential_store_failed");
    throw new Error("credential_store_failed");
  }
  const { error: connectedError } = await admin.from("trader_exchange_connections")
    .update({ status: "connected", last_verified_at: now, last_error: null, updated_at: now })
    .eq("account_id", accountId).eq("provider", PROVIDER);
  if (connectedError) {
    await markConnectionError(admin, accountId, "connection_finalize_failed");
    throw connectedError;
  }
  return { ...await publicStatus(admin, accountId), ...summary };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration_missing" }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  try {
    const account = await ownerRealAccount(admin, user.id);
    const body = await req.json().catch(() => ({})) as Json;
    const action = String(body.action || "status");

    if (action === "status") return json({ ok: true, ...await publicStatus(admin, account.id) });
    if (action === "connect") {
      const keyName = String(body.keyName || "").trim();
      const keySecret = String(body.keySecret || "").replace(/\\n/g, "\n").trim();
      if (keyName.length < 20 || !keyName.includes("/apiKeys/") || keySecret.length < 80) return json({ error: "invalid_credentials_format" }, 400);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, { keyName, keySecret }) });
    }
    if (action === "reverify") {
      const credentials = await storedCredentials(admin, account.id);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, credentials) });
    }
    if (action === "balances") {
      const connection = await readConnection(admin, account.id);
      if (!connection || connection.status !== "connected") throw new Error("coinbase_not_connected");
      const credentials = await storedCredentials(admin, account.id);
      const portfolioUuid = String(obj(connection.metadata).portfolioUuid || "") || null;
      return json({ ok: true, ...await portfolioSummary(credentials, portfolioUuid), ...await publicStatus(admin, account.id) });
    }
    if (action === "disconnect") {
      const { error } = await admin.from("trader_exchange_connections").update({
        status: "disconnected", permission_read: false, permission_trade: false, permission_withdraw: false, last_error: null, updated_at: new Date().toISOString(),
      }).eq("account_id", account.id).eq("provider", PROVIDER);
      if (error) throw error;
      return json({ ok: true, ...await publicStatus(admin, account.id) });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = cleanError(error);
    console.error("trader-coinbase-control", message);
    const safe = message.startsWith("coinbase_") || message.includes("credential_not_found") || message.includes("real_account_required") || message.includes("credential_store_failed")
      ? message : "coinbase_control_failed";
    const status = safe.includes("real_account_required") ? 409 : safe.includes("unauthorized") ? 401 : 400;
    return json({ error: safe }, status);
  }
});
