import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
}
function n(value: unknown, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function cleanConditions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((raw, index) => {
    const c = obj(raw);
    return {
      id: String(c.id || `condition-${index}`),
      kind: String(c.kind || "RSI"),
      timeframe: String(c.timeframe || "15 minutes"),
      length: n(c.length), comparator: String(c.comparator || "Less Than"), signal: n(c.signal),
      aux1: n(c.aux1), aux2: n(c.aux2), aux3: n(c.aux3),
    };
  });
}
function cleanTakeProfitTargets(value: unknown, averagePrice: number) {
  if (!Array.isArray(value) || averagePrice <= 0) return [];
  return value.slice(0, 8).flatMap((raw, index) => {
    const target = obj(raw);
    const profitPct = n(target.profitPct);
    const allocationPct = n(target.allocationPct);
    if (!(profitPct > 0) || !(allocationPct > 0)) return [];
    return [{ index: index + 1, profitPct, allocationPct, price: averagePrice * (1 + profitPct / 100) }];
  });
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
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({})) as Json;
    const accountId = String(body.accountId || "").trim();
    const tradeId = String(body.tradeId || "").trim();
    if (!accountId) return json({ error: "account_id_required" }, 400);
    if (!tradeId) return json({ error: "trade_id_required" }, 400);

    const { data: account, error: accountError } = await admin.from("trader_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("owner_user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json({ error: "trader_account_not_owned" }, 403);

    const { data: trade, error: tradeError } = await admin.from("trader_trades")
      .select("*")
      .eq("account_id", accountId)
      .eq("client_id", tradeId)
      .maybeSingle();
    if (tradeError) throw tradeError;
    if (!trade) return json({ error: "trade_not_found" }, 404);

    const [botResult, fillsResult, ordersResult] = await Promise.all([
      trade.bot_id ? admin.from("trader_bots").select("id,client_id,name,conditions").eq("account_id", accountId).eq("id", trade.bot_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      admin.from("trader_fills").select("id,order_id,side,kind,price,quantity,quote_amount,filled_at").eq("account_id", accountId).eq("trade_id", trade.id).order("filled_at", { ascending: true }),
      admin.from("trader_orders").select("id,client_order_id,kind,side,status,sequence_no,price,requested_quote,reserved_quote,opened_at,updated_at").eq("account_id", accountId).eq("trade_id", trade.id).order("sequence_no", { ascending: true }),
    ]);
    if (botResult.error) throw botResult.error;
    if (fillsResult.error) throw fillsResult.error;
    if (ordersResult.error) throw ordersResult.error;

    const averagePrice = n(trade.average_price);
    const state = obj(trade.client_state);
    const strategyV2 = state.exitStrategyV2 === true;
    const takeProfitTargets = cleanTakeProfitTargets(state.takeProfitTargets, averagePrice);
    const legacyTakeProfitPct = n(trade.take_profit_pct);
    const takeProfitPct = takeProfitTargets[0]?.profitPct ?? legacyTakeProfitPct;
    const stopPct = strategyV2 ? n(state.stopPct, n(trade.stop_pct)) : n(trade.stop_pct);
    const stopEnabled = strategyV2 ? state.stopEnabled === true : trade.stop_enabled === true;
    const activeOrders = (ordersResult.data ?? []).filter((order) => ["OPEN", "PENDING", "NEW", "PARTIALLY_FILLED"].includes(String(order.status || "").toUpperCase()));
    const orderById = new Map((ordersResult.data ?? []).map((order) => [String(order.id), order]));
    const exchangeProvider = ["bybit", "okx", "kucoin"].includes(String(trade.exchange_provider || "")) ? String(trade.exchange_provider) : "binance";

    return json({
      ok: true,
      trade: {
        id: String(trade.client_id), pair: String(trade.pair), status: String(trade.status), exchangeProvider,
        entryPrice: n(trade.entry_price), averagePrice, quantity: n(trade.quantity), invested: n(trade.invested),
        takeProfitPct,
        takeProfitPrice: takeProfitTargets[0]?.price ?? (averagePrice > 0 && legacyTakeProfitPct > 0 ? averagePrice * (1 + legacyTakeProfitPct / 100) : null),
        takeProfitTargets,
        stopEnabled, stopPct,
        stopLossTimeoutSeconds: strategyV2 ? Math.max(0, n(state.stopLossTimeoutSeconds)) : 0,
        stopLossPrice: stopEnabled && averagePrice > 0 && stopPct > 0 ? averagePrice * (1 - stopPct / 100) : null,
        lastPrice: trade.last_price == null ? null : n(trade.last_price),
        exitPrice: trade.exit_price == null ? null : n(trade.exit_price),
        openedAt: String(trade.opened_at), closedAt: trade.closed_at ? String(trade.closed_at) : null,
        closeReason: trade.close_reason ? String(trade.close_reason) : null,
      },
      bot: botResult.data ? {
        id: String(botResult.data.client_id), name: String(botResult.data.name), conditions: cleanConditions(botResult.data.conditions),
      } : null,
      fills: (fillsResult.data ?? []).map((fill) => {
        const linkedOrder = fill.order_id ? orderById.get(String(fill.order_id)) : null;
        return {
          id: String(fill.id), orderId: fill.order_id ? String(fill.order_id) : null, sequence: linkedOrder ? n(linkedOrder.sequence_no) : 0,
          side: String(fill.side), kind: String(fill.kind), price: n(fill.price), quantity: n(fill.quantity), amount: n(fill.quote_amount), at: String(fill.filled_at),
        };
      }),
      activeOrders: activeOrders.map((order) => ({
        id: String(order.client_order_id || order.id), kind: String(order.kind), side: String(order.side), status: String(order.status),
        sequence: n(order.sequence_no), price: order.price == null ? null : n(order.price), amount: n(order.requested_quote), reserved: n(order.reserved_quote),
      })),
    });
  } catch (error) {
    console.error("trader-chart-control", error instanceof Error ? error.message : String(error));
    return json({ error: "trade_chart_failed" }, 500);
  }
});
