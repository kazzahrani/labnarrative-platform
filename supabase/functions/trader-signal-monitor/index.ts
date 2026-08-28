import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type EventRow = {
  id: string;
  account_id: string;
  bot_id: string;
  action: string;
  pair: string;
  amount: number | string | null;
  signal_id: string | null;
  dedupe_key: string | null;
  status: string;
  received_at: string;
  processed_at: string | null;
  error: string | null;
  payload: Json | null;
};
type QueueRow = {
  id: string;
  account_id: string;
  bot_id: string;
  action: string;
  pair: string;
  signal_id: string | null;
  dedupe_key: string | null;
  payload: Json | null;
  status: string;
  received_at: string;
};
type TradeRow = {
  id: string;
  client_id: string;
  pair: string;
  status: string;
  execution_mode: string;
};
type OrderRow = {
  id: string;
  trade_id: string;
  client_order_id: string | null;
  pair: string;
  side: string;
  kind: string;
  status: string;
  requested_quote: number | string | null;
  requested_qty: number | string | null;
  filled_qty: number | string | null;
  filled_quote: number | string | null;
  average_fill_price: number | string | null;
  exchange: string | null;
  exchange_order_id: string | null;
  created_at: string;
  filled_at: string | null;
};

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function text(value: unknown): string | null {
  const clean = String(value ?? "").trim();
  return clean ? clean : null;
}
function cleanPair(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.endsWith("USDT") && raw.length > 4) return `${raw.slice(0, -4)}/USDT`;
  return String(value ?? "").trim().toUpperCase();
}
function canonicalAction(value: unknown) {
  const action = String(value ?? "").trim().toLowerCase();
  if (action === "buy" || action === "start") return "start";
  if (action === "sell" || action === "close") return "close";
  return action;
}
function signalKey(botId: string, action: string, pair: string, signalId: string | null) {
  if (!signalId) return null;
  return `${botId}|${canonicalAction(action)}|${cleanPair(pair)}|${signalId}`;
}
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://platform.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "access-control-allow-origin": allowed ? origin : "https://platform.labnarrative.com",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json", "cache-control": "no-store" },
  });
}
function signalContext(signalId: string | null) {
  if (!signalId) return { tradingViewOrderId: null, tradingViewEventTime: null };
  const separator = signalId.lastIndexOf("|");
  if (separator <= 0 || separator >= signalId.length - 1) {
    return { tradingViewOrderId: signalId, tradingViewEventTime: null };
  }
  return {
    tradingViewOrderId: signalId.slice(0, separator) || null,
    tradingViewEventTime: signalId.slice(separator + 1) || null,
  };
}
function expectedSide(action: string) {
  const normalized = action.toLowerCase();
  if (normalized === "close" || normalized === "sell" || normalized.includes("exit")) return "SELL";
  if (normalized === "start" || normalized === "buy" || normalized === "add_funds" || normalized.includes("add")) return "BUY";
  return "";
}
function closestOrder(event: EventRow, trade: TradeRow | undefined, orders: OrderRow[]) {
  if (!trade) return null;
  const side = expectedSide(event.action);
  const eventAt = Date.parse(event.processed_at || event.received_at);
  const candidates = orders.filter((order) => order.trade_id === trade.id && (!side || order.side === side));
  if (!candidates.length) return null;
  let best: OrderRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const order of candidates) {
    const distance = Math.abs(Date.parse(order.created_at) - eventAt);
    if (distance < bestDistance) {
      best = order;
      bestDistance = distance;
    }
  }
  return bestDistance <= 180_000 ? best : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(req, { error: "server_configuration_missing" }, 500);

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const authorization = req.headers.get("authorization") || "";
    const bearer = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json(req, { error: "unauthorized" }, 401);
    const { data: userData, error: userError } = await db.auth.getUser(bearer);
    if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Json;
    const accountId = String(body.accountId || "").trim();
    const limit = Math.max(20, Math.min(200, Math.round(Number(body.limit || 120))));
    if (!accountId) return json(req, { error: "account_required" }, 400);

    const { data: account, error: accountError } = await db
      .from("trader_accounts")
      .select("id,name,account_kind,mode")
      .eq("id", accountId)
      .eq("owner_user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json(req, { error: "account_not_found" }, 404);

    const [
      { data: botRows, error: botError },
      { data: eventRows, error: eventError },
      { data: queueRows, error: queueError },
    ] = await Promise.all([
      db.from("trader_bots").select("id,name,execution_mode,client_state").eq("account_id", accountId),
      db.from("trader_tradingview_events")
        .select("id,account_id,bot_id,action,pair,amount,signal_id,dedupe_key,status,received_at,processed_at,error,payload")
        .eq("account_id", accountId)
        .order("received_at", { ascending: false })
        .limit(limit),
      db.from("trader_strategy_signal_queue")
        .select("id,account_id,bot_id,action,pair,signal_id,dedupe_key,payload,status,received_at")
        .eq("account_id", accountId)
        .in("status", ["pending", "dispatching"])
        .order("received_at", { ascending: false })
        .limit(limit),
    ]);
    if (botError) throw botError;
    if (eventError) throw eventError;
    if (queueError) throw queueError;

    const realEvents = (eventRows ?? []) as EventRow[];
    const existingKeys = new Set(realEvents.map((event) => signalKey(event.bot_id, event.action, event.pair, event.signal_id)).filter(Boolean) as string[]);
    const queuedEvents: EventRow[] = ((queueRows ?? []) as QueueRow[])
      .filter((row) => {
        const key = signalKey(row.bot_id, row.action, row.pair, row.signal_id);
        return !key || !existingKeys.has(key);
      })
      .map((row) => ({
        id: `queue:${row.id}`,
        account_id: row.account_id,
        bot_id: row.bot_id,
        action: row.action === "buy" ? "start" : "close",
        pair: row.pair,
        amount: null,
        signal_id: row.signal_id,
        dedupe_key: row.dedupe_key,
        status: row.status === "dispatching" ? "processing" : "pending",
        received_at: row.received_at,
        processed_at: null,
        error: null,
        payload: row.payload,
      }));
    const events = [...realEvents, ...queuedEvents]
      .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))
      .slice(0, limit);

    const bots = (botRows ?? []).map((row) => {
      const state = obj(row.client_state);
      return {
        id: String(row.id),
        name: String(row.name || "Automation"),
        executionMode: String(row.execution_mode || ""),
        automationType: String(state.automationType || "dca"),
      };
    });
    const botMap = new Map(bots.map((bot) => [bot.id, bot]));

    const tradeClientIds = Array.from(new Set(events.map((event) => text(obj(obj(event.payload).result).tradeId)).filter(Boolean))) as string[];
    let trades: TradeRow[] = [];
    if (tradeClientIds.length) {
      const { data, error } = await db
        .from("trader_trades")
        .select("id,client_id,pair,status,execution_mode")
        .eq("account_id", accountId)
        .in("client_id", tradeClientIds.slice(0, 200));
      if (error) throw error;
      trades = (data ?? []) as TradeRow[];
    }
    const tradeByClient = new Map(trades.map((trade) => [trade.client_id, trade]));

    let orders: OrderRow[] = [];
    const tradeIds = trades.map((trade) => trade.id);
    if (tradeIds.length) {
      const { data, error } = await db
        .from("trader_orders")
        .select("id,trade_id,client_order_id,pair,side,kind,status,requested_quote,requested_qty,filled_qty,filled_quote,average_fill_price,exchange,exchange_order_id,created_at,filled_at")
        .eq("account_id", accountId)
        .in("trade_id", tradeIds.slice(0, 200))
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      orders = (data ?? []) as OrderRow[];
    }

    const safeEvents = events.map((event) => {
      const payload = obj(event.payload);
      const result = obj(payload.result);
      const context = Object.keys(obj(payload.orderContext)).length ? obj(payload.orderContext) : payload;
      const tradeClientId = text(result.tradeId);
      const trade = tradeClientId ? tradeByClient.get(tradeClientId) : undefined;
      const order = closestOrder(event, trade, orders);
      const signal = signalContext(event.signal_id);
      const bot = botMap.get(event.bot_id);
      const maxOpenPositions = numeric(result.maxOpenPositions);
      const activePositions = numeric(result.activePositions);
      return {
        id: event.id,
        receivedAt: event.received_at,
        processedAt: event.processed_at,
        account: { id: String(account.id), name: String(account.name || "Account"), kind: String(account.account_kind), mode: String(account.mode) },
        automation: { id: event.bot_id, name: bot?.name || "Automation", type: bot?.automationType || "tradingview_strategy", executionMode: bot?.executionMode || "" },
        source: "TradingView",
        symbol: cleanPair(event.pair),
        action: event.action,
        rawStatus: event.status,
        rawReason: text(result.reason) || text(event.error),
        requestedQuote: numeric(result.requestedQuote) ?? numeric(event.amount),
        contracts: numeric(context.contracts),
        tradingViewOrderPrice: numeric(context.orderPrice ?? context.order_price),
        positionSize: numeric(context.positionSize ?? context.position_size),
        previousPositionSize: numeric(context.prevPositionSize ?? context.prev_position_size),
        marketPosition: text(context.marketPosition ?? context.market_position),
        previousMarketPosition: text(context.prevMarketPosition ?? context.prev_market_position),
        tradingViewOrderId: signal.tradingViewOrderId,
        tradingViewEventTime: signal.tradingViewEventTime,
        signalId: event.signal_id,
        positionAction: text(result.positionAction),
        resultPrice: numeric(result.price),
        resultQuote: numeric(result.quote),
        resultQuantity: numeric(result.executedQty ?? result.quantity),
        remainingQuantity: numeric(result.remainingQty),
        resultFraction: numeric(result.fraction),
        tradeId: tradeClientId,
        order: order ? {
          id: order.id,
          clientOrderId: order.client_order_id,
          side: order.side,
          kind: order.kind,
          status: order.status,
          requestedQuote: numeric(order.requested_quote),
          requestedQuantity: numeric(order.requested_qty),
          filledQuantity: numeric(order.filled_qty),
          filledQuote: numeric(order.filled_quote),
          averageFillPrice: numeric(order.average_fill_price),
          exchange: order.exchange,
          exchangeOrderId: order.exchange_order_id,
          createdAt: order.created_at,
          filledAt: order.filled_at,
        } : null,
        capacity: maxOpenPositions !== null || activePositions !== null ? { maxOpenPositions, activePositions } : null,
      };
    });

    return json(req, {
      ok: true,
      account: { id: String(account.id), name: String(account.name || "Account"), kind: String(account.account_kind), mode: String(account.mode) },
      automations: bots.filter((bot) => bot.automationType === "tradingview_strategy"),
      events: safeEvents,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("trader-signal-monitor", error);
    return json(req, { error: error instanceof Error ? error.message : "signal_monitor_failed" }, 500);
  }
});
