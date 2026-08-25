import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Db = ReturnType<typeof createClient>;
type AccountKind = "paper" | "real";
type AccountMode = "paper" | "shadow" | "live";
type Json = Record<string, unknown>;
type AccountRow = {
  id: string;
  owner_user_id: string | null;
  account_kind: AccountKind;
  name: string;
  mode: AccountMode;
  status: string;
  quote_asset: string;
  starting_balance: number | string;
  created_at: string;
  last_worker_at?: string | null;
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
function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function cleanPair(value: unknown) {
  const pair = String(value ?? "BTC/USDT").trim().toUpperCase();
  if (/^[A-Z0-9]{2,16}\/USDT$/.test(pair)) return pair;
  const base = pair.replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
  return `${base || "BTC"}/USDT`;
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function newAccessHash() {
  return await sha256(`${crypto.randomUUID()}:${crypto.randomUUID()}:${Date.now()}`);
}

async function ownedAccount(admin: Db, userId: string, kind: AccountKind) {
  const { data, error } = await admin.from("trader_accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("account_kind", kind)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? String(data.id) : null;
}

async function ownedAccountById(admin: Db, userId: string, accountId: string) {
  const { data, error } = await admin.from("trader_accounts")
    .select("id,owner_user_id,account_kind,name,mode,status,quote_asset,starting_balance,created_at,last_worker_at")
    .eq("id", accountId)
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("trader_account_not_owned");
  return data as AccountRow;
}

async function ensurePaperAccount(admin: Db, userId: string) {
  const existing = await ownedAccount(admin, userId, "paper");
  if (existing) return existing;
  const { data, error } = await admin.from("trader_accounts").insert({
    owner_user_id: userId,
    account_kind: "paper",
    access_token_hash: await newAccessHash(),
    name: "Paper Account",
    mode: "paper",
    status: "active",
    quote_asset: "USDT",
    starting_balance: 100000,
    fee_bps: 0,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") {
      const raced = await ownedAccount(admin, userId, "paper");
      if (raced) return raced;
    }
    throw error;
  }
  return String(data.id);
}

async function ensureRealControls(admin: Db, userId: string, accountId: string) {
  const { data, error } = await admin.from("trader_execution_controls")
    .select("account_id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (data) return;
  const { error: insertError } = await admin.from("trader_execution_controls").insert({
    account_id: accountId,
    global_live_enabled: false,
    kill_switch: true,
    max_live_capital: 0,
    max_single_order: 0,
    max_concurrent_live_trades: 1,
    daily_loss_limit: 0,
    live_confirmed_at: null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (insertError && insertError.code !== "23505") throw insertError;
}

async function ensureRealAccount(admin: Db, userId: string) {
  const existing = await ownedAccount(admin, userId, "real");
  if (existing) {
    await ensureRealControls(admin, userId, existing);
    return existing;
  }
  const { data, error } = await admin.from("trader_accounts").insert({
    owner_user_id: userId,
    account_kind: "real",
    access_token_hash: await newAccessHash(),
    name: "Real Account",
    mode: "shadow",
    status: "active",
    quote_asset: "USDT",
    starting_balance: 0,
    fee_bps: 0,
  }).select("id").single();
  let accountId: string;
  if (error) {
    if (error.code !== "23505") throw error;
    const raced = await ownedAccount(admin, userId, "real");
    if (!raced) throw error;
    accountId = raced;
  } else {
    accountId = String(data.id);
  }
  await ensureRealControls(admin, userId, accountId);
  return accountId;
}

async function accountsForUser(admin: Db, userId: string) {
  const { data, error } = await admin.from("trader_accounts")
    .select("id,owner_user_id,account_kind,name,mode,status,quote_asset,starting_balance,created_at")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const accounts = (data ?? []) as AccountRow[];
  const ids = accounts.map((account) => account.id);
  const exchange = new Map<string, { status: string; last4: string | null }>();
  if (ids.length) {
    const { data: connections, error: connectionError } = await admin.from("trader_binance_connections")
      .select("account_id,status,api_key_last4")
      .in("account_id", ids);
    if (connectionError) throw connectionError;
    for (const connection of connections ?? []) {
      exchange.set(String(connection.account_id), {
        status: String(connection.status || "disconnected"),
        last4: connection.api_key_last4 ? String(connection.api_key_last4) : null,
      });
    }
  }
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.account_kind,
    mode: account.mode,
    status: account.status,
    quoteAsset: account.quote_asset,
    startingBalance: n(account.starting_balance),
    exchangeStatus: exchange.get(account.id)?.status ?? "disconnected",
    apiKeyLast4: exchange.get(account.id)?.last4 ?? null,
  }));
}

async function workspaceState(admin: Db, account: AccountRow) {
  const [botsResult, tradesResult, ordersResult, fillsResult, controlsResult, workerResult] = await Promise.all([
    admin.from("trader_bots").select("*").eq("account_id", account.id).order("created_at", { ascending: false }),
    admin.from("trader_trades").select("*").eq("account_id", account.id).order("opened_at", { ascending: false }),
    admin.from("trader_orders").select("*").eq("account_id", account.id).order("opened_at", { ascending: false }),
    admin.from("trader_fills").select("id,bot_id,trade_id,order_id,pair,side,kind,price,quantity,quote_amount,fee_asset,fee_amount,filled_at").eq("account_id", account.id).order("filled_at", { ascending: true }),
    admin.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order,max_concurrent_live_trades,daily_loss_limit,live_confirmed_at,live_generation").eq("account_id", account.id).maybeSingle(),
    admin.from("trader_worker_runs").select("status,started_at,finished_at,duration_ms,error").eq("account_id", account.id).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [botsResult, tradesResult, ordersResult, fillsResult]) if (result.error) throw result.error;
  if (controlsResult.error) throw controlsResult.error;

  const bots = botsResult.data ?? [];
  const trades = tradesResult.data ?? [];
  const orders = ordersResult.data ?? [];
  const fills = fillsResult.data ?? [];
  const openOrders = orders.filter((order) => ["OPEN", "PENDING"].includes(String(order.status).toUpperCase()));

  let invested = 0;
  let realized = 0;
  let unrealized = 0;
  for (const trade of trades) {
    if (trade.status === "Active") {
      invested += n(trade.invested);
      unrealized += (n(trade.last_price, n(trade.average_price)) - n(trade.average_price)) * n(trade.quantity);
    } else {
      realized += n(trade.realized_pnl);
    }
  }
  const reserved = openOrders.filter((order) => String(order.side).toUpperCase() === "BUY").reduce((sum, order) => sum + n(order.reserved_quote), 0);
  const starting = n(account.starting_balance);
  const available = Math.max(0, starting + realized - invested - reserved);
  const equity = starting + realized + unrealized;

  const botMeta = new Map<string, { clientId: string; name: string }>();
  for (const bot of bots) botMeta.set(String(bot.id), { clientId: String(bot.client_id), name: String(bot.name) });

  const fillsByTrade = new Map<string, Array<Record<string, unknown>>>();
  for (const fill of fills) {
    const key = String(fill.trade_id || "");
    if (!key) continue;
    const current = fillsByTrade.get(key) ?? [];
    const rawKind = String(fill.kind || "").toLowerCase();
    if (String(fill.side || "").toUpperCase() === "BUY" && (rawKind === "base" || rawKind === "averaging")) {
      current.push({
        kind: rawKind === "base" ? "Base" : "Averaging",
        price: n(fill.price),
        amount: n(fill.quote_amount),
        quantity: n(fill.quantity),
        at: String(fill.filled_at),
      });
      fillsByTrade.set(key, current);
    }
  }

  const openOrdersByTrade = new Map<string, Array<Record<string, unknown>>>();
  for (const order of openOrders) {
    const key = String(order.trade_id || "");
    if (!key) continue;
    const current = openOrdersByTrade.get(key) ?? [];
    current.push(order as Record<string, unknown>);
    openOrdersByTrade.set(key, current);
  }

  const botStats = new Map<string, { active: number; closed: number; pnl: number }>();
  for (const trade of trades) {
    const key = String(trade.bot_id || "");
    if (!key) continue;
    const current = botStats.get(key) ?? { active: 0, closed: 0, pnl: 0 };
    if (trade.status === "Active") {
      current.active += 1;
      current.pnl += (n(trade.last_price, n(trade.average_price)) - n(trade.average_price)) * n(trade.quantity);
    } else {
      current.closed += 1;
      current.pnl += n(trade.realized_pnl);
    }
    botStats.set(key, current);
  }

  const mappedTrades = trades.map((trade) => {
    const averagePrice = n(trade.average_price);
    const quantity = n(trade.quantity);
    const investedAmount = n(trade.invested);
    const lastPrice = trade.last_price == null ? null : n(trade.last_price);
    const activePnl = trade.status === "Active" ? (n(trade.last_price, averagePrice) - averagePrice) * quantity : n(trade.realized_pnl);
    const pnlPct = investedAmount > 0 ? activePnl / investedAmount * 100 : 0;
    const takeProfitPct = n(trade.take_profit_pct);
    const stopEnabled = trade.stop_enabled === true;
    const stopPct = n(trade.stop_pct);
    const tradeOrders = (openOrdersByTrade.get(String(trade.id)) ?? [])
      .filter((order) => String(order.kind || "").toLowerCase().includes("averag") && String(order.side || "").toUpperCase() === "BUY")
      .sort((a, b) => n(a.sequence_no, 9999) - n(b.sequence_no, 9999));
    const nextOrder = tradeOrders[0];
    const bot = botMeta.get(String(trade.bot_id || ""));
    return {
      id: String(trade.client_id),
      botId: bot?.clientId ?? null,
      botName: bot?.name ?? "DCA Bot",
      pair: String(trade.pair),
      status: String(trade.status),
      entryPrice: n(trade.entry_price),
      averagePrice,
      quantity,
      invested: investedAmount,
      averagingFilled: n(trade.averaging_filled),
      maxAveraging: n(trade.max_averaging),
      activeOrdersLimit: n(trade.active_orders_limit),
      takeProfitPct,
      takeProfitPrice: averagePrice > 0 && takeProfitPct > 0 ? averagePrice * (1 + takeProfitPct / 100) : null,
      stopEnabled,
      stopPct,
      stopLossPrice: stopEnabled && averagePrice > 0 && stopPct > 0 ? averagePrice * (1 - stopPct / 100) : null,
      nextAveragingPrice: nextOrder?.price == null ? null : n(nextOrder.price),
      lastPrice,
      realizedPnl: trade.realized_pnl == null ? null : n(trade.realized_pnl),
      pnl: activePnl,
      pnlPct,
      exitPrice: trade.exit_price == null ? null : n(trade.exit_price),
      openedAt: String(trade.opened_at),
      closedAt: trade.closed_at ? String(trade.closed_at) : null,
      closeReason: trade.close_reason ? String(trade.close_reason) : null,
      executionMode: String(trade.execution_mode || account.mode),
      fills: fillsByTrade.get(String(trade.id)) ?? [],
    };
  });

  return {
    account: {
      id: account.id,
      name: account.name,
      kind: account.account_kind,
      mode: account.mode,
      quoteAsset: account.quote_asset,
      startingBalance: starting,
      invested,
      reserved,
      available,
      realizedPnl: realized,
      unrealizedPnl: unrealized,
      equity,
      lastWorkerAt: account.last_worker_at ?? null,
    },
    controls: controlsResult.data ?? {
      global_live_enabled: false,
      kill_switch: true,
      max_live_capital: 0,
      max_single_order: 0,
      max_concurrent_live_trades: 1,
      daily_loss_limit: 0,
      live_confirmed_at: null,
      live_generation: 0,
    },
    worker: workerResult.data ?? null,
    bots: bots.map((bot) => {
      const stats = botStats.get(String(bot.id)) ?? { active: 0, closed: 0, pnl: 0 };
      return {
        id: String(bot.client_id),
        name: String(bot.name),
        status: String(bot.status),
        lifecycle: bot.is_archived === true ? "closed" : "active",
        pair: String(bot.pair),
        baseOrder: n(bot.base_order),
        safetyOrder: n(bot.safety_order),
        maxSafetyOrders: n(bot.max_safety_orders),
        limitSafetyOrders: n(bot.limit_safety_orders),
        maxActiveTrades: n(bot.max_active_trades, 1),
        deviation: n(bot.deviation),
        stepScale: n(bot.step_scale),
        volumeScale: n(bot.volume_scale),
        takeProfit: n(bot.take_profit_pct),
        stopEnabled: bot.stop_enabled === true,
        stopPct: n(bot.stop_pct),
        startCondition: Array.isArray(bot.conditions) && bot.conditions.length ? bot.conditions.map((condition: Json) => String(condition.kind || "Condition")).join(" + ") : "Immediately",
        executionMode: String(bot.execution_mode || account.mode),
        activeTradeCount: stats.active,
        closedTradeCount: stats.closed,
        pnl: stats.pnl,
        createdAt: String(bot.created_at),
        updatedAt: String(bot.updated_at),
      };
    }),
    trades: mappedTrades,
    orders: openOrders.map((order) => ({
      id: String(order.client_order_id),
      tradeId: order.trade_id ? String(order.trade_id) : null,
      pair: String(order.pair),
      kind: String(order.kind),
      side: String(order.side),
      status: String(order.status),
      sequence: n(order.sequence_no),
      price: order.price == null ? null : n(order.price),
      amount: n(order.requested_quote),
      reserved: n(order.reserved_quote),
    })),
  };
}

async function requireRealExchange(admin: Db, account: AccountRow) {
  if (account.account_kind !== "real") return;
  const { data, error } = await admin.from("trader_binance_connections")
    .select("status")
    .eq("account_id", account.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "connected") throw new Error("exchange_connection_required");
}

function botNumbers(body: Json, current?: Record<string, unknown>) {
  const baseOrder = Math.max(0, n(body.baseOrder, n(current?.base_order)));
  const safetyOrder = Math.max(0, n(body.safetyOrder, n(current?.safety_order)));
  if (!(baseOrder > 0) || !(safetyOrder > 0)) throw new Error("invalid_order_amount");
  const maxSafetyOrders = Math.max(0, Math.min(50, Math.round(n(body.maxSafetyOrders, n(current?.max_safety_orders, 5)))));
  const fallbackLimit = n(current?.limit_safety_orders, maxSafetyOrders > 0 ? 1 : 0);
  const limitSafetyOrders = maxSafetyOrders > 0 ? Math.min(maxSafetyOrders, Math.max(1, Math.round(n(body.limitSafetyOrders, fallbackLimit)))) : 0;
  const maxActiveTrades = Math.max(1, Math.min(20, Math.round(n(body.maxActiveTrades, n(current?.max_active_trades, 1)))));
  const deviation = Math.max(0.000001, n(body.deviation, n(current?.deviation, 1)));
  const stepScale = Math.max(0.000001, n(body.stepScale, n(current?.step_scale, 1)));
  const volumeScale = Math.max(0.000001, n(body.volumeScale, n(current?.volume_scale, 1)));
  const takeProfit = Math.max(0, n(body.takeProfit, n(current?.take_profit_pct, 1.5)));
  const stopEnabled = body.stopEnabled === undefined ? current?.stop_enabled === true : bool(body.stopEnabled);
  const stopPct = Math.max(0, n(body.stopPct, n(current?.stop_pct, 8)));
  return { baseOrder, safetyOrder, maxSafetyOrders, limitSafetyOrders, maxActiveTrades, deviation, stepScale, volumeScale, takeProfit, stopEnabled, stopPct };
}

async function createBot(admin: Db, account: AccountRow, body: Json) {
  if (account.account_kind === "real" && !["shadow", "live"].includes(account.mode)) throw new Error("real_mode_required");
  await requireRealExchange(admin, account);
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("bot_name_required");
  const values = botNumbers(body);
  const clientId = `bot-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const pair = cleanPair(body.pair);
  const executionMode = account.account_kind === "real" ? (account.mode === "live" ? "live" : "shadow") : "paper";
  const clientState = {
    id: clientId,
    name,
    pair,
    pairs: [pair],
    allPairs: false,
    status: "Running",
    direction: "Long",
    ...values,
    trailingPct: 0,
    maxHoldEnabled: false,
    averagingEnabled: true,
    orderType: "Market",
    conditions: [],
    startCondition: "Immediately",
    createdAt: new Date().toISOString(),
    executionMode,
  };
  const { data, error } = await admin.from("trader_bots").insert({
    account_id: account.id,
    client_id: clientId,
    name,
    status: "Running",
    pair,
    pairs: [pair],
    all_pairs: false,
    base_order: values.baseOrder,
    safety_order: values.safetyOrder,
    max_safety_orders: values.maxSafetyOrders,
    limit_safety_orders: values.limitSafetyOrders,
    max_active_trades: values.maxActiveTrades,
    deviation: values.deviation,
    step_scale: values.stepScale,
    volume_scale: values.volumeScale,
    take_profit_pct: values.takeProfit,
    stop_enabled: values.stopEnabled,
    stop_pct: values.stopPct,
    trailing_pct: 0,
    max_hold_enabled: false,
    max_hold_hours: null,
    averaging_enabled: true,
    order_type: "Market",
    conditions: [],
    client_state: clientState,
    is_archived: false,
    next_scan_at: null,
    execution_mode: executionMode,
  }).select("client_id").single();
  if (error || !data) throw error ?? new Error("bot_create_failed");
  return String(data.client_id);
}

async function updateBot(admin: Db, account: AccountRow, botId: string, body: Json) {
  const { data, error } = await admin.from("trader_bots")
    .select("*")
    .eq("account_id", account.id)
    .eq("client_id", botId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("bot_not_found");
  if (data.is_archived === true) throw new Error("bot_closed");

  const name = String(body.name ?? data.name ?? "").trim();
  if (!name) throw new Error("bot_name_required");
  const pair = cleanPair(body.pair ?? data.pair);
  if (pair !== String(data.pair)) {
    const { count, error: tradeError } = await admin.from("trader_trades")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .eq("bot_id", data.id)
      .eq("status", "Active");
    if (tradeError) throw tradeError;
    if ((count ?? 0) > 0) throw new Error("bot_pair_locked_by_active_trade");
  }

  const values = botNumbers(body, data as Record<string, unknown>);
  const clientState = {
    ...obj(data.client_state),
    name,
    pair,
    pairs: [pair],
    allPairs: false,
    ...values,
    status: String(data.status),
    direction: "Long",
    averagingEnabled: true,
    orderType: "Market",
    startCondition: "Immediately",
  };
  const { error: updateError } = await admin.from("trader_bots").update({
    name,
    pair,
    pairs: [pair],
    all_pairs: false,
    base_order: values.baseOrder,
    safety_order: values.safetyOrder,
    max_safety_orders: values.maxSafetyOrders,
    limit_safety_orders: values.limitSafetyOrders,
    max_active_trades: values.maxActiveTrades,
    deviation: values.deviation,
    step_scale: values.stepScale,
    volume_scale: values.volumeScale,
    take_profit_pct: values.takeProfit,
    stop_enabled: values.stopEnabled,
    stop_pct: values.stopPct,
    averaging_enabled: true,
    order_type: "Market",
    client_state: clientState,
    next_scan_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", data.id);
  if (updateError) throw updateError;
}

async function setBotStatus(admin: Db, account: AccountRow, botId: string, status: string) {
  const nextStatus = status === "Stopped" ? "Stopped" : "Running";
  const { data, error } = await admin.from("trader_bots")
    .select("id,is_archived,client_state")
    .eq("account_id", account.id)
    .eq("client_id", botId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("bot_not_found");
  if (data.is_archived === true) throw new Error("bot_closed");
  const clientState = { ...obj(data.client_state), status: nextStatus };
  const { error: updateError } = await admin.from("trader_bots").update({ status: nextStatus, client_state: clientState, next_scan_at: null }).eq("id", data.id);
  if (updateError) throw updateError;
}

async function closeBot(admin: Db, account: AccountRow, botId: string) {
  const { data, error } = await admin.from("trader_bots")
    .select("id,client_state")
    .eq("account_id", account.id)
    .eq("client_id", botId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("bot_not_found");
  const clientState = { ...obj(data.client_state), status: "Stopped", lifecycle: "closed" };
  const { error: updateError } = await admin.from("trader_bots").update({ status: "Stopped", is_archived: true, client_state: clientState }).eq("id", data.id);
  if (updateError) throw updateError;
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
    const body = await req.json().catch(() => ({})) as Json;
    const action = String(body.action || "bootstrap");
    if (action === "bootstrap") {
      await Promise.all([ensurePaperAccount(admin, user.id), ensureRealAccount(admin, user.id)]);
      return json({ ok: true, accounts: await accountsForUser(admin, user.id), defaultAccount: "real" });
    }
    if (action === "list") return json({ ok: true, accounts: await accountsForUser(admin, user.id) });
    if (action === "create_real") {
      const realAccountId = await ensureRealAccount(admin, user.id);
      await ensurePaperAccount(admin, user.id);
      return json({ ok: true, realAccountId, accounts: await accountsForUser(admin, user.id) });
    }
    const accountId = String(body.accountId || "").trim();
    if (!accountId) return json({ error: "account_id_required" }, 400);
    const account = await ownedAccountById(admin, user.id, accountId);
    if (action === "workspace_state") return json({ ok: true, ...(await workspaceState(admin, account)) });
    if (action === "create_bot" || action === "create_shadow_bot") {
      const botId = await createBot(admin, account, body);
      return json({ ok: true, botId, ...(await workspaceState(admin, account)) });
    }
    if (action === "update_bot") {
      const botId = String(body.botId || "").trim();
      if (!botId) return json({ error: "bot_id_required" }, 400);
      await updateBot(admin, account, botId, body);
      return json({ ok: true, ...(await workspaceState(admin, account)) });
    }
    if (action === "set_bot_status") {
      const botId = String(body.botId || "").trim();
      if (!botId) return json({ error: "bot_id_required" }, 400);
      await setBotStatus(admin, account, botId, String(body.status || "Running"));
      return json({ ok: true, ...(await workspaceState(admin, account)) });
    }
    if (action === "close_bot") {
      const botId = String(body.botId || "").trim();
      if (!botId) return json({ error: "bot_id_required" }, 400);
      await closeBot(admin, account, botId);
      return json({ ok: true, ...(await workspaceState(admin, account)) });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("trader-account-control", message);
    const safe = [
      "trader_account_not_owned", "real_mode_required", "exchange_connection_required", "bot_name_required",
      "invalid_order_amount", "bot_not_found", "bot_closed", "account_id_required", "bot_id_required",
      "bot_pair_locked_by_active_trade",
    ].includes(message) ? message : "trader_account_control_failed";
    return json({ error: safe }, safe === "trader_account_not_owned" ? 403 : 400);
  }
});
