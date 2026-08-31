import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizeLaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { requireLiveExchangeConnection } from "../_shared/trader-exchange-live-guard.ts";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://app.labnarrative.com" || origin === "https://platform.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
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
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }
function statusCode(code: string) {
  if (code === "unauthorized") return 401;
  if (code === "real_account_required") return 403;
  if (code === "position_not_found") return 404;
  if (["position_not_active","live_trading_not_enabled","core_v2_execute_disabled","idempotency_key_reuse"].includes(code)) return 409;
  return 400;
}
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts")
    .select("id,name,mode,status")
    .eq("owner_user_id", userId).eq("account_kind", "real").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return { id: String(data.id), name: String(data.name || "Real Account"), mode: String(data.mode || "shadow") };
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
    const targetId = String(body.positionId || "").trim();
    const quoteAmount = Math.round(n(body.quoteAmount, NaN) * 1e8) / 1e8;
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) throw new Error("position_not_found");
    if (!(quoteAmount > 0) || quoteAmount > 1_000_000) throw new Error("invalid_add_funds_amount");
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error("invalid_idempotency_key");

    const account = await realAccount(db, userData.user.id);
    const [{ data: control, error: controlError }, { data: gate, error: gateError }, { data: trade, error: tradeError }] = await Promise.all([
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order").eq("account_id", account.id).maybeSingle(),
      db.from("trader_v2_command_gates").select("enabled").eq("account_id", account.id).eq("command_type", "position.add_funds").maybeSingle(),
      db.from("trader_trades").select("id,client_id,pair,status,execution_mode,exchange_provider,client_state,invested").eq("account_id", account.id).eq("id", targetId).maybeSingle(),
    ]);
    if (controlError) throw controlError;
    if (gateError) throw gateError;
    if (tradeError) throw tradeError;
    if (account.mode !== "live" || !control || control.global_live_enabled !== true || control.kill_switch !== false) throw new Error("live_trading_not_enabled");
    if (gate?.enabled !== true) throw new Error("core_v2_execute_disabled");
    if (!trade) throw new Error("position_not_found");
    if (trade.status !== "Active" || trade.execution_mode !== "live") throw new Error("position_not_active");
    const maxSingleOrder = n(control.max_single_order);
    if (maxSingleOrder > 0 && quoteAmount > maxSingleOrder + 1e-9) throw new Error(`live_order_limit_exceeded:${maxSingleOrder}`);

    const state = obj(trade.client_state);
    const provider = normalizeLaunchExchangeProvider(String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"), "binance");
    await requireLiveExchangeConnection(db, account.id, provider);

    const payload = { quoteAmount };
    const validation: Json = {
      target: { type: "position", id: trade.id, clientId: trade.client_id, pair: trade.pair, provider, executionMode: trade.execution_mode },
      current: { invested: n(trade.invested) },
      requested: payload,
      limits: { maxSingleOrder, maxLiveCapital: n(control.max_live_capital) },
      queue: { durable: true, idempotent: true, sendsMarketOrder: true, providerAware: true },
    };
    const fingerprint = await sha256(canonical({ commandType: "position.add_funds", targetType: "position", targetId, payload }));
    const { data: queued, error: queueError } = await db.rpc("trader_v2_enqueue_add_funds_command", {
      p_owner_user_id: userData.user.id,
      p_account_id: account.id,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_target_id: targetId,
      p_quote_amount: quoteAmount,
      p_validation: validation,
    });
    if (queueError) throw queueError;
    const queuedRow = Array.isArray(queued) ? queued[0] : queued;
    if (!queuedRow?.command_id) throw new Error("command_enqueue_failed");

    let dispatchRequested = false;
    try {
      const { error: dispatchError } = await db.rpc("invoke_trader_v2_command_worker");
      dispatchRequested = !dispatchError;
    } catch {}

    const { data: command } = await db.from("trader_v2_commands")
      .select("id,status,mode,result,error_code,requested_at,validated_at,finished_at,attempt_count")
      .eq("id", queuedRow.command_id).eq("owner_user_id", userData.user.id).maybeSingle();
    return json(req, {
      ok: true,
      command: command || { id: queuedRow.command_id, status: queuedRow.command_status, mode: "execute" },
      replayed: queuedRow.replayed === true,
      dispatchRequested,
      message: "Add-funds order accepted by Core V2 for provider-aware execution.",
    }, queuedRow.replayed === true ? 200 : 202);
  } catch (error) {
    const code = clean(error);
    const known = new Set([
      "real_account_required","live_trading_not_enabled","core_v2_execute_disabled","position_not_found","position_not_active",
      "invalid_idempotency_key","invalid_add_funds_amount","idempotency_key_reuse","command_enqueue_failed",
      "exchange_connection_required","exchange_trade_permission_required","exchange_withdraw_permission_forbidden","exchange_live_execution_not_enabled",
    ]);
    const safe = known.has(code) || code.startsWith("live_order_limit_exceeded:") || code.startsWith("binance_") || code.startsWith("bybit_") || code.startsWith("okx_") || code.startsWith("kucoin_") ? code : "add_funds_submit_failed";
    return json(req, { error: safe }, statusCode(safe));
  }
});
