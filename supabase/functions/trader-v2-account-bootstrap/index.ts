import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
type AccountKind = "paper" | "real";
const SUPPORTED_PROVIDERS = new Set(["binance", "bybit", "okx", "kucoin"]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://platform.labnarrative.com" || origin === "https://app.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://platform.labnarrative.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" } });
}
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function newAccessHash() { return await sha256(`${crypto.randomUUID()}:${crypto.randomUUID()}:${Date.now()}`); }

async function ownedAccount(db: Db, userId: string, kind: AccountKind) {
  const { data, error } = await db.from("trader_accounts").select("id")
    .eq("owner_user_id", userId).eq("account_kind", kind).eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}
async function ensurePaperAccount(db: Db, userId: string) {
  const existing = await ownedAccount(db, userId, "paper");
  if (existing) return existing;
  const { data, error } = await db.from("trader_accounts").insert({
    owner_user_id: userId, account_kind: "paper", access_token_hash: await newAccessHash(), name: "Paper Account",
    mode: "paper", status: "active", quote_asset: "USDT", starting_balance: 100000, fee_bps: 0,
  }).select("id").single();
  if (!error && data?.id) return String(data.id);
  if (error?.code === "23505") {
    const raced = await ownedAccount(db, userId, "paper");
    if (raced) return raced;
  }
  throw error ?? new Error("paper_account_create_failed");
}
async function ensureRealControls(db: Db, userId: string, accountId: string) {
  const { data, error } = await db.from("trader_execution_controls").select("account_id").eq("account_id", accountId).maybeSingle();
  if (error) throw error;
  if (data) return;
  const { error: insertError } = await db.from("trader_execution_controls").insert({
    account_id: accountId, global_live_enabled: false, kill_switch: true, max_live_capital: 0, max_single_order: 0,
    max_concurrent_live_trades: 1, daily_loss_limit: 0, live_confirmed_at: null, updated_by: userId, updated_at: new Date().toISOString(),
  });
  if (insertError && insertError.code !== "23505") throw insertError;
}
async function ensureRealAccount(db: Db, userId: string) {
  const existing = await ownedAccount(db, userId, "real");
  if (existing) { await ensureRealControls(db, userId, existing); return existing; }
  const { data, error } = await db.from("trader_accounts").insert({
    owner_user_id: userId, account_kind: "real", access_token_hash: await newAccessHash(), name: "Real Account",
    mode: "shadow", status: "active", quote_asset: "USDT", starting_balance: 0, fee_bps: 0,
  }).select("id").single();
  let accountId = data?.id ? String(data.id) : "";
  if (error) {
    if (error.code !== "23505") throw error;
    accountId = (await ownedAccount(db, userId, "real")) || "";
    if (!accountId) throw error;
  }
  await ensureRealControls(db, userId, accountId);
  return accountId;
}
async function accountsForUser(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts")
    .select("id,account_kind,name,mode,status,quote_asset,starting_balance,created_at")
    .eq("owner_user_id", userId).eq("status", "active").order("created_at", { ascending: true });
  if (error) throw error;
  const accounts = (data ?? []) as Json[];
  const ids = accounts.map((account) => String(account.id || "")).filter(Boolean);
  const connectionState = new Map<string, { connected: boolean; last4: string | null }>();
  if (ids.length) {
    const [exchangeResult, binanceResult] = await Promise.all([
      db.from("trader_exchange_connections").select("account_id,provider,status").in("account_id", ids),
      db.from("trader_binance_connections").select("account_id,status,api_key_last4").in("account_id", ids),
    ]);
    if (exchangeResult.error) throw exchangeResult.error;
    if (binanceResult.error) throw binanceResult.error;
    for (const row of exchangeResult.data ?? []) {
      const accountId = String(row.account_id || ""), provider = String(row.provider || "").toLowerCase();
      if (!accountId || !SUPPORTED_PROVIDERS.has(provider) || String(row.status || "").toLowerCase() !== "connected") continue;
      const current = connectionState.get(accountId) ?? { connected: false, last4: null };
      connectionState.set(accountId, { ...current, connected: true });
    }
    for (const row of binanceResult.data ?? []) {
      const accountId = String(row.account_id || "");
      if (!accountId) continue;
      const current = connectionState.get(accountId) ?? { connected: false, last4: null };
      connectionState.set(accountId, {
        connected: current.connected || String(row.status || "").toLowerCase() === "connected",
        last4: row.api_key_last4 ? String(row.api_key_last4) : current.last4,
      });
    }
  }
  return accounts.map((account) => {
    const accountId = String(account.id || ""), state = connectionState.get(accountId);
    return {
      id: accountId,
      name: String(account.name || (account.account_kind === "paper" ? "Paper Account" : "Real Account")),
      kind: String(account.account_kind || "real"),
      mode: String(account.mode || (account.account_kind === "paper" ? "paper" : "shadow")),
      status: String(account.status || "active"),
      quoteAsset: String(account.quote_asset || "USDT"),
      startingBalance: n(account.starting_balance),
      exchangeStatus: state?.connected ? "connected" : "disconnected",
      apiKeyLast4: state?.last4 ?? null,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(req, { error: "server_configuration_missing" }, 500);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(req, { error: "unauthorized" }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({})) as Json;
    const action = String(body.action || "bootstrap");
    if (action === "bootstrap") await Promise.all([ensurePaperAccount(db, userData.user.id), ensureRealAccount(db, userData.user.id)]);
    else if (action !== "list") return json(req, { error: "unsupported_account_action" }, 400);
    return json(req, { ok: true, accounts: await accountsForUser(db, userData.user.id), defaultAccount: "real", coreV2: true });
  } catch (error) {
    console.error("trader-v2-account-bootstrap", error);
    return json(req, { error: "trader_v2_account_bootstrap_failed" }, 400);
  }
});
