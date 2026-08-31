import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizeLaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { requireLiveExchangeConnection } from "../_shared/trader-exchange-live-guard.ts";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Target = { profitPct: number; allocationPct: number };

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://app.labnarrative.com" || origin === "https://platform.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://app.labnarrative.com",
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
  if (code === "position_not_active" || code === "live_trading_not_enabled" || code === "idempotency_key_reuse") return 409;
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
function normalizeTargets(value: unknown): Target[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new Error("invalid_take_profit_targets");
  if (value.length === 0) return [];
  let allocation = 0;
  const result = value.map((raw) => {
    const row = obj(raw);
    const profitPct = Math.round(n(row.profitPct, NaN) * 10000) / 10000;
    const allocationPct = Math.round(n(row.allocationPct, NaN) * 10000) / 10000;
    if (!(profitPct > 0) || !(allocationPct > 0) || allocationPct > 100) throw new Error("invalid_take_profit_targets");
    allocation += allocationPct;
    return { profitPct, allocationPct };
  }).sort((a, b) => a.profitPct - b.profitPct);
  if (Math.abs(allocation - 100) > 0.011) throw new Error("take_profit_allocation_must_equal_100");
  return result;
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
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) throw new Error("position_not_found");
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error("invalid_idempotency_key");

    const account = await realAccount(db, userData.user.id);
    if (account.mode !== "live") throw new Error("live_trading_not_enabled");
    const [{ data: control, error: controlError }, { data: trade, error: tradeError }] = await Promise.all([
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch").eq("account_id", account.id).maybeSingle(),
      db.from("trader_trades").select("id,client_id,pair,status,execution_mode,exchange_provider,client_state,stop_enabled,stop_pct").eq("account_id", account.id).eq("id", targetId).maybeSingle(),
    ]);
    if (controlError) throw controlError;
    if (tradeError) throw tradeError;
    if (!control || control.global_live_enabled !== true || control.kill_switch !== false) throw new Error("live_trading_not_enabled");
    if (!trade) throw new Error("position_not_found");
    if (trade.status !== "Active" || trade.execution_mode !== "live") throw new Error("position_not_active");

    const state = obj(trade.client_state);
    if (state.exitStrategyV2 !== true) throw new Error("exit_strategy_v2_required");
    const provider = normalizeLaunchExchangeProvider(String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"), "binance");
    await requireLiveExchangeConnection(db, account.id, provider);

    const stopEnabled = body.stopEnabled === undefined ? (typeof state.stopEnabled === "boolean" ? state.stopEnabled : trade.stop_enabled === true) : body.stopEnabled === true;
    const stopPct = body.stopPct === undefined ? n(state.stopPct, n(trade.stop_pct)) : n(body.stopPct, NaN);
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");
    const takeProfitTargets = normalizeTargets(body.takeProfitTargets);
    const payload: Json = { stopEnabled, stopPct };
    if (takeProfitTargets !== undefined) payload.takeProfitTargets = takeProfitTargets;
    const requested: Json = { stopEnabled, stopPct };
    if (takeProfitTargets !== undefined) requested.takeProfitTargets = takeProfitTargets;
    const validation: Json = {
      target: { type: "position", id: trade.id, clientId: trade.client_id, pair: trade.pair, provider, executionMode: trade.execution_mode },
      current: {
        exitStrategyV2: true,
        stopEnabled: typeof state.stopEnabled === "boolean" ? state.stopEnabled : trade.stop_enabled === true,
        stopPct: n(state.stopPct, n(trade.stop_pct)),
        takeProfitTargets: Array.isArray(state.takeProfitTargets) ? state.takeProfitTargets : [],
      },
      requested,
      queue: { durable: true, idempotent: true, noOrderSentByCommand: true },
    };
    const fingerprint = await sha256(canonical({ commandType: "position.update_exit_plan", targetType: "position", targetId, payload }));
    const { data: queued, error: queueError } = await db.rpc("trader_v2_enqueue_exit_plan_command", {
      p_owner_user_id: userData.user.id,
      p_account_id: account.id,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_target_id: targetId,
      p_payload: payload,
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
      message: "Exit-plan update accepted. No market order is sent by this command.",
    }, queuedRow.replayed === true ? 200 : 202);
  } catch (error) {
    const code = clean(error);
    const known = new Set([
      "real_account_required","live_trading_not_enabled","position_not_found","position_not_active","exit_strategy_v2_required",
      "invalid_idempotency_key","invalid_stop_loss","invalid_take_profit_targets","take_profit_allocation_must_equal_100","idempotency_key_reuse",
      "binance_not_connected","binance_trade_permission_required","binance_connection_not_safe","exchange_connection_required",
      "exchange_trade_permission_required","exchange_withdraw_permission_forbidden",
    ]);
    return json(req, { error: known.has(code) ? code : "exit_plan_submit_failed" }, statusCode(known.has(code) ? code : "exit_plan_submit_failed"));
  }
});
