import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://platform.labnarrative.com", "https://app.labnarrative.com"]);
type Db = ReturnType<typeof createClient>;

type TradeRow = {
  id: string;
  bot_id: string | null;
  pair: string;
  status: string;
  total_invested: number | string | null;
  realized_pnl: number | string | null;
  close_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
  exchange_provider: string | null;
};
type BotRow = { id: string; name: string; status: string; exchange_provider: string | null };

type Bucket = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  pnl: number;
  invested: number;
};

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://app.labnarrative.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" } });
}
function n(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function clean(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }
function emptyBucket(): Bucket { return { trades: 0, wins: 0, losses: 0, breakeven: 0, pnl: 0, invested: 0 }; }
function add(bucket: Bucket, pnl: number, invested: number) {
  bucket.trades += 1; bucket.pnl += pnl; bucket.invested += invested;
  if (pnl > 0) bucket.wins += 1;
  else if (pnl < 0) bucket.losses += 1;
  else bucket.breakeven += 1;
}
function finish(bucket: Bucket) {
  return {
    ...bucket,
    winRate: bucket.trades > 0 ? bucket.wins / bucket.trades * 100 : 0,
    roi: bucket.invested > 0 ? bucket.pnl / bucket.invested * 100 : 0,
    averagePnl: bucket.trades > 0 ? bucket.pnl / bucket.trades : 0,
  };
}
function sample<T>(rows: T[], max = 180) {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  const result = rows.filter((_, index) => index % step === 0);
  if (rows.length && result.at(-1) !== rows.at(-1)) result.push(rows.at(-1)!);
  return result;
}

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts").select("id").eq("owner_user_id", userId).eq("account_kind", "real").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return String(data.id);
}

async function closedTrades(db: Db, accountId: string) {
  const rows: TradeRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from("trader_trades")
      .select("id,bot_id,pair,status,total_invested,realized_pnl,close_reason,opened_at,closed_at,exchange_provider")
      .eq("account_id", accountId)
      .eq("status", "Closed")
      .order("closed_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as TradeRow[];
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
    const accountId = await realAccount(db, userData.user.id);
    const [closed, activeResult, botsResult] = await Promise.all([
      closedTrades(db, accountId),
      db.from("trader_trades").select("id,bot_id,pair,status,total_invested,realized_pnl,close_reason,opened_at,closed_at,exchange_provider").eq("account_id", accountId).eq("status", "Active"),
      db.from("trader_bots").select("id,name,status,exchange_provider").eq("account_id", accountId),
    ]);
    if (activeResult.error) throw activeResult.error;
    if (botsResult.error) throw botsResult.error;
    const active = (activeResult.data ?? []) as TradeRow[];
    const bots = (botsResult.data ?? []) as BotRow[];
    const botMap = new Map(bots.map((bot) => [bot.id, bot]));

    const total = emptyBucket();
    let grossProfit = 0, grossLoss = 0, bestTrade: number | null = null, worstTrade: number | null = null;
    let cumulative = 0, peak = 0, maxDrawdown = 0, holdMinutes = 0, holdCount = 0;
    const series: Array<{ at: string; pnl: number; cumulative: number }> = [];
    const providers = new Map<string, Bucket>();
    const botBuckets = new Map<string, Bucket>();
    const reasons = new Map<string, { trades: number; pnl: number }>();
    const pairs = new Map<string, { trades: number; pnl: number }>();

    for (const trade of closed) {
      const pnl = n(trade.realized_pnl), invested = Math.max(0, n(trade.total_invested));
      add(total, pnl, invested);
      if (pnl > 0) grossProfit += pnl;
      if (pnl < 0) grossLoss += Math.abs(pnl);
      bestTrade = bestTrade == null ? pnl : Math.max(bestTrade, pnl);
      worstTrade = worstTrade == null ? pnl : Math.min(worstTrade, pnl);
      cumulative += pnl; peak = Math.max(peak, cumulative); maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
      if (trade.closed_at) series.push({ at: trade.closed_at, pnl, cumulative });
      if (trade.opened_at && trade.closed_at) {
        const minutes = (Date.parse(trade.closed_at) - Date.parse(trade.opened_at)) / 60_000;
        if (Number.isFinite(minutes) && minutes >= 0) { holdMinutes += minutes; holdCount += 1; }
      }
      const provider = String(trade.exchange_provider || "unknown").toLowerCase();
      const providerBucket = providers.get(provider) ?? emptyBucket(); add(providerBucket, pnl, invested); providers.set(provider, providerBucket);
      if (trade.bot_id) {
        const botBucket = botBuckets.get(trade.bot_id) ?? emptyBucket(); add(botBucket, pnl, invested); botBuckets.set(trade.bot_id, botBucket);
      }
      const reason = String(trade.close_reason || "Other");
      const reasonBucket = reasons.get(reason) ?? { trades: 0, pnl: 0 }; reasonBucket.trades += 1; reasonBucket.pnl += pnl; reasons.set(reason, reasonBucket);
      const pair = String(trade.pair || "Unknown");
      const pairBucket = pairs.get(pair) ?? { trades: 0, pnl: 0 }; pairBucket.trades += 1; pairBucket.pnl += pnl; pairs.set(pair, pairBucket);
    }

    const activeByBot = new Map<string, number>();
    for (const trade of active) if (trade.bot_id) activeByBot.set(trade.bot_id, (activeByBot.get(trade.bot_id) || 0) + 1);

    const providerStats = [...providers.entries()].map(([provider, bucket]) => ({ provider, ...finish(bucket) })).sort((a, b) => b.pnl - a.pnl);
    const botStats = [...new Set([...botBuckets.keys(), ...activeByBot.keys()])].map((botId) => {
      const bucket = botBuckets.get(botId) ?? emptyBucket();
      const bot = botMap.get(botId);
      return { botId, botName: bot?.name || "DCA Bot", provider: String(bot?.exchange_provider || "unknown").toLowerCase(), status: bot?.status || "unknown", activePositions: activeByBot.get(botId) || 0, ...finish(bucket) };
    }).sort((a, b) => b.pnl - a.pnl);
    const exitReasons = [...reasons.entries()].map(([reason, value]) => ({ reason, ...value })).sort((a, b) => b.trades - a.trades);
    const pairStats = [...pairs.entries()].map(([pair, value]) => ({ pair, ...value })).sort((a, b) => b.trades - a.trades).slice(0, 20);
    const latestAt = closed.at(-1)?.closed_at || null;

    return json(req, {
      ok: true,
      ready: true,
      accountId,
      ageMs: latestAt ? Math.max(0, Date.now() - Date.parse(latestAt)) : 0,
      summary: {
        ...finish(total),
        activePositions: active.length,
        grossProfit,
        grossLoss,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
        expectancy: total.trades > 0 ? total.pnl / total.trades : 0,
        bestTrade,
        worstTrade,
        maxDrawdown,
        avgHoldMinutes: holdCount > 0 ? holdMinutes / holdCount : null,
      },
      series: sample(series),
      providers: providerStats,
      bots: botStats,
      exitReasons,
      pairs: pairStats,
    });
  } catch (error) {
    const message = clean(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_analytics_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});
