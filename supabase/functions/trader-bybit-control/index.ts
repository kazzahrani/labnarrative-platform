import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BYBIT_ORIGIN = "https://api.bybit.com";
const PROVIDER = "bybit";
const RECV_WINDOW = "5000";

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

type BybitEnvelope = {
  retCode?: number;
  retMsg?: string;
  result?: unknown;
  time?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}
function cleanError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "unknown_error");
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
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ownerRealAccount(admin: Db, userId: string) {
  const { data, error } = await admin.from("trader_accounts")
    .select("id,owner_user_id,account_kind,status")
    .eq("owner_user_id", userId)
    .eq("account_kind", "real")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("real_account_required");
  return data as RealAccount;
}

async function readConnection(admin: Db, accountId: string) {
  const { data, error } = await admin.from("trader_exchange_connections")
    .select("id,account_id,status,environment,api_key_last4,permission_read,permission_trade,permission_withdraw,ip_restricted,external_uid_last4,capabilities,metadata,last_verified_at,last_error")
    .eq("account_id", accountId)
    .eq("provider", PROVIDER)
    .maybeSingle();
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

async function signedGet(path: string, apiKey: string, apiSecret: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams();
  for (const key of Object.keys(params).sort()) query.set(key, params[key]);
  const queryString = query.toString();
  const timestamp = String(Date.now());
  const signature = await hmacHex(apiSecret, `${timestamp}${apiKey}${RECV_WINDOW}${queryString}`);
  const url = `${BYBIT_ORIGIN}${path}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
      "X-BAPI-SIGN": signature,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as BybitEnvelope | null;
  if (!response.ok) throw new Error(`bybit_http_${response.status}`);
  if (!payload || Number(payload.retCode ?? -1) !== 0) {
    const code = String(payload?.retCode ?? "invalid_response");
    const message = String(payload?.retMsg || "request_failed").replace(/[^a-zA-Z0-9 .:_-]/g, "").slice(0, 160);
    throw new Error(`bybit_${code}:${message}`);
  }
  return payload;
}

async function apiKeyInfo(apiKey: string, apiSecret: string) {
  const envelope = await signedGet("/v5/user/query-api", apiKey, apiSecret);
  const result = obj(envelope.result);
  if (n(result.readOnly, -1) !== 1) throw new Error("bybit_read_only_required");
  if (n(result.uta, 0) !== 1) throw new Error("bybit_unified_account_required");
  const permissions = obj(result.permissions);
  const walletPermissions = arr(permissions.Wallet).map((item) => String(item));
  const ips = arr(result.ips).map((item) => String(item)).filter(Boolean);
  return {
    result,
    ips,
    readOnly: true,
    permissionWithdraw: walletPermissions.includes("Withdraw"),
  };
}

function walletSummary(envelope: BybitEnvelope) {
  const result = obj(envelope.result);
  const account = obj(arr(result.list)[0]);
  if (!Object.keys(account).length || String(account.accountType || "") !== "UNIFIED") {
    throw new Error("bybit_wallet_balance_unavailable");
  }
  const balances = arr(account.coin).map(obj).map((coin) => {
    const asset = String(coin.coin || "").toUpperCase();
    const equity = n(coin.equity);
    const walletBalance = n(coin.walletBalance);
    const locked = Math.max(0, n(coin.locked));
    const usdValue = Math.max(0, n(coin.usdValue));
    return {
      asset,
      equity,
      walletBalance,
      free: Math.max(0, walletBalance - locked),
      locked,
      usdValue,
    };
  }).filter((coin) => coin.asset && (Math.abs(coin.equity) > 0 || Math.abs(coin.walletBalance) > 0 || coin.usdValue > 0))
    .sort((a, b) => b.usdValue - a.usdValue);
  return {
    balances,
    totalUsd: Math.max(0, n(account.totalEquity)),
    availableUsd: Math.max(0, n(account.totalAvailableBalance)),
    accountType: "UNIFIED",
    serverTime: envelope.time ?? null,
  };
}

async function walletBalances(apiKey: string, apiSecret: string) {
  return walletSummary(await signedGet("/v5/account/wallet-balance", apiKey, apiSecret, { accountType: "UNIFIED" }));
}

async function storedCredentials(admin: Db, accountId: string) {
  const { data, error } = await admin.rpc("trader_exchange_read_secret", { p_account_id: accountId, p_provider: PROVIDER });
  if (error || !data) throw new Error("credential_not_found");
  let credentials: { apiKey?: string; apiSecret?: string } = {};
  try { credentials = JSON.parse(String(data)); } catch { throw new Error("credential_not_found"); }
  if (!credentials.apiKey || !credentials.apiSecret) throw new Error("credential_not_found");
  return { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret };
}

async function verifyAndPersist(admin: Db, userId: string, accountId: string, apiKey: string, apiSecret: string) {
  const keyInfo = await apiKeyInfo(apiKey, apiSecret);
  const balances = await walletBalances(apiKey, apiSecret);
  const info = keyInfo.result;
  const uid = String(info.userID || "");
  const fingerprint = (await sha256(apiKey)).slice(0, 16);
  const now = new Date().toISOString();
  const row = {
    account_id: accountId,
    owner_user_id: userId,
    provider: PROVIDER,
    environment: "mainnet",
    status: "connected",
    api_key_fingerprint: fingerprint,
    api_key_last4: apiKey.slice(-4),
    permission_read: true,
    permission_trade: false,
    permission_withdraw: false,
    ip_restricted: keyInfo.ips.length > 0,
    external_uid_last4: uid.slice(-4) || null,
    capabilities: {
      balances: true,
      spotOrders: false,
      liveExecution: false,
      readOnly: true,
    },
    metadata: {
      uta: n(info.uta, 0),
      keyType: n(info.type, 0),
      ipCount: keyInfo.ips.length,
      deadlineDay: info.deadlineDay ?? null,
      expiredAt: info.expiredAt ?? null,
      createdAt: info.createdAt ?? null,
      kycRegion: info.kycRegion ? String(info.kycRegion) : null,
    },
    last_verified_at: now,
    last_error: null,
    updated_at: now,
  };
  const { error } = await admin.from("trader_exchange_connections").upsert(row, { onConflict: "account_id,provider" });
  if (error) throw error;
  const { error: secretError } = await admin.rpc("trader_exchange_store_secret", {
    p_account_id: accountId,
    p_owner_user_id: userId,
    p_provider: PROVIDER,
    p_secret: JSON.stringify({ apiKey, apiSecret }),
  });
  if (secretError) throw secretError;
  return { ...await publicStatus(admin, accountId), ...balances };
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
      if (apiKey.length < 8 || apiSecret.length < 16) return json({ error: "invalid_credentials_format" }, 400);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, apiKey, apiSecret) });
    }

    if (action === "reverify") {
      const credentials = await storedCredentials(admin, account.id);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, credentials.apiKey, credentials.apiSecret) });
    }

    if (action === "balances") {
      const connection = await readConnection(admin, account.id);
      if (!connection || connection.status !== "connected") throw new Error("bybit_not_connected");
      const credentials = await storedCredentials(admin, account.id);
      return json({ ok: true, ...await walletBalances(credentials.apiKey, credentials.apiSecret), ...await publicStatus(admin, account.id) });
    }

    if (action === "disconnect") {
      const { error } = await admin.from("trader_exchange_connections")
        .update({
          status: "disconnected",
          permission_read: false,
          permission_trade: false,
          permission_withdraw: false,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", account.id)
        .eq("provider", PROVIDER);
      if (error) throw error;
      return json({ ok: true, ...await publicStatus(admin, account.id) });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = cleanError(error);
    console.error("trader-bybit-control", message);
    const safe = message.startsWith("bybit_") || message.includes("credential_not_found") || message.includes("real_account_required")
      ? message
      : "bybit_control_failed";
    const status = safe.includes("real_account_required") ? 409 : safe.includes("unauthorized") ? 401 : 400;
    return json({ error: safe }, status);
  }
});
