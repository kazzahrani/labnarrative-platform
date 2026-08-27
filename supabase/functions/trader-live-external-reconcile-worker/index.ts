import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPECTED_GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
const PUBLIC_BINANCE = "https://data-api.binance.vision";
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Creds = { apiKey: string; apiSecret: string };
type ClosedTrade = {
  id: string;
  account_id: string;
  bot_id: string;
  client_id: string;
  pair: string;
  status: string;
  total_invested: number | string;
  realized_pnl: number | string | null;
  closed_at: string | null;
  client_state: Json;
  execution_mode: string;
};
type GroupedSell = {
  orderId: string;
  items: Json[];
  qty: number;
  quote: number;
  usdtFee: number;
  filledAtMs: number;
};

type Rule = { symbol: string; stepSize: number };

let signingKeyCache: CryptoKey | null = null;
const n = (value: unknown, fallback = 0) => {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
};
const obj = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const clean = (error: unknown) => error instanceof Error ? error.message : String(error || "unknown_error");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function nonce() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function pemBytes(pem: string) {
  const raw = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function b64(buffer: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signed)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function verifyWorkerSecret(db: Db, value: string) {
  if (!value) return false;
  const { data, error } = await db.from("trader_worker_secrets").select("secret").eq("name", "paper_worker").maybeSingle();
  return !error && data?.secret === value;
}
async function gatewayConfig(db: Db) {
  const { data, error } = await db.from("trader_gateway_config").select("base_url,status").eq("name", "binance").single();
  if (error || !data) throw new Error("gateway_not_configured");
  return data as { base_url: string | null; status: string };
}
async function signingKey(db: Db) {
  if (signingKeyCache) return signingKeyCache;
  const { data, error } = await db.rpc("trader_gateway_read_signing_private_key");
  if (error || !data) throw new Error("gateway_signing_key_not_configured");
  signingKeyCache = await crypto.subtle.importKey("pkcs8", pemBytes(String(data)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return signingKeyCache;
}
async function relay(db: Db, payload: Json) {
  const cfg = await gatewayConfig(db);
  if (cfg.status !== "ready" || !cfg.base_url) throw new Error("gateway_not_ready");
  const origin = new URL(cfg.base_url).origin;
  if (origin !== EXPECTED_GATEWAY_ORIGIN) throw new Error("gateway_origin_not_allowed");
  const raw = JSON.stringify(payload);
  const timestamp = Date.now();
  const nn = nonce();
  const key = await signingKey(db);
  const signature = b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${timestamp}\n${nn}\n${raw}`)));
  const response = await fetch(`${origin}/relay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ln-timestamp": String(timestamp),
      "x-ln-nonce": nn,
      "x-ln-signature": signature,
    },
    body: raw,
    signal: AbortSignal.timeout(12000),
  });
  const envelope = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`gateway_${response.status}:${String(envelope.error || "relay_failed")}`);
  const upstreamStatus = n(envelope.upstreamStatus);
  const rawBody = String(envelope.upstreamBody || "");
  let body: unknown = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error("binance_invalid_json");
  }
  if (upstreamStatus < 200 || upstreamStatus >= 300) {
    const value = obj(body);
    throw new Error(`binance_${String(value.code ?? upstreamStatus)}:${String(value.msg ?? "request_failed")}`);
  }
  return body;
}
async function credentials(db: Db, accountId: string): Promise<Creds> {
  const { data, error } = await db.rpc("trader_binance_read_secret", { p_account_id: accountId });
  if (error || !data) throw new Error("credential_not_found");
  const parsed = JSON.parse(String(data)) as { apiKey?: string; apiSecret?: string };
  if (!parsed.apiKey || !parsed.apiSecret) throw new Error("credential_not_found");
  return { apiKey: parsed.apiKey, apiSecret: parsed.apiSecret };
}
async function signed(db: Db, creds: Creds, path: string, params: Record<string, string | number | boolean> = {}) {
  const time = obj(await relay(db, { requestId: crypto.randomUUID(), method: "GET", path: "/api/v3/time", query: "" }));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  query.set("timestamp", String(n(time.serverTime, Date.now())));
  query.set("recvWindow", "10000");
  query.set("signature", await hmac(creds.apiSecret, query.toString()));
  return await relay(db, { requestId: crypto.randomUUID(), method: "GET", path, query: query.toString(), apiKey: creds.apiKey });
}

