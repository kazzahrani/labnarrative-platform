import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type BotRow = {
  id: string;
  client_id: string;
  public_bot_no: number | null;
  name: string;
  status: string;
  exchange_provider: string | null;
  execution_mode: string;
  pair: string;
  pairs: string[] | null;
  all_pairs: boolean | null;
  base_order: number | string | null;
  safety_order: number | string | null;
  max_safety_orders: number | string | null;
  limit_safety_orders: number | string | null;
  max_active_trades: number | string | null;
  deviation: number | string | null;
  step_scale: number | string | null;
  volume_scale: number | string | null;
  take_profit_pct: number | string | null;
  stop_enabled: boolean | null;
  stop_pct: number | string | null;
  trailing_pct: number | string | null;
  max_hold_enabled: boolean | null;
  max_hold_hours: number | string | null;
  averaging_enabled: boolean | null;
  order_type: string | null;
  tradingview_enabled: boolean | null;
  conditions: unknown;
  client_state: Json | null;
  is_archived: boolean | null;
  updated_at: string | null;
  created_at: string;
};
type TradeMetricRow = { bot_id: string | null; status: string; realized_pnl: number | string | null };
type PositionMetricRow = { bot_id: string | null; unrealized_pnl: number | string | null; remaining_cost_basis: number | string | null };
type BotMetrics = { executions: number; closed: number; realizedPnl: number; active: number; unrealizedPnl: number; activeCapital: number };
const SUPPORTED_PROVIDERS = new Set(["binance", "bybit", "okx", "kucoin"]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://app.labnarrative.com" || origin === "https://platform.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://app.labnarrative.com",
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
function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function botType(bot: BotRow) {
  return bot.tradingview_enabled === true || String(obj(bot.client_state).automationType || "") === "tradingview_strategy" ? "Strategy Execution" : "DCA";
}
function maxActive(bot: BotRow): number | null {
  if (botType(bot) === "Strategy Execution") {
    const raw = obj(bot.client_state).strategyMaxOpenPositions;
    if (raw === null || raw === undefined || String(raw).trim().toLowerCase() === "unlimited") return null;
    const parsed = Math.round(n(raw, 0));
    return parsed > 0 ? parsed : null;
  }
  const parsed = Math.round(n(bot.max_active_trades, 0));
  return parsed > 0 ? parsed : null;
}
function marketLabel(bot: BotRow) {
  if (botType(bot) === "Strategy Execution") return "From TradingView";
  if (bot.all_pairs === true) return "All coins";
  const pairs = Array.isArray(bot.pairs) ? bot.pairs.filter(Boolean) : [];
  if (pairs.length > 1) return `${pairs.length} pairs`;
  return pairs[0] || bot.pair || "Configured market";
}
function conditionLabel(bot: BotRow) {
  if (botType(bot) === "Strategy Execution") return "";
  if (!Array.isArray(bot.conditions) || bot.conditions.length === 0) return "Immediately";
  return bot.conditions.slice(0, 6).map((raw) => String(obj(raw).kind || "Rule")).join(" + ");
}
function maxCapital(bot: BotRow) {
  if (botType(bot) === "Strategy Execution") return null;
  const base = Math.max(0, n(bot.base_order));
  let perTrade = base;
  if (bot.averaging_enabled === true) {
    const safety = Math.max(0, n(bot.safety_order));
    const scale = Math.max(0.000001, n(bot.volume_scale, 1));
    const count = Math.max(0, Math.round(n(bot.max_safety_orders)));
    for (let index = 0; index < count; index += 1) perTrade += safety * Math.pow(scale, index);
  }
  const capacity = Math.max(1, maxActive(bot) ?? 1);
  return perTrade * capacity;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }
function metricFor(map: Map<string, BotMetrics>, botId: string) {
  const existing = map.get(botId);
  if (existing) return existing;
  const created = { executions: 0, closed: 0, realizedPnl: 0, active: 0, unrealizedPnl: 0, activeCapital: 0 };
  map.set(botId, created);
  return created;
}

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts")
    .select("id,name")
    .eq("owner_user_id", userId)
    .eq("account_kind", "real")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return { id: String(data.id), name: String(data.name || "Real Account") };
}
async function tradeMetricsRows(db: Db, accountId: string) {
  const rows: TradeMetricRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from("trader_trades")
      .select("bot_id,status,realized_pnl")
      .eq("account_id", accountId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as TradeMetricRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
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
    const [botsResult, trades, positionsResult] = await Promise.all([
      db.from("trader_bots")
        .select("id,client_id,public_bot_no,name,status,exchange_provider,execution_mode,pair,pairs,all_pairs,base_order,safety_order,max_safety_orders,limit_safety_orders,max_active_trades,deviation,step_scale,volume_scale,take_profit_pct,stop_enabled,stop_pct,trailing_pct,max_hold_enabled,max_hold_hours,averaging_enabled,order_type,tradingview_enabled,conditions,client_state,is_archived,updated_at,created_at")
        .eq("account_id", account.id)
        .order("public_bot_no", { ascending: false, nullsFirst: false }),
      tradeMetricsRows(db, account.id),
      db.from("trader_v2_positions_latest")
        .select("bot_id,unrealized_pnl,remaining_cost_basis")
        .eq("account_id", account.id),
    ]);
    if (botsResult.error) throw botsResult.error;
    if (positionsResult.error) throw positionsResult.error;

    const metrics = new Map<string, BotMetrics>();
    let closedPositions = 0;
    let realizedPnl = 0;
    for (const trade of trades) {
      if (!trade.bot_id) continue;
      const metric = metricFor(metrics, trade.bot_id);
      metric.executions += 1;
      if (String(trade.status) === "Closed") {
        const pnl = n(trade.realized_pnl);
        metric.closed += 1;
        metric.realizedPnl += pnl;
        closedPositions += 1;
        realizedPnl += pnl;
      }
    }
    let activePositions = 0;
    let unrealizedPnl = 0;
    for (const position of (positionsResult.data ?? []) as PositionMetricRow[]) {
      if (!position.bot_id) continue;
      const metric = metricFor(metrics, position.bot_id);
      const pnl = n(position.unrealized_pnl);
      metric.active += 1;
      metric.unrealizedPnl += pnl;
      metric.activeCapital += Math.max(0, n(position.remaining_cost_basis));
      activePositions += 1;
      unrealizedPnl += pnl;
    }

    const automations = ((botsResult.data ?? []) as BotRow[]).map((bot) => {
      const type = botType(bot);
      const provider = String(bot.exchange_provider || "unknown").toLowerCase();
      const metric = metricFor(metrics, bot.id);
      return {
        id: bot.id,
        clientId: bot.client_id,
        number: bot.public_bot_no,
        name: bot.name || "Automation",
        status: bot.status || "Stopped",
        type,
        provider,
        executionMode: bot.execution_mode || "",
        pair: bot.pair || "BTC/USDT",
        market: marketLabel(bot),
        conditionLabel: conditionLabel(bot),
        isArchived: bot.is_archived === true,
        executions: metric.executions,
        closedPositions: metric.closed,
        activePositions: metric.active,
        maxActivePositions: maxActive(bot),
        maxCapital: maxCapital(bot),
        realizedPnl: metric.realizedPnl,
        unrealizedPnl: metric.unrealizedPnl,
        pnl: metric.realizedPnl + metric.unrealizedPnl,
        activeCapital: metric.activeCapital,
        baseOrder: nullableNumber(bot.base_order),
        safetyOrder: nullableNumber(bot.safety_order),
        maxSafetyOrders: Math.max(0, Math.round(n(bot.max_safety_orders, 0))),
        activeDcaLimit: Math.max(0, Math.round(n(bot.limit_safety_orders, 0))),
        deviation: Math.max(0, n(bot.deviation, 1)),
        stepScale: Math.max(0, n(bot.step_scale, 1)),
        volumeScale: Math.max(0, n(bot.volume_scale, 1)),
        averagingEnabled: bot.averaging_enabled === true,
        orderType: bot.order_type || "Market",
        takeProfitPct: nullableNumber(bot.take_profit_pct),
        stopEnabled: bot.stop_enabled === true,
        stopPct: nullableNumber(bot.stop_pct),
        trailingPct: nullableNumber(bot.trailing_pct),
        maxHoldEnabled: bot.max_hold_enabled === true,
        maxHoldHours: nullableNumber(bot.max_hold_hours),
        canManage: bot.is_archived !== true && type === "DCA" && SUPPORTED_PROVIDERS.has(provider),
        updatedAt: bot.updated_at || bot.created_at,
      };
    });

    const activeAutomations = automations.filter((bot) => !bot.isArchived);
    const archived = automations.length - activeAutomations.length;
    const running = activeAutomations.filter((bot) => bot.status.toLowerCase() === "running").length;
    const strategies = activeAutomations.filter((bot) => bot.type === "Strategy Execution").length;
    const providerCounts: Record<string, number> = {};
    for (const bot of activeAutomations) providerCounts[bot.provider] = (providerCounts[bot.provider] || 0) + 1;

    return json(req, {
      ok: true,
      ready: true,
      account: { id: account.id, name: account.name },
      supportedProviders: ["binance", "bybit", "okx", "kucoin"],
      summary: {
        total: activeAutomations.length,
        archived,
        running,
        stopped: activeAutomations.length - running,
        dca: activeAutomations.length - strategies,
        strategies,
        activePositions,
        closedPositions,
        realizedPnl,
        unrealizedPnl,
        automationPnl: realizedPnl + unrealizedPnl,
        providerCounts,
      },
      automations,
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = errorMessage(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_automations_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});