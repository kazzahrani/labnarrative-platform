import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://platform.labnarrative.com", "https://app.labnarrative.com"]);
type Db = ReturnType<typeof createClient>;

type TradeRow = {
  id: string;
  client_id: string | null;
  public_trade_no: number | string | null;
  bot_id: string | null;
  pair: string;
  status: string;
  entry_price: number | string | null;
  average_price: number | string | null;
  total_invested: number | string | null;
  realized_pnl: number | string | null;
  exit_price: number | string | null;
  close_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
  execution_mode: string | null;
  exchange_provider: string | null;
  averaging_filled: number | string | null;
  max_averaging: number | string | null;
  active_orders_limit: number | string | null;
  take_profit_pct: number | string | null;
  stop_enabled: boolean | null;
  stop_pct: number | string | null;
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

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts").select("id").eq("owner_user_id", userId).eq("account_kind", "real").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return String(data.id);
}

async function historyRows(db: Db, accountId: string) {
  const rows: TradeRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from("trader_trades")
      .select("id,client_id,public_trade_no,bot_id,pair,status,entry_price,average_price,total_invested,realized_pnl,exit_price,close_reason,opened_at,closed_at,execution_mode,exchange_provider,averaging_filled,max_averaging,active_orders_limit,take_profit_pct,stop_enabled,stop_pct")
      .eq("account_id", accountId)
      .in("status", ["Closed", "Cancelled"])
      .order("closed_at", { ascending: false, nullsFirst: false })
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
    const rows = await historyRows(db, accountId);
    const botIds = [...new Set(rows.map((row) => row.bot_id).filter((value): value is string => Boolean(value)))];
    const botNames = new Map<string, string>();
    if (botIds.length) {
      const { data: bots, error: botError } = await db.from("trader_bots").select("id,name").eq("account_id", accountId).in("id", botIds);
      if (botError) throw botError;
      for (const bot of bots ?? []) botNames.set(String(bot.id), String(bot.name || "DCA Bot"));
    }

    let closedCount = 0, cancelledCount = 0, wins = 0, losses = 0, breakeven = 0, realizedPnl = 0, totalInvested = 0;
    const providerCounts: Record<string, number> = {};
    const reasonCounts: Record<string, number> = {};
    for (const row of rows) {
      const provider = String(row.exchange_provider || "unknown").toLowerCase();
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      const reason = String(row.close_reason || (row.status === "Cancelled" ? "Cancelled" : "Other"));
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      if (row.status === "Cancelled") { cancelledCount += 1; continue; }
      closedCount += 1;
      const pnl = n(row.realized_pnl);
      realizedPnl += pnl;
      totalInvested += n(row.total_invested);
      if (pnl > 0) wins += 1;
      else if (pnl < 0) losses += 1;
      else breakeven += 1;
    }

    const details = rows.slice(0, 300).map((row) => {
      const invested = n(row.total_invested);
      const pnl = n(row.realized_pnl);
      const openedAt = row.opened_at ? Date.parse(row.opened_at) : NaN;
      const closedAt = row.closed_at ? Date.parse(row.closed_at) : NaN;
      return {
        tradeId: row.id,
        clientId: row.client_id,
        publicTradeNo: row.public_trade_no == null ? null : Number(row.public_trade_no),
        botId: row.bot_id,
        botName: row.bot_id ? botNames.get(row.bot_id) ?? "DCA Bot" : "—",
        pair: String(row.pair || ""),
        provider: String(row.exchange_provider || "unknown").toLowerCase(),
        executionMode: row.execution_mode,
        status: row.status,
        entryPrice: n(row.entry_price),
        averagePrice: n(row.average_price),
        invested,
        exitPrice: n(row.exit_price),
        realizedPnl: pnl,
        realizedPct: invested > 0 ? pnl / invested * 100 : 0,
        closeReason: row.close_reason || (row.status === "Cancelled" ? "Cancelled" : null),
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        durationMs: Number.isFinite(openedAt) && Number.isFinite(closedAt) ? Math.max(0, closedAt - openedAt) : null,
        averagingFilled: Math.max(0, Math.round(n(row.averaging_filled))),
        maxAveraging: Math.max(0, Math.round(n(row.max_averaging))),
        activeOrdersLimit: Math.max(0, Math.round(n(row.active_orders_limit))),
        takeProfitPct: Math.max(0, n(row.take_profit_pct)),
        stopEnabled: row.stop_enabled === true,
        stopPct: Math.max(0, n(row.stop_pct)),
      };
    });

    const latestClosedAt = rows.find((row) => row.closed_at)?.closed_at || null;
    return json(req, {
      ok: true,
      ready: true,
      accountId,
      ageMs: latestClosedAt ? Math.max(0, Date.now() - Date.parse(latestClosedAt)) : 0,
      summary: {
        closedCount,
        cancelledCount,
        wins,
        losses,
        breakeven,
        winRate: closedCount > 0 ? wins / closedCount * 100 : 0,
        realizedPnl,
        totalInvested,
        averagePnl: closedCount > 0 ? realizedPnl / closedCount : 0,
        providerCounts,
        reasonCounts,
      },
      history: details,
      totalRows: rows.length,
      truncated: rows.length > details.length,
    });
  } catch (error) {
    const message = clean(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_history_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});
