import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;

type AccountRow = {
  id: string;
  owner_user_id: string | null;
  mode: "paper" | "shadow" | "live";
  account_kind: "paper" | "real";
  starting_balance: number | string;
  status: string;
};

type TradeRow = {
  id: string;
  account_id: string;
  bot_id: string;
  client_id: string;
  pair: string;
  status: string;
  average_price: number | string;
  quantity: number | string;
  invested: number | string;
  averaging_filled: number;
  max_averaging: number;
  active_orders_limit: number;
  take_profit_pct: number | string;
  stop_enabled: boolean;
  stop_pct: number | string;
  last_price: number | string | null;
  client_state: Json;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}
function n(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function b(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

async function ownedAccount(admin: Db, userId: string, accountId: string) {
  const { data, error } = await admin.from("trader_accounts")
    .select("id,owner_user_id,mode,account_kind,starting_balance,status")
    .eq("id", accountId)
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("trader_account_not_owned");
  return data as AccountRow;
}

async function ownedTrade(admin: Db, accountId: string, tradeId: string) {
  const { data, error } = await admin.from("trader_trades")
    .select("id,account_id,bot_id,client_id,pair,status,average_price,quantity,invested,averaging_filled,max_averaging,active_orders_limit,take_profit_pct,stop_enabled,stop_pct,last_price,client_state")
    .eq("account_id", accountId)
    .eq("client_id", tradeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("trade_not_found");
  return data as TradeRow;
}

function requireSimulationMode(account: AccountRow) {
  if (account.mode === "live") throw new Error("manual_live_trade_action_unavailable");
}

async function availableQuote(admin: Db, account: AccountRow) {
  const [tradesResult, ordersResult] = await Promise.all([
    admin.from("trader_trades").select("status,invested,realized_pnl").eq("account_id", account.id),
    admin.from("trader_orders").select("side,status,reserved_quote").eq("account_id", account.id),
  ]);
  if (tradesResult.error) throw tradesResult.error;
  if (ordersResult.error) throw ordersResult.error;
  let invested = 0;
  let realized = 0;
  for (const trade of tradesResult.data ?? []) {
    if (String(trade.status) === "Active") invested += n(trade.invested);
    else realized += n(trade.realized_pnl);
  }
  const reserved = (ordersResult.data ?? [])
    .filter((order) => String(order.side).toUpperCase() === "BUY" && ["OPEN", "PENDING"].includes(String(order.status).toUpperCase()))
    .reduce((sum, order) => sum + n(order.reserved_quote), 0);
  return Math.max(0, n(account.starting_balance) + realized - invested - reserved);
}

async function addFunds(admin: Db, account: AccountRow, trade: TradeRow, amount: number) {
  requireSimulationMode(account);
  if (trade.status !== "Active") throw new Error("trade_not_active");
  if (!(amount > 0)) throw new Error("invalid_add_funds_amount");
  const available = await availableQuote(admin, account);
  if (amount > available + 1e-9) throw new Error("insufficient_available_balance");
  const price = n(trade.last_price, n(trade.average_price));
  if (!(price > 0)) throw new Error("trade_price_unavailable");
  const quantity = amount / price;
  const clientOrderId = `${trade.client_id}:add-funds:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
  const { data: order, error: orderError } = await admin.from("trader_orders").insert({
    account_id: account.id,
    bot_id: trade.bot_id,
    trade_id: trade.id,
    client_order_id: clientOrderId,
    pair: trade.pair,
    kind: "add_funds",
    side: "BUY",
    order_type: "MARKET",
    status: "OPEN",
    price,
    requested_quote: amount,
    requested_qty: quantity,
    reserved_quote: amount,
    exchange: "paper",
    opened_at: new Date().toISOString(),
  }).select("id").single();
  if (orderError || !order) throw orderError ?? new Error("add_funds_order_failed");
  const { error: fillError } = await admin.rpc("trader_fill_buy_order", {
    p_order_id: order.id,
    p_fill_price: price,
    p_fill_quantity: quantity,
    p_fill_quote: amount,
    p_fee_amount: 0,
    p_increment_averaging: false,
  });
  if (fillError) {
    await admin.from("trader_orders").update({ status: "CANCELLED", reserved_quote: 0, cancelled_at: new Date().toISOString() }).eq("id", order.id);
    throw fillError;
  }
}

async function reconcileAveragingOrders(
  admin: Db,
  trade: TradeRow,
  completed: number,
  maxAveraging: number,
  activeOrdersLimit: number,
) {
  const desiredFirst = completed + 1;
  const desiredLast = Math.min(maxAveraging, completed + activeOrdersLimit);
  const { data, error } = await admin.from("trader_orders")
    .select("id,kind,side,status,sequence_no,requested_quote")
    .eq("trade_id", trade.id)
    .eq("kind", "averaging")
    .eq("side", "BUY")
    .order("sequence_no", { ascending: true });
  if (error) throw error;

  const now = new Date().toISOString();
  for (const order of data ?? []) {
    const sequence = Math.round(n(order.sequence_no));
    const status = String(order.status || "").toUpperCase();
    const shouldBeActive = activeOrdersLimit > 0 && sequence >= desiredFirst && sequence <= desiredLast;

    if (shouldBeActive && status === "CANCELLED") {
      const { error: reopenError } = await admin.from("trader_orders").update({
        status: "OPEN",
        reserved_quote: Math.max(0, n(order.requested_quote)),
        cancelled_at: null,
        opened_at: now,
        updated_at: now,
      }).eq("id", order.id);
      if (reopenError) throw reopenError;
    } else if (!shouldBeActive && ["OPEN", "PENDING"].includes(status)) {
      const { error: cancelError } = await admin.from("trader_orders").update({
        status: "CANCELLED",
        reserved_quote: 0,
        cancelled_at: now,
        updated_at: now,
      }).eq("id", order.id);
      if (cancelError) throw cancelError;
    }
  }
}

async function updateTrade(admin: Db, account: AccountRow, trade: TradeRow, body: Json) {
  requireSimulationMode(account);
  if (trade.status !== "Active") throw new Error("trade_not_active");
  const completed = Math.max(0, Math.round(n(trade.averaging_filled)));
  const maxAveraging = Math.max(completed, Math.min(100, Math.round(n(body.maxAveraging, trade.max_averaging))));
  const remaining = Math.max(0, maxAveraging - completed);
  const requestedActive = Math.round(n(body.activeOrdersLimit, trade.active_orders_limit));
  const activeOrdersLimit = remaining === 0 ? 0 : Math.max(1, Math.min(remaining, requestedActive || 1));
  const takeProfitPct = Math.max(0, n(body.takeProfitPct, trade.take_profit_pct));
  const stopEnabled = body.stopEnabled === undefined ? trade.stop_enabled : b(body.stopEnabled);
  const stopPct = Math.max(0, n(body.stopPct, trade.stop_pct));
  if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");
  const clientState = {
    ...object(trade.client_state),
    maxAveraging,
    activeOrdersLimit,
    takeProfitPct,
    stopEnabled,
    stopPct,
    manualEditAt: new Date().toISOString(),
  };
  const { error } = await admin.from("trader_trades").update({
    max_averaging: maxAveraging,
    active_orders_limit: activeOrdersLimit,
    take_profit_pct: takeProfitPct,
    stop_enabled: stopEnabled,
    stop_pct: stopPct,
    client_state: clientState,
    updated_at: new Date().toISOString(),
  }).eq("id", trade.id).eq("status", "Active");
  if (error) throw error;

  // Stop-loss / TP edits must not destroy a valid DCA ladder. Reconcile only
  // averaging slots that fall inside or outside the configured active window.
  await reconcileAveragingOrders(admin, trade, completed, maxAveraging, activeOrdersLimit);
}

async function closeTrade(admin: Db, account: AccountRow, trade: TradeRow) {
  requireSimulationMode(account);
  if (trade.status !== "Active") throw new Error("trade_not_active");
  const price = n(trade.last_price, n(trade.average_price));
  if (!(price > 0)) throw new Error("trade_price_unavailable");
  const { error } = await admin.rpc("trader_close_trade", {
    p_trade_id: trade.id,
    p_exit_price: price,
    p_reason: "Manual close",
    p_order_kind: "manual_exit",
    p_fee_amount: 0,
  });
  if (error) throw error;
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
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({})) as Json;
    const action = String(body.action || "");
    const accountId = String(body.accountId || "").trim();
    const tradeId = String(body.tradeId || "").trim();
    if (!accountId) throw new Error("account_id_required");
    if (!tradeId) throw new Error("trade_id_required");
    const account = await ownedAccount(admin, userData.user.id, accountId);
    const trade = await ownedTrade(admin, account.id, tradeId);
    if (action === "add_funds") await addFunds(admin, account, trade, n(body.amount));
    else if (action === "update_trade") await updateTrade(admin, account, trade, body);
    else if (action === "close_trade") await closeTrade(admin, account, trade);
    else throw new Error("unknown_action");
    return json({ ok: true, action });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("trader-trade-control", message);
    const safe = [
      "trader_account_not_owned", "trade_not_found", "trade_not_active", "account_id_required", "trade_id_required",
      "invalid_add_funds_amount", "insufficient_available_balance", "trade_price_unavailable", "invalid_stop_loss",
      "manual_live_trade_action_unavailable", "unknown_action",
    ].includes(message) ? message : "trader_trade_control_failed";
    return json({ error: safe }, safe === "trader_account_not_owned" ? 403 : 400);
  }
});
