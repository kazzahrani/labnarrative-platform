import type {
  Db,
  ExchangeBalance,
  ExchangeExecutionAdapter,
  MarketQuote,
  MarketRule,
  NormalizedFill,
  NormalizedOrder,
  NormalizedOrderStatus,
  NormalizedOrderType,
  NormalizedSide,
  OrderLookupInput,
  PlaceLimitInput,
  PlaceMarketBuyInput,
  PlaceMarketSellInput,
} from "./trader-exchange.ts";
import { kucoinPrivateRequest } from "./trader-exchange-kucoin-transport.ts";

const KUCOIN_ORIGIN = "https://api.kucoin.com";

function text(value: unknown) { return String(value ?? ""); }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function pairValue(value: string) {
  const pair = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}\/USDT$/.test(pair) || pair === "USDT/USDT") throw new Error("unsupported_spot_pair");
  return pair;
}
function symbolFor(pair: string) { return pairValue(pair).replace("/", "-"); }
function clientOrderId(value: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 64 || !/^[A-Za-z0-9_-]+$/.test(cleaned)) throw new Error("invalid_client_order_id");
  return cleaned;
}

async function kucoinPublic(path: string, queryValues: Record<string, string> = {}) {
  const query = new URLSearchParams(queryValues).toString();
  const response = await fetch(`${KUCOIN_ORIGIN}${path}${query ? `?${query}` : ""}`, { signal: AbortSignal.timeout(8000) });
  const root = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`kucoin_http_${response.status}`);
  if (text(root.code) !== "200000") throw new Error(`kucoin_${text(root.code)}:${text(root.msg) || "request_failed"}`);
  return root;
}

function normalizeStatus(raw: Record<string, unknown>): NormalizedOrderStatus {
  const active = raw.active === true;
  const dealSize = n(raw.dealSize);
  const dealFunds = n(raw.dealFunds);
  const requestedSize = n(raw.size);
  const requestedFunds = n(raw.funds);
  const cancelledSize = n(raw.cancelledSize);
  const cancelledFunds = n(raw.cancelledFunds);
  const cancelExists = raw.cancelExist === true;
  if (active) return dealSize > 0 || dealFunds > 0 ? "partially_filled" : "open";
  if (cancelExists || cancelledSize > 0 || cancelledFunds > 0) return "cancelled";
  if ((requestedSize > 0 && dealSize >= requestedSize) || (requestedFunds > 0 && dealFunds >= requestedFunds) || dealSize > 0 || dealFunds > 0) return "filled";
  return "unknown";
}

async function orderFills(db: Db, accountId: string, pair: string, orderId: string): Promise<NormalizedFill[]> {
  if (!orderId) return [];
  const root = await kucoinPrivateRequest(db, accountId, "GET", "/api/v1/hf/fills", { symbol: symbolFor(pair), orderId, limit: 100 });
  const data = object(root.data);
  return array(data.items).map((value): NormalizedFill => {
    const fill = object(value);
    return {
      tradeId: text(fill.tradeId) || text(fill.id) || null,
      price: n(fill.price),
      quantity: n(fill.size),
      quoteAmount: n(fill.funds),
      feeAsset: text(fill.feeCurrency) || null,
      feeAmount: Math.abs(n(fill.fee)),
    };
  }).filter((fill) => fill.price > 0 && fill.quantity > 0);
}

async function normalizeOrder(db: Db, accountId: string, pair: string, rawValue: unknown): Promise<NormalizedOrder> {
  const raw = object(rawValue);
  const orderId = text(raw.id || raw.orderId);
  const side: NormalizedSide = text(raw.side).toLowerCase() === "sell" ? "SELL" : "BUY";
  const type: NormalizedOrderType = text(raw.type).toLowerCase() === "market" ? "MARKET" : "LIMIT";
  const filledQty = n(raw.dealSize);
  const filledQuote = n(raw.dealFunds);
  const fills = filledQty > 0 || filledQuote > 0 ? await orderFills(db, accountId, pair, orderId) : [];
  const status = normalizeStatus(raw);
  return {
    provider: "kucoin",
    orderId: orderId || null,
    clientOrderId: text(raw.clientOid) || null,
    pair: pairValue(pair),
    side,
    type,
    status,
    rawStatus: raw.active === true ? "active" : (status === "cancelled" ? "done_cancelled" : status === "filled" ? "done_filled" : "done"),
    price: n(raw.price) > 0 ? n(raw.price) : null,
    requestedQty: n(raw.size),
    filledQty,
    filledQuote,
    averageFillPrice: filledQty > 0 && filledQuote > 0 ? filledQuote / filledQty : null,
    fills,
    raw,
  };
}

function acceptedOrder(pair: string, side: NormalizedSide, type: NormalizedOrderType, value: unknown, requestedQty = 0): NormalizedOrder {
  const raw = object(value);
  const statusText = text(raw.status);
  const dealSize = n(raw.dealSize);
  const remainSize = n(raw.remainSize);
  let status: NormalizedOrderStatus = "open";
  if (statusText === "done") status = dealSize > 0 ? "filled" : "cancelled";
  else if (dealSize > 0 && remainSize > 0) status = "partially_filled";
  return {
    provider: "kucoin",
    orderId: text(raw.orderId) || null,
    clientOrderId: text(raw.clientOid) || null,
    pair: pairValue(pair),
    side,
    type,
    status,
    rawStatus: statusText || "accepted",
    price: null,
    requestedQty,
    filledQty: dealSize,
    filledQuote: 0,
    averageFillPrice: null,
    fills: [],
    raw,
  };
}

