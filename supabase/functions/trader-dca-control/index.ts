import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
type Account = { id:string; owner_user_id:string; account_kind:"paper"|"real"; mode:"paper"|"shadow"|"live"; status:string };
type Condition = { id:string; kind:string; timeframe:string; length:number; comparator:string; signal:number; aux1:number; aux2:number; aux3:number };

const KINDS = new Set([
  "RSI",
  "Stochastic",
  "MACD",
  "Moving Average (MA)",
  "Average Directional Index",
  "Bollinger Bands %B",
  "Money Flow Index",
  "Commodity Channel Index",
  "Ultimate Oscillator",
  "Parabolic SAR",
  "Heikin Ashi",
]);
const TIMEFRAMES = new Set([
  "1 minute", "3 minutes", "5 minutes", "15 minutes", "30 minutes",
  "1 hour", "2 hours", "4 hours", "6 hours", "8 hours", "12 hours",
  "1 day", "3 days", "1 week", "1 month",
]);
const COMPARATORS = new Set(["Less Than", "Greater Than", "Crossing Up", "Crossing Down"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}
function n(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function cleanPair(value: unknown) {
  const pair = String(value ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{2,20}\/USDT$/.test(pair)) return pair;
  const compact = pair.replace(/[^A-Z0-9]/g, "");
  const base = compact.endsWith("USDT") ? compact.slice(0, -4) : compact;
  if (!/^[A-Z0-9]{2,20}$/.test(base)) return "";
  return `${base}/USDT`;
}
function cleanPairs(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map(cleanPair).filter(Boolean))).slice(0, 1000);
}
function defaultCondition(kind: string, index: number): Condition {
  const base: Condition = { id: `condition-${Date.now()}-${index}`, kind, timeframe: "15 minutes", length: 14, comparator: "Less Than", signal: 30, aux1: 0, aux2: 0, aux3: 0 };
  if (kind === "Stochastic") return { ...base, length: 2, signal: 20, aux1: 14, aux2: 1, aux3: 3 };
  if (kind === "MACD") return { ...base, length: 1, comparator: "Crossing Up", signal: 0, aux1: 12, aux2: 26, aux3: 9 };
  if (kind === "Moving Average (MA)") return { ...base, length: 0, comparator: "Crossing Up", signal: 0, aux1: 1, aux2: 9, aux3: 26 };
  if (kind === "Average Directional Index") return { ...base, length: 14, comparator: "Greater Than", signal: 25 };
  if (kind === "Bollinger Bands %B") return { ...base, length: 20, comparator: "Less Than", signal: 0, aux1: 2 };
  if (kind === "Money Flow Index") return { ...base, length: 14, comparator: "Less Than", signal: 20 };
  if (kind === "Commodity Channel Index") return { ...base, length: 20, comparator: "Less Than", signal: -100 };
  if (kind === "Ultimate Oscillator") return { ...base, length: 0, comparator: "Less Than", signal: 30, aux1: 7, aux2: 14, aux3: 28 };
  if (kind === "Parabolic SAR") return { ...base, length: 0, comparator: "Crossing Up", signal: 0, aux1: 2, aux2: 1 };
  if (kind === "Heikin Ashi") return { ...base, length: 2, comparator: "Greater Than", signal: 0 };
  return base;
}
function cleanConditions(value: unknown) {
  if (!Array.isArray(value)) return [] as Condition[];
  return value.slice(0, 12).map((raw, index) => {
    const source = obj(raw);
    const kind = KINDS.has(String(source.kind)) ? String(source.kind) : "RSI";
    const defaults = defaultCondition(kind, index);
    return {
      id: String(source.id || defaults.id),
      kind,
      timeframe: TIMEFRAMES.has(String(source.timeframe)) ? String(source.timeframe) : defaults.timeframe,
      length: Math.max(0, Math.min(500, Math.round(n(source.length, defaults.length)))),
      comparator: COMPARATORS.has(String(source.comparator)) ? String(source.comparator) : defaults.comparator,
      signal: Math.max(-1000000, Math.min(1000000, n(source.signal, defaults.signal))),
      aux1: Math.max(0, Math.min(1000, n(source.aux1, defaults.aux1))),
      aux2: Math.max(0, Math.min(1000, n(source.aux2, defaults.aux2))),
      aux3: Math.max(0, Math.min(1000, n(source.aux3, defaults.aux3))),
    };
  });
}
function botValues(body: Json, current?: Record<string, unknown>) {
  const baseOrder = Math.max(0, n(body.baseOrder, n(current?.base_order)));
  const safetyOrder = Math.max(0, n(body.safetyOrder, n(current?.safety_order)));
  if (!(baseOrder > 0) || !(safetyOrder > 0)) throw new Error("invalid_order_amount");
  const maxSafetyOrders = Math.max(0, Math.min(50, Math.round(n(body.maxSafetyOrders, n(current?.max_safety_orders, 5)))));
  const fallbackLimit = n(current?.limit_safety_orders, maxSafetyOrders > 0 ? 1 : 0);
  const limitSafetyOrders = maxSafetyOrders > 0 ? Math.min(maxSafetyOrders, Math.max(1, Math.round(n(body.limitSafetyOrders, fallbackLimit)))) : 0;
  return {
    baseOrder,
    safetyOrder,
    maxSafetyOrders,
    limitSafetyOrders,
    maxActiveTrades: Math.max(1, Math.min(20, Math.round(n(body.maxActiveTrades, n(current?.max_active_trades, 1))))),
    deviation: Math.max(0.000001, n(body.deviation, n(current?.deviation, 1))),
    stepScale: Math.max(0.000001, n(body.stepScale, n(current?.step_scale, 1))),
    volumeScale: Math.max(0.000001, n(body.volumeScale, n(current?.volume_scale, 1))),
    takeProfit: Math.max(0, n(body.takeProfit, n(current?.take_profit_pct, 1.5))),
    stopEnabled: body.stopEnabled === undefined ? current?.stop_enabled === true : bool(body.stopEnabled),
    stopPct: Math.max(0, n(body.stopPct, n(current?.stop_pct, 8))),
  };
}
async function ownedAccount(admin: Db, userId: string, accountId: string) {
  const { data, error } = await admin.from("trader_accounts")
    .select("id,owner_user_id,account_kind,mode,status")
    .eq("id", accountId).eq("owner_user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("trader_account_not_owned");
  return data as Account;
}
async function requireRealExchange(admin: Db, account: Account) {
  if (account.account_kind !== "real") return;
  const { data, error } = await admin.from("trader_binance_connections").select("status").eq("account_id", account.id).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "connected") throw new Error("exchange_connection_required");
}
function detail(row: Record<string, unknown>) {
  const conditions = cleanConditions(row.conditions);
  const pairs = Array.isArray(row.pairs) ? cleanPairs(row.pairs) : [];
  return {
    id: String(row.client_id),
    name: String(row.name),
    status: String(row.status),
    lifecycle: row.is_archived === true ? "closed" : "active",
    pair: String(row.pair),
    pairs,
    allPairs: row.all_pairs === true,
    baseOrder: n(row.base_order),
    safetyOrder: n(row.safety_order),
    maxSafetyOrders: n(row.max_safety_orders),
    limitSafetyOrders: n(row.limit_safety_orders),
    maxActiveTrades: n(row.max_active_trades, 1),
    deviation: n(row.deviation),
    stepScale: n(row.step_scale),
    volumeScale: n(row.volume_scale),
    takeProfit: n(row.take_profit_pct),
    stopEnabled: row.stop_enabled === true,
    stopPct: n(row.stop_pct),
    conditions,
    startCondition: conditions.length ? conditions.map((item) => item.kind).join(" + ") : "Immediately",
    executionMode: String(row.execution_mode || "paper"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
async function botDetail(admin: Db, account: Account, botId: string) {
  const { data, error } = await admin.from("trader_bots").select("*").eq("account_id", account.id).eq("client_id", botId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("bot_not_found");
  return { row: data as Record<string, unknown>, detail: detail(data as Record<string, unknown>) };
}
async function activeTradesForBot(admin: Db, accountId: string, dbBotId: unknown) {
  const { count, error } = await admin.from("trader_trades").select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("bot_id", String(dbBotId)).eq("status", "Active");
  if (error) throw error;
  return count ?? 0;
}
function universeFrom(body: Json, current?: Record<string, unknown>) {
  const allPairs = body.allPairs === undefined ? current?.all_pairs === true : bool(body.allPairs);
  const incomingPairs = body.pairs === undefined ? cleanPairs(current?.pairs) : cleanPairs(body.pairs);
  let pairs = incomingPairs;
  if (!allPairs && !pairs.length) {
    const fallback = cleanPair(body.pair ?? current?.pair);
    if (fallback) pairs = [fallback];
  }
  if (!allPairs && !pairs.length) throw new Error("bot_pairs_required");
  const primaryPair = pairs[0] || cleanPair(body.pair ?? current?.pair) || "BTC/USDT";
  return { allPairs, pairs: allPairs ? [] : pairs, primaryPair };
}
function sameUniverse(row: Record<string, unknown>, universe: {allPairs:boolean;pairs:string[]}) {
  if ((row.all_pairs === true) !== universe.allPairs) return false;
  if (universe.allPairs) return true;
  const before = cleanPairs(row.pairs).sort();
  const after = [...universe.pairs].sort();
  return before.length === after.length && before.every((value, index) => value === after[index]);
}
async function createBot(admin: Db, account: Account, body: Json) {
  await requireRealExchange(admin, account);
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("bot_name_required");
  const values = botValues(body);
  const universe = universeFrom(body);
  const conditions = cleanConditions(body.conditions);
  const clientId = `bot-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const executionMode = account.account_kind === "real" ? (account.mode === "live" ? "live" : "shadow") : "paper";
  const clientState = {
    id: clientId, name, pair: universe.primaryPair, pairs: universe.pairs, allPairs: universe.allPairs,
    status: "Running", direction: "Long", ...values, conditions,
    startCondition: conditions.length ? conditions.map((condition) => condition.kind).join(" + ") : "Immediately",
    trailingPct: 0, maxHoldEnabled: false, averagingEnabled: true, orderType: "Market",
    createdAt: new Date().toISOString(), executionMode,
  };
  const { data, error } = await admin.from("trader_bots").insert({
    account_id: account.id, client_id: clientId, name, status: "Running",
    pair: universe.primaryPair, pairs: universe.pairs, all_pairs: universe.allPairs,
    base_order: values.baseOrder, safety_order: values.safetyOrder,
    max_safety_orders: values.maxSafetyOrders, limit_safety_orders: values.limitSafetyOrders,
    max_active_trades: values.maxActiveTrades, deviation: values.deviation,
    step_scale: values.stepScale, volume_scale: values.volumeScale,
    take_profit_pct: values.takeProfit, stop_enabled: values.stopEnabled, stop_pct: values.stopPct,
    trailing_pct: 0, max_hold_enabled: false, max_hold_hours: null,
    averaging_enabled: true, order_type: "Market", conditions, client_state: clientState,
    is_archived: false, scan_cursor: 0, next_scan_at: null, execution_mode: executionMode,
  }).select("*").single();
  if (error || !data) throw error ?? new Error("bot_create_failed");
  return detail(data as Record<string, unknown>);
}
async function updateBot(admin: Db, account: Account, botId: string, body: Json) {
  const existing = await botDetail(admin, account, botId);
  const row = existing.row;
  if (row.is_archived === true) throw new Error("bot_closed");
  const name = String(body.name ?? row.name ?? "").trim();
  if (!name) throw new Error("bot_name_required");
  const values = botValues(body, row);
  const universe = universeFrom(body, row);
  const conditions = body.conditions === undefined ? cleanConditions(row.conditions) : cleanConditions(body.conditions);
  const activeTrades = await activeTradesForBot(admin, account.id, row.id);
  if (activeTrades > 0 && !sameUniverse(row, universe)) throw new Error("bot_pairs_locked_by_active_trade");
  const clientState = {
    ...obj(row.client_state), name, pair: universe.primaryPair, pairs: universe.pairs, allPairs: universe.allPairs,
    ...values, conditions, status: String(row.status), direction: "Long",
    startCondition: conditions.length ? conditions.map((condition) => condition.kind).join(" + ") : "Immediately",
    averagingEnabled: true, orderType: "Market",
  };
  const { data, error } = await admin.from("trader_bots").update({
    name, pair: universe.primaryPair, pairs: universe.pairs, all_pairs: universe.allPairs,
    base_order: values.baseOrder, safety_order: values.safetyOrder,
    max_safety_orders: values.maxSafetyOrders, limit_safety_orders: values.limitSafetyOrders,
    max_active_trades: values.maxActiveTrades, deviation: values.deviation,
    step_scale: values.stepScale, volume_scale: values.volumeScale,
    take_profit_pct: values.takeProfit, stop_enabled: values.stopEnabled, stop_pct: values.stopPct,
    conditions, client_state: clientState, scan_cursor: 0, next_scan_at: null, updated_at: new Date().toISOString(),
  }).eq("id", String(row.id)).select("*").single();
  if (error || !data) throw error ?? new Error("bot_update_failed");
  return detail(data as Record<string, unknown>);
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
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({})) as Json;
    const accountId = String(body.accountId || "").trim();
    if (!accountId) return json({ error: "account_id_required" }, 400);
    const account = await ownedAccount(admin, user.id, accountId);
    const action = String(body.action || "bot_detail");
    if (action === "bot_detail") {
      const botId = String(body.botId || "").trim();
      if (!botId) return json({ error: "bot_id_required" }, 400);
      const result = await botDetail(admin, account, botId);
      return json({ ok: true, bot: result.detail });
    }
    if (action === "create_bot") {
      const bot = await createBot(admin, account, body);
      return json({ ok: true, botId: bot.id, bot });
    }
    if (action === "update_bot") {
      const botId = String(body.botId || "").trim();
      if (!botId) return json({ error: "bot_id_required" }, 400);
      const bot = await updateBot(admin, account, botId, body);
      return json({ ok: true, botId: bot.id, bot });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("trader-dca-control", message);
    const safe = new Set([
      "trader_account_not_owned", "exchange_connection_required", "bot_name_required", "invalid_order_amount",
      "bot_pairs_required", "bot_not_found", "bot_closed", "bot_pairs_locked_by_active_trade",
    ]);
    return json({ error: safe.has(message) ? message : "trader_dca_control_failed" }, message === "trader_account_not_owned" ? 403 : 400);
  }
});
