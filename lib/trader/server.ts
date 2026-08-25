import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

export const TRADER_COOKIE = "ln_trader_session_v1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type Json = Record<string, unknown>;

type TraderAccount = {
  id: string;
  access_token_hash: string;
  name: string;
  mode: "paper" | "shadow" | "live";
  status: string;
  starting_balance: number | string;
  quote_asset: string;
  last_worker_at: string | null;
};

export function traderAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE?.trim();
  if (!url || !key) throw new Error("Trader server Supabase configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

export async function resolveTraderAccount(request: NextRequest) {
  const db = traderAdmin();
  const raw = request.cookies.get(TRADER_COOKIE)?.value?.trim();
  if (raw) {
    const { data, error } = await db.from("trader_accounts").select("*").eq("access_token_hash", hashToken(raw)).maybeSingle();
    if (error) throw error;
    if (data) return { db, account: data as TraderAccount, tokenToSet: null as string | null };
  }

  const token = newToken();
  const { data, error } = await db.from("trader_accounts").insert({
    access_token_hash: hashToken(token),
    name: "Paper Account",
    mode: "paper",
    status: "active",
    starting_balance: 100000,
    quote_asset: "USDT",
  }).select("*").single();
  if (error || !data) throw error ?? new Error("Unable to create trader account.");
  return { db, account: data as TraderAccount, tokenToSet: token };
}

export function attachTraderCookie(response: NextResponse, token: string | null) {
  if (!token) return response;
  response.cookies.set(TRADER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

function n(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function cleanPair(value: unknown) {
  const pair = String(value ?? "BTC/USDT").toUpperCase();
  if (/^[A-Z0-9]{2,16}\/USDT$/.test(pair)) return pair;
  const base = pair.replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
  return `${base || "BTC"}/USDT`;
}

export function normalizeBotInput(accountId: string, input: Json) {
  const clientId = String(input.id ?? input.clientId ?? "").trim();
  if (!clientId) throw new Error("Bot client id is required.");
  const pairs = arr(input.pairs).map((value) => cleanPair(value)).filter(Boolean);
  const pair = cleanPair(input.pair ?? pairs[0]);
  const conditions = arr(input.conditions).map((condition) => obj(condition));
  const maxSafety = Math.max(0, Math.round(n(input.maxSafetyOrders)));
  const limitSafety = maxSafety > 0
    ? Math.max(1, Math.min(maxSafety, Math.round(n(input.limitSafetyOrders, maxSafety))))
    : 0;
  return {
    account_id: accountId,
    client_id: clientId,
    name: String(input.name ?? "DCA Bot").trim() || "DCA Bot",
    status: input.status === "Stopped" ? "Stopped" : "Running",
    pair,
    pairs: pairs.length ? pairs : [pair],
    all_pairs: bool(input.allPairs),
    base_order: Math.max(0, n(input.baseOrder)),
    safety_order: Math.max(0, n(input.safetyOrder)),
    max_safety_orders: maxSafety,
    limit_safety_orders: limitSafety,
    max_active_trades: Math.max(1, Math.round(n(input.maxActiveTrades, 1))),
    deviation: Math.max(0.000001, n(input.deviation, 1)),
    step_scale: Math.max(0.000001, n(input.stepScale, 1)),
    volume_scale: Math.max(0.000001, n(input.volumeScale, 1)),
    take_profit_pct: Math.max(0, n(input.takeProfit)),
    stop_enabled: bool(input.stopEnabled),
    stop_pct: Math.max(0, n(input.stopPct)),
    trailing_pct: Math.max(0, n(input.trailingPct)),
    max_hold_enabled: bool(input.maxHoldEnabled),
    max_hold_hours: input.maxHoldHours == null ? null : Math.max(0, n(input.maxHoldHours)),
    averaging_enabled: input.averagingEnabled !== false,
    order_type: input.orderType === "Limit" ? "Limit" : "Market",
    conditions,
    client_state: input,
    is_archived: false,
    next_scan_at: null,
  };
}

export async function upsertBotInput(db: SupabaseClient, accountId: string, input: Json) {
  const row = normalizeBotInput(accountId, input);
  const { data, error } = await db.from("trader_bots").upsert(row, { onConflict: "account_id,client_id" }).select("*").single();
  if (error || !data) throw error ?? new Error("Unable to save trader bot.");
  return data;
}

function normalizeTradeInput(accountId: string, botDbId: string, input: Json) {
  const clientId = String(input.id ?? "").trim();
  if (!clientId) throw new Error("Trade client id is required.");
  const status = input.status === "Closed" ? "Closed" : "Active";
  const openedAt = String(input.createdAt ?? new Date().toISOString());
  const closedAt = status === "Closed" && input.closedAt ? String(input.closedAt) : null;
  return {
    account_id: accountId,
    bot_id: botDbId,
    client_id: clientId,
    pair: cleanPair(input.pair),
    status,
    entry_price: Math.max(0.000000000001, n(input.entryPrice)),
    average_price: Math.max(0.000000000001, n(input.averagePrice, n(input.entryPrice))),
    quantity: Math.max(0, n(input.quantity)),
    invested: Math.max(0, n(input.invested)),
    averaging_filled: Math.max(0, Math.round(n(input.averagingFilled))),
    max_averaging: Math.max(0, Math.round(n(input.maxAveraging))),
    active_orders_limit: Math.max(0, Math.round(n(input.activeOrdersLimit))),
    take_profit_pct: Math.max(0, n(input.takeProfitPct)),
    trailing_enabled: bool(input.trailingEnabled),
    trailing_deviation_pct: Math.max(0, n(input.trailingDeviationPct)),
    trailing_peak_price: input.trailingPeakPrice == null ? null : n(input.trailingPeakPrice),
    stop_enabled: bool(input.stopEnabledOverride),
    stop_pct: Math.max(0, n(input.stopPctOverride)),
    max_hold_enabled: bool(input.maxHoldEnabled),
    max_hold_hours: input.maxHoldHours == null ? null : Math.max(0, n(input.maxHoldHours)),
    last_price: input.lastPrice == null ? null : n(input.lastPrice),
    realized_pnl: status === "Closed" ? n(input.realizedPnl) : null,
    exit_price: input.exitPrice == null ? null : n(input.exitPrice),
    close_reason: input.closeReason == null ? null : String(input.closeReason),
    client_state: input,
    opened_at: openedAt,
    closed_at: closedAt,
  };
}

async function importTradeFills(db: SupabaseClient, accountId: string, botDbId: string, tradeDbId: string, trade: Json) {
  const tradeClient = String(trade.id);
  const fills = arr(trade.fills).map((fill) => obj(fill));
  const normalizedFills = fills.length ? fills : [{
    kind: "Base",
    price: n(trade.entryPrice),
    amount: n(trade.invested),
    quantity: n(trade.quantity),
    at: String(trade.createdAt ?? new Date().toISOString()),
  }];

  for (let index = 0; index < normalizedFills.length; index += 1) {
    const fill = normalizedFills[index];
    const kindText = String(fill.kind ?? (index === 0 ? "Base" : "Averaging"));
    const orderKind = kindText === "Add Funds" ? "add_funds" : index === 0 ? "base" : "averaging";
    const clientOrderId = `${tradeClient}:import:${index + 1}`;
    const price = Math.max(0, n(fill.price));
    const quantity = Math.max(0, n(fill.quantity));
    const quote = Math.max(0, n(fill.amount, price * quantity));
    if (!(price > 0 && quantity > 0)) continue;
    const at = String(fill.at ?? trade.createdAt ?? new Date().toISOString());
    const { data: order, error } = await db.from("trader_orders").upsert({
      account_id: accountId,
      bot_id: botDbId,
      trade_id: tradeDbId,
      client_order_id: clientOrderId,
      pair: cleanPair(trade.pair),
      kind: orderKind,
      side: "BUY",
      order_type: orderKind === "averaging" ? "LIMIT" : "MARKET",
      status: "FILLED",
      sequence_no: orderKind === "averaging" ? index : null,
      price,
      requested_quote: quote,
      requested_qty: quantity,
      reserved_quote: 0,
      filled_qty: quantity,
      filled_quote: quote,
      average_fill_price: price,
      exchange: "paper",
      opened_at: at,
      filled_at: at,
      metadata: { imported_from_browser: true },
    }, { onConflict: "account_id,client_order_id" }).select("id").single();
    if (error || !order) throw error ?? new Error("Unable to import fill order.");
    await db.from("trader_fills").delete().eq("order_id", order.id);
    const { error: fillError } = await db.from("trader_fills").insert({
      account_id: accountId,
      bot_id: botDbId,
      trade_id: tradeDbId,
      order_id: order.id,
      pair: cleanPair(trade.pair),
      side: "BUY",
      kind: kindText,
      price,
      quantity,
      quote_amount: quote,
      filled_at: at,
      metadata: { imported_from_browser: true },
    });
    if (fillError) throw fillError;
  }

  if (trade.status === "Closed" && n(trade.exitPrice) > 0 && n(trade.quantity) > 0) {
    const clientOrderId = `${tradeClient}:import:exit`;
    const price = n(trade.exitPrice);
    const quantity = n(trade.quantity);
    const quote = price * quantity;
    const at = String(trade.closedAt ?? new Date().toISOString());
    const { data: order, error } = await db.from("trader_orders").upsert({
      account_id: accountId,
      bot_id: botDbId,
      trade_id: tradeDbId,
      client_order_id: clientOrderId,
      pair: cleanPair(trade.pair),
      kind: String(trade.closeReason ?? "").includes("Stop") ? "stop_loss" : "take_profit",
      side: "SELL",
      order_type: "MARKET",
      status: "FILLED",
      price,
      requested_qty: quantity,
      requested_quote: 0,
      reserved_quote: 0,
      filled_qty: quantity,
      filled_quote: quote,
      average_fill_price: price,
      exchange: "paper",
      opened_at: at,
      filled_at: at,
      metadata: { imported_from_browser: true },
    }, { onConflict: "account_id,client_order_id" }).select("id").single();
    if (error || !order) throw error ?? new Error("Unable to import exit order.");
    await db.from("trader_fills").delete().eq("order_id", order.id);
    const { error: fillError } = await db.from("trader_fills").insert({
      account_id: accountId,
      bot_id: botDbId,
      trade_id: tradeDbId,
      order_id: order.id,
      pair: cleanPair(trade.pair),
      side: "SELL",
      kind: String(trade.closeReason ?? "Exit"),
      price,
      quantity,
      quote_amount: quote,
      filled_at: at,
      metadata: { imported_from_browser: true },
    });
    if (fillError) throw fillError;
  }
}

export async function bootstrapLegacyState(db: SupabaseClient, accountId: string, botsInput: unknown, tradesInput: unknown) {
  const [{ count: botCount }, { count: tradeCount }] = await Promise.all([
    db.from("trader_bots").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    db.from("trader_trades").select("id", { count: "exact", head: true }).eq("account_id", accountId),
  ]);
  if ((botCount ?? 0) > 0 || (tradeCount ?? 0) > 0) return { imported: false, reason: "server_state_exists" };

  const bots = arr(botsInput).map((item) => obj(item));
  const trades = arr(tradesInput).map((item) => obj(item));
  const botIds = new Map<string, string>();
  for (const bot of bots) {
    if (!bot.id) continue;
    const saved = await upsertBotInput(db, accountId, bot);
    botIds.set(String(bot.id), String(saved.id));
  }

  for (const trade of trades) {
    const clientBotId = String(trade.botId ?? "");
    const botDbId = botIds.get(clientBotId);
    if (!botDbId || !trade.id) continue;
    const row = normalizeTradeInput(accountId, botDbId, trade);
    const { data: saved, error } = await db.from("trader_trades").upsert(row, { onConflict: "account_id,client_id" }).select("id").single();
    if (error || !saved) throw error ?? new Error("Unable to import trader trade.");
    await importTradeFills(db, accountId, botDbId, String(saved.id), trade);
  }
  return { imported: true, bots: bots.length, trades: trades.length };
}

export async function traderSnapshot(db: SupabaseClient, account: TraderAccount) {
  const [botsResult, tradesResult, ordersResult, fillsResult, workerResult] = await Promise.all([
    db.from("trader_bots").select("*").eq("account_id", account.id).eq("is_archived", false).order("created_at", { ascending: false }),
    db.from("trader_trades").select("*").eq("account_id", account.id).order("created_at", { ascending: false }),
    db.from("trader_orders").select("*").eq("account_id", account.id).order("created_at", { ascending: false }),
    db.from("trader_fills").select("*").eq("account_id", account.id).order("filled_at", { ascending: true }),
    db.from("trader_worker_runs").select("*").eq("account_id", account.id).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [botsResult, tradesResult, ordersResult, fillsResult]) if (result.error) throw result.error;

  const bots = botsResult.data ?? [];
  const trades = tradesResult.data ?? [];
  const orders = ordersResult.data ?? [];
  const fills = fillsResult.data ?? [];
  const botClientByDb = new Map(bots.map((bot) => [String(bot.id), String(bot.client_id)]));
  const botNameByDb = new Map(bots.map((bot) => [String(bot.id), String(bot.name)]));
  const fillsByTrade = new Map<string, typeof fills>();
  for (const fill of fills) {
    const id = String(fill.trade_id ?? "");
    if (!id) continue;
    const bucket = fillsByTrade.get(id) ?? [];
    bucket.push(fill);
    fillsByTrade.set(id, bucket);
  }

  const clientBots = bots.map((bot) => ({
    ...obj(bot.client_state),
    id: bot.client_id,
    name: bot.name,
    pair: bot.pair,
    pairs: bot.pairs ?? [],
    allPairs: bot.all_pairs,
    baseOrder: n(bot.base_order),
    safetyOrder: n(bot.safety_order),
    maxSafetyOrders: n(bot.max_safety_orders),
    limitSafetyOrders: n(bot.limit_safety_orders),
    maxActiveTrades: n(bot.max_active_trades, 1),
    deviation: n(bot.deviation),
    stepScale: n(bot.step_scale),
    volumeScale: n(bot.volume_scale),
    takeProfit: n(bot.take_profit_pct),
    stopEnabled: bot.stop_enabled,
    stopPct: n(bot.stop_pct),
    averagingEnabled: bot.averaging_enabled,
    trailingPct: n(bot.trailing_pct),
    maxHoldEnabled: bot.max_hold_enabled,
    maxHoldHours: bot.max_hold_hours == null ? undefined : n(bot.max_hold_hours),
    startCondition: Array.isArray(bot.conditions) && bot.conditions.length ? bot.conditions.map((condition: Json) => condition.kind).join(" + ") : "Immediately",
    conditions: bot.conditions ?? [],
    direction: "Long",
    orderType: bot.order_type,
    status: bot.status,
    createdAt: bot.created_at,
  }));

  const clientTrades = trades.map((trade) => ({
    ...obj(trade.client_state),
    id: trade.client_id,
    botId: botClientByDb.get(String(trade.bot_id)) ?? String(trade.bot_id),
    botName: botNameByDb.get(String(trade.bot_id)) ?? String(obj(trade.client_state).botName ?? "DCA Bot"),
    pair: trade.pair,
    entryPrice: n(trade.entry_price),
    averagePrice: n(trade.average_price),
    quantity: n(trade.quantity),
    invested: n(trade.invested),
    averagingFilled: n(trade.averaging_filled),
    maxAveraging: n(trade.max_averaging),
    activeOrdersLimit: n(trade.active_orders_limit),
    takeProfitPct: n(trade.take_profit_pct),
    trailingEnabled: trade.trailing_enabled,
    trailingDeviationPct: n(trade.trailing_deviation_pct),
    trailingPeakPrice: trade.trailing_peak_price == null ? undefined : n(trade.trailing_peak_price),
    stopEnabledOverride: trade.stop_enabled,
    stopPctOverride: n(trade.stop_pct),
    maxHoldEnabled: trade.max_hold_enabled,
    maxHoldHours: trade.max_hold_hours == null ? undefined : n(trade.max_hold_hours),
    status: trade.status,
    createdAt: trade.opened_at,
    closedAt: trade.closed_at ?? undefined,
    lastPrice: trade.last_price == null ? undefined : n(trade.last_price),
    realizedPnl: trade.realized_pnl == null ? undefined : n(trade.realized_pnl),
    exitPrice: trade.exit_price == null ? undefined : n(trade.exit_price),
    closeReason: trade.close_reason ?? undefined,
    fills: (fillsByTrade.get(String(trade.id)) ?? []).filter((fill) => fill.side === "BUY").map((fill) => ({
      kind: fill.kind,
      price: n(fill.price),
      amount: n(fill.quote_amount),
      quantity: n(fill.quantity),
      at: fill.filled_at,
    })),
  }));

  let invested = 0;
  let realized = 0;
  let unrealized = 0;
  for (const trade of trades) {
    if (trade.status === "Active") {
      invested += n(trade.invested);
      unrealized += (n(trade.last_price, n(trade.average_price)) - n(trade.average_price)) * n(trade.quantity);
    } else realized += n(trade.realized_pnl);
  }
  const openOrders = orders.filter((order) => ["OPEN", "PENDING"].includes(String(order.status)));
  const reserved = openOrders.filter((order) => order.side === "BUY").reduce((sum, order) => sum + n(order.reserved_quote), 0);
  const starting = n(account.starting_balance, 100000);
  const available = Math.max(0, starting + realized - invested - reserved);
  const equity = starting + realized + unrealized;

  return {
    serverEngine: true,
    generatedAt: new Date().toISOString(),
    account: {
      id: account.id,
      name: account.name,
      mode: account.mode,
      quoteAsset: account.quote_asset,
      startingBalance: starting,
      invested,
      reserved,
      available,
      realizedPnl: realized,
      unrealizedPnl: unrealized,
      equity,
      lastWorkerAt: account.last_worker_at,
      worker: workerResult.data ?? null,
    },
    bots: clientBots,
    trades: clientTrades,
    orders: openOrders.map((order) => ({
      id: order.client_order_id,
      tradeId: order.trade_id,
      botId: order.bot_id,
      pair: order.pair,
      kind: order.kind,
      side: order.side,
      orderType: order.order_type,
      status: order.status,
      sequence: order.sequence_no,
      price: order.price == null ? null : n(order.price),
      amount: n(order.requested_quote),
      quantity: n(order.requested_qty),
      reserved: n(order.reserved_quote),
    })),
  };
}
