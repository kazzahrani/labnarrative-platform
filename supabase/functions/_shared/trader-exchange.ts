import { createClient } from "jsr:@supabase/supabase-js@2";

export type Db = ReturnType<typeof createClient>;
export type LaunchExchangeProvider = "binance" | "bybit" | "okx" | "kucoin";
export type NormalizedOrderStatus = "open" | "partially_filled" | "filled" | "cancelled" | "rejected" | "expired" | "unknown";
export type NormalizedSide = "BUY" | "SELL";
export type NormalizedOrderType = "MARKET" | "LIMIT";

export type MarketRule = {
  symbol: string;
  pair: string;
  baseAsset: string;
  quoteAsset: string;
  minQty: number;
  maxQty: number;
  stepSize: number;
  minNotional: number;
  tickSize: number;
};

export type MarketQuote = {
  pair: string;
  bid: number;
  ask: number;
  last: number;
};

export type ExchangeBalance = {
  asset: string;
  free: number;
  locked: number;
  total: number;
};

export type NormalizedFill = {
  tradeId: string | null;
  price: number;
  quantity: number;
  quoteAmount: number;
  feeAsset: string | null;
  feeAmount: number;
};

export type NormalizedOrder = {
  provider: LaunchExchangeProvider;
  orderId: string | null;
  clientOrderId: string | null;
  pair: string;
  side: NormalizedSide;
  type: NormalizedOrderType;
  status: NormalizedOrderStatus;
  rawStatus: string;
  price: number | null;
  requestedQty: number;
  filledQty: number;
  filledQuote: number;
  averageFillPrice: number | null;
  fills: NormalizedFill[];
  raw: Record<string, unknown>;
};

export type PlaceMarketBuyInput = { pair: string; quoteAmount: number; clientOrderId: string };
export type PlaceMarketSellInput = { pair: string; quantity: number; clientOrderId: string };
export type PlaceLimitInput = { pair: string; side: NormalizedSide; quantity: number; price: number; clientOrderId: string };
export type OrderLookupInput = { pair: string; clientOrderId?: string; orderId?: string };

export interface ExchangeExecutionAdapter {
  readonly provider: LaunchExchangeProvider;
  getMarketRule(pair: string): Promise<MarketRule>;
  getQuote(pair: string): Promise<MarketQuote>;
  fetchBalances(): Promise<ExchangeBalance[]>;
  placeMarketBuy(input: PlaceMarketBuyInput): Promise<NormalizedOrder>;
  placeMarketSell(input: PlaceMarketSellInput): Promise<NormalizedOrder>;
  placeLimit(input: PlaceLimitInput): Promise<NormalizedOrder>;
  queryOrder(input: OrderLookupInput): Promise<NormalizedOrder | null>;
  cancelOrder(input: OrderLookupInput): Promise<NormalizedOrder | null>;
}

const BINANCE_PUBLIC = "https://data-api.binance.vision";
const GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
let cachedGatewaySigningKey: CryptoKey | null = null;

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function text(value: unknown) { return String(value ?? ""); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function pairValue(value: string) {
  const pair = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}\/USDT$/.test(pair) || pair === "USDT/USDT") throw new Error("unsupported_spot_pair");
  return pair;
}
function symbolFor(pair: string) { return pairValue(pair).replace("/", ""); }
function nonce() { const bytes = crypto.getRandomValues(new Uint8Array(24)); return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function pemBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function base64(bytes: Uint8Array) { let out = ""; for (const b of bytes) out += String.fromCharCode(b); return btoa(out); }
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gatewaySigningKey(db: Db) {
  if (cachedGatewaySigningKey) return cachedGatewaySigningKey;
  const { data, error } = await db.rpc("trader_gateway_read_signing_private_key");
  if (error || !data) throw new Error("gateway_signing_key_not_configured");
  cachedGatewaySigningKey = await crypto.subtle.importKey("pkcs8", pemBytes(String(data)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return cachedGatewaySigningKey;
}

async function gatewayRelay(db: Db, payload: Record<string, unknown>) {
  const { data, error } = await db.from("trader_gateway_config").select("base_url,status").eq("name", "binance").single();
  if (error || !data || data.status !== "ready" || !data.base_url) throw new Error("gateway_not_ready");
  const origin = new URL(String(data.base_url)).origin;
  if (origin !== GATEWAY_ORIGIN) throw new Error("gateway_origin_not_allowed");
  const raw = JSON.stringify(payload);
  const ts = Date.now();
  const nce = nonce();
  const key = await gatewaySigningKey(db);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${ts}\n${nce}\n${raw}`)));
  const response = await fetch(`${origin}/relay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ln-timestamp": String(ts), "x-ln-nonce": nce, "x-ln-signature": base64(signature) },
    body: raw,
    signal: AbortSignal.timeout(12000),
  });
  const envelope = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`gateway_${response.status}:${text(envelope.error) || "relay_failed"}`);
  const upstreamStatus = n(envelope.upstreamStatus);
  const upstreamBody = text(envelope.upstreamBody);
  let body: Record<string, unknown> = {};
  try { body = upstreamBody ? object(JSON.parse(upstreamBody)) : {}; } catch { throw new Error("binance_invalid_json"); }
  if (upstreamStatus < 200 || upstreamStatus >= 300) throw new Error(`binance_${text(body.code || upstreamStatus)}:${text(body.msg) || "request_failed"}`);
  return body;
}

