import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const KRAKEN_ORIGIN = "https://api.kraken.com";
const PROVIDER = "kraken";
const DANGEROUS_PERMISSIONS = new Set([
  "add-funds",
  "withdraw-funds",
  "earn-funds",
  "modify-trades",
  "close-trades",
  "add-withdraw-address",
  "update-withdraw-address",
]);
const READ_PERMISSIONS = new Set([
  "query-funds",
  "query-open-trades",
  "query-closed-trades",
  "query-ledger",
  "export-data",
  "create-ws-token",
]);
const USD_QUOTES = ["USD", "USDT", "USDC", "EUR", "GBP", "XBT"];

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
type KrakenCredentials = { apiKey: string; apiSecret: string };
type KrakenKeyInfo = {
  apiKeyName?: string;
  apiKey?: string;
  permissions?: string[];
  validUntil?: string | number;
  queryFrom?: string | number;
  queryTo?: string | number;
  ipAllowlist?: string[];
  lastUsed?: string | null;
};
type MarketCatalog = {
  at: number;
  assets: Record<string, Json>;
  pairs: Record<string, Json>;
};

let lastNonce = 0n;
let marketCache: MarketCatalog | null = null;

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
function concat(...chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
function base64Bytes(value: string) {
  let raw = "";
  try { raw = atob(value.trim()); } catch { throw new Error("kraken_invalid_secret_format"); }
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
function base64Encode(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}
function nextNonce() {
  const now = BigInt(Date.now()) * 1000n;
  lastNonce = now > lastNonce ? now : lastNonce + 1n;
  return lastNonce.toString();
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function krakenSignature(path: string, body: string, nonce: string, secret: string) {
  const payloadHash = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(nonce + body)));
  const key = await crypto.subtle.importKey("raw", base64Bytes(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"])
    .catch(() => { throw new Error("kraken_invalid_secret_format"); });
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, concat(utf8(path), payloadHash)));
  return base64Encode(signature);
}
function normalizeKrakenError(value: unknown) {
  const text = String(value || "kraken_request_failed");
  if (text.includes("Invalid key")) return "kraken_invalid_credentials";
  if (text.includes("Invalid signature")) return "kraken_invalid_signature";
  if (text.includes("Invalid nonce")) return "kraken_invalid_nonce";
  if (text.includes("Permission denied")) return "kraken_permission_denied";
  if (text.includes("Temporary lockout")) return "kraken_temporary_lockout";
  if (text.includes("Rate limit")) return "kraken_rate_limited";
  return `kraken_api_error:${text.replace(/[^a-zA-Z0-9 .:_-]/g, "").slice(0, 140)}`;
}
async function privatePost(path: string, credentials: KrakenCredentials, extra: Record<string, string> = {}) {
  const nonce = nextNonce();
  const params = new URLSearchParams({ nonce, ...extra });
  const body = params.toString();
  const signature = await krakenSignature(path, body, nonce, credentials.apiSecret);
  const response = await fetch(`${KRAKEN_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "API-Key": credentials.apiKey,
      "API-Sign": signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(`kraken_http_${response.status}`);
  const root = obj(payload);
  const errors = arr(root.error).map(String).filter(Boolean);
  if (errors.length) throw new Error(normalizeKrakenError(errors.join("; ")));
  if (!("result" in root)) throw new Error("kraken_invalid_response");
  return root.result;
}
async function publicGet(path: string) {
  const response = await fetch(`${KRAKEN_ORIGIN}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(`kraken_public_http_${response.status}`);
  const root = obj(payload);
  const errors = arr(root.error).map(String).filter(Boolean);
  if (errors.length) throw new Error(normalizeKrakenError(errors.join("; ")));
  return obj(root.result);
}
async function marketCatalog() {
  if (marketCache && Date.now() - marketCache.at < 15 * 60_000) return marketCache;
  const [assets, pairs] = await Promise.all([publicGet("/0/public/Assets"), publicGet("/0/public/AssetPairs")]);
  marketCache = { at: Date.now(), assets, pairs };
  return marketCache;
}
function coreAsset(asset: string) {
  return asset.replace(/\.(?:B|F|M|S|T)$/i, "");
}
function assetAlt(assets: Record<string, Json>, assetCode: string) {
  const core = coreAsset(assetCode);
  const meta = obj(assets[core]);
  const alt = String(meta.altname || "").toUpperCase();
  if (alt) return alt;
  if (/^[XZ][A-Z]{3}$/.test(core)) return core.slice(1);
  return core.toUpperCase();
}
function candidatePairs(assets: Record<string, Json>, pairs: Record<string, Json>, balanceAssets: string[]) {
  const wanted = new Set(balanceAssets.map((asset) => assetAlt(assets, asset)));
  for (const quote of USD_QUOTES.slice(1)) wanted.add(quote);
  const candidates = new Map<string, { pairKey: string; altname: string; baseAlt: string; quoteAlt: string; priority: number }>();
  const anchorUsd = new Map<string, { pairKey: string; altname: string }>();
  for (const [pairKey, raw] of Object.entries(pairs)) {
    const pair = obj(raw);
    const baseAlt = assetAlt(assets, String(pair.base || ""));
    const quoteAlt = assetAlt(assets, String(pair.quote || ""));
    const altname = String(pair.altname || pairKey);
    if (!baseAlt || !quoteAlt || !altname) continue;
    if (USD_QUOTES.slice(1).includes(baseAlt) && quoteAlt === "USD" && !anchorUsd.has(baseAlt)) anchorUsd.set(baseAlt, { pairKey, altname });
    if (!wanted.has(baseAlt)) continue;
    const priority = USD_QUOTES.indexOf(quoteAlt);
    if (priority < 0) continue;
    const current = candidates.get(baseAlt);
    if (!current || priority < current.priority) candidates.set(baseAlt, { pairKey, altname, baseAlt, quoteAlt, priority });
  }
  return { candidates, anchorUsd };
}
async function tickerPrices(pairRequests: Array<{ pairKey: string; altname: string }>) {
  const unique = Array.from(new Map(pairRequests.map((item) => [item.altname, item])).values());
  if (!unique.length) return {} as Record<string, number>;
  const query = encodeURIComponent(unique.map((item) => item.altname).join(","));
  const result = await publicGet(`/0/public/Ticker?pair=${query}`);
  const prices: Record<string, number> = {};
  for (const item of unique) {
    const ticker = obj(result[item.pairKey] ?? result[item.altname]);
    const close = arr(ticker.c);
    const price = n(close[0]);
    if (price > 0) prices[item.pairKey] = price;
  }
  return prices;
}
async function readOnlyKeyInfo(credentials: KrakenCredentials) {
  const raw = obj(await privatePost("/0/private/GetApiKeyInfo", credentials));
  const info: KrakenKeyInfo = {
    apiKeyName: String(raw.apiKeyName || ""),
    apiKey: String(raw.apiKey || credentials.apiKey),
    permissions: arr(raw.permissions).map(String),
    validUntil: raw.validUntil as string | number | undefined,
    queryFrom: raw.queryFrom as string | number | undefined,
    queryTo: raw.queryTo as string | number | undefined,
    ipAllowlist: arr(raw.ipAllowlist).map(String),
    lastUsed: raw.lastUsed == null ? null : String(raw.lastUsed),
  };
  const permissions = new Set(info.permissions ?? []);
  if (!permissions.has("query-funds")) throw new Error("kraken_query_funds_required");
  const dangerous = Array.from(permissions).filter((permission) => DANGEROUS_PERMISSIONS.has(permission));
  if (dangerous.length) throw new Error(`kraken_read_only_required:${dangerous.join(",")}`);
  return info;
}
async function balanceSummary(credentials: KrakenCredentials) {
  const balanceResult = obj(await privatePost("/0/private/BalanceEx", credentials));
  const balanceAssets = Object.entries(balanceResult).filter(([, raw]) => {
    const item = obj(raw);
    return n(item.balance ?? raw) !== 0;
  }).map(([asset]) => asset);
  const { assets, pairs } = await marketCatalog();
  const { candidates, anchorUsd } = candidatePairs(assets, pairs, balanceAssets);
  const pairRequests = [
    ...Array.from(candidates.values()).map(({ pairKey, altname }) => ({ pairKey, altname })),
    ...Array.from(anchorUsd.values()),
  ];
  const prices = await tickerPrices(pairRequests);
  const quoteUsd: Record<string, number> = { USD: 1 };
  for (const [quote, pair] of anchorUsd.entries()) {
    const price = prices[pair.pairKey];
    if (price > 0) quoteUsd[quote] = price;
  }
  const balances = Object.entries(balanceResult).map(([asset, raw]) => {
    const item = obj(raw);
    const balance = n(item.balance ?? raw);
    const credit = n(item.credit);
    const creditUsed = n(item.credit_used);
    const holdTrade = n(item.hold_trade);
    const available = Math.max(0, balance + credit - creditUsed - holdTrade);
    const alt = assetAlt(assets, asset);
    let priceUsd = alt === "USD" ? 1 : quoteUsd[alt] || 0;
    if (!(priceUsd > 0)) {
      const candidate = candidates.get(alt);
      if (candidate) {
        const pairPrice = prices[candidate.pairKey] || 0;
        const quoteRate = quoteUsd[candidate.quoteAlt] || 0;
        if (pairPrice > 0 && quoteRate > 0) priceUsd = pairPrice * quoteRate;
      }
    }
    const usdValue = priceUsd > 0 ? Math.max(0, balance * priceUsd) : 0;
    const availableUsd = priceUsd > 0 ? Math.max(0, available * priceUsd) : 0;
    return {
      asset: alt || asset,
      krakenAsset: asset,
      balance,
      available,
      held: Math.max(0, balance - available),
      usdValue,
      availableUsd,
      priceUsd,
      priced: priceUsd > 0,
    };
  }).filter((item) => Math.abs(item.balance) > 1e-12)
    .sort((a, b) => b.usdValue - a.usdValue || Math.abs(b.balance) - Math.abs(a.balance));
  const priced = balances.filter((item) => item.priced);
  const cashSymbols = new Set(["USD", "USDT", "USDC", "EUR", "GBP"]);
  return {
    totalUsd: priced.reduce((sum, item) => sum + item.usdValue, 0),
    availableUsd: priced.reduce((sum, item) => sum + item.availableUsd, 0),
    cashUsd: priced.filter((item) => cashSymbols.has(item.asset)).reduce((sum, item) => sum + item.usdValue, 0),
    cryptoUsd: priced.filter((item) => !cashSymbols.has(item.asset)).reduce((sum, item) => sum + item.usdValue, 0),
    assetCount: balances.length,
    valuedAssetCount: priced.length,
    unpricedAssetCount: balances.length - priced.length,
    balances,
    currency: "USD",
  };
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
async function storedCredentials(admin: Db, accountId: string): Promise<KrakenCredentials> {
  const { data, error } = await admin.rpc("trader_exchange_read_secret", { p_account_id: accountId, p_provider: PROVIDER });
  if (error || !data) throw new Error("credential_not_found");
  let credentials: Partial<KrakenCredentials> = {};
  try { credentials = JSON.parse(String(data)); } catch { throw new Error("credential_not_found"); }
  if (!credentials.apiKey || !credentials.apiSecret) throw new Error("credential_not_found");
  return credentials as KrakenCredentials;
}
async function markConnectionError(admin: Db, accountId: string, message: string) {
  await admin.from("trader_exchange_connections").update({ status: "error", last_error: message.slice(0, 240), updated_at: new Date().toISOString() })
    .eq("account_id", accountId).eq("provider", PROVIDER);
}
async function verifyAndPersist(admin: Db, userId: string, accountId: string, credentials: KrakenCredentials) {
  const keyInfo = await readOnlyKeyInfo(credentials);
  const summary = await balanceSummary(credentials);
  const permissions = keyInfo.permissions ?? [];
  const now = new Date().toISOString();
  const apiKey = String(keyInfo.apiKey || credentials.apiKey);
  const ipAllowlist = keyInfo.ipAllowlist ?? [];
  const row = {
    account_id: accountId,
    owner_user_id: userId,
    provider: PROVIDER,
    environment: "spot",
    status: "pending",
    api_key_fingerprint: (await sha256Hex(credentials.apiKey)).slice(0, 16),
    api_key_last4: apiKey.slice(-4),
    permission_read: true,
    permission_trade: false,
    permission_withdraw: false,
    ip_restricted: ipAllowlist.length > 0,
    external_uid_last4: null,
    capabilities: { balances: true, extendedBalances: true, keyPermissionIntrospection: true, spotOrders: false, liveExecution: false, readOnly: true },
    metadata: {
      apiKeyName: keyInfo.apiKeyName || null,
      permissions,
      readPermissions: permissions.filter((permission) => READ_PERMISSIONS.has(permission)),
      ipAllowlistCount: ipAllowlist.length,
      validUntil: keyInfo.validUntil ?? null,
      queryFrom: keyInfo.queryFrom ?? null,
      queryTo: keyInfo.queryTo ?? null,
      valuationMethod: "Kraken BalanceEx + public spot marks",
    },
    last_verified_at: now,
    last_error: null,
    updated_at: now,
  };
  const { error: upsertError } = await admin.from("trader_exchange_connections").upsert(row, { onConflict: "account_id,provider" });
  if (upsertError) throw upsertError;
  const { error: secretError } = await admin.rpc("trader_exchange_store_secret", {
    p_account_id: accountId,
    p_owner_user_id: userId,
    p_provider: PROVIDER,
    p_secret: JSON.stringify(credentials),
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
      const apiKey = String(body.apiKey || "").trim();
      const apiSecret = String(body.apiSecret || "").trim();
      if (apiKey.length < 20 || apiSecret.length < 40) return json({ error: "invalid_credentials_format" }, 400);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, { apiKey, apiSecret }) });
    }
    if (action === "reverify") {
      const credentials = await storedCredentials(admin, account.id);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, credentials) });
    }
    if (action === "balances") {
      const connection = await readConnection(admin, account.id);
      if (!connection || connection.status !== "connected") throw new Error("kraken_not_connected");
      const credentials = await storedCredentials(admin, account.id);
      await readOnlyKeyInfo(credentials);
      return json({ ok: true, ...await balanceSummary(credentials), ...await publicStatus(admin, account.id) });
    }
    if (action === "disconnect") {
      const { error } = await admin.from("trader_exchange_connections").update({
        status: "disconnected",
        permission_read: false,
        permission_trade: false,
        permission_withdraw: false,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("account_id", account.id).eq("provider", PROVIDER);
      if (error) throw error;
      return json({ ok: true, ...await publicStatus(admin, account.id) });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = cleanError(error);
    console.error("trader-kraken-control", message);
    const safe = message.startsWith("kraken_") || message.includes("credential_not_found") || message.includes("real_account_required") || message.includes("credential_store_failed")
      ? message : "kraken_control_failed";
    const status = safe.includes("real_account_required") ? 409 : safe.includes("unauthorized") ? 401 : 400;
    return json({ error: safe }, status);
  }
});
