import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { attachTraderCookie, resolveTraderAccount, traderSnapshot, upsertBotInput } from "../../../../../lib/trader/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const BINANCE = "https://data-api.binance.vision";
type Json = Record<string, unknown>;

function n(value: unknown, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function floorStep(value: number, step: number) {
  if (!(step > 0)) return value;
  const precision = Math.max(0, Math.min(12, (String(step).split(".")[1] ?? "").replace(/0+$/, "").length));
  return Number((Math.floor((value + 1e-14) / step) * step).toFixed(precision));
}
function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return result;
}

async function acquireCommandLease(db: SupabaseClient, accountId: string) {
  const lockId = randomUUID();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await db.rpc("trader_begin_command", { p_account_id: accountId, p_lock_id: lockId, p_lease_seconds: 15 } as never);
    if (error) throw error;
    if (data === true) return lockId;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Trading engine is busy. Try the command again in a moment.");
}

async function bookQuote(symbol: string) {
  const result = await fetch(`${BINANCE}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const data = await result.json().catch(() => ({})) as Json;
  if (!result.ok) throw new Error(String(data.msg ?? `Binance quote failed (${result.status}).`));
  const bid = n(data.bidPrice), ask = n(data.askPrice);
  if (!(bid > 0 && ask > 0)) throw new Error("Binance returned an invalid bid/ask quote.");
  return { bid, ask };
}

async function symbolRules(symbol: string) {
  const result = await fetch(`${BINANCE}/api/v3/exchangeInfo?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const data = await result.json().catch(() => ({})) as { symbols?: Json[]; msg?: string };
  if (!result.ok) throw new Error(data.msg ?? `Binance exchange info failed (${result.status}).`);
  const symbolInfo = data.symbols?.[0];
  if (!symbolInfo) throw new Error("Binance symbol rules were not found.");
  const filters = arr(symbolInfo.filters).map(obj);
  const find = (type: string) => filters.find((filter) => filter.filterType === type) ?? {};
  const lot = find("LOT_SIZE"), price = find("PRICE_FILTER"), notional = filters.find((filter) => filter.filterType === "NOTIONAL") ?? find("MIN_NOTIONAL");
  return { stepSize: n(lot.stepSize), minQty: n(lot.minQty), maxQty: n(lot.maxQty), tickSize: n(price.tickSize), minNotional: n(notional.minNotional) };
}

async function normalizeMarketBuy(symbol: string, quoteAmount: number) {
  const [{ ask }, rules] = await Promise.all([bookQuote(symbol), symbolRules(symbol)]);
  const quantity = floorStep(quoteAmount / ask, rules.stepSize), actualQuote = quantity * ask;
  if (!(quantity > 0)) throw new Error("Order quantity rounds to zero under Binance rules.");
  if (rules.minQty > 0 && quantity + 1e-15 < rules.minQty) throw new Error("Order is below Binance minimum quantity.");
  if (rules.maxQty > 0 && quantity - 1e-15 > rules.maxQty) throw new Error("Order exceeds Binance maximum quantity.");
  if (rules.minNotional > 0 && actualQuote + 1e-9 < rules.minNotional) throw new Error("Order is below Binance minimum notional.");
  return { price: ask, quantity, quote: actualQuote };
}

export async function POST(request: NextRequest) {
  let lockId: string | null = null;
  let db: SupabaseClient | null = null;
  let accountId: string | null = null;
  let tokenToSet: string | null = null;
  try {
    const resolved = await resolveTraderAccount(request);
    db = resolved.db; accountId = resolved.account.id; tokenToSet = resolved.tokenToSet;
    const body = await request.json().catch(() => ({})) as Json;
    const action = String(body.action ?? "");

    if (action === "sync_bots") {
      const bots = arr(body.bots).map(obj), clientIds = new Set<string>();
      for (const bot of bots) {
        if (!bot.id) continue;
        clientIds.add(String(bot.id));
        await upsertBotInput(db, accountId, bot);
      }
      const { data: existing, error } = await db.from("trader_bots").select("id,client_id").eq("account_id", accountId).eq("is_archived", false);
      if (error) throw error;
      for (const bot of existing ?? []) {
        if (clientIds.has(String(bot.client_id))) continue;
        const { count, error: countError } = await db.from("trader_trades").select("id", { count: "exact", head: true }).eq("bot_id", bot.id).eq("status", "Active");
        if (countError) throw countError;
        const patch = (count ?? 0) > 0 ? { status: "Stopped" } : { status: "Stopped", is_archived: true };
        const { error: archiveError } = await db.from("trader_bots").update(patch).eq("id", bot.id);
        if (archiveError) throw archiveError;
      }
    } else if (action === "edit_trade") {
      lockId = await acquireCommandLease(db, accountId);
      const tradeClientId = String(body.tradeId ?? ""), patch = obj(body.patch);
      const { data: trade, error } = await db.from("trader_trades").select("*").eq("account_id", accountId).eq("client_id", tradeClientId).eq("status", "Active").maybeSingle();
      if (error) throw error;
      if (!trade) throw new Error("Active trade was not found.");
      const maxAveraging = Math.max(n(trade.averaging_filled), Math.round(n(patch.maxAveraging, n(trade.max_averaging))));
      const remaining = Math.max(0, maxAveraging - n(trade.averaging_filled));
      const activeOrdersLimit = remaining > 0 ? Math.max(1, Math.min(remaining, Math.round(n(patch.activeOrdersLimit, n(trade.active_orders_limit, 1))))) : 0;
      const { error: updateError } = await db.from("trader_trades").update({
        max_averaging: maxAveraging,
        active_orders_limit: activeOrdersLimit,
        take_profit_pct: Math.max(0, n(patch.takeProfitPct, n(trade.take_profit_pct))),
        trailing_enabled: patch.trailingEnabled == null ? trade.trailing_enabled : patch.trailingEnabled === true,
        trailing_deviation_pct: Math.max(0, n(patch.trailingDeviationPct, n(trade.trailing_deviation_pct))),
        stop_enabled: patch.stopEnabled == null ? trade.stop_enabled : patch.stopEnabled === true,
        stop_pct: Math.max(0, n(patch.stopPct, n(trade.stop_pct))),
        max_hold_enabled: patch.maxHoldEnabled == null ? trade.max_hold_enabled : patch.maxHoldEnabled === true,
        max_hold_hours: patch.maxHoldHours == null ? trade.max_hold_hours : Math.max(0.01, n(patch.maxHoldHours)),
      }).eq("id", trade.id);
      if (updateError) throw updateError;
    } else if (action === "manual_close") {
      lockId = await acquireCommandLease(db, accountId);
      const { data: trade, error } = await db.from("trader_trades").select("id,pair,status").eq("account_id", accountId).eq("client_id", String(body.tradeId ?? "")).maybeSingle();
      if (error) throw error;
      if (!trade || trade.status !== "Active") throw new Error("Active trade was not found.");
      const { bid } = await bookQuote(String(trade.pair).replace("/", ""));
      const { error: closeError } = await db.rpc("trader_close_trade", { p_trade_id: trade.id, p_exit_price: bid, p_reason: "Manual close", p_order_kind: "manual_exit", p_fee_amount: 0 } as never);
      if (closeError) throw closeError;
    } else if (action === "add_funds") {
      lockId = await acquireCommandLease(db, accountId);
      const requested = n(body.amount);
      if (!(requested > 0)) throw new Error("Add Funds amount must be greater than 0.");
      const { data: trade, error } = await db.from("trader_trades").select("*").eq("account_id", accountId).eq("client_id", String(body.tradeId ?? "")).eq("status", "Active").maybeSingle();
      if (error) throw error;
      if (!trade) throw new Error("Active trade was not found.");
      const snapshotBefore = await traderSnapshot(db, resolved.account);
      if (requested > n(snapshotBefore.account.available) + 0.000001) throw new Error("Add Funds exceeds available USDT.");
      const execution = await normalizeMarketBuy(String(trade.pair).replace("/", ""), requested);
      const { data: order, error: orderError } = await db.from("trader_orders").insert({
        account_id: accountId, bot_id: trade.bot_id, trade_id: trade.id,
        client_order_id: `${trade.client_id}:add:${Date.now()}`, pair: trade.pair,
        kind: "add_funds", side: "BUY", order_type: "MARKET", status: "OPEN",
        price: execution.price, requested_quote: execution.quote, requested_qty: execution.quantity,
        reserved_quote: execution.quote, exchange: "paper", opened_at: new Date().toISOString(), metadata: { source: "server_command" },
      }).select("id").single();
      if (orderError || !order) throw orderError ?? new Error("Unable to create Add Funds order.");
      const { error: fillError } = await db.rpc("trader_fill_buy_order", { p_order_id: order.id, p_fill_price: execution.price, p_fill_quantity: execution.quantity, p_fill_quote: execution.quote, p_fee_amount: 0, p_increment_averaging: false } as never);
      if (fillError) throw fillError;
    } else {
      return attachTraderCookie(response({ error: "Unsupported trader command." }, 400), tokenToSet);
    }

    return attachTraderCookie(response(await traderSnapshot(db, resolved.account)), tokenToSet);
  } catch (error) {
    console.error("trader-server-command", error);
    return attachTraderCookie(response({ error: error instanceof Error ? error.message : "Trader server command failed." }, 500), tokenToSet);
  } finally {
    if (db && accountId && lockId) await db.rpc("trader_release_account", { p_account_id: accountId, p_worker_id: lockId } as never).catch(() => undefined);
  }
}
