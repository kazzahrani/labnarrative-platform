import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { ExchangeExecutionAdapter, LaunchExchangeProvider, MarketRule, NormalizedOrder } from "https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/a1470a7a3f934c86303aab0abade107843de35ce/supabase/functions/_shared/trader-exchange.ts";
import { normalizeLaunchExchangeProvider } from "https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/a1470a7a3f934c86303aab0abade107843de35ce/supabase/functions/_shared/trader-exchange.ts";
import { createLaunchExchangeExecutionAdapter } from "https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/a1470a7a3f934c86303aab0abade107843de35ce/supabase/functions/_shared/trader-exchange-router.ts";
import { requireLiveExchangeConnection } from "https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/a1470a7a3f934c86303aab0abade107843de35ce/supabase/functions/_shared/trader-exchange-live-guard.ts";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Trade = {
  id: string; account_id: string; bot_id: string; client_id: string; pair: string; status: string;
  entry_price: number | string; average_price: number | string; quantity: number | string; invested: number | string;
  averaging_filled: number; max_averaging: number; active_orders_limit: number; take_profit_pct: number | string;
  stop_enabled: boolean; stop_pct: number | string; client_state: Json; execution_mode: string; exchange_provider: string;
};
type Bot = { id: string; safety_order: number | string; deviation: number | string; step_scale: number | string; volume_scale: number | string };
type Ledger = {
  id: string; client_order_id: string; exchange_order_id: string | null; status: string; sequence_no: number | null;
  kind: string; side: string; price: number | null; requested_quote: number; requested_qty: number; metadata: Json;
};
type Controls = { global_live_enabled: boolean; kill_switch: boolean; max_live_capital: number | string; max_single_order: number | string };

