import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type BotRow = {
  id: string;
  name: string;
  status: string;
  pair: string;
  pairs: string[] | null;
  all_pairs: boolean;
  max_active_trades: number | string;
  client_state: Json | null;
  execution_mode: string;
  is_archived: boolean;
  created_at: string;
};
type TradeRow = {
  id: string;
  bot_id: string;
  pair: string;
  status: string;
  invested: number | string | null;
  total_invested: number | string | null;
  realized_pnl: number | string | null;
  close_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
};
type SeriesPoint = { at: string; pnl: number; cumulative: number };
type BotStats = {
  id: string;
  name: string;
  type: string;
  status: string;
  executionMode: string;
  archived: boolean;
  market: string;
  activePositions: number;
  maxActivePositions: number | null;
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  realizedPnl: number;
  realizedRoi: number | null;
  winRate: number | null;
  profitFactor: number | null;
  grossProfit: number;
  grossLoss: number;
  expectancy: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  maxDrawdown: number;
  avgHoldMinutes: number | null;
  firstTradeAt: string | null;
  lastActivityAt: string | null;
  series: SeriesPoint[];
  pairs: Array<{ pair: string; trades: number; pnl: number }>;
  exitReasons: Array<{ reason: string; trades: number; pnl: number }>;
};

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
function rangeStart(range: string) {
  if (range === "ytd") {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0;
  return days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
}
function botType(bot: BotRow) {
  return String(obj(bot.client_state).automationType || "") === "tradingview_strategy" ? "Strategy Execution" : "DCA";
}
function maxActive(bot: BotRow): number | null {
  const state = obj(bot.client_state);
  if (String(state.automationType || "") === "tradingview_strategy") {
    const raw = state.strategyMaxOpenPositions;
    if (raw === null || String(raw ?? "").trim().toLowerCase() === "unlimited") return null;
    const parsed = Math.round(n(raw, 0));
    if (parsed >= 1 && parsed <= 100) return parsed;
  }
  const parsed = Math.round(n(bot.max_active_trades, 0));
  return parsed > 0 ? parsed : null;
}
function marketLabel(bot: BotRow) {
  if (botType(bot) === "Strategy Execution") return "From TradingView";
  if (bot.all_pairs) return "All coins";
  const pairs = Array.isArray(bot.pairs) ? bot.pairs.filter(Boolean) : [];
  if (pairs.length > 1) return `${pairs.length} pairs`;
  return pairs[0] || bot.pair || "Configured market";
}
function sampleSeries(points: SeriesPoint[], max = 220) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points.at(-1);
  if (last && sampled.at(-1)?.at !== last.at) sampled.push(last);
  return sampled;
}
async function fetchClosedTrades(db: Db, accountId: string, since: string | null) {
  const rows: TradeRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10_000; offset += pageSize) {
    let query = db.from("trader_trades")
      .select("id,bot_id,pair,status,invested,total_invested,realized_pnl,close_reason,opened_at,closed_at")
      .eq("account_id", accountId)
      .eq("status", "Closed")
      .order("closed_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (since) query = query.gte("closed_at", since);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as TradeRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
function buildStats(bot: BotRow, closed: TradeRow[], active: TradeRow[]): BotStats {
  const sorted = [...closed].sort((a, b) => Date.parse(a.closed_at || "") - Date.parse(b.closed_at || ""));
  let realizedPnl = 0;
  let invested = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let bestTrade: number | null = null;
  let worstTrade: number | null = null;
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let holdTotal = 0;
  let holdCount = 0;
  let firstTradeAt: string | null = null;
  let lastActivityAt: string | null = null;
  const series: SeriesPoint[] = [];
  const pairMap = new Map<string, { trades: number; pnl: number }>();
  const reasonMap = new Map<string, { trades: number; pnl: number }>();

  for (const trade of sorted) {
    const pnl = n(trade.realized_pnl, 0);
    const capital = Math.max(0, n(trade.total_invested ?? trade.invested, 0));
    realizedPnl += pnl;
    invested += capital;
    if (pnl > 0) { wins++; grossProfit += pnl; }
    else if (pnl < 0) { losses++; grossLoss += Math.abs(pnl); }
    else breakeven++;
    bestTrade = bestTrade === null ? pnl : Math.max(bestTrade, pnl);
    worstTrade = worstTrade === null ? pnl : Math.min(worstTrade, pnl);
    cumulative += pnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    const at = trade.closed_at || trade.opened_at;
    if (at) series.push({ at, pnl, cumulative });
    if (trade.opened_at && trade.closed_at) {
      const minutes = (Date.parse(trade.closed_at) - Date.parse(trade.opened_at)) / 60_000;
      if (Number.isFinite(minutes) && minutes >= 0) { holdTotal += minutes; holdCount++; }
    }
    const pair = trade.pair || "Unknown";
    const pairStat = pairMap.get(pair) || { trades: 0, pnl: 0 };
    pairStat.trades++; pairStat.pnl += pnl; pairMap.set(pair, pairStat);
    const reason = String(trade.close_reason || "Other");
    const reasonStat = reasonMap.get(reason) || { trades: 0, pnl: 0 };
    reasonStat.trades++; reasonStat.pnl += pnl; reasonMap.set(reason, reasonStat);
    if (trade.opened_at && (!firstTradeAt || Date.parse(trade.opened_at) < Date.parse(firstTradeAt))) firstTradeAt = trade.opened_at;
    if (at && (!lastActivityAt || Date.parse(at) > Date.parse(lastActivityAt))) lastActivityAt = at;
  }
  for (const trade of active) {
    if (trade.opened_at && (!firstTradeAt || Date.parse(trade.opened_at) < Date.parse(firstTradeAt))) firstTradeAt = trade.opened_at;
    const at = trade.opened_at;
    if (at && (!lastActivityAt || Date.parse(at) > Date.parse(lastActivityAt))) lastActivityAt = at;
  }
  const totalClosed = sorted.length;
  return {
    id: bot.id,
    name: bot.name || "Automation",
    type: botType(bot),
    status: bot.status || "Stopped",
    executionMode: bot.execution_mode || "",
    archived: bot.is_archived === true,
    market: marketLabel(bot),
    activePositions: active.length,
    maxActivePositions: maxActive(bot),
    closedTrades: totalClosed,
    wins,
    losses,
    breakeven,
    realizedPnl,
    realizedRoi: invested > 0 ? realizedPnl / invested * 100 : null,
    winRate: totalClosed > 0 ? wins / totalClosed * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    grossProfit,
    grossLoss,
    expectancy: totalClosed > 0 ? realizedPnl / totalClosed : null,
    bestTrade,
    worstTrade,
    maxDrawdown,
    avgHoldMinutes: holdCount ? holdTotal / holdCount : null,
    firstTradeAt,
    lastActivityAt,
    series: sampleSeries(series),
    pairs: Array.from(pairMap, ([pair, value]) => ({ pair, ...value })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 12),
    exitReasons: Array.from(reasonMap, ([reason, value]) => ({ reason, ...value })).sort((a, b) => b.trades - a.trades).slice(0, 10),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(req, { error: "server_configuration_missing" }, 500);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const bearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json(req, { error: "unauthorized" }, 401);
    const { data: userData, error: userError } = await db.auth.getUser(bearer);
    if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Json;
    const accountId = String(body.accountId || "").trim();
    const requestedRange = String(body.range || "30d");
    const range = ["7d", "30d", "90d", "ytd", "all"].includes(requestedRange) ? requestedRange : "30d";
    if (!accountId) return json(req, { error: "account_required" }, 400);

    const { data: account, error: accountError } = await db.from("trader_accounts")
      .select("id,name,account_kind,mode")
      .eq("id", accountId)
      .eq("owner_user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json(req, { error: "account_not_found" }, 404);

    const [{ data: botData, error: botError }, { data: activeData, error: activeError }, closed] = await Promise.all([
      db.from("trader_bots")
        .select("id,name,status,pair,pairs,all_pairs,max_active_trades,client_state,execution_mode,is_archived,created_at")
        .eq("account_id", accountId)
        .order("is_archived", { ascending: true })
        .order("created_at", { ascending: true }),
      db.from("trader_trades")
        .select("id,bot_id,pair,status,invested,total_invested,realized_pnl,close_reason,opened_at,closed_at")
        .eq("account_id", accountId)
        .eq("status", "Active"),
      fetchClosedTrades(db, accountId, rangeStart(range)),
    ]);
    if (botError) throw botError;
    if (activeError) throw activeError;

    const bots = (botData ?? []) as BotRow[];
    const active = (activeData ?? []) as TradeRow[];
    const closedByBot = new Map<string, TradeRow[]>();
    const activeByBot = new Map<string, TradeRow[]>();
    for (const trade of closed) {
      const list = closedByBot.get(trade.bot_id) || [];
      list.push(trade); closedByBot.set(trade.bot_id, list);
    }
    for (const trade of active) {
      const list = activeByBot.get(trade.bot_id) || [];
      list.push(trade); activeByBot.set(trade.bot_id, list);
    }
    const automations = bots.map((bot) => buildStats(bot, closedByBot.get(bot.id) || [], activeByBot.get(bot.id) || []));

    let totalPnl = 0;
    let totalInvested = 0;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const overallSeries: SeriesPoint[] = [];
    for (const trade of [...closed].sort((a, b) => Date.parse(a.closed_at || "") - Date.parse(b.closed_at || ""))) {
      const pnl = n(trade.realized_pnl, 0);
      totalPnl += pnl;
      totalInvested += Math.max(0, n(trade.total_invested ?? trade.invested, 0));
      if (pnl > 0) { wins++; grossProfit += pnl; }
      else if (pnl < 0) { losses++; grossLoss += Math.abs(pnl); }
      else breakeven++;
      cumulative += pnl;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
      const at = trade.closed_at || trade.opened_at;
      if (at) overallSeries.push({ at, pnl, cumulative });
    }
    const best = automations.filter((item) => item.closedTrades > 0).sort((a, b) => b.realizedPnl - a.realizedPnl)[0] || null;
    const totalClosed = closed.length;

    return json(req, {
      ok: true,
      account: { id: String(account.id), name: String(account.name || "Account"), kind: String(account.account_kind), mode: String(account.mode) },
      range,
      summary: {
        realizedPnl: totalPnl,
        realizedRoi: totalInvested > 0 ? totalPnl / totalInvested * 100 : null,
        closedTrades: totalClosed,
        activePositions: active.length,
        winRate: totalClosed ? wins / totalClosed * 100 : null,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
        maxDrawdown,
        wins,
        losses,
        breakeven,
        runningAutomations: bots.filter((bot) => !bot.is_archived && bot.status === "Running").length,
        automationCount: bots.length,
        bestAutomation: best ? { id: best.id, name: best.name, pnl: best.realizedPnl } : null,
      },
      series: sampleSeries(overallSeries),
      automations,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("trader-analytics", error);
    return json(req, { error: error instanceof Error ? error.message : "analytics_failed" }, 500);
  }
});