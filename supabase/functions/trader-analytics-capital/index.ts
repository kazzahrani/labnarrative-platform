import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type BotRow = {
  id: string;
  base_order: number | string | null;
  safety_order: number | string | null;
  max_safety_orders: number | string | null;
  max_active_trades: number | string | null;
  volume_scale: number | string | null;
  client_state: Json | null;
};
type TradeRow = {
  bot_id: string | null;
  invested: number | string | null;
  total_invested: number | string | null;
  closed_at: string | null;
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
function maxCapital(bot: BotRow) {
  const state = obj(bot.client_state);
  if (String(state.automationType || "") === "tradingview_strategy") {
    return { maxCapital: null, maxCapitalMode: "dynamic" as const };
  }

  const baseOrder = Math.max(0, n(bot.base_order, 0));
  const safetyOrder = Math.max(0, n(bot.safety_order, 0));
  const maxSafetyOrders = Math.max(0, Math.round(n(bot.max_safety_orders, 0)));
  const volumeScale = Math.max(0.000001, n(bot.volume_scale, 1));
  const maxActiveTrades = Math.max(1, Math.round(n(bot.max_active_trades, 1)));

  let perTrade = baseOrder;
  for (let index = 0; index < maxSafetyOrders; index += 1) {
    perTrade += safetyOrder * Math.pow(volumeScale, index);
  }
  return { maxCapital: perTrade * maxActiveTrades, maxCapitalMode: "fixed" as const };
}
async function fetchClosedCapital(db: ReturnType<typeof createClient>, accountId: string, since: string | null) {
  const rows: TradeRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10_000; offset += pageSize) {
    let query = db.from("trader_trades")
      .select("bot_id,invested,total_invested,closed_at")
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
      .select("id")
      .eq("id", accountId)
      .eq("owner_user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json(req, { error: "account_not_found" }, 404);

    const [{ data, error }, closedTrades] = await Promise.all([
      db.from("trader_bots")
        .select("id,base_order,safety_order,max_safety_orders,max_active_trades,volume_scale,client_state")
        .eq("account_id", accountId),
      fetchClosedCapital(db, accountId, rangeStart(range)),
    ]);
    if (error) throw error;

    const capitalByBot = new Map<string, number>();
    let summaryCapitalUsed = 0;
    for (const trade of closedTrades) {
      const capital = Math.max(0, n(trade.total_invested ?? trade.invested, 0));
      summaryCapitalUsed += capital;
      if (!trade.bot_id) continue;
      capitalByBot.set(trade.bot_id, (capitalByBot.get(trade.bot_id) || 0) + capital);
    }

    const automations = ((data ?? []) as BotRow[]).map((bot) => ({
      id: bot.id,
      ...maxCapital(bot),
      capitalUsed: capitalByBot.get(bot.id) || 0,
    }));
    return json(req, { ok: true, range, summaryCapitalUsed, automations });
  } catch (error) {
    console.error("trader-analytics-capital", error);
    return json(req, { error: error instanceof Error ? error.message : "analytics_capital_failed" }, 500);
  }
});