async function binanceCredentials(db: Db, accountId: string) {
  const { data, error } = await db.rpc("trader_binance_read_secret", { p_account_id: accountId });
  if (error || !data) throw new Error("credential_not_found");
  const parsed = object(JSON.parse(String(data)));
  const apiKey = text(parsed.apiKey);
  const apiSecret = text(parsed.apiSecret);
  if (!apiKey || !apiSecret) throw new Error("credential_not_found");
  return { apiKey, apiSecret };
}

async function binanceSigned(db: Db, creds: { apiKey: string; apiSecret: string }, method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string | number | boolean> = {}) {
  const time = await gatewayRelay(db, { requestId: crypto.randomUUID(), method: "GET", path: "/api/v3/time", query: "" });
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  query.set("timestamp", String(n(time.serverTime)));
  query.set("recvWindow", "5000");
  query.set("signature", await hmacHex(creds.apiSecret, query.toString()));
  return gatewayRelay(db, { requestId: crypto.randomUUID(), method, path, query: query.toString(), apiKey: creds.apiKey });
}

function normalizeBinanceStatus(status: string): NormalizedOrderStatus {
  switch (status.toUpperCase()) {
    case "NEW": return "open";
    case "PARTIALLY_FILLED": return "partially_filled";
    case "FILLED": return "filled";
    case "CANCELED": return "cancelled";
    case "REJECTED": return "rejected";
    case "EXPIRED":
    case "EXPIRED_IN_MATCH": return "expired";
    default: return "unknown";
  }
}

function normalizeBinanceOrder(pair: string, side: NormalizedSide, type: NormalizedOrderType, response: Record<string, unknown>): NormalizedOrder {
  const rawStatus = text(response.status || "UNKNOWN");
  const filledQty = n(response.executedQty);
  const filledQuote = n(response.cummulativeQuoteQty);
  const fills = array(response.fills).map((value): NormalizedFill => {
    const fill = object(value);
    const price = n(fill.price);
    const quantity = n(fill.qty);
    return { tradeId: text(fill.tradeId) || null, price, quantity, quoteAmount: price * quantity, feeAsset: text(fill.commissionAsset) || null, feeAmount: n(fill.commission) };
  });
  return {
    provider: "binance",
    orderId: text(response.orderId) || null,
    clientOrderId: text(response.clientOrderId) || text(response.origClientOrderId) || null,
    pair: pairValue(pair),
    side,
    type,
    status: normalizeBinanceStatus(rawStatus),
    rawStatus,
    price: n(response.price) > 0 ? n(response.price) : null,
    requestedQty: n(response.origQty),
    filledQty,
    filledQuote,
    averageFillPrice: filledQty > 0 && filledQuote > 0 ? filledQuote / filledQty : null,
    fills,
    raw: response,
  };
}

class BinanceAdapter implements ExchangeExecutionAdapter {
  readonly provider = "binance" as const;
  constructor(private db: Db, private accountId: string) {}

  async getMarketRule(pairInput: string): Promise<MarketRule> {
    const pair = pairValue(pairInput);
    const symbol = symbolFor(pair);
    const response = await fetch(`${BINANCE_PUBLIC}/api/v3/exchangeInfo?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`binance_exchange_info_${response.status}`);
    const root = await response.json() as { symbols?: Record<string, unknown>[] };
    const symbolInfo = root.symbols?.[0];
    if (!symbolInfo || symbolInfo.status !== "TRADING" || symbolInfo.quoteAsset !== "USDT" || symbolInfo.isSpotTradingAllowed === false) throw new Error("spot_symbol_not_tradeable");
    const filters = array(symbolInfo.filters).map(object);
    const filter = (name: string) => filters.find((item) => item.filterType === name) ?? {};
    const lot = filter("LOT_SIZE");
    const price = filter("PRICE_FILTER");
    const notional = filters.find((item) => item.filterType === "NOTIONAL" || item.filterType === "MIN_NOTIONAL") ?? {};
    return { symbol, pair, baseAsset: text(symbolInfo.baseAsset), quoteAsset: "USDT", minQty: n(lot.minQty), maxQty: n(lot.maxQty), stepSize: n(lot.stepSize), minNotional: n(notional.minNotional), tickSize: n(price.tickSize) };
  }

  async getQuote(pairInput: string): Promise<MarketQuote> {
    const pair = pairValue(pairInput);
    const symbol = symbolFor(pair);
    const response = await fetch(`${BINANCE_PUBLIC}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`binance_quote_${response.status}`);
    const root = object(await response.json());
    const bid = n(root.bidPrice);
    const ask = n(root.askPrice);
    if (!(bid > 0) || !(ask > 0)) throw new Error("binance_quote_invalid");
    return { pair, bid, ask, last: (bid + ask) / 2 };
  }

