import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
const SUPPORTED_PROVIDERS = new Set(["binance", "bybit", "okx", "kucoin"]);
const OPEN_ORDER_STATUSES = new Set(["OPEN", "PENDING", "NEW", "PARTIALLY_FILLED"]);

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
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function clean(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts")
    .select("id,name,mode,status,quote_asset,starting_balance,last_worker_at,created_at")
    .eq("owner_user_id", userId)
    .eq("account_kind", "real")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return data as Json;
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
    const account = await realAccount(db, userData.user.id);
    const accountId = String(account.id);
    const [portfolioResult, positionsResult, botsResult, tradesResult, ordersResult, fillsResult, controlsResult, workerResult, binanceResult, exchangesResult] = await Promise.all([
      db.from("trader_v2_portfolio_accounting_latest").select("*").eq("account_id", accountId).maybeSingle(),
      db.from("trader_v2_positions_latest").select("*").eq("account_id", accountId).order("opened_at", { ascending: false }),
      db.from("trader_bots").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
      db.from("trader_trades").select("*").eq("account_id", accountId).order("opened_at", { ascending: false }),
      db.from("trader_orders").select("*").eq("account_id", accountId).order("opened_at", { ascending: false }),
      db.from("trader_fills").select("id,bot_id,trade_id,order_id,pair,side,kind,price,quantity,quote_amount,fee_asset,fee_amount,filled_at").eq("account_id", accountId).order("filled_at", { ascending: true }),
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order,max_concurrent_live_trades,daily_loss_limit,live_confirmed_at,live_generation").eq("account_id", accountId).maybeSingle(),
      db.from("trader_worker_runs").select("status,started_at,finished_at,duration_ms,error").eq("account_id", accountId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("trader_binance_connections").select("provider,status,last_verified_at").eq("account_id", accountId).limit(1).maybeSingle(),
      db.from("trader_exchange_connections").select("provider,status,last_verified_at").eq("account_id", accountId),
    ]);
    for (const result of [portfolioResult, positionsResult, botsResult, tradesResult, ordersResult, fillsResult, controlsResult, workerResult, binanceResult, exchangesResult]) {
      if (result.error) throw result.error;
    }

    const portfolio = obj(portfolioResult.data);
    if (!portfolioResult.data) return json(req, { ok: true, ready: false, accountId, error: "v2_snapshot_pending" }, 409);
    const positions = (positionsResult.data ?? []) as Json[];
    const bots = (botsResult.data ?? []) as Json[];
    const rawTrades = (tradesResult.data ?? []) as Json[];
    const rawOrders = (ordersResult.data ?? []) as Json[];
    const rawFills = (fillsResult.data ?? []) as Json[];
    const positionByTrade = new Map(positions.map((row) => [String(row.trade_id || ""), row]));
    const botById = new Map(bots.map((row) => [String(row.id || ""), row]));

    const openOrders = rawOrders.filter((row) => OPEN_ORDER_STATUSES.has(String(row.status || "").toUpperCase()));
    const openOrdersByTrade = new Map<string, Json[]>();
    for (const order of openOrders) {
      const key = String(order.trade_id || "");
      if (!key) continue;
      openOrdersByTrade.set(key, [...(openOrdersByTrade.get(key) ?? []), order]);
    }
    const fillsByTrade = new Map<string, Json[]>();
    for (const fill of rawFills) {
      const key = String(fill.trade_id || "");
      if (!key || String(fill.side || "").toUpperCase() !== "BUY") continue;
      const kind = String(fill.kind || "").toLowerCase();
      if (kind !== "base" && kind !== "averaging") continue;
      fillsByTrade.set(key, [...(fillsByTrade.get(key) ?? []), {
        kind: kind === "base" ? "Base" : "Averaging",
        price: n(fill.price), amount: n(fill.quote_amount), quantity: n(fill.quantity), at: String(fill.filled_at || ""),
      }]);
    }

    const mappedTrades = rawTrades.map((trade) => {
      const tradeId = String(trade.id || "");
      const position = positionByTrade.get(tradeId);
      const active = String(trade.status || "") === "Active" && Boolean(position);
      const averagePrice = active ? n(position?.average_price) : n(trade.average_price);
      const quantity = active ? n(position?.quantity) : n(trade.quantity);
      const invested = active ? n(position?.remaining_cost_basis) : n(trade.total_invested, n(trade.invested));
      const pnl = active ? n(position?.unrealized_pnl) : n(trade.realized_pnl);
      const pnlPct = active ? n(position?.unrealized_pct) : (invested > 0 ? pnl / invested * 100 : 0);
      const lastPrice = active && position?.last_price != null ? n(position.last_price) : (trade.last_price == null ? null : n(trade.last_price));
      const takeProfitPct = n(trade.take_profit_pct);
      const stopEnabled = trade.stop_enabled === true;
      const stopPct = n(trade.stop_pct);
      const nextOrder = (openOrdersByTrade.get(tradeId) ?? [])
        .filter((order) => String(order.kind || "").toLowerCase().includes("averag") && String(order.side || "").toUpperCase() === "BUY")
        .sort((a, b) => n(a.sequence_no, 9999) - n(b.sequence_no, 9999))[0];
      const bot = botById.get(String(trade.bot_id || ""));
      return {
        id: String(trade.client_id || trade.id || ""),
        botId: bot ? String(bot.client_id || bot.id || "") : null,
        botName: String(bot?.name || position?.bot_name || "DCA Bot"),
        pair: String(trade.pair || position?.pair || ""),
        status: String(trade.status || ""),
        entryPrice: n(trade.entry_price), averagePrice, quantity, invested,
        averagingFilled: active ? n(position?.completed_dca_orders) : n(trade.averaging_filled),
        maxAveraging: active ? n(position?.max_dca_orders) : n(trade.max_averaging),
        activeOrdersLimit: active ? n(position?.active_dca_limit) : n(trade.active_orders_limit),
        takeProfitPct,
        takeProfitPrice: averagePrice > 0 && takeProfitPct > 0 ? averagePrice * (1 + takeProfitPct / 100) : null,
        stopEnabled, stopPct,
        stopLossPrice: stopEnabled && averagePrice > 0 && stopPct > 0 ? averagePrice * (1 - stopPct / 100) : null,
        nextAveragingPrice: nextOrder?.price == null ? null : n(nextOrder.price),
        lastPrice,
        realizedPnl: trade.realized_pnl == null ? null : n(trade.realized_pnl),
        pnl, pnlPct,
        exitPrice: trade.exit_price == null ? null : n(trade.exit_price),
        openedAt: String(trade.opened_at || ""), closedAt: trade.closed_at ? String(trade.closed_at) : null,
        closeReason: trade.close_reason ? String(trade.close_reason) : null,
        executionMode: String(trade.execution_mode || account.mode || "live"),
        fills: fillsByTrade.get(tradeId) ?? [],
      };
    });

    const statsByBot = new Map<string, { active: number; closed: number; pnl: number }>();
    for (let i = 0; i < rawTrades.length; i += 1) {
      const raw = rawTrades[i], mapped = mappedTrades[i];
      const key = String(raw.bot_id || "");
      if (!key) continue;
      const state = statsByBot.get(key) ?? { active: 0, closed: 0, pnl: 0 };
      if (String(raw.status || "") === "Active") state.active += 1; else state.closed += 1;
      state.pnl += n(mapped.pnl);
      statsByBot.set(key, state);
    }
    const mappedBots = bots.map((bot) => {
      const stats = statsByBot.get(String(bot.id || "")) ?? { active: 0, closed: 0, pnl: 0 };
      const conditions = Array.isArray(bot.conditions) ? bot.conditions as Json[] : [];
      return {
        id: String(bot.client_id || bot.id || ""), name: String(bot.name || "Automation"), status: String(bot.status || "Stopped"),
        lifecycle: bot.is_archived === true ? "closed" : "active", pair: String(bot.pair || "BTC/USDT"),
        baseOrder: n(bot.base_order), safetyOrder: n(bot.safety_order), maxSafetyOrders: n(bot.max_safety_orders),
        limitSafetyOrders: n(bot.limit_safety_orders), maxActiveTrades: n(bot.max_active_trades, 1), deviation: n(bot.deviation),
        stepScale: n(bot.step_scale), volumeScale: n(bot.volume_scale), takeProfit: n(bot.take_profit_pct),
        stopEnabled: bot.stop_enabled === true, stopPct: n(bot.stop_pct),
        startCondition: conditions.length ? conditions.map((condition) => String(condition.kind || "Condition")).join(" + ") : "Immediately",
        executionMode: String(bot.execution_mode || account.mode || "live"), activeTradeCount: stats.active, closedTradeCount: stats.closed,
        pnl: stats.pnl, createdAt: String(bot.created_at || ""), updatedAt: String(bot.updated_at || bot.created_at || ""),
      };
    });

    const assetTotals = Array.isArray(portfolio.asset_totals) ? portfolio.asset_totals.map(obj) : [];
    const balances = assetTotals.map((asset) => {
      const providers = Array.isArray(asset.providers) ? asset.providers.map(obj) : [];
      const free = providers.reduce((sum, row) => sum + n(row.free), 0);
      const locked = providers.reduce((sum, row) => sum + n(row.locked), 0);
      const priced = asset.priced === true;
      return {
        asset: String(asset.asset || ""), free, locked,
        usdPrice: priced && asset.priceUsd != null ? n(asset.priceUsd) : null,
        usdValue: priced ? n(asset.usdValue) : null,
      };
    }).filter((row) => row.asset);

    const providerRows: Json[] = [];
    if (binanceResult.data) providerRows.push({ ...(binanceResult.data as Json), provider: "binance" });
    for (const row of (exchangesResult.data ?? []) as Json[]) providerRows.push(row);
    const supportedConnections = providerRows.filter((row) => SUPPORTED_PROVIDERS.has(String(row.provider || "").toLowerCase()));
    const supportedConnectedCount = supportedConnections.filter((row) => String(row.status || "") === "connected").length;

    const invested = positions.reduce((sum, row) => sum + n(row.remaining_cost_basis), 0);
    const unrealized = positions.reduce((sum, row) => sum + n(row.unrealized_pnl), 0);
    const realized = rawTrades.filter((row) => String(row.status || "") !== "Active").reduce((sum, row) => sum + n(row.realized_pnl), 0);
    const reserved = openOrders.filter((row) => String(row.side || "").toUpperCase() === "BUY").reduce((sum, row) => sum + n(row.reserved_quote), 0);
    const totalUsd = n(portfolio.accounting_total_usd);
    const cashUsd = n(portfolio.cash_usd);

    return json(req, {
      ok: true, ready: true, source: "core_v2", accountId,
      account: {
        id: accountId, name: String(account.name || "Real Account"), kind: "real", mode: String(account.mode || "live"),
        quoteAsset: String(account.quote_asset || "USDT"), startingBalance: n(account.starting_balance), invested, reserved,
        available: cashUsd, realizedPnl: realized, unrealizedPnl: unrealized, equity: totalUsd,
        lastWorkerAt: account.last_worker_at ? String(account.last_worker_at) : null,
      },
      controls: controlsResult.data ?? { global_live_enabled: false, kill_switch: true },
      worker: workerResult.data ?? null,
      bots: mappedBots, trades: mappedTrades,
      orders: openOrders.map((order) => ({
        id: String(order.client_order_id || order.id || ""), tradeId: order.trade_id ? String(order.trade_id) : null,
        pair: String(order.pair || ""), kind: String(order.kind || ""), side: String(order.side || ""), status: String(order.status || ""),
        sequence: n(order.sequence_no), price: order.price == null ? null : n(order.price), amount: n(order.requested_quote), reserved: n(order.reserved_quote),
      })),
      balances, quoteBalance: cashUsd, totalUsd,
      portfolio: {
        capturedAt: portfolio.captured_at ?? null, exchangeTotalUsd: n(portfolio.exchange_total_usd), accountingTotalUsd: totalUsd,
        inTransitUsd: n(portfolio.in_transit_usd), cashUsd, holdingsUsd: n(portfolio.holdings_usd),
        connectedProviderCount: n(portfolio.connected_provider_count), freshProviderCount: n(portfolio.fresh_provider_count),
        staleProviderCount: n(portfolio.stale_provider_count), unpricedAssetCount: n(portfolio.unpriced_asset_count),
      },
      supportedConnectedCount,
      supportedProviders: ["binance", "bybit", "okx", "kucoin"],
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = clean(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_workspace_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});
