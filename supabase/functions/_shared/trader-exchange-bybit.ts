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
import { bybitPrivateRequest } from "./trader-exchange-provider-transport.ts";

const BYBIT_ORIGIN = "https://api.bybit.com";

function text(value: unknown) { return String(value ?? ""); }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function pairValue(value: string) {
  const pair = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}\/USDT$/.test(pair) || pair === "USDT/USDT") throw new Error("unsupported_spot_pair");
  return pair;
}
function symbolFor(pair: string) { return pairValue(pair).replace("/", ""); }

async function bybitPublic(path: string, queryValues: Record<string, string>) {
  const query = new URLSearchParams(queryValues).toString();
  const response = await fetch(`${BYBIT_ORIGIN}${path}?${query}`, { signal: AbortSignal.timeout(8000) });
  const root = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`bybit_http_${response.status}`);
  if (n(root.retCode) !== 0) throw new Error(`bybit_${text(root.retCode)}:${text(root.retMsg)}`);
  return root;
}

function normalizeStatus(status: string): NormalizedOrderStatus {
  switch (status) {
    case "New": return "open";
    case "PartiallyFilled": return "partially_filled";
    case "Filled": return "filled";
    case "Cancelled":
    case "PartiallyFilledCanceled":
    case "Deactivated": return "cancelled";
    case "Rejected": return "rejected";
    default: return "unknown";
  }
}

async function orderFills(db: Db, accountId: string, orderId: string, orderLinkId: string): Promise<NormalizedFill[]> {
  const query: Record<string, string | number> = { category: "spot", limit: 100 };
  if (orderId) query.orderId = orderId;
  else if (orderLinkId) query.orderLinkId = orderLinkId;
  else return [];
  const root = await bybitPrivateRequest(db, accountId, "GET", "/v5/execution/list", query);
  const result = object(root.result);
  return array(result.list).map((value): NormalizedFill => {
    const fill = object(value);
    return {
      tradeId: text(fill.execId) || null,
      price: n(fill.execPrice),
      quantity: n(fill.execQty),
      quoteAmount: n(fill.execValue),
      feeAsset: text(fill.feeCurrency) || null,
      feeAmount: n(fill.execFee),
    };
  }).filter((fill) => fill.quantity > 0 && fill.price > 0);
}

async function normalizeOrder(db: Db, accountId: string, pair: string, rawValue: unknown): Promise<NormalizedOrder> {
  const raw = object(rawValue);
  const rawStatus = text(raw.orderStatus || "Unknown");
  const side: NormalizedSide = text(raw.side).toLowerCase() === "sell" ? "SELL" : "BUY";
  const type: NormalizedOrderType = text(raw.orderType).toLowerCase() === "market" ? "MARKET" : "LIMIT";
  const orderId = text(raw.orderId);
  const clientOrderId = text(raw.orderLinkId);
  const filledQty = n(raw.cumExecQty);
  const filledQuote = n(raw.cumExecValue);
  const fills = filledQty > 0 ? await orderFills(db, accountId, orderId, clientOrderId) : [];
  return {
    provider: "bybit",
    orderId: orderId || null,
    clientOrderId: clientOrderId || null,
    pair: pairValue(pair),
    side,
    type,
    status: normalizeStatus(rawStatus),
    rawStatus,
    price: n(raw.price) > 0 ? n(raw.price) : null,
    requestedQty: n(raw.qty),
    filledQty,
    filledQuote,
    averageFillPrice: n(raw.avgPrice) > 0 ? n(raw.avgPrice) : (filledQty > 0 && filledQuote > 0 ? filledQuote / filledQty : null),
    fills,
    raw,
  };
}

function acceptedOrder(pair: string, side: NormalizedSide, type: NormalizedOrderType, resultValue: unknown, requestedQty = 0): NormalizedOrder {
  const result = object(resultValue);
  return {
    provider: "bybit",
    orderId: text(result.orderId) || null,
    clientOrderId: text(result.orderLinkId) || null,
    pair: pairValue(pair),
    side,
    type,
    status: "open",
    rawStatus: "Accepted",
    price: null,
    requestedQty,
    filledQty: 0,
    filledQuote: 0,
    averageFillPrice: null,
    fills: [],
    raw: result,
  };
}

export class BybitAdapter implements ExchangeExecutionAdapter {
  readonly provider = "bybit" as const;
  constructor(private db: Db, private accountId: string) {}

  async getMarketRule(pairInput: string): Promise<MarketRule> {
    const pair = pairValue(pairInput);
    const symbol = symbolFor(pair);
    const root = await bybitPublic("/v5/market/instruments-info", { category: "spot", symbol });
    const result = object(root.result);
    const info = object(array(result.list)[0]);
    if (!info.symbol || text(info.status) !== "Trading" || text(info.quoteCoin) !== "USDT") throw new Error("spot_symbol_not_tradeable");
    const lot = object(info.lotSizeFilter);
    const price = object(info.priceFilter);
    return {
      symbol,
      pair,
      baseAsset: text(info.baseCoin),
      quoteAsset: "USDT",
      minQty: n(lot.minOrderQty),
      maxQty: n(lot.maxMarketOrderQty || lot.maxLimitOrderQty || lot.maxOrderQty),
      stepSize: n(lot.basePrecision),
      minNotional: n(lot.minOrderAmt),
      tickSize: n(price.tickSize),
    };
  }

  async getQuote(pairInput: string): Promise<MarketQuote> {
    const pair = pairValue(pairInput);
    const root = await bybitPublic("/v5/market/tickers", { category: "spot", symbol: symbolFor(pair) });
    const result = object(root.result);
    const ticker = object(array(result.list)[0]);
    const bid = n(ticker.bid1Price);
    const ask = n(ticker.ask1Price);
    const last = n(ticker.lastPrice);
    if (!(bid > 0) || !(ask > 0) || !(last > 0)) throw new Error("bybit_quote_invalid");
    return { pair, bid, ask, last };
  }

