import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type EventRow = {
  id: string;
  bot_id: string;
  action: string;
  pair: string;
  amount: number | string | null;
  signal_id: string | null;
  status: string;
  received_at: string;
  processed_at: string | null;
  error: string | null;
  payload: Json | null;
};
type QueueRow = {
  id: string;
  bot_id: string;
  action: string;
  pair: string;
  signal_id: string | null;
  status: string;
  received_at: string;
};
type BotRow = {
  id: string;
  name: string;
  status: string;
  execution_mode: string;
  exchange_provider: string | null;
  tradingview_enabled: boolean | null;
  client_state: Json | null;
  is_archived: boolean | null;
};

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
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function text(value: unknown): string | null {
  const clean = String(value ?? "").trim();
  return clean && clean !== "[object Object]" ? clean : null;
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
  return action || "signal";
}
function signalKey(botId: string, action: string, pair: string, signalId: string | null) {
  if (!signalId) return null;
  return `${botId}|${canonicalAction(action)}|${cleanPair(pair)}|${signalId}`;
}
function signalContext(signalId: string | null) {
  if (!signalId) return { orderId: null, eventTime: null };
  const separator = signalId.lastIndexOf("|");
  if (separator <= 0 || separator >= signalId.length - 1) return { orderId: signalId, eventTime: null };
  return { orderId: signalId.slice(0, separator) || null, eventTime: signalId.slice(separator + 1) || null };
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }

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
    const [botsResult, eventsResult, queueResult, totalCount, processedCount, ignoredCount, failedCount, queueCount] = await Promise.all([
      db.from("trader_bots").select("id,name,status,execution_mode,exchange_provider,tradingview_enabled,client_state,is_archived").eq("account_id", account.id),
      db.from("trader_tradingview_events")
        .select("id,bot_id,action,pair,amount,signal_id,status,received_at,processed_at,error,payload")
        .eq("account_id", account.id)
        .order("received_at", { ascending: false })
        .limit(200),
      db.from("trader_strategy_signal_queue")
        .select("id,bot_id,action,pair,signal_id,status,received_at")
        .eq("account_id", account.id)
        .in("status", ["pending", "dispatching"])
        .order("received_at", { ascending: false })
        .limit(100),
      db.from("trader_tradingview_events").select("id", { count: "exact", head: true }).eq("account_id", account.id),
      db.from("trader_tradingview_events").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("status", "processed"),
      db.from("trader_tradingview_events").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("status", "ignored"),
      db.from("trader_tradingview_events").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("status", "failed"),
      db.from("trader_strategy_signal_queue").select("id", { count: "exact", head: true }).eq("account_id", account.id).in("status", ["pending", "dispatching"]),
    ]);
    for (const result of [botsResult, eventsResult, queueResult, totalCount, processedCount, ignoredCount, failedCount, queueCount]) if (result.error) throw result.error;

    const bots = (botsResult.data ?? []) as BotRow[];
    const botMap = new Map(bots.map((bot) => [bot.id, bot]));
    const realEvents = (eventsResult.data ?? []) as EventRow[];
    const existingKeys = new Set(realEvents.map((event) => signalKey(event.bot_id, event.action, event.pair, event.signal_id)).filter(Boolean) as string[]);

    const events = realEvents.map((event) => {
      const bot = botMap.get(event.bot_id);
      const payload = obj(event.payload);
      const result = obj(payload.result);
      const context = Object.keys(obj(payload.orderContext)).length ? obj(payload.orderContext) : payload;
      const signal = signalContext(event.signal_id);
      const receivedMs = Date.parse(event.received_at);
      const processedMs = event.processed_at ? Date.parse(event.processed_at) : Number.NaN;
      const latencyMs = Number.isFinite(receivedMs) && Number.isFinite(processedMs) ? Math.max(0, processedMs - receivedMs) : null;
      return {
        id: event.id,
        source: "TradingView",
        automationId: event.bot_id,
        automationName: bot?.name || "Automation",
        automationStatus: bot?.status || "unknown",
        executionMode: bot?.execution_mode || "",
        provider: String(bot?.exchange_provider || "unknown").toLowerCase(),
        action: canonicalAction(event.action),
        pair: cleanPair(event.pair),
        status: String(event.status || "unknown").toLowerCase(),
        receivedAt: event.received_at,
        processedAt: event.processed_at,
        latencyMs,
        signalId: event.signal_id,
        tradingViewOrderId: signal.orderId,
        tradingViewEventTime: signal.eventTime,
        reason: text(result.reason) || text(event.error),
        requestedQuote: numeric(result.requestedQuote) ?? numeric(event.amount),
        resultPrice: numeric(result.price),
        resultQuote: numeric(result.quote),
        resultQuantity: numeric(result.executedQty),
        remainingQuantity: numeric(result.remainingQty),
        resultFraction: numeric(result.fraction),
        positionAction: text(result.positionAction),
        activePositions: numeric(result.activePositions),
        maxOpenPositions: numeric(result.maxOpenPositions),
        contracts: numeric(context.contracts),
        marketPosition: text(context.marketPosition ?? context.market_position),
      };
    });

    for (const row of (queueResult.data ?? []) as QueueRow[]) {
      const key = signalKey(row.bot_id, row.action, row.pair, row.signal_id);
      if (key && existingKeys.has(key)) continue;
      const bot = botMap.get(row.bot_id);
      const signal = signalContext(row.signal_id);
      events.push({
        id: `queue:${row.id}`,
        source: "TradingView",
        automationId: row.bot_id,
        automationName: bot?.name || "Automation",
        automationStatus: bot?.status || "unknown",
        executionMode: bot?.execution_mode || "",
        provider: String(bot?.exchange_provider || "unknown").toLowerCase(),
        action: canonicalAction(row.action),
        pair: cleanPair(row.pair),
        status: row.status === "dispatching" ? "processing" : "pending",
        receivedAt: row.received_at,
        processedAt: null,
        latencyMs: null,
        signalId: row.signal_id,
        tradingViewOrderId: signal.orderId,
        tradingViewEventTime: signal.eventTime,
        reason: null,
        requestedQuote: null,
        resultPrice: null,
        resultQuote: null,
        resultQuantity: null,
        remainingQuantity: null,
        resultFraction: null,
        positionAction: null,
        activePositions: null,
        maxOpenPositions: null,
        contracts: null,
        marketPosition: null,
      });
    }

    events.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
    const latestReceivedAt = events[0]?.receivedAt || null;
    const strategyBots = bots.filter((bot) => bot.is_archived !== true && (bot.tradingview_enabled === true || String(obj(bot.client_state).automationType || "") === "tradingview_strategy"));

    return json(req, {
      ok: true,
      ready: true,
      account: { name: account.name },
      latestReceivedAt,
      ageMs: latestReceivedAt ? Math.max(0, Date.now() - Date.parse(latestReceivedAt)) : null,
      summary: {
        totalEvents: totalCount.count || 0,
        processed: processedCount.count || 0,
        ignored: ignoredCount.count || 0,
        failed: failedCount.count || 0,
        activeQueue: queueCount.count || 0,
        strategyAutomations: strategyBots.length,
      },
      automations: strategyBots.map((bot) => ({ id: bot.id, name: bot.name, status: bot.status, provider: String(bot.exchange_provider || "unknown").toLowerCase() })),
      events: events.slice(0, 200),
    });
  } catch (error) {
    const message = errorMessage(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_signal_monitor_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});
