import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { ExchangeExecutionAdapter, LaunchExchangeProvider, MarketRule, NormalizedOrder } from "../_shared/trader-exchange.ts";
import { normalizeLaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { createLaunchExchangeExecutionAdapter } from "../_shared/trader-exchange-router.ts";
import { requireLiveExchangeConnection } from "../_shared/trader-exchange-live-guard.ts";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Command = {
  id: string;
  owner_user_id: string;
  account_id: string;
  command_type: string;
  target_id: string | null;
  validation: Json | null;
  attempt_count: number;
};

type AddFundsTrade = {
  id: string;
  bot_id: string;
  pair: string;
  status: string;
  execution_mode: string;
  exchange_provider: string;
  client_state: Json;
};

const ACTIVE_ORDER_STATUSES = ["OPEN", "PENDING", "NEW", "PARTIALLY_FILLED"];
const LAUNCH_EXCHANGES: LaunchExchangeProvider[] = ["binance", "bybit", "okx", "kucoin"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(error: unknown) { return (error instanceof Error ? error.message : String(error || "unknown_error")).slice(0, 160); }
async function verify(db: Db, value: string) {
  if (!value) return false;
  const { data, error } = await db.from("trader_worker_secrets").select("secret").eq("name", "paper_worker").maybeSingle();
  return !error && data?.secret === value;
}
function retryDelay(attempt: number) { return Math.min(20, Math.max(1, Math.pow(2, Math.min(4, Math.max(0, attempt - 1))))); }
async function retryOrFail(db: Db, command: Command, workerId: string, error: unknown) {
  const code = clean(error);
  const attempt = Math.max(1, Math.round(n(command.attempt_count, 1)));
  const retryable = code === "account_busy" || code === "order_pending" || code.startsWith("order_submission_uncertain:");
  if (retryable && attempt < 12) {
    const delay = retryDelay(attempt);
    await db.rpc("trader_v2_requeue_command", { p_command_id: command.id, p_worker_id: workerId, p_error_code: code, p_delay_seconds: delay });
    return { id: command.id, ok: false, retrying: true, error: code, delaySeconds: delay };
  }
  await db.rpc("trader_v2_fail_command", { p_command_id: command.id, p_worker_id: workerId, p_error_code: code });
  return { id: command.id, ok: false, retrying: false, error: code };
}
function dbStatus(order: NormalizedOrder) {
  return order.status === "open" ? "NEW" : order.status === "partially_filled" ? "PARTIALLY_FILLED" : order.status === "filled" ? "FILLED" : order.status === "cancelled" ? "CANCELED" : order.status === "rejected" ? "REJECTED" : order.status === "expired" ? "EXPIRED" : "PENDING";
}
function addFundsClientId(commandId: string) {
  return `LNAF${commandId.replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`.slice(0, 32);
}
function orderFees(order: NormalizedOrder, asset: string) {
  return order.fills.reduce((sum, fill) => sum + (String(fill.feeAsset || "").toUpperCase() === asset.toUpperCase() ? n(fill.feeAmount) : 0), 0);
}
function netBuy(order: NormalizedOrder, rule: MarketRule) {
  const netQty = Math.max(0, n(order.filledQty) - orderFees(order, rule.baseAsset));
  const cost = Math.max(0, n(order.filledQuote) + orderFees(order, rule.quoteAsset));
  return { netQty, cost, average: netQty > 0 ? cost / netQty : n(order.averageFillPrice) };
}
async function liveExposure(db: Db, accountId: string, excludeClientOrderId = "") {
  const tradeQuery = db.from("trader_trades").select("invested").eq("account_id", accountId).eq("status", "Active").eq("execution_mode", "live");
  let orderQuery = db.from("trader_orders").select("requested_quote,client_order_id").eq("account_id", accountId).in("exchange", LAUNCH_EXCHANGES).eq("side", "BUY").in("status", ACTIVE_ORDER_STATUSES);
  if (excludeClientOrderId) orderQuery = orderQuery.neq("client_order_id", excludeClientOrderId);
  const [{ data: trades, error: tradeError }, { data: orders, error: orderError }] = await Promise.all([tradeQuery, orderQuery]);
  if (tradeError) throw tradeError;
  if (orderError) throw orderError;
  return (trades || []).reduce((sum, row) => sum + n(row.invested), 0) + (orders || []).reduce((sum, row) => sum + n(row.requested_quote), 0);
}
async function adapterFor(db: Db, accountId: string, provider: LaunchExchangeProvider): Promise<ExchangeExecutionAdapter> {
  await requireLiveExchangeConnection(db, accountId, provider);
  return createLaunchExchangeExecutionAdapter(db, accountId, provider);
}

async function processExitPlanCommand(db: Db, command: Command, workerId: string) {
  const validation = obj(command.validation);
  const requested = obj(validation.requested);
  let exitLockHeld = false;
  try {
    if (command.command_type !== "position.update_exit_plan") throw new Error("unsupported_worker_command");
    if (!command.target_id) throw new Error("position_not_found");

    const [{ data: account, error: accountError }, { data: control, error: controlError }, { data: trade, error: tradeError }] = await Promise.all([
      db.from("trader_accounts").select("id,mode,status,account_kind").eq("id", command.account_id).maybeSingle(),
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch").eq("account_id", command.account_id).maybeSingle(),
      db.from("trader_trades").select("id,status,execution_mode,exchange_provider,client_state").eq("id", command.target_id).eq("account_id", command.account_id).maybeSingle(),
    ]);
    if (accountError) throw accountError;
    if (controlError) throw controlError;
    if (tradeError) throw tradeError;
    if (!account || account.account_kind !== "real" || account.status !== "active") throw new Error("real_account_required");
    if (account.mode !== "live" || !control || control.global_live_enabled !== true || control.kill_switch !== false) throw new Error("live_trading_not_enabled");
    if (!trade) throw new Error("position_not_found");
    if (trade.status !== "Active") throw new Error("position_not_active");
    if (trade.execution_mode !== "live") throw new Error("position_not_live");

    const state = obj(trade.client_state);
    if (state.exitStrategyV2 !== true) throw new Error("exit_strategy_v2_required");
    const provider = normalizeLaunchExchangeProvider(String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"), "binance");
    await requireLiveExchangeConnection(db, command.account_id, provider);

    const stopEnabled = requested.stopEnabled === true;
    const stopPct = n(requested.stopPct, NaN);
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");
    const hasTargets = Object.prototype.hasOwnProperty.call(requested, "takeProfitTargets");
    const targets = hasTargets ? requested.takeProfitTargets : null;
    if (hasTargets && !Array.isArray(targets)) throw new Error("invalid_take_profit_targets");

    const { data: locked, error: lockError } = await db.rpc("trader_begin_exit_command", {
      p_account_id: command.account_id,
      p_lock_id: workerId,
      p_lease_seconds: 31,
    });
    if (lockError) throw lockError;
    if (locked !== true) throw new Error("account_busy");
    exitLockHeld = true;

    const { data: result, error: applyError } = await db.rpc("trader_v2_apply_exit_plan_command", {
      p_command_id: command.id,
      p_worker_id: workerId,
      p_stop_enabled: stopEnabled,
      p_stop_pct: Number.isFinite(stopPct) ? stopPct : 0,
      p_take_profit_targets: hasTargets ? targets : null,
    });
    if (applyError) throw applyError;
    return { id: command.id, ok: true, result };
  } catch (error) {
    return await retryOrFail(db, command, workerId, error);
  } finally {
    if (exitLockHeld) {
      await db.rpc("trader_release_exit_account", { p_account_id: command.account_id, p_worker_id: workerId }).catch(() => undefined);
    }
  }
}

async function processAddFundsCommand(db: Db, command: Command, workerId: string) {
  const validation = obj(command.validation);
  const requested = obj(validation.requested);
  const quoteAmount = n(requested.quoteAmount, NaN);
  let accountLockHeld = false;
  try {
    if (command.command_type !== "position.add_funds") throw new Error("unsupported_worker_command");
    if (!command.target_id) throw new Error("position_not_found");
    if (!(quoteAmount > 0)) throw new Error("invalid_add_funds_amount");

    const { data: locked, error: lockError } = await db.rpc("trader_begin_command", {
      p_account_id: command.account_id,
      p_lock_id: workerId,
      p_lease_seconds: 30,
    });
    if (lockError) throw lockError;
    if (locked !== true) throw new Error("account_busy");
    accountLockHeld = true;

    const [{ data: account, error: accountError }, { data: control, error: controlError }, { data: rawTrade, error: tradeError }] = await Promise.all([
      db.from("trader_accounts").select("id,mode,status,account_kind").eq("id", command.account_id).maybeSingle(),
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order").eq("account_id", command.account_id).maybeSingle(),
      db.from("trader_trades").select("id,bot_id,pair,status,execution_mode,exchange_provider,client_state").eq("id", command.target_id).eq("account_id", command.account_id).maybeSingle(),
    ]);
    if (accountError) throw accountError;
    if (controlError) throw controlError;
    if (tradeError) throw tradeError;
    if (!account || account.account_kind !== "real" || account.status !== "active") throw new Error("real_account_required");
    if (account.mode !== "live" || !control || control.global_live_enabled !== true || control.kill_switch !== false) throw new Error("live_trading_not_enabled");
    if (!rawTrade) throw new Error("position_not_found");
    const trade = rawTrade as AddFundsTrade;
    if (trade.status !== "Active") throw new Error("position_not_active");
    if (trade.execution_mode !== "live") throw new Error("position_not_live");
    const maxSingleOrder = n(control.max_single_order);
    if (maxSingleOrder > 0 && quoteAmount > maxSingleOrder + 1e-9) throw new Error(`live_order_limit_exceeded:${maxSingleOrder}`);

    const state = obj(trade.client_state);
    const provider = normalizeLaunchExchangeProvider(String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"), "binance");
    const adapter = await adapterFor(db, command.account_id, provider);
    const rule = await adapter.getMarketRule(trade.pair);
    if (rule.minNotional > 0 && quoteAmount + 1e-9 < rule.minNotional) throw new Error(`exchange_minimum_not_met:${rule.minNotional}`);

    const clientOrderId = addFundsClientId(command.id);
    const exposure = await liveExposure(db, command.account_id, clientOrderId);
    const maxLiveCapital = n(control.max_live_capital);
    if (maxLiveCapital > 0 && exposure + quoteAmount > maxLiveCapital + 1e-9) throw new Error(`live_capital_limit_exceeded:${maxLiveCapital}`);
    const balances = await adapter.fetchBalances();
    const freeUsdt = n(balances.find((balance) => String(balance.asset).toUpperCase() === "USDT")?.free);
    if (freeUsdt + 1e-9 < quoteAmount) throw new Error("insufficient_available_balance");

    let { data: ledger, error: ledgerError } = await db.from("trader_orders")
      .select("id,status,exchange_order_id,client_order_id")
      .eq("account_id", command.account_id).eq("client_order_id", clientOrderId).maybeSingle();
    if (ledgerError) throw ledgerError;
    if (!ledger) {
      const now = new Date().toISOString();
      const inserted = await db.from("trader_orders").insert({
        account_id: command.account_id,
        bot_id: trade.bot_id,
        trade_id: trade.id,
        client_order_id: clientOrderId,
        pair: trade.pair,
        kind: "add_funds",
        side: "BUY",
        order_type: "MARKET",
        status: "PENDING",
        requested_quote: quoteAmount,
        requested_qty: 0,
        reserved_quote: 0,
        filled_qty: 0,
        filled_quote: 0,
        exchange: provider,
        opened_at: now,
        metadata: { exchange: provider, coreV2Command: true, commandId: command.id },
      }).select("id,status,exchange_order_id,client_order_id").single();
      if (inserted.error || !inserted.data) throw inserted.error || new Error("add_funds_order_persist_failed");
      ledger = inserted.data;
      await db.from("trader_broker_events").insert({
        account_id: command.account_id, bot_id: trade.bot_id, trade_id: trade.id, order_id: ledger.id, mode: "live",
        event_type: "manual_add_funds_intent_v2_command", pair: trade.pair, client_order_id: clientOrderId,
        payload: { quoteAmount, exchange: provider, commandId: command.id, coreV2Command: true },
      });
    }
    if (String(ledger.status).toUpperCase() === "FILLED") throw new Error("add_funds_already_filled_state");

    let remote = await adapter.queryOrder({ pair: trade.pair, clientOrderId, orderId: ledger.exchange_order_id || undefined });
    if (!remote) {
      try {
        remote = await adapter.placeMarketBuy({ pair: trade.pair, quoteAmount, clientOrderId });
      } catch (placementError) {
        remote = await adapter.queryOrder({ pair: trade.pair, clientOrderId }).catch(() => null);
        if (!remote) throw new Error(`order_submission_uncertain:${clean(placementError)}`);
      }
    }

    await db.from("trader_orders").update({
      status: dbStatus(remote),
      exchange_order_id: remote.orderId || ledger.exchange_order_id || null,
      updated_at: new Date().toISOString(),
      metadata: { exchange: provider, remote_status: remote.rawStatus, coreV2Command: true, commandId: command.id },
    }).eq("id", ledger.id);

    if (["open", "partially_filled", "unknown"].includes(remote.status)) throw new Error("order_pending");
    if (!(n(remote.filledQty) > 0 && n(remote.filledQuote) > 0)) throw new Error(`${provider}_add_funds_unfilled:${remote.rawStatus || remote.status}`);

    const fill = netBuy(remote, rule);
    if (!(fill.netQty > 0 && fill.cost > 0 && fill.average > 0)) throw new Error(`${provider}_add_funds_fill_invalid`);
    const rawFills = remote.fills.map((item) => ({
      tradeId: item.tradeId,
      price: n(item.price),
      quantity: n(item.quantity),
      quoteAmount: n(item.quoteAmount),
      feeAsset: item.feeAsset,
      feeAmount: n(item.feeAmount),
    }));
    const { data: result, error: applyError } = await db.rpc("trader_v2_apply_add_funds_fill", {
      p_command_id: command.id,
      p_worker_id: workerId,
      p_order_id: ledger.id,
      p_exchange_order_id: remote.orderId || "",
      p_remote_status: remote.rawStatus || remote.status,
      p_fill_price: fill.average,
      p_net_quantity: fill.netQty,
      p_cost_quote: fill.cost,
      p_raw_fills: rawFills,
    });
    if (applyError) throw applyError;
    return { id: command.id, ok: true, result };
  } catch (error) {
    return await retryOrFail(db, command, workerId, error);
  } finally {
    if (accountLockHeld) {
      await db.rpc("trader_release_account", { p_account_id: command.account_id, p_worker_id: workerId }).catch(() => undefined);
    }
  }
}

async function processAutomationCommand(db: Db, command: Command, workerId: string) {
  let accountLockHeld = false;
  try {
    if (!["automation.create", "automation.update", "automation.set_status", "automation.archive"].includes(command.command_type)) throw new Error("unsupported_worker_command");
    const { data: locked, error: lockError } = await db.rpc("trader_begin_command", {
      p_account_id: command.account_id,
      p_lock_id: workerId,
      p_lease_seconds: 15,
    });
    if (lockError) throw lockError;
    if (locked !== true) throw new Error("account_busy");
    accountLockHeld = true;
    const { data: result, error: applyError } = await db.rpc("trader_v2_apply_automation_command", {
      p_command_id: command.id,
      p_worker_id: workerId,
    });
    if (applyError) throw applyError;
    return { id: command.id, ok: true, result };
  } catch (error) {
    return await retryOrFail(db, command, workerId, error);
  } finally {
    if (accountLockHeld) {
      await db.rpc("trader_release_account", { p_account_id: command.account_id, p_worker_id: workerId }).catch(() => undefined);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_configuration_missing" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await verify(db, req.headers.get("x-trader-worker-secret") || "")) return json({ error: "unauthorized" }, 401);

  const workerId = crypto.randomUUID();
  const [exitClaim, addFundsClaim, automationClaim] = await Promise.all([
    db.rpc("trader_v2_claim_exit_plan_commands", { p_worker_id: workerId, p_limit: 4, p_lease_seconds: 45 }),
    db.rpc("trader_v2_claim_add_funds_commands", { p_worker_id: workerId, p_limit: 4, p_lease_seconds: 45 }),
    db.rpc("trader_v2_claim_automation_commands", { p_worker_id: workerId, p_limit: 8, p_lease_seconds: 45 }),
  ]);
  if (exitClaim.error) return json({ error: clean(exitClaim.error) }, 500);
  if (addFundsClaim.error) return json({ error: clean(addFundsClaim.error) }, 500);
  if (automationClaim.error) return json({ error: clean(automationClaim.error) }, 500);

  const exitCommands = (exitClaim.data || []) as Command[];
  const addFundsCommands = (addFundsClaim.data || []) as Command[];
  const automationCommands = (automationClaim.data || []) as Command[];
  const results = [];
  for (const command of exitCommands) results.push(await processExitPlanCommand(db, command, workerId));
  for (const command of addFundsCommands) results.push(await processAddFundsCommand(db, command, workerId));
  for (const command of automationCommands) results.push(await processAutomationCommand(db, command, workerId));
  return json({
    ok: true,
    workerId,
    claimed: exitCommands.length + addFundsCommands.length + automationCommands.length,
    exitClaimed: exitCommands.length,
    addFundsClaimed: addFundsCommands.length,
    automationClaimed: automationCommands.length,
    results,
  });
});