const ruleCache = new Map<string, Rule>();
async function ruleFor(pair: string): Promise<Rule> {
  const symbol = pair.replace("/", "");
  const cached = ruleCache.get(symbol);
  if (cached) return cached;
  const response = await fetch(`${PUBLIC_BINANCE}/api/v3/exchangeInfo?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`exchange_info_${response.status}`);
  const payload = await response.json() as { symbols?: Json[] };
  const row = payload.symbols?.[0];
  if (!row) throw new Error("symbol_not_found");
  const filters = Array.isArray(row.filters) ? row.filters as Json[] : [];
  const lot = filters.find((x) => x.filterType === "LOT_SIZE");
  const rule = { symbol, stepSize: n(lot?.stepSize) };
  ruleCache.set(symbol, rule);
  return rule;
}

function groupSells(rows: Json[]): GroupedSell[] {
  const grouped = new Map<string, Json[]>();
  for (const row of rows) {
    const orderId = String(row.orderId || "");
    if (!orderId) continue;
    const current = grouped.get(orderId) ?? [];
    current.push(row);
    grouped.set(orderId, current);
  }
  return [...grouped.entries()].map(([orderId, items]) => {
    let qty = 0;
    let quote = 0;
    let usdtFee = 0;
    let filledAtMs = Number.MAX_SAFE_INTEGER;
    for (const item of items) {
      qty += n(item.qty);
      quote += n(item.quoteQty, n(item.price) * n(item.qty));
      if (String(item.commissionAsset || "") === "USDT") usdtFee += n(item.commission);
      filledAtMs = Math.min(filledAtMs, n(item.time, Date.now()));
    }
    return { orderId, items, qty, quote, usdtFee, filledAtMs: Number.isFinite(filledAtMs) ? filledAtMs : Date.now() };
  });
}

async function reconcileTrade(db: Db, trade: ClosedTrade, creds: Creds) {
  const state = obj(trade.client_state);
  const residual = n(state.residualDustQty);
  if (!(residual > 0) || state.externalResidualReconciled === true) return { status: "skip" };

  const rule = await ruleFor(trade.pair);
  const { count: activeSamePair, error: activeError } = await db.from("trader_trades")
    .select("id", { count: "exact", head: true })
    .eq("account_id", trade.account_id)
    .eq("pair", trade.pair)
    .eq("execution_mode", "live")
    .eq("status", "Active");
  if (activeError) throw activeError;
  if ((activeSamePair ?? 0) > 0) return { status: "ambiguous_active_pair" };

  const { data: unresolvedSamePair, error: unresolvedError } = await db.from("trader_trades")
    .select("id,client_state")
    .eq("account_id", trade.account_id)
    .eq("pair", trade.pair)
    .eq("execution_mode", "live")
    .eq("status", "Closed")
    .gte("closed_at", new Date(Date.now() - LOOKBACK_MS).toISOString());
  if (unresolvedError) throw unresolvedError;
  const unresolved = (unresolvedSamePair ?? []).filter((row) => {
    const s = obj(row.client_state);
    return n(s.residualDustQty) > 0 && s.externalResidualReconciled !== true;
  });
  if (unresolved.length !== 1 || String(unresolved[0].id) !== trade.id) return { status: "ambiguous_residual_trade" };

  const remote = await signed(db, creds, "/api/v3/myTrades", { symbol: rule.symbol, limit: 1000 });
  if (!Array.isArray(remote)) throw new Error("binance_trades_invalid");

  const { data: localFills, error: localFillError } = await db.from("trader_fills")
    .select("exchange_trade_id")
    .eq("account_id", trade.account_id)
    .eq("pair", trade.pair)
    .not("exchange_trade_id", "is", null);
  if (localFillError) throw localFillError;
  const knownTradeIds = new Set((localFills ?? []).map((row) => String(row.exchange_trade_id || "")).filter(Boolean));

  const startMs = Math.max(Date.parse(String(state.reconciledCloseAt || trade.closed_at || "")) || 0, Date.now() - LOOKBACK_MS);
  const untrackedSells = (remote as Json[]).filter((row) => row.isBuyer === false && n(row.time) >= startMs && !knownTradeIds.has(String(row.id || "")));
  const groups = groupSells(untrackedSells);
  const tolerance = Math.max(rule.stepSize > 0 ? rule.stepSize / 2 : 0, residual * 0.02, 1e-12);
  const matches = groups.filter((group) => Math.abs(group.qty - residual) <= tolerance);
  if (matches.length !== 1) return { status: "no_unique_match", residual, candidates: matches.length };

  const match = matches[0];
  const clientOrderId = `EXT-${match.orderId}`.slice(0, 36);
  const averagePrice = match.qty > 0 ? match.quote / match.qty : 0;
  const filledAt = new Date(match.filledAtMs).toISOString();

  const { data: order, error: orderError } = await db.from("trader_orders").upsert({
    account_id: trade.account_id,
    bot_id: trade.bot_id,
    trade_id: trade.id,
    client_order_id: clientOrderId,
    pair: trade.pair,
    kind: "manual_external_close",
    side: "SELL",
    order_type: "MARKET",
    status: "FILLED",
    requested_qty: match.qty,
    filled_qty: match.qty,
    filled_quote: match.quote,
    average_fill_price: averagePrice,
    exchange: "binance",
    exchange_order_id: match.orderId,
    metadata: { externalManualReconciliation: true, source: "binance_myTrades" },
    opened_at: filledAt,
    filled_at: filledAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "account_id,client_order_id" }).select("id").single();
  if (orderError || !order) throw orderError ?? new Error("external_order_upsert_failed");

  for (const item of match.items) {
    const exchangeTradeId = String(item.id || "");
    if (!exchangeTradeId) continue;
    const fill = {
      account_id: trade.account_id,
      bot_id: trade.bot_id,
      trade_id: trade.id,
      order_id: order.id,
      pair: trade.pair,
      side: "SELL",
      kind: "Manual External Close",
      price: n(item.price),
      quantity: n(item.qty),
      quote_amount: n(item.quoteQty, n(item.price) * n(item.qty)),
      fee_asset: String(item.commissionAsset || "") || null,
      fee_amount: n(item.commission),
      exchange_trade_id: exchangeTradeId,
      filled_at: new Date(n(item.time, match.filledAtMs)).toISOString(),
      metadata: { exchange: "binance", externalManualReconciliation: true, exchangeOrderId: match.orderId },
    };
    const { error: fillError } = await db.from("trader_fills").upsert(fill, { onConflict: "trade_id,exchange_trade_id", ignoreDuplicates: true });
    if (fillError) throw fillError;
  }

  const { data: sellFills, error: sellFillError } = await db.from("trader_fills")
    .select("quantity,quote_amount,fee_asset,fee_amount")
    .eq("trade_id", trade.id)
    .eq("side", "SELL");
  if (sellFillError) throw sellFillError;
  let sellQty = 0;
  let sellNet = 0;
  for (const fill of sellFills ?? []) {
    sellQty += n(fill.quantity);
    sellNet += n(fill.quote_amount) - (String(fill.fee_asset || "") === "USDT" ? n(fill.fee_amount) : 0);
  }
  const lifetime = n(trade.total_invested);
  const realizedPnl = sellNet - lifetime;
  const exitPrice = sellQty > 0 ? sellNet / sellQty : null;
  const now = new Date().toISOString();
  const nextState = {
    ...state,
    originalResidualDustQty: residual,
    residualDustQty: 0,
    externalResidualReconciled: true,
    externalResidualReconciledAt: now,
    externalResidualOrderId: match.orderId,
    externalResidualQty: match.qty,
    externalResidualQuote: match.quote,
  };
  const { error: updateError } = await db.from("trader_trades").update({
    realized_pnl: realizedPnl,
    exit_price: exitPrice,
    client_state: nextState,
    updated_at: now,
  }).eq("id", trade.id).eq("status", "Closed");
  if (updateError) throw updateError;

  await db.from("trader_broker_events").insert({
    account_id: trade.account_id,
    bot_id: trade.bot_id,
    trade_id: trade.id,
    order_id: order.id,
    mode: "live",
    event_type: "external_manual_close_reconciled",
    pair: trade.pair,
    client_order_id: clientOrderId,
    exchange_order_id: match.orderId,
    payload: { qty: match.qty, quote: match.quote, avgPrice: averagePrice, realizedPnl },
  });
  return { status: "reconciled", tradeId: trade.client_id, pair: trade.pair, qty: match.qty, quote: match.quote, realizedPnl };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration_missing" }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await verifyWorkerSecret(db, (req.headers.get("x-trader-worker-secret") ?? "").trim())) return json({ error: "unauthorized" }, 401);

  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data: rows, error } = await db.from("trader_trades")
    .select("id,account_id,bot_id,client_id,pair,status,total_invested,realized_pnl,closed_at,client_state,execution_mode")
    .eq("status", "Closed")
    .eq("execution_mode", "live")
    .gte("closed_at", cutoff)
    .order("closed_at", { ascending: true });
  if (error) return json({ error: error.message }, 500);

  const candidates = (rows ?? []).filter((row) => {
    const state = obj(row.client_state);
    return n(state.residualDustQty) > 0 && state.externalResidualReconciled !== true;
  }) as ClosedTrade[];
  const credsByAccount = new Map<string, Creds>();
  const results: unknown[] = [];
  for (const trade of candidates) {
    try {
      let creds = credsByAccount.get(trade.account_id);
      if (!creds) {
        creds = await credentials(db, trade.account_id);
        credsByAccount.set(trade.account_id, creds);
      }
      results.push(await reconcileTrade(db, trade, creds));
    } catch (error) {
      console.error("trader-live-external-reconcile-worker", trade.client_id, error);
      results.push({ status: "error", tradeId: trade.client_id, error: clean(error) });
    }
  }
  return json({ ok: true, candidates: candidates.length, results });
});