  async fetchBalances(): Promise<ExchangeBalance[]> {
    const root = await bybitPrivateRequest(this.db, this.accountId, "GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" });
    const result = object(root.result);
    const account = object(array(result.list)[0]);
    return array(account.coin).map((value): ExchangeBalance => {
      const coin = object(value);
      const wallet = Math.max(0, n(coin.walletBalance));
      const locked = Math.max(0, n(coin.locked));
      const borrowed = Math.max(0, n(coin.spotBorrow));
      const total = Math.max(0, wallet - borrowed);
      const free = Math.max(0, total - locked);
      return { asset: text(coin.coin), free, locked: Math.min(locked, total), total };
    }).filter((balance) => balance.asset && balance.total > 0);
  }

  private async lookup(pair: string, input: { orderId?: string | null; clientOrderId?: string | null }): Promise<NormalizedOrder | null> {
    const query: Record<string, string | number> = { category: "spot", symbol: symbolFor(pair), orderFilter: "Order" };
    if (input.orderId) query.orderId = input.orderId;
    else if (input.clientOrderId) query.orderLinkId = input.clientOrderId;
    else throw new Error("order_identifier_required");

    const realtime = await bybitPrivateRequest(this.db, this.accountId, "GET", "/v5/order/realtime", query);
    let rows = array(object(realtime.result).list);
    if (!rows.length) {
      const history = await bybitPrivateRequest(this.db, this.accountId, "GET", "/v5/order/history", { ...query, limit: 1 });
      rows = array(object(history.result).list);
    }
    return rows.length ? await normalizeOrder(this.db, this.accountId, pair, rows[0]) : null;
  }

  private async settleAccepted(pair: string, side: NormalizedSide, type: NormalizedOrderType, result: unknown, requestedQty = 0, waitForTerminal = false) {
    const accepted = acceptedOrder(pair, side, type, result, requestedQty);
    let latest: NormalizedOrder | null = null;
    for (let attempt = 0; attempt < (waitForTerminal ? 12 : 1); attempt++) {
      latest = await this.lookup(pair, { orderId: accepted.orderId, clientOrderId: accepted.clientOrderId });
      if (latest && (!waitForTerminal || !["open", "partially_filled", "unknown"].includes(latest.status))) return latest;
      if (attempt < (waitForTerminal ? 11 : 0)) await new Promise((resolve) => setTimeout(resolve, 125));
    }
    return latest ?? accepted;
  }

  async placeMarketBuy(input: PlaceMarketBuyInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quoteAmount > 0)) throw new Error("invalid_quote_amount");
    const root = await bybitPrivateRequest(this.db, this.accountId, "POST", "/v5/order/create", {}, {
      category: "spot",
      symbol: symbolFor(pair),
      side: "Buy",
      orderType: "Market",
      qty: String(input.quoteAmount),
      marketUnit: "quoteCoin",
      timeInForce: "IOC",
      orderLinkId: input.clientOrderId,
      isLeverage: 0,
      orderFilter: "Order",
    });
    return this.settleAccepted(pair, "BUY", "MARKET", root.result, input.quoteAmount, true);
  }

  async placeMarketSell(input: PlaceMarketSellInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0)) throw new Error("invalid_order_quantity");
    const root = await bybitPrivateRequest(this.db, this.accountId, "POST", "/v5/order/create", {}, {
      category: "spot",
      symbol: symbolFor(pair),
      side: "Sell",
      orderType: "Market",
      qty: String(input.quantity),
      marketUnit: "baseCoin",
      timeInForce: "IOC",
      orderLinkId: input.clientOrderId,
      isLeverage: 0,
      orderFilter: "Order",
    });
    return this.settleAccepted(pair, "SELL", "MARKET", root.result, input.quantity, true);
  }

  async placeLimit(input: PlaceLimitInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0) || !(input.price > 0)) throw new Error("invalid_limit_order");
    const root = await bybitPrivateRequest(this.db, this.accountId, "POST", "/v5/order/create", {}, {
      category: "spot",
      symbol: symbolFor(pair),
      side: input.side === "SELL" ? "Sell" : "Buy",
      orderType: "Limit",
      qty: String(input.quantity),
      price: String(input.price),
      timeInForce: "GTC",
      orderLinkId: input.clientOrderId,
      isLeverage: 0,
      orderFilter: "Order",
    });
    return this.settleAccepted(pair, input.side, "LIMIT", root.result, input.quantity, false);
  }

  async queryOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    return this.lookup(pairValue(input.pair), { orderId: input.orderId, clientOrderId: input.clientOrderId });
  }

  async cancelOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    const pair = pairValue(input.pair);
    if (!input.orderId && !input.clientOrderId) throw new Error("order_identifier_required");
    const body: Record<string, unknown> = { category: "spot", symbol: symbolFor(pair), orderFilter: "Order" };
    if (input.orderId) body.orderId = input.orderId;
    else body.orderLinkId = input.clientOrderId;
    const root = await bybitPrivateRequest(this.db, this.accountId, "POST", "/v5/order/cancel", {}, body);
    const result = object(root.result);
    let latest: NormalizedOrder | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      latest = await this.lookup(pair, { orderId: text(result.orderId) || input.orderId, clientOrderId: text(result.orderLinkId) || input.clientOrderId });
      if (latest && ["cancelled", "filled", "rejected", "expired"].includes(latest.status)) return latest;
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 125));
    }
    return latest;
  }
}
