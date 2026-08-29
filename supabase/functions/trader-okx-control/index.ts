import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OKX_ORIGIN = "https://www.okx.com";
const PROVIDER = "okx";

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
type OkxEnvelope = {
  code?: string | number;
  msg?: string;
  data?: unknown[];
};
type OkxCredentials = { apiKey: string; apiSecret: string; passphrase: string };

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
async function hmacBase64(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return btoa(String.fromCharCode(...signature));
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

async function signedGet(path: string, credentials: OkxCredentials, params: Record<string, string> = {}) {
  const query = new URLSearchParams();
  for (const key of Object.keys(params).sort()) query.set(key, params[key]);
  const queryString = query.toString();
  const requestPath = `${path}${queryString ? `?${queryString}` : ""}`;
  const timestamp = new Date().toISOString();
  const signature = await hmacBase64(credentials.apiSecret, `${timestamp}GET${requestPath}`);
  const response = await fetch(`${OKX_ORIGIN}${requestPath}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "OK-ACCESS-KEY": credentials.apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": credentials.passphrase,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as OkxEnvelope | null;
  if (!response.ok) throw new Error(`okx_http_${response.status}`);
  if (!payload || String(payload.code ?? "") !== "0") {
    const code = String(payload?.code ?? "invalid_response");
    const message = String(payload?.msg || "request_failed").replace(/[^a-zA-Z0-9 .:_-]/g, "").slice(0, 160);
    throw new Error(`okx_${code}:${message}`);
  }
  return payload;
}

async function apiKeyInfo(credentials: OkxCredentials) {
  const envelope = await signedGet("/api/v5/account/config", credentials);
  const info = obj(arr(envelope.data)[0]);
  if (!Object.keys(info).length) throw new Error("okx_account_config_unavailable");
  const permissions = String(info.perm || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!permissions.includes("read_only")) throw new Error("okx_read_permission_required");
  if (permissions.includes("trade") || permissions.includes("withdraw")) throw new Error("okx_read_only_required");
  const ips = String(info.ip || "").split(",").map((item) => item.trim()).filter(Boolean);
  return { info, permissions, ips };
}

async function accountSummary(credentials: OkxCredentials) {
  const [balanceEnvelope, valuationEnvelope, fundingEnvelope] = await Promise.all([
    signedGet("/api/v5/account/balance", credentials),
    signedGet("/api/v5/asset/asset-valuation", credentials, { ccy: "USD" }),
    signedGet("/api/v5/asset/balances", credentials),
  ]);

  const account = obj(arr(balanceEnvelope.data)[0]);
  const valuation = obj(arr(valuationEnvelope.data)[0]);
  const valuationDetails = obj(valuation.details);
  const tradingBalances = arr(account.details).map(obj).map((coin) => {
    const asset = String(coin.ccy || "").toUpperCase();
    const equity = n(coin.eq);
    const available = Math.max(0, n(coin.availBal));
    const frozen = Math.max(0, n(coin.frozenBal));
    const usdValue = Math.max(0, n(coin.eqUsd));
    return { asset, equity, available, frozen, usdValue };
  }).filter((coin) => coin.asset && (Math.abs(coin.equity) > 0 || coin.usdValue > 0))
    .sort((a, b) => b.usdValue - a.usdValue);
  const fundingBalances = arr(fundingEnvelope.data).map(obj).map((coin) => ({
    asset: String(coin.ccy || "").toUpperCase(),
    balance: n(coin.bal),
    available: Math.max(0, n(coin.availBal)),
    frozen: Math.max(0, n(coin.frozenBal)),
  })).filter((coin) => coin.asset && Math.abs(coin.balance) > 0);

  return {
    totalUsd: Math.max(0, n(valuation.totalBal, n(account.totalEq))),
    tradingUsd: Math.max(0, n(valuationDetails.trading, n(account.totalEq))),
    fundingUsd: Math.max(0, n(valuationDetails.funding)),
    earnUsd: Math.max(0, n(valuationDetails.earn)),
    balances: tradingBalances,
    tradingAssetCount: tradingBalances.length,
    fundingAssetCount: fundingBalances.length,
    accountMode: String(account.acctLv || ""),
    valuationAt: valuation.ts ? String(valuation.ts) : null,
  };
}

async function storedCredentials(admin: Db, accountId: string): Promise<OkxCredentials> {
  const { data, error } = await admin.rpc("trader_exchange_read_secret", { p_account_id: accountId, p_provider: PROVIDER });
  if (error || !data) throw new Error("credential_not_found");
  let credentials: Partial<OkxCredentials> = {};
  try { credentials = JSON.parse(String(data)); } catch { throw new Error("credential_not_found"); }
  if (!credentials.apiKey || !credentials.apiSecret || !credentials.passphrase) throw new Error("credential_not_found");
  return credentials as OkxCredentials;
}

async function markConnectionError(admin: Db, accountId: string, message: string) {
  await admin.from("trader_exchange_connections")
    .update({ status: "error", last_error: message.slice(0, 240), updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("provider", PROVIDER);
}

async function verifyAndPersist(admin: Db, userId: string, accountId: string, credentials: OkxCredentials) {
  const keyInfo = await apiKeyInfo(credentials);
  const summary = await accountSummary(credentials);
  const info = keyInfo.info;
  const uid = String(info.uid || "");
  const now = new Date().toISOString();
  const fingerprint = (await sha256(credentials.apiKey)).slice(0, 16);
  const baseRow = {
    account_id: accountId,
    owner_user_id: userId,
    provider: PROVIDER,
    environment: "mainnet",
    status: "pending",
    api_key_fingerprint: fingerprint,
    api_key_last4: credentials.apiKey.slice(-4),
    permission_read: true,
    permission_trade: false,
    permission_withdraw: false,
    ip_restricted: keyInfo.ips.length > 0,
    external_uid_last4: uid.slice(-4) || null,
    capabilities: {
      balances: true,
      accountValuation: true,
      spotOrders: false,
      liveExecution: false,
      readOnly: true,
    },
    metadata: {
      label: info.label ? String(info.label) : null,
      accountLevel: info.acctLv ? String(info.acctLv) : null,
      positionMode: info.posMode ? String(info.posMode) : null,
      roleType: info.roleType ? String(info.roleType) : null,
      ipCount: keyInfo.ips.length,
    },
    last_verified_at: now,
    last_error: null,
    updated_at: now,
  };
  const { error: upsertError } = await admin.from("trader_exchange_connections").upsert(baseRow, { onConflict: "account_id,provider" });
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
    .eq("account_id", accountId)
    .eq("provider", PROVIDER);
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
      const credentials = {
        apiKey: String(body.apiKey || "").trim(),
        apiSecret: String(body.apiSecret || "").trim(),
        passphrase: String(body.passphrase || "").trim(),
      };
      if (credentials.apiKey.length < 8 || credentials.apiSecret.length < 16 || credentials.passphrase.length < 6) {
        return json({ error: "invalid_credentials_format" }, 400);
      }
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, credentials) });
    }

    if (action === "reverify") {
      const credentials = await storedCredentials(admin, account.id);
      return json({ ok: true, ...await verifyAndPersist(admin, user.id, account.id, credentials) });
    }

    if (action === "balances") {
      const connection = await readConnection(admin, account.id);
      if (!connection || connection.status !== "connected") throw new Error("okx_not_connected");
      const credentials = await storedCredentials(admin, account.id);
      return json({ ok: true, ...await accountSummary(credentials), ...await publicStatus(admin, account.id) });
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
    console.error("trader-okx-control", message);
    const safe = message.startsWith("okx_") || message.includes("credential_not_found") || message.includes("real_account_required") || message.includes("credential_store_failed")
      ? message
      : "okx_control_failed";
    const status = safe.includes("real_account_required") ? 409 : safe.includes("unauthorized") ? 401 : 400;
    return json({ error: safe }, status);
  }
});
