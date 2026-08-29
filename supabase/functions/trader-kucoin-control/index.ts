import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const KUCOIN_ORIGIN = "https://api.kucoin.com";
const PROVIDER = "kucoin";
const SUPPORTED_KEY_VERSIONS = ["3", "2"];
const CASH_SYMBOLS = new Set(["USD", "USDT", "USDC"]);

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
type KucoinCredentials = { apiKey: string; apiSecret: string; passphrase: string; apiVersion: string };
type KucoinKeyInfo = {
  apiKey?: string;
  apiVersion?: number | string;
  permission?: string;
  uid?: number | string;
  isMaster?: boolean;
  region?: string;
  siteType?: string;
  remark?: string;
};
type BalanceRow = {
  currency: string;
  balance: number;
  equity: number;
  available: number;
  held: number;
  liability: number;
  accountTypes: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
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
function cleanError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}
function utf8(value: string) {
  return new TextEncoder().encode(value);
}
function base64(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}
async function hmacBase64(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(message)));
  return base64(signature);
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeKucoinError(code: unknown, message: unknown) {
  const c = String(code || "");
  const text = String(message || "");
  if (c === "400001" || /header.*KC-API|invalid.*key/i.test(text)) return "kucoin_invalid_credentials";
  if (c === "400002" || /timestamp/i.test(text)) return "kucoin_invalid_timestamp";
  if (c === "400003" || /key.*not.*exist|api.*key.*invalid/i.test(text)) return "kucoin_invalid_credentials";
  if (c === "400004" || /passphrase/i.test(text)) return "kucoin_invalid_passphrase";
  if (c === "400005" || /signature/i.test(text)) return "kucoin_invalid_signature";
  if (c === "400006" || /ip.*whitelist/i.test(text)) return "kucoin_ip_restricted";
  if (c === "400007" || /permission/i.test(text)) return "kucoin_permission_denied";
  if (c === "429000" || /too many|rate limit/i.test(text)) return "kucoin_rate_limited";
  return `kucoin_api_error:${c}:${text.replace(/[^a-zA-Z0-9 .:_-]/g, "").slice(0, 120)}`;
}
async function signedGet(endpoint: string, credentials: KucoinCredentials) {
  const timestamp = Date.now().toString();
  const sign = await hmacBase64(credentials.apiSecret, `${timestamp}GET${endpoint}`);
  const passphrase = await hmacBase64(credentials.apiSecret, credentials.passphrase);
  const response = await fetch(`${KUCOIN_ORIGIN}${endpoint}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "KC-API-KEY": credentials.apiKey,
      "KC-API-SIGN": sign,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-PASSPHRASE": passphrase,
      "KC-API-KEY-VERSION": credentials.apiVersion,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(`kucoin_http_${response.status}`);
  const root = obj(payload);
  const code = String(root.code || "");
  if (code !== "200000") throw new Error(normalizeKucoinError(code, root.msg ?? root.message));
  return root.data;
}
async function publicGet(endpoint: string) {
  const response = await fetch(`${KUCOIN_ORIGIN}${endpoint}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(`kucoin_public_http_${response.status}`);
  const root = obj(payload);
  const code = String(root.code || "");
  if (code !== "200000") throw new Error(normalizeKucoinError(code, root.msg ?? root.message));
  return root.data;
}
function permissionList(value: unknown) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
async function discoverCredentials(apiKey: string, apiSecret: string, passphrase: string) {
  let lastError = "kucoin_invalid_credentials";
  for (const apiVersion of SUPPORTED_KEY_VERSIONS) {
    const credentials: KucoinCredentials = { apiKey, apiSecret, passphrase, apiVersion };
    try {
      const info = obj(await signedGet("/api/v1/user/api-key", credentials)) as KucoinKeyInfo;
      const reportedVersion = String(info.apiVersion || apiVersion);
      return { credentials: { ...credentials, apiVersion: reportedVersion }, info };
    } catch (error) {
      lastError = cleanError(error);
      if (!/invalid_credentials|invalid_passphrase|invalid_signature|http_401|http_403|permission_denied/.test(lastError)) throw error;
    }
  }
  throw new Error(lastError);
}
function validateReadOnly(info: KucoinKeyInfo) {
  const permissions = permissionList(info.permission);
  if (!permissions.includes("General")) throw new Error("kucoin_general_permission_required");
  const nonGeneral = permissions.filter((permission) => permission !== "General");
  if (nonGeneral.length) throw new Error(`kucoin_read_only_required:${nonGeneral.join(",")}`);
  return permissions;
}
async function accountMode(credentials: KucoinCredentials) {
  try {
    const data = obj(await signedGet("/api/ua/v1/account/mode", credentials));
    const mode = String(data.selfAccountMode || "CLASSIC").toUpperCase();
    return mode === "UNIFIED" ? "UNIFIED" : "CLASSIC";
  } catch (error) {
    const message = cleanError(error);
    if (message.includes("permission_denied")) throw error;
    return "CLASSIC";
  }
}
function mergeRows(target: Map<string, BalanceRow>, currencyValue: unknown, raw: Json, accountType: string) {
  const currency = String(currencyValue || "").toUpperCase();
  if (!currency) return;
  const balance = n(raw.balance);
  const equity = n(raw.equity, balance);
  const available = n(raw.available, Math.max(0, balance - n(raw.locked ?? raw.hold ?? raw.holds)));
  const held = Math.max(0, n(raw.locked ?? raw.hold ?? raw.holds, Math.max(0, balance - available)));
  const liability = Math.max(0, n(raw.liability));
  const current = target.get(currency) ?? { currency, balance: 0, equity: 0, available: 0, held: 0, liability: 0, accountTypes: [] };
  current.balance += balance;
  current.equity += equity;
  current.available += available;
  current.held += held;
  current.liability += liability;
  if (!current.accountTypes.includes(accountType)) current.accountTypes.push(accountType);
  target.set(currency, current);
}
function rowsFromAccountPayload(payload: unknown, defaultType: string) {
  const rows = new Map<string, BalanceRow>();
  const root = obj(payload);
  const accountType = String(root.accountType || defaultType);
  for (const account of arr(root.accounts)) {
    const accountObj = obj(account);
    for (const item of arr(accountObj.currencies)) {
      const itemObj = obj(item);
      mergeRows(rows, itemObj.currency, itemObj, accountType);
    }
  }
  return rows;
}
async function classicBalances(credentials: KucoinCredentials) {
  const combined = new Map<string, BalanceRow>();
  let usedModern = false;
  for (const accountType of ["FUNDING", "SPOT"]) {
    try {
      const data = await signedGet(`/api/ua/v2/account/balance?accountType=${accountType}`, credentials);
      const rows = rowsFromAccountPayload(data, accountType);
      for (const row of rows.values()) mergeRows(combined, row.currency, row as unknown as Json, accountType);
      usedModern = true;
    } catch (error) {
      const message = cleanError(error);
      if (message.includes("permission_denied")) throw error;
    }
  }
  if (usedModern) return Array.from(combined.values());

  const legacy = arr(await signedGet("/api/v1/accounts", credentials));
  for (const item of legacy) {
    const row = obj(item);
    const type = String(row.type || "spot").toUpperCase();
    mergeRows(combined, row.currency, {
      balance: row.balance,
      equity: row.balance,
      available: row.available,
      holds: row.holds,
    }, type);
  }
  return Array.from(combined.values());
}
async function unifiedBalances(credentials: KucoinCredentials) {
  const payload = await signedGet("/api/ua/v1/unified/account/balance", credentials);
  return Array.from(rowsFromAccountPayload(payload, "UNIFIED").values());
}
async function fiatPrices(currencies: string[]) {
  const unique = Array.from(new Set(currencies.map((currency) => currency.toUpperCase()).filter(Boolean)));
  const prices: Record<string, number> = { USD: 1 };
  const requested = unique.filter((currency) => currency !== "USD");
  for (let index = 0; index < requested.length; index += 40) {
    const chunk = requested.slice(index, index + 40);
    const params = new URLSearchParams({ base: "USD" });
    for (const currency of chunk) params.append("currencies", currency);
    try {
      const data = obj(await publicGet(`/api/ua/v2/market/fiat-price?${params.toString()}`));
      for (const [currency, value] of Object.entries(data)) {
        const price = n(value);
        if (price > 0) prices[currency.toUpperCase()] = price;
      }
    } catch {
      // Unpriced assets remain visible and are explicitly reported as such.
    }
  }
  return prices;
}
async function balanceSummary(credentials: KucoinCredentials, modeOverride?: string | null) {
  const mode = modeOverride || await accountMode(credentials);
  const rawRows = mode === "UNIFIED" ? await unifiedBalances(credentials) : await classicBalances(credentials);
  const rows = rawRows.filter((row) => Math.abs(row.equity) > 1e-12 || Math.abs(row.balance) > 1e-12 || Math.abs(row.liability) > 1e-12);
  const prices = await fiatPrices(rows.map((row) => row.currency));
  const balances = rows.map((row) => {
    const priceUsd = row.currency === "USD" ? 1 : prices[row.currency] || 0;
    const usdValue = priceUsd > 0 ? Math.max(0, row.equity * priceUsd) : 0;
    const availableUsd = priceUsd > 0 ? Math.max(0, row.available * priceUsd) : 0;
    return { ...row, priceUsd, usdValue, availableUsd, priced: priceUsd > 0 };
  }).sort((a, b) => b.usdValue - a.usdValue || Math.abs(b.equity) - Math.abs(a.equity));
  const priced = balances.filter((item) => item.priced);
  return {
    accountMode: mode,
    totalUsd: priced.reduce((sum, item) => sum + item.usdValue, 0),
    availableUsd: priced.reduce((sum, item) => sum + item.availableUsd, 0),
    cashUsd: priced.filter((item) => CASH_SYMBOLS.has(item.currency)).reduce((sum, item) => sum + item.usdValue, 0),
    cryptoUsd: priced.filter((item) => !CASH_SYMBOLS.has(item.currency)).reduce((sum, item) => sum + item.usdValue, 0),
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
async function storedCredentials(admin: Db, accountId: string): Promise<KucoinCredentials> {
  const { data, error } = await admin.rpc("trader_exchange_read_secret", { p_account_id: accountId, p_provider: PROVIDER });
  if (error || !data) throw new Error("credential_not_found");
  let credentials: Partial<KucoinCredentials> = {};
  try { credentials = JSON.parse(String(data)); } catch { throw new Error("credential_not_found"); }
  if (!credentials.apiKey || !credentials.apiSecret || !credentials.passphrase || !credentials.apiVersion) throw new Error("credential_not_found");
  return credentials as KucoinCredentials;
}
async function markConnectionError(admin: Db, accountId: string, message: string) {
  await admin.from("trader_exchange_connections").update({ status: "error", last_error: message.slice(0, 240), updated_at: new Date().toISOString() })
    .eq("account_id", accountId).eq("provider", PROVIDER);
}
async function verifyAndPersist(admin: Db, userId: string, accountId: string, input: { apiKey: string; apiSecret: string; passphrase: string }) {
  const { credentials, info } = await discoverCredentials(input.apiKey, input.apiSecret, input.passphrase);
  const permissions = validateReadOnly(info);
  const mode = await accountMode(credentials);
  const summary = await balanceSummary(credentials, mode);
  const now = new Date().toISOString();
  const apiKey = String(info.apiKey || credentials.apiKey);
  const uid = String(info.uid || "");
  const row = {
    account_id: accountId,
    owner_user_id: userId,
    provider: PROVIDER,
    environment: "global",
    status: "pending",
    api_key_fingerprint: (await sha256Hex(credentials.apiKey)).slice(0, 16),
    api_key_last4: apiKey.slice(-4),
    permission_read: true,
    permission_trade: false,
    permission_withdraw: false,
    ip_restricted: null,
    external_uid_last4: uid ? uid.slice(-4) : null,
    capabilities: { balances: true, classicSpot: true, unifiedBalances: true, keyPermissionIntrospection: true, spotOrders: false, liveExecution: false, readOnly: true },
    metadata: {
      permissions,
      apiVersion: credentials.apiVersion,
      accountMode: mode,
      uidLast4: uid ? uid.slice(-4) : null,
      isMaster: info.isMaster === true,
      region: info.region || null,
      siteType: info.siteType || null,
      remark: info.remark || null,
      valuationMethod: "KuCoin account balances + public USD fiat-price marks",
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
      const passphrase = String(body.passphrase || "").trim();
      if (apiKey.length < 16 || apiSecret.length < 16 || passphrase.length < 4) return json({ error: "invalid_credentials_format" }, 400);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, { apiKey, apiSecret, passphrase }) });
    }
    if (action === "reverify") {
      const stored = await storedCredentials(admin, account.id);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, stored) });
    }
    if (action === "balances") {
      const connection = await readConnection(admin, account.id);
      if (!connection || connection.status !== "connected") throw new Error("kucoin_not_connected");
      const credentials = await storedCredentials(admin, account.id);
      const info = obj(await signedGet("/api/v1/user/api-key", credentials)) as KucoinKeyInfo;
      validateReadOnly(info);
      const mode = String(obj(connection.metadata).accountMode || "") || await accountMode(credentials);
      return json({ ok: true, ...await balanceSummary(credentials, mode), ...await publicStatus(admin, account.id) });
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
    console.error("trader-kucoin-control", message);
    const safe = message.startsWith("kucoin_") || message.includes("credential_not_found") || message.includes("real_account_required") || message.includes("credential_store_failed")
      ? message : "kucoin_control_failed";
    const status = safe.includes("real_account_required") ? 409 : safe.includes("unauthorized") ? 401 : 400;
    return json({ error: safe }, status);
  }
});