export class KucoinAdapter implements ExchangeExecutionAdapter {
  readonly provider = "kucoin" as const;
  constructor(private db: Db, private accountId: string) {}

  async getMarketRule(pairInput: string): Promise<MarketRule> {
    const pair = pairValue(pairInput);
    const symbol = symbolFor(pair);
    const root = await kucoinPublic(`/api/v2/symbols/${encodeURIComponent(symbol)}`);
    const info = object(root.data);
    if (text(info.symbol) !== symbol || text(info.quoteCurrency) !== "USDT" || info.enableTrading !== true) throw new Error("spot_symbol_not_tradeable");
    return {
      symbol,
      pair,
      baseAsset: text(info.baseCurrency),
      quoteAsset: "USDT",
      minQty: n(info.baseMinSize),
      maxQty: n(info.baseMaxSize),
      stepSize: n(info.baseIncrement),
      minNotional: n(info.minFunds),
      tickSize: n(info.priceIncrement),
    };
  }

  async getQuote(pairInput: string): Promise<MarketQuote> {
    const pair = pairValue(pairInput);
    const root = await kucoinPublic("/api/v1/market/orderbook/level1", { symbol: symbolFor(pair) });
    const ticker = object(root.data);
    const bid = n(ticker.bestBid);
    const ask = n(ticker.bestAsk);
    const last = n(ticker.price);
    if (!(bid > 0) || !(ask > 0) || !(last > 0)) throw new Error("kucoin_quote_invalid");
    return { pair, bid, ask, last };
  }

  async fetchBalances(): Promise<ExchangeBalance[]> {
    const root = await kucoinPrivateRequest(this.db, this.accountId, "GET", "/api/v1/accounts", { type: "trade" });
    return array(root.data).map((value): ExchangeBalance => {
      const row = object(value);
      const total = Math.max(0, n(row.balance));
      const free = Math.max(0, n(row.available));
      const locked = Math.max(0, n(row.holds));
      return { asset: text(row.currency), free: Math.min(free, total), locked: Math.min(locked, total), total };
    }).filter((balance) => balance.asset && balance.total > 0);
  }

  private async lookup(pair: string, input: { orderId?: string | null; clientOrderId?: string | null }): Promise<NormalizedOrder | null> {
    if (!input.orderId && !input.clientOrderId) throw new Error("order_identifier_required");
    const symbol = symbolFor(pair);
    const path = input.orderId
      ? `/api/v1/hf/orders/${encodeURIComponent(String(input.orderId))}`
      : `/api/v1/hf/orders/client-order/${encodeURIComponent(clientOrderId(String(input.clientOrderId)))}`;
    try {
      const root = await kucoinPrivateRequest(this.db, this.accountId, "GET", path, { symbol });
      return root.data ? await normalizeOrder(this.db, this.accountId, pair, root.data) : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/order.*(not exist|not found|does not exist)/i.test(message) || message.includes("404000")) return null;
      throw error;
    }
  }

  private async place(pair: string, side: NormalizedSide, type: NormalizedOrderType, body: Record<string, unknown>, requestedQty: number) {
    const root = await kucoinPrivateRequest(this.db, this.accountId, "POST", "/api/v1/hf/orders/sync", {}, body);
    const accepted = acceptedOrder(pair, side, type, root.data, requestedQty);
    const latest = await this.lookup(pair, { orderId: accepted.orderId, clientOrderId: accepted.clientOrderId });
    return latest ?? accepted;
  }

  async placeMarketBuy(input: PlaceMarketBuyInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quoteAmount > 0)) throw new Error("invalid_quote_amount");
    return this.place(pair, "BUY", "MARKET", {
      clientOid: clientOrderId(input.clientOrderId),
      symbol: symbolFor(pair),
      type: "market",
      side: "buy",
      funds: String(input.quoteAmount),
    }, input.quoteAmount);
  }

  async placeMarketSell(input: PlaceMarketSellInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0)) throw new Error("invalid_order_quantity");
    return this.place(pair, "SELL", "MARKET", {
      clientOid: clientOrderId(input.clientOrderId),
      symbol: symbolFor(pair),
      type: "market",
      side: "sell",
      size: String(input.quantity),
    }, input.quantity);
  }

  async placeLimit(input: PlaceLimitInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0) || !(input.price > 0)) throw new Error("invalid_limit_order");
    return this.place(pair, input.side, "LIMIT", {
      clientOid: clientOrderId(input.clientOrderId),
      symbol: symbolFor(pair),
      type: "limit",
      side: input.side === "SELL" ? "sell" : "buy",
      price: String(input.price),
      size: String(input.quantity),
      timeInForce: "GTC",
    }, input.quantity);
  }

  async queryOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    return this.lookup(pairValue(input.pair), { orderId: input.orderId, clientOrderId: input.clientOrderId });
  }

  async cancelOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    const pair = pairValue(input.pair);
    if (!input.orderId && !input.clientOrderId) throw new Error("order_identifier_required");
    const symbol = symbolFor(pair);
    const path = input.orderId
      ? `/api/v1/hf/orders/sync/${encodeURIComponent(String(input.orderId))}`
      : `/api/v1/hf/orders/sync/client-order/${encodeURIComponent(clientOrderId(String(input.clientOrderId)))}`;
    await kucoinPrivateRequest(this.db, this.accountId, "DELETE", path, { symbol });
    return this.lookup(pair, { orderId: input.orderId, clientOrderId: input.clientOrderId });
  }
}