const ACTIVE = ["OPEN", "PENDING", "NEW", "PARTIALLY_FILLED"];
const LAUNCH_EXCHANGES: LaunchExchangeProvider[] = ["binance", "bybit", "okx", "kucoin"];

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
function clean(error: unknown) { return (error instanceof Error ? error.message : String(error || "unknown_error")).slice(0, 160); }
function floorStep(value: number, step: number) {
  if (!(step > 0)) return value;
  const precision = Math.max(0, Math.min(12, (String(step).split(".")[1] ?? "").replace(/0+$/, "").length));
  return Number((Math.floor((value + 1e-14) / step) * step).toFixed(precision));
}
function priceStep(value: number, step: number) { return step > 0 ? floorStep(value, step) : value; }
function orderAmount(bot: Bot, index: number) { return n(bot.safety_order) * Math.pow(Math.max(0.000001, n(bot.volume_scale, 1)), index); }
function orderPrice(bot: Bot, entry: number, index: number) {
  let cumulative = 0, step = n(bot.deviation);
  for (let i = 0; i <= index; i++) { cumulative += step; step *= Math.max(0.000001, n(bot.step_scale, 1)); }
  return entry * (1 - cumulative / 100);
}
function dbStatus(order: NormalizedOrder) {
  return order.status === "open" ? "NEW" : order.status === "partially_filled" ? "PARTIALLY_FILLED" : order.status === "filled" ? "FILLED" : order.status === "cancelled" ? "CANCELED" : order.status === "rejected" ? "REJECTED" : order.status === "expired" ? "EXPIRED" : "PENDING";
}
function orderFees(order: NormalizedOrder, asset: string) {
  return order.fills.reduce((sum, fill) => sum + (String(fill.feeAsset || "").toUpperCase() === asset.toUpperCase() ? n(fill.feeAmount) : 0), 0);
}
function netBuy(order: NormalizedOrder, rule: MarketRule) {
  const qty = Math.max(0, n(order.filledQty) - orderFees(order, rule.baseAsset));
  const quote = Math.max(0, n(order.filledQuote) + orderFees(order, rule.quoteAsset));
  return { qty, quote, average: qty > 0 ? quote / qty : n(order.averageFillPrice) };
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
function editClientId(commandId: string, sequence: number) {
  const cleanId = commandId.replace(/[^A-Za-z0-9]/g, "");
  return `LNPE${String(sequence).slice(0, 3)}${cleanId.slice(0, 24)}`.slice(0, 32);
}
async function liveExposure(db: Db, accountId: string, excludeClientOrderId = "") {
  const tradeQuery = db.from("trader_trades").select("invested").eq("account_id", accountId).eq("status", "Active").eq("execution_mode", "live");
  let orderQuery = db.from("trader_orders").select("requested_quote,client_order_id").eq("account_id", accountId).in("exchange", LAUNCH_EXCHANGES).eq("side", "BUY").in("status", ACTIVE);
  if (excludeClientOrderId) orderQuery = orderQuery.neq("client_order_id", excludeClientOrderId);
  const [{ data: trades, error: tradeError }, { data: orders, error: orderError }] = await Promise.all([tradeQuery, orderQuery]);
  if (tradeError) throw tradeError;
  if (orderError) throw orderError;
  return (trades || []).reduce((sum, row) => sum + n(row.invested), 0) + (orders || []).reduce((sum, row) => sum + n(row.requested_quote), 0);
}
async function refreshTrade(db: Db, accountId: string, tradeId: string) {
  const { data, error } = await db.from("trader_trades")
    .select("id,account_id,bot_id,client_id,pair,status,entry_price,average_price,quantity,invested,averaging_filled,max_averaging,active_orders_limit,take_profit_pct,stop_enabled,stop_pct,client_state,execution_mode,exchange_provider")
    .eq("account_id", accountId).eq("id", tradeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("position_not_found");
  return data as Trade;
}
async function loadDca(db: Db, trade: Trade, provider: LaunchExchangeProvider) {
  const { data, error } = await db.from("trader_orders")
    .select("id,client_order_id,exchange_order_id,status,sequence_no,kind,side,price,requested_quote,requested_qty,metadata")
    .eq("trade_id", trade.id).eq("exchange", provider).eq("kind", "averaging").eq("side", "BUY").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as Ledger[];
}
async function applyDcaFill(db: Db, trade: Trade, ledger: Ledger, rule: MarketRule, remote: NormalizedOrder) {
  const fill = netBuy(remote, rule);
  if (!(fill.qty > 0 && fill.quote > 0 && fill.average > 0)) return false;
  const { error } = await db.rpc("trader_fill_buy_order", {
    p_order_id: ledger.id,
    p_fill_price: fill.average,
    p_fill_quantity: fill.qty,
    p_fill_quote: fill.quote,
    p_fee_amount: 0,
    p_increment_averaging: true,
  });
  if (error) throw error;
  await db.from("trader_orders").update({
    status: "FILLED", reserved_quote: 0, exchange_order_id: remote.orderId || ledger.exchange_order_id,
    filled_qty: fill.qty, filled_quote: fill.quote, average_fill_price: fill.average,
    filled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    metadata: { ...obj(ledger.metadata), exchange: remote.provider, remote_status: remote.rawStatus, coreV2PositionEdit: true },
  }).eq("id", ledger.id);
  return true;
}
async function reconcileDcaRow(db: Db, trade: Trade, adapter: ExchangeExecutionAdapter, rule: MarketRule, ledger: Ledger, cancel = false) {
  if (!ACTIVE.includes(String(ledger.status || "").toUpperCase())) return;
  let remote = await adapter.queryOrder({ pair: trade.pair, clientOrderId: ledger.client_order_id || undefined, orderId: ledger.exchange_order_id || undefined });
  if (cancel && remote && ["open", "partially_filled", "unknown"].includes(remote.status)) {
    remote = await adapter.cancelOrder({ pair: trade.pair, clientOrderId: ledger.client_order_id || undefined, orderId: ledger.exchange_order_id || undefined })
      ?? await adapter.queryOrder({ pair: trade.pair, clientOrderId: ledger.client_order_id || undefined, orderId: ledger.exchange_order_id || undefined });
  }
  if (!remote) {
    if (String(ledger.status).toUpperCase() === "PENDING" && obj(ledger.metadata).placement_uncertain === true && !ledger.exchange_order_id) {
      await db.from("trader_orders").update({ status: "REJECTED", reserved_quote: 0, updated_at: new Date().toISOString(), metadata: { ...obj(ledger.metadata), reconciled_not_found: true } }).eq("id", ledger.id);
      return;
    }
    if (cancel) {
      await db.from("trader_orders").update({ status: "CANCELED", reserved_quote: 0, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledger.id);
      return;
    }
    throw new Error("dca_reconciliation_unavailable");
  }
  const terminal = ["filled", "cancelled", "expired", "rejected"].includes(remote.status);
  if (terminal && remote.filledQty > 0) {
    await applyDcaFill(db, trade, ledger, rule, remote);
    return;
  }
  if (cancel && !terminal) throw new Error("dca_cancel_pending");
  await db.from("trader_orders").update({
    status: dbStatus(remote), reserved_quote: terminal ? 0 : ledger.requested_quote,
    exchange_order_id: remote.orderId || ledger.exchange_order_id,
    cancelled_at: remote.status === "cancelled" ? new Date().toISOString() : null,
    filled_qty: remote.filledQty, filled_quote: remote.filledQuote, updated_at: new Date().toISOString(),
    metadata: { ...obj(ledger.metadata), exchange: remote.provider, remote_status: remote.rawStatus, coreV2PositionEdit: true },
  }).eq("id", ledger.id);
}
async function createDca(
  db: Db, commandId: string, trade: Trade, bot: Bot, controls: Controls,
  provider: LaunchExchangeProvider, adapter: ExchangeExecutionAdapter, rule: MarketRule, sequence: number,
) {
  const rawQuote = orderAmount(bot, sequence - 1);
  const maxSingleOrder = n(controls.max_single_order);
  if (!(rawQuote > 0)) throw new Error("invalid_dca_order_amount");
  if (maxSingleOrder > 0 && rawQuote > maxSingleOrder + 1e-9) throw new Error(`live_order_limit_exceeded:${maxSingleOrder}`);
  const price = priceStep(orderPrice(bot, n(trade.entry_price), sequence - 1), rule.tickSize);
  const qty = floorStep(rawQuote / price, rule.stepSize);
  const quote = qty * price;
  if (!(qty > 0) || (rule.minQty > 0 && qty < rule.minQty - 1e-15) || (rule.minNotional > 0 && quote < rule.minNotional - 1e-9)) throw new Error("dca_order_below_exchange_minimum");
  const clientOrderId = editClientId(commandId, sequence);
  const exposure = await liveExposure(db, trade.account_id, clientOrderId);
  const maxLiveCapital = n(controls.max_live_capital);
  if (maxLiveCapital > 0 && exposure + quote > maxLiveCapital + 1e-9) throw new Error(`live_capital_limit_exceeded:${maxLiveCapital}`);

  let { data: ledger, error: ledgerError } = await db.from("trader_orders")
    .select("id,client_order_id,exchange_order_id,status,sequence_no,kind,side,price,requested_quote,requested_qty,metadata")
    .eq("account_id", trade.account_id).eq("client_order_id", clientOrderId).maybeSingle();
  if (ledgerError) throw ledgerError;
  if (!ledger) {
    const now = new Date().toISOString();
    const inserted = await db.from("trader_orders").insert({
      account_id: trade.account_id, bot_id: trade.bot_id, trade_id: trade.id, client_order_id: clientOrderId,
      pair: trade.pair, kind: "averaging", side: "BUY", order_type: "LIMIT", status: "PENDING", sequence_no: sequence,
      price, requested_quote: quote, requested_qty: qty, reserved_quote: quote, exchange: provider, opened_at: now,
      metadata: { planner: "core_v2_position_edit", exchange: provider, commandId, coreV2Command: true },
    }).select("id,client_order_id,exchange_order_id,status,sequence_no,kind,side,price,requested_quote,requested_qty,metadata").single();
    if (inserted.error || !inserted.data) throw inserted.error || new Error("dca_order_ledger_failed");
    ledger = inserted.data;
  }
  const row = ledger as Ledger;
  let remote = await adapter.queryOrder({ pair: trade.pair, clientOrderId, orderId: row.exchange_order_id || undefined });
  if (!remote) {
    try {
      remote = await adapter.placeLimit({ pair: trade.pair, side: "BUY", quantity: qty, price, clientOrderId });
    } catch (placementError) {
      remote = await adapter.queryOrder({ pair: trade.pair, clientOrderId }).catch(() => null);
      if (!remote) {
        await db.from("trader_orders").update({
          status: "PENDING", updated_at: new Date().toISOString(),
          metadata: { ...obj(row.metadata), planner: "core_v2_position_edit", exchange: provider, commandId, coreV2Command: true, placement_uncertain: true, error: clean(placementError) },
        }).eq("id", row.id);
        throw new Error(`order_submission_uncertain:${clean(placementError)}`);
      }
    }
  }
  if (["filled", "cancelled", "expired", "rejected"].includes(remote.status) && remote.filledQty > 0) {
    await applyDcaFill(db, trade, row, rule, remote);
  } else {
    await db.from("trader_orders").update({
      status: dbStatus(remote), exchange_order_id: remote.orderId || row.exchange_order_id,
      reserved_quote: ["cancelled", "expired", "rejected"].includes(remote.status) ? 0 : quote,
      updated_at: new Date().toISOString(),
      metadata: { ...obj(row.metadata), planner: "core_v2_position_edit", exchange: provider, remote_status: remote.rawStatus, commandId, coreV2Command: true },
    }).eq("id", row.id);
    if (["cancelled", "expired", "rejected"].includes(remote.status)) throw new Error(`${provider}_dca_order_${remote.status}`);
  }
  await db.from("trader_broker_events").insert({
    account_id: trade.account_id, bot_id: trade.bot_id, trade_id: trade.id, order_id: row.id, mode: "live",
    event_type: "manual_dca_open_v2_command", pair: trade.pair, client_order_id: clientOrderId,
    exchange_order_id: remote.orderId || null,
    payload: { exchange: provider, sequence, price, quote, commandId, coreV2Command: true },
  });
}
function scalarTargets(value: number) { return value > 0 ? [{ profitPct: value, allocationPct: 100 }] : []; }
function targetSignature(value: unknown) {
  if (!Array.isArray(value)) return "[]";
  return JSON.stringify(value.map((raw) => {
    const row = obj(raw);
    return { profitPct: Math.round(n(row.profitPct) * 10000) / 10000, allocationPct: Math.round(n(row.allocationPct) * 10000) / 10000 };
  }).sort((a, b) => a.profitPct - b.profitPct));
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

  let commandId = "";
  let accountId = "";
  let lockId = "";
  try {
    const body = await req.json().catch(() => ({})) as Json;
    const positionId = String(body.positionId || "").trim();
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(positionId)) throw new Error("position_not_found");
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error("invalid_idempotency_key");

    let trade = await (async () => {
      const { data, error } = await db.from("trader_trades")
        .select("id,account_id,bot_id,client_id,pair,status,entry_price,average_price,quantity,invested,averaging_filled,max_averaging,active_orders_limit,take_profit_pct,stop_enabled,stop_pct,client_state,execution_mode,exchange_provider")
        .eq("id", positionId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("position_not_found");
      return data as Trade;
    })();
    accountId = trade.account_id;
    const [{ data: account, error: accountError }, { data: controls, error: controlsError }, { data: gate, error: gateError }] = await Promise.all([
      db.from("trader_accounts").select("id,owner_user_id,account_kind,mode,status").eq("id", accountId).eq("owner_user_id", userData.user.id).maybeSingle(),
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order").eq("account_id", accountId).maybeSingle(),
      db.from("trader_v2_command_gates").select("enabled").eq("account_id", accountId).eq("command_type", "position.update_trade").maybeSingle(),
    ]);
    if (accountError) throw accountError;
    if (controlsError) throw controlsError;
    if (gateError) throw gateError;
    if (!account || account.account_kind !== "real" || account.status !== "active") throw new Error("real_account_required");
    if (account.mode !== "live" || !controls || controls.global_live_enabled !== true || controls.kill_switch !== false) throw new Error("live_trading_not_enabled");
    if (gate?.enabled !== true) throw new Error("core_v2_execute_disabled");
    if (trade.status !== "Active") throw new Error("position_not_active");
    if (trade.execution_mode !== "live") throw new Error("position_not_live");

    const completed = Math.max(0, Math.round(n(trade.averaging_filled)));
    let maxAveraging = Math.max(completed, Math.min(100, Math.round(n(body.maxAveraging, trade.max_averaging))));
    const requestedActive = Math.max(0, Math.min(100 - completed, Math.round(n(body.activeOrdersLimit, trade.active_orders_limit))));
    if (requestedActive > Math.max(0, maxAveraging - completed)) maxAveraging = Math.min(100, completed + requestedActive);
    const activeOrdersLimit = Math.min(Math.max(0, maxAveraging - completed), requestedActive);
    const takeProfitPct = Math.round(Math.max(0, Math.min(1000, n(body.takeProfitPct, trade.take_profit_pct))) * 10000) / 10000;
    const state = obj(trade.client_state);
    if (state.exitStrategyV2 !== true) throw new Error("exit_strategy_v2_required");
    const stopEnabled = body.stopEnabled === undefined ? state.stopEnabled === true : body.stopEnabled === true;
    const stopPct = Math.round(Math.max(0, Math.min(1000, n(body.stopPct, n(state.stopPct, trade.stop_pct)))) * 10000) / 10000;
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");
    const provider = normalizeLaunchExchangeProvider(String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"), "binance");
    await requireLiveExchangeConnection(db, accountId, provider);

    const payload = { maxAveraging, activeOrdersLimit, takeProfitPct, stopEnabled, stopPct };
    const fingerprint = await sha256(canonical({ commandType: "position.update_trade", targetType: "position", targetId: positionId, payload }));
    const { data: existing, error: existingError } = await db.from("trader_v2_commands")
      .select("id,status,request_fingerprint,result,error_code").eq("owner_user_id", userData.user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) throw new Error("idempotency_key_reuse");
      if (existing.status === "succeeded") return json(req, { ok: true, command: existing, replayed: true });
      if (existing.status === "running") throw new Error("command_in_progress");
    }

    if (!existing) {
      const validation = {
        target: { type: "position", id: positionId, clientId: trade.client_id, pair: trade.pair, provider, executionMode: trade.execution_mode },
        current: { completedDca: completed, maxAveraging: trade.max_averaging, activeOrdersLimit: trade.active_orders_limit, takeProfitPct: n(trade.take_profit_pct), stopEnabled: state.stopEnabled === true, stopPct: n(state.stopPct, trade.stop_pct) },
        requested: payload,
        coreV2: true,
      };
      const inserted = await db.from("trader_v2_commands").insert({
        owner_user_id: userData.user.id, account_id: accountId, idempotency_key: idempotencyKey, request_fingerprint: fingerprint,
        command_type: "position.update_trade", target_type: "position", target_id: positionId, payload, mode: "execute", status: "running",
        validation, validated_at: new Date().toISOString(), started_at: new Date().toISOString(), attempt_count: 1,
      }).select("id").single();
      if (inserted.error || !inserted.data) throw inserted.error || new Error("command_insert_failed");
      commandId = String(inserted.data.id);
      await db.from("trader_v2_command_events").insert([
        { command_id: commandId, owner_user_id: userData.user.id, event_type: "received", details: { commandType: "position.update_trade", targetType: "position", targetId: positionId, mode: "execute" } },
        { command_id: commandId, owner_user_id: userData.user.id, event_type: "running", details: { provider, coreV2: true } },
      ]);
    } else {
      commandId = String(existing.id);
      await db.from("trader_v2_commands").update({ status: "running", error_code: null, finished_at: null, started_at: new Date().toISOString() }).eq("id", commandId);
    }

    lockId = crypto.randomUUID();
    const { data: locked, error: lockError } = await db.rpc("trader_begin_command", { p_account_id: accountId, p_lock_id: lockId, p_lease_seconds: 30 });
    if (lockError) throw lockError;
    if (locked !== true) throw new Error("account_busy");

    trade = await refreshTrade(db, accountId, positionId);
    if (trade.status !== "Active" || trade.execution_mode !== "live") throw new Error("position_not_active");
    const currentState = obj(trade.client_state);
    if (currentState.exitStrategyV2 !== true) throw new Error("exit_strategy_v2_required");
    const adapter = createLaunchExchangeExecutionAdapter(db, accountId, provider);
    const currentCompleted = Math.max(0, Math.round(n(trade.averaging_filled)));
    let nextMax = Math.max(currentCompleted, maxAveraging);
    const nextActive = Math.min(Math.max(0, nextMax - currentCompleted), requestedActive);
    const currentMax = Math.max(currentCompleted, Math.min(100, Math.round(n(trade.max_averaging))));
    const currentActive = Math.min(Math.max(0, currentMax - currentCompleted), Math.max(0, Math.round(n(trade.active_orders_limit))));
    const dcaChanged = nextMax !== currentMax || nextActive !== currentActive;

    if (dcaChanged) {
      const rule = await adapter.getMarketRule(trade.pair);
      for (const row of await loadDca(db, trade, provider)) if (ACTIVE.includes(String(row.status).toUpperCase())) await reconcileDcaRow(db, trade, adapter, rule, row, false);
      trade = await refreshTrade(db, accountId, positionId);
      const afterReconcileCompleted = Math.max(0, Math.round(n(trade.averaging_filled)));
      nextMax = Math.max(afterReconcileCompleted, maxAveraging);
      const desiredActive = Math.min(Math.max(0, nextMax - afterReconcileCompleted), requestedActive);
      const desired = new Set<number>();
      for (let sequence = afterReconcileCompleted + 1; sequence <= afterReconcileCompleted + desiredActive; sequence++) desired.add(sequence);
      let rows = await loadDca(db, trade, provider);
      for (const row of rows) {
        const sequence = Math.round(n(row.sequence_no));
        if (ACTIVE.includes(String(row.status).toUpperCase()) && !desired.has(sequence)) await reconcileDcaRow(db, trade, adapter, rule, row, true);
      }
      trade = await refreshTrade(db, accountId, positionId);
      const completedAfterCancel = Math.max(0, Math.round(n(trade.averaging_filled)));
      nextMax = Math.max(completedAfterCancel, maxAveraging);
      const finalActive = Math.min(Math.max(0, nextMax - completedAfterCancel), requestedActive);
      const finalDesired = new Set<number>();
      for (let sequence = completedAfterCancel + 1; sequence <= completedAfterCancel + finalActive; sequence++) finalDesired.add(sequence);
      rows = await loadDca(db, trade, provider);
      const activeBySequence = new Set(rows.filter((row) => ACTIVE.includes(String(row.status).toUpperCase())).map((row) => Math.round(n(row.sequence_no))));
      const { data: botData, error: botError } = await db.from("trader_bots").select("id,safety_order,deviation,step_scale,volume_scale").eq("id", trade.bot_id).eq("account_id", accountId).maybeSingle();
      if (botError) throw botError;
      if (!botData) throw new Error("bot_not_found");
      for (const sequence of finalDesired) if (!activeBySequence.has(sequence)) await createDca(db, commandId, trade, botData as Bot, controls as Controls, provider, adapter, rule, sequence);
    }

    trade = await refreshTrade(db, accountId, positionId);
    const finalCompleted = Math.max(0, Math.round(n(trade.averaging_filled)));
    const finalMax = Math.max(finalCompleted, Math.min(100, maxAveraging));
    const finalActiveLimit = Math.min(Math.max(0, finalMax - finalCompleted), requestedActive);
    const targets = scalarTargets(takeProfitPct);
    const finalState = obj(trade.client_state);
    const tpChanged = targetSignature(finalState.takeProfitTargets) !== targetSignature(targets);
    const now = new Date().toISOString();
    const nextState: Json = {
      ...finalState,
      exitStrategyV2: true,
      maxAveraging: finalMax,
      activeOrdersLimit: finalActiveLimit,
      manualEditAt: now,
      exchange: provider,
      exchangeProvider: provider,
      stopEnabled,
      stopPct,
      takeProfitTargets: targets,
    };
    delete nextState.stopLossTriggeredAt;
    if (tpChanged) {
      nextState.takeProfitFilled = [];
      nextState.takeProfitPlanUpdatedAt = now;
    }
    const updated = await db.from("trader_trades").update({
      max_averaging: finalMax,
      active_orders_limit: finalActiveLimit,
      take_profit_pct: takeProfitPct,
      stop_enabled: false,
      stop_pct: stopPct,
      client_state: nextState,
      updated_at: now,
    }).eq("id", positionId).eq("account_id", accountId).eq("status", "Active").select("id").maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("position_not_active");

    const result = {
      executed: true,
      commandType: "position.update_trade",
      positionId,
      clientId: trade.client_id,
      pair: trade.pair,
      provider,
      maxAveraging: finalMax,
      activeOrdersLimit: finalActiveLimit,
      completedDca: finalCompleted,
      takeProfitPct,
      stopEnabled,
      stopPct,
      dcaReconciled: dcaChanged,
      tpPlanReplaced: tpChanged,
      appliedAt: now,
    };
    await db.from("trader_broker_events").insert({
      account_id: accountId, bot_id: trade.bot_id, trade_id: positionId, order_id: null, mode: "live",
      event_type: "manual_trade_updated_v2_command", pair: trade.pair, client_order_id: null, exchange_order_id: null,
      payload: { ...result, commandId, coreV2Command: true },
    });
    await db.from("trader_v2_commands").update({ status: "succeeded", result, error_code: null, finished_at: now, worker_lock_id: null, worker_locked_until: null }).eq("id", commandId);
    await db.from("trader_v2_command_events").insert({ command_id: commandId, owner_user_id: userData.user.id, event_type: "succeeded", details: result });
    return json(req, { ok: true, command: { id: commandId, status: "succeeded", result }, replayed: false });
  } catch (error) {
    const code = clean(error);
    if (commandId) {
      const now = new Date().toISOString();
      await db.from("trader_v2_commands").update({ status: "failed", error_code: code, result: { executed: false, errorCode: code }, finished_at: now }).eq("id", commandId).neq("status", "succeeded").catch(() => undefined);
      await db.from("trader_v2_command_events").insert({ command_id: commandId, owner_user_id: userData.user.id, event_type: "failed", details: { errorCode: code } }).catch(() => undefined);
    }
    const known = code === "real_account_required" || code === "live_trading_not_enabled" || code === "core_v2_execute_disabled" || code === "position_not_found" || code === "position_not_active" || code === "position_not_live" || code === "exit_strategy_v2_required" || code === "invalid_idempotency_key" || code === "idempotency_key_reuse" || code === "command_in_progress" || code === "invalid_stop_loss" || code === "bot_not_found" || code === "dca_order_below_exchange_minimum" || code === "dca_reconciliation_unavailable" || code === "dca_cancel_pending" || code === "account_busy" || code === "exchange_connection_required" || code === "exchange_trade_permission_required" || code === "exchange_withdraw_permission_forbidden" || code.startsWith("live_order_limit_exceeded:") || code.startsWith("live_capital_limit_exceeded:") || code.startsWith("order_submission_uncertain:") || code.startsWith("binance_") || code.startsWith("bybit_") || code.startsWith("okx_") || code.startsWith("kucoin_") || code.startsWith("gateway_");
    return json(req, { error: known ? code : "position_edit_failed" }, code === "real_account_required" ? 403 : code === "position_not_found" ? 404 : code === "core_v2_execute_disabled" || code === "command_in_progress" || code === "account_busy" ? 409 : 400);
  } finally {
    if (accountId && lockId) await db.rpc("trader_release_account", { p_account_id: accountId, p_worker_id: lockId }).catch(() => undefined);
  }
});
