import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizeLaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { requireLiveExchangeConnection } from "../_shared/trader-exchange-live-guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Trade = {
  id: string;
  account_id: string;
  bot_id: string;
  client_id: string;
  pair: string;
  status: string;
  averaging_filled: number;
  max_averaging: number;
  active_orders_limit: number;
  stop_enabled: boolean;
  stop_pct: number | string;
  client_state: Json;
  execution_mode: string;
  exchange_provider: string;
};

type DcaShape = {
  completed: number;
  maxAveraging: number;
  activeOrdersLimit: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}
function n(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}
function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function clean(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}
function dcaShape(trade: Trade, body: Json): { current: DcaShape; requested: DcaShape; changed: boolean } {
  const completed = Math.max(0, Math.round(n(trade.averaging_filled)));
  const currentMax = Math.max(completed, Math.min(100, Math.round(n(trade.max_averaging))));
  const currentRemaining = Math.max(0, currentMax - completed);
  const currentActive = Math.min(currentRemaining, Math.max(0, Math.round(n(trade.active_orders_limit))));
  const requestedMax = Math.max(completed, Math.min(100, Math.round(n(body.maxAveraging, trade.max_averaging))));
  const requestedRemaining = Math.max(0, requestedMax - completed);
  const requestedActive = Math.min(
    requestedRemaining,
    Math.max(0, Math.round(n(body.activeOrdersLimit, trade.active_orders_limit))),
  );
  return {
    current: { completed, maxAveraging: currentMax, activeOrdersLimit: currentActive },
    requested: { completed, maxAveraging: requestedMax, activeOrdersLimit: requestedActive },
    changed: requestedMax !== currentMax || requestedActive !== currentActive,
  };
}
async function forwardCore(req: Request, url: string, body: Json) {
  const headers = new Headers({ "content-type": "application/json" });
  const authorization = req.headers.get("Authorization");
  if (authorization) headers.set("Authorization", authorization);
  const apiKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (apiKey) headers.set("apikey", apiKey);
  const response = await fetch(`${url}/functions/v1/trader-live-trade-control-core`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) responseHeaders.set(key, value);
  responseHeaders.set("cache-control", "no-store");
  return new Response(await response.text(), { status: response.status, headers: responseHeaders });
}
async function ownedTrade(db: Db, accountId: string, tradeId: string) {
  const { data, error } = await db.from("trader_trades")
    .select("id,account_id,bot_id,client_id,pair,status,averaging_filled,max_averaging,active_orders_limit,stop_enabled,stop_pct,client_state,execution_mode,exchange_provider")
    .eq("account_id", accountId)
    .eq("client_id", tradeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("trade_not_found");
  return data as Trade;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_configuration_missing" }, 500);

  const body = await req.json().catch(() => ({})) as Json;
  const action = String(body.action || "");
  if (action !== "update_trade") return forwardCore(req, url, body);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  let accountId = "";
  let lockId = "";
  try {
    accountId = String(body.accountId || "").trim();
    const tradeId = String(body.tradeId || "").trim();
    if (!accountId) throw new Error("account_id_required");
    if (!tradeId) throw new Error("trade_id_required");

    const { data: account, error: accountError } = await admin.from("trader_accounts")
      .select("id,owner_user_id,account_kind,mode,status")
      .eq("id", accountId)
      .eq("owner_user_id", userData.user.id)
      .eq("account_kind", "real")
      .eq("status", "active")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new Error("real_account_required");

    const { data: control, error: controlError } = await admin.from("trader_execution_controls")
      .select("global_live_enabled,kill_switch")
      .eq("account_id", accountId)
      .single();
    if (controlError || !control) throw new Error("execution_controls_missing");
    if (account.mode !== "live" || control.global_live_enabled !== true || control.kill_switch !== false) {
      throw new Error("live_trading_not_enabled");
    }

    let trade = await ownedTrade(admin, accountId, tradeId);
    if (trade.status !== "Active") throw new Error("trade_not_active");
    if (trade.execution_mode !== "live") throw new Error("trade_not_live");
    let state = obj(trade.client_state);
    let dca = dcaShape(trade, body);

    if (state.exitStrategyV2 !== true || dca.changed) return forwardCore(req, url, body);

    lockId = crypto.randomUUID();
    const { data: locked, error: lockError } = await admin.rpc("trader_begin_exit_command", {
      p_account_id: accountId,
      p_lock_id: lockId,
      p_lease_seconds: 31,
    });
    if (lockError) throw lockError;
    if (locked !== true) throw new Error("account_busy");

    trade = await ownedTrade(admin, accountId, tradeId);
    if (trade.status !== "Active") throw new Error("trade_not_active");
    if (trade.execution_mode !== "live") throw new Error("trade_not_live");
    state = obj(trade.client_state);
    dca = dcaShape(trade, body);
    if (state.exitStrategyV2 !== true || dca.changed) {
      await admin.rpc("trader_release_exit_account", { p_account_id: accountId, p_worker_id: lockId });
      lockId = "";
      return forwardCore(req, url, body);
    }

    const provider = normalizeLaunchExchangeProvider(trade.exchange_provider, "binance");
    await requireLiveExchangeConnection(admin, accountId, provider);

    const stateStopEnabled = typeof state.stopEnabled === "boolean" ? state.stopEnabled : trade.stop_enabled === true;
    const stopEnabled = body.stopEnabled === undefined ? stateStopEnabled : bool(body.stopEnabled, stateStopEnabled);
    const stateStopPct = n(state.stopPct, n(trade.stop_pct));
    const stopPct = Math.max(0, n(body.stopPct, stateStopPct));
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");

    const now = new Date().toISOString();
    const nextState: Json = {
      ...state,
      exitStrategyV2: true,
      maxAveraging: dca.current.maxAveraging,
      activeOrdersLimit: dca.current.activeOrdersLimit,
      manualEditAt: now,
      exchange: provider,
      exchangeProvider: provider,
      stopEnabled,
      stopPct,
    };
    delete nextState.stopLossTriggeredAt;

    const { data: updated, error: updateError } = await admin.from("trader_trades").update({
      stop_enabled: false,
      stop_pct: stopPct,
      client_state: nextState,
      updated_at: now,
    }).eq("id", trade.id).eq("status", "Active").eq("execution_mode", "live").select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error("trade_not_active");

    await admin.from("trader_broker_events").insert({
      account_id: accountId,
      bot_id: trade.bot_id,
      trade_id: trade.id,
      order_id: null,
      mode: "live",
      event_type: "manual_trade_updated",
      pair: trade.pair,
      client_order_id: null,
      exchange_order_id: null,
      payload: {
        exchange: provider,
        maxAveraging: dca.current.maxAveraging,
        activeOrdersLimit: dca.current.activeOrdersLimit,
        stopEnabled,
        stopPct,
        exitStrategyV2: true,
        dcaReconciled: false,
        noOrderSent: true,
      },
    });

    return json({
      ok: true,
      action: "update_trade",
      result: {
        exchange: provider,
        maxAveraging: dca.current.maxAveraging,
        activeOrdersLimit: dca.current.activeOrdersLimit,
        stopEnabled,
        stopPct,
        exitStrategyV2: true,
        dcaReconciled: false,
      },
    });
  } catch (error) {
    const message = clean(error);
    console.error("trader-live-trade-control-dispatch", message);
    const publicErrors = [
      "real_account_required",
      "execution_controls_missing",
      "live_trading_not_enabled",
      "trade_not_found",
      "trade_not_active",
      "trade_not_live",
      "account_id_required",
      "trade_id_required",
      "invalid_stop_loss",
      "account_busy",
      "binance_not_connected",
      "binance_trade_permission_required",
      "binance_connection_not_safe",
      "exchange_connection_required",
      "exchange_trade_permission_required",
      "exchange_withdraw_permission_forbidden",
      "exchange_live_execution_not_enabled",
    ];
    const safe = publicErrors.includes(message) || message.startsWith("binance_") || message.startsWith("bybit_") ||
        message.startsWith("okx_") || message.startsWith("kucoin_") || message.startsWith("gateway_")
      ? message
      : "live_trade_control_failed";
    return json({ error: safe }, safe === "real_account_required" ? 403 : 400);
  } finally {
    if (accountId && lockId) {
      await admin.rpc("trader_release_exit_account", { p_account_id: accountId, p_worker_id: lockId }).catch(() => undefined);
    }
  }
});