  async fetchBalances(): Promise<ExchangeBalance[]> {
    const creds = await binanceCredentials(this.db, this.accountId);
    const root = await binanceSigned(this.db, creds, "GET", "/api/v3/account", { omitZeroBalances: true });
    return array(root.balances).map((value) => {
      const balance = object(value);
      const free = n(balance.free);
      const locked = n(balance.locked);
      return { asset: text(balance.asset), free, locked, total: free + locked };
    }).filter((item) => item.asset && item.total > 0);
  }

  async placeMarketBuy(input: PlaceMarketBuyInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quoteAmount > 0)) throw new Error("invalid_quote_amount");
    const creds = await binanceCredentials(this.db, this.accountId);
    const response = await binanceSigned(this.db, creds, "POST", "/api/v3/order", { symbol: symbolFor(pair), side: "BUY", type: "MARKET", quoteOrderQty: input.quoteAmount, newClientOrderId: input.clientOrderId, newOrderRespType: "FULL" });
    return normalizeBinanceOrder(pair, "BUY", "MARKET", response);
  }

  async placeMarketSell(input: PlaceMarketSellInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0)) throw new Error("invalid_order_quantity");
    const creds = await binanceCredentials(this.db, this.accountId);
    const response = await binanceSigned(this.db, creds, "POST", "/api/v3/order", { symbol: symbolFor(pair), side: "SELL", type: "MARKET", quantity: input.quantity, newClientOrderId: input.clientOrderId, newOrderRespType: "FULL" });
    return normalizeBinanceOrder(pair, "SELL", "MARKET", response);
  }

  async placeLimit(input: PlaceLimitInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0) || !(input.price > 0)) throw new Error("invalid_limit_order");
    const creds = await binanceCredentials(this.db, this.accountId);
    const response = await binanceSigned(this.db, creds, "POST", "/api/v3/order", { symbol: symbolFor(pair), side: input.side, type: "LIMIT", timeInForce: "GTC", quantity: input.quantity, price: input.price, newClientOrderId: input.clientOrderId, newOrderRespType: "RESULT" });
    return normalizeBinanceOrder(pair, input.side, "LIMIT", response);
  }

  async queryOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    const pair = pairValue(input.pair);
    if (!input.clientOrderId && !input.orderId) throw new Error("order_identifier_required");
    const creds = await binanceCredentials(this.db, this.accountId);
    try {
      const params: Record<string, string> = { symbol: symbolFor(pair) };
      if (input.clientOrderId) params.origClientOrderId = input.clientOrderId;
      else if (input.orderId) params.orderId = input.orderId;
      const response = await binanceSigned(this.db, creds, "GET", "/api/v3/order", params);
      return normalizeBinanceOrder(pair, text(response.side).toUpperCase() === "SELL" ? "SELL" : "BUY", text(response.type).toUpperCase() === "MARKET" ? "MARKET" : "LIMIT", response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("-2013") || message.includes("Order does not exist")) return null;
      throw error;
    }
  }

  async cancelOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    const pair = pairValue(input.pair);
    if (!input.clientOrderId && !input.orderId) throw new Error("order_identifier_required");
    const creds = await binanceCredentials(this.db, this.accountId);
    try {
      const params: Record<string, string> = { symbol: symbolFor(pair) };
      if (input.clientOrderId) params.origClientOrderId = input.clientOrderId;
      else if (input.orderId) params.orderId = input.orderId;
      const response = await binanceSigned(this.db, creds, "DELETE", "/api/v3/order", params);
      return normalizeBinanceOrder(pair, text(response.side).toUpperCase() === "SELL" ? "SELL" : "BUY", text(response.type).toUpperCase() === "MARKET" ? "MARKET" : "LIMIT", response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("-2011") || message.includes("Unknown order")) return null;
      throw error;
    }
  }
}

export function createExchangeExecutionAdapter(db: Db, accountId: string, provider: LaunchExchangeProvider): ExchangeExecutionAdapter {
  if (provider === "binance") return new BinanceAdapter(db, accountId);
  throw new Error(`execution_adapter_not_enabled:${provider}`);
}

export function normalizeLaunchExchangeProvider(value: unknown, fallback: LaunchExchangeProvider = "binance"): LaunchExchangeProvider {
  const provider = text(value).trim().toLowerCase();
  return provider === "binance" || provider === "bybit" || provider === "okx" || provider === "kucoin" ? provider : fallback;
}
