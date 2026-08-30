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
import { okxPrivateRequest, requireOkxItemSuccess } from "./trader-exchange-okx-transport.ts";

const OKX_ORIGIN = "https://www.okx.com";

function text(value: unknown) { return String(value ?? ""); }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function pairValue(value: string) {
  const pair = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}\/USDT$/.test(pair) || pair === "USDT/USDT") throw new Error("unsupported_spot_pair");
  return pair;
}
function instrumentId(pair: string) { return pairValue(pair).replace("/", "-"); }
function clientOrderId(value: string) {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  if (!cleaned) throw new Error("invalid_client_order_id");
  return cleaned;
}

async function okxPublic(path: string, queryValues: Record<string, string>) {
  const query = new URLSearchParams(queryValues).toString();
  const response = await fetch(`${OKX_ORIGIN}${path}?${query}`, { signal: AbortSignal.timeout(8000) });
  const root = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`okx_http_${response.status}`);
  if (text(root.code) !== "0") throw new Error(`okx_${text(root.code)}:${text(root.msg)}`);
  return root;
}

function normalizeStatus(status: string): NormalizedOrderStatus {
  switch (status) {
    case "live": return "open";
    case "partially_filled": return "partially_filled";
    case "filled": return "filled";
    case "canceled":
    case "mmp_canceled": return "cancelled";
    default: return "unknown";
  }
}

async function orderFills(db: Db, accountId: string, orderId: string): Promise<NormalizedFill[]> {
  if (!orderId) return [];
  const root = await okxPrivateRequest(db, accountId, "GET", "/api/v5/trade/fills", { instType: "SPOT", ordId: orderId, limit: 100 });
  return array(root.data).map((value): NormalizedFill => {
    const fill = object(value);
    const price = n(fill.fillPx);
    const quantity = n(fill.fillSz);
    return {
      tradeId: text(fill.tradeId) || text(fill.billId) || null,
      price,
      quantity,
      quoteAmount: price * quantity,
      feeAsset: text(fill.feeCcy) || null,
      feeAmount: Math.abs(n(fill.fee)),
    };
  }).filter((fill) => fill.price > 0 && fill.quantity > 0);
}

async function normalizeOrder(db: Db, accountId: string, pair: string, rawValue: unknown): Promise<NormalizedOrder> {
  const raw = object(rawValue);
  const rawStatus = text(raw.state || "unknown");
  const side: NormalizedSide = text(raw.side).toLowerCase() === "sell" ? "SELL" : "BUY";
  const type: NormalizedOrderType = text(raw.ordType).toLowerCase() === "market" ? "MARKET" : "LIMIT";
  const orderId = text(raw.ordId);
  const filledQty = n(raw.accFillSz);
  const avgPrice = n(raw.avgPx);
  const filledQuote = filledQty > 0 && avgPrice > 0 ? filledQty * avgPrice : 0;
  const fills = filledQty > 0 ? await orderFills(db, accountId, orderId) : [];
  return {
    provider: "okx",
    orderId: orderId || null,
    clientOrderId: text(raw.clOrdId) || null,
    pair: pairValue(pair),
    side,
    type,
    status: normalizeStatus(rawStatus),
    rawStatus,
    price: n(raw.px) > 0 ? n(raw.px) : null,
    requestedQty: n(raw.sz),
    filledQty,
    filledQuote,
    averageFillPrice: avgPrice > 0 ? avgPrice : null,
    fills,
    raw,
  };
}

function acceptedOrder(pair: string, side: NormalizedSide, type: NormalizedOrderType, value: unknown, requestedQty = 0): NormalizedOrder {
  const row = requireOkxItemSuccess(value);
  return {
    provider: "okx",
    orderId: text(row.ordId) || null,
    clientOrderId: text(row.clOrdId) || null,
    pair: pairValue(pair),
    side,
    type,
    status: "open",
    rawStatus: "accepted",
    price: null,
    requestedQty,
    filledQty: 0,
    filledQuote: 0,
    averageFillPrice: null,
    fills: [],
    raw: row,
  };
}

export class OkxAdapter implements ExchangeExecutionAdapter {
  readonly provider = "okx" as const;
  constructor(private db: Db, private accountId: string) {}

  async getMarketRule(pairInput: string): Promise<MarketRule> {
    const pair = pairValue(pairInput);
    const symbol = instrumentId(pair);
    const root = await okxPublic("/api/v5/public/instruments", { instType: "SPOT", instId: symbol });
    const info = object(array(root.data)[0]);
    const parts = symbol.split("-");
    if (!info.instId || text(info.state) !== "live" || parts[1] !== "USDT") throw new Error("spot_symbol_not_tradeable");
    return {
      symbol,
      pair,
      baseAsset: parts[0],
      quoteAsset: "USDT",
      minQty: n(info.minSz),
      maxQty: n(info.maxLmtSz),
      stepSize: n(info.lotSz),
      minNotional: 0,
      tickSize: n(info.tickSz),
    };
  }

  async getQuote(pairInput: string): Promise<MarketQuote> {
    const pair = pairValue(pairInput);
    const root = await okxPublic("/api/v5/market/ticker", { instId: instrumentId(pair) });
    const ticker = object(array(root.data)[0]);
    const bid = n(ticker.bidPx);
    const ask = n(ticker.askPx);
    const last = n(ticker.last);
    if (!(bid > 0) || !(ask > 0) || !(last > 0)) throw new Error("okx_quote_invalid");
    return { pair, bid, ask, last };
  }

  async fetchBalances(): Promise<ExchangeBalance[]> {
    const root = await okxPrivateRequest(this.db, this.accountId, "GET", "/api/v5/account/balance");
    const account = object(array(root.data)[0]);
    return array(account.details).map((value): ExchangeBalance => {
      const detail = object(value);
      const free = Math.max(0, n(detail.availBal));
      const locked = Math.max(0, n(detail.frozenBal));
      const liability = Math.max(0, n(detail.liab));
      const cash = Math.max(0, n(detail.cashBal));
      const total = Math.max(0, cash - liability);
      return { asset: text(detail.ccy), free: Math.min(free, total), locked: Math.min(locked, total), total };
    }).filter((balance) => balance.asset && balance.total > 0);
  }

  private async lookup(pair: string, input: { orderId?: string | null; clientOrderId?: string | null }): Promise<NormalizedOrder | null> {
    if (!input.orderId && !input.clientOrderId) throw new Error("order_identifier_required");
    const query: Record<string, string | number> = { instId: instrumentId(pair) };
    if (input.orderId) query.ordId = input.orderId;
    else if (input.clientOrderId) query.clOrdId = clientOrderId(input.clientOrderId);
    try {
      const root = await okxPrivateRequest(this.db, this.accountId, "GET", "/api/v5/trade/order", query);
      const rows = array(root.data);
      return rows.length ? await normalizeOrder(this.db, this.accountId, pair, rows[0]) : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/order.*(not exist|does not exist)/i.test(message) || message.includes("51603")) return null;
      throw error;
    }
  }

  private async settleAccepted(pair: string, side: NormalizedSide, type: NormalizedOrderType, value: unknown, requestedQty: number, waitForTerminal: boolean) {
    const accepted = acceptedOrder(pair, side, type, value, requestedQty);
    let latest: NormalizedOrder | null = null;
    for (let attempt = 0; attempt < (waitForTerminal ? 12 : 2); attempt++) {
      latest = await this.lookup(pair, { orderId: accepted.orderId, clientOrderId: accepted.clientOrderId });
      if (latest && (!waitForTerminal || !["open", "partially_filled", "unknown"].includes(latest.status))) return latest;
      if (attempt < (waitForTerminal ? 11 : 1)) await new Promise((resolve) => setTimeout(resolve, 125));
    }
    return latest ?? accepted;
  }

  async placeMarketBuy(input: PlaceMarketBuyInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quoteAmount > 0)) throw new Error("invalid_quote_amount");
    const root = await okxPrivateRequest(this.db, this.accountId, "POST", "/api/v5/trade/order", {}, {
      instId: instrumentId(pair),
      tdMode: "cash",
      clOrdId: clientOrderId(input.clientOrderId),
      side: "buy",
      ordType: "market",
      sz: String(input.quoteAmount),
      tgtCcy: "quote_ccy",
      banAmend: true,
    });
    return this.settleAccepted(pair, "BUY", "MARKET", array(root.data)[0], input.quoteAmount, true);
  }

  async placeMarketSell(input: PlaceMarketSellInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0)) throw new Error("invalid_order_quantity");
    const root = await okxPrivateRequest(this.db, this.accountId, "POST", "/api/v5/trade/order", {}, {
      instId: instrumentId(pair),
      tdMode: "cash",
      clOrdId: clientOrderId(input.clientOrderId),
      side: "sell",
      ordType: "market",
      sz: String(input.quantity),
      tgtCcy: "base_ccy",
      banAmend: true,
    });
    return this.settleAccepted(pair, "SELL", "MARKET", array(root.data)[0], input.quantity, true);
  }

  async placeLimit(input: PlaceLimitInput): Promise<NormalizedOrder> {
    const pair = pairValue(input.pair);
    if (!(input.quantity > 0) || !(input.price > 0)) throw new Error("invalid_limit_order");
    const root = await okxPrivateRequest(this.db, this.accountId, "POST", "/api/v5/trade/order", {}, {
      instId: instrumentId(pair),
      tdMode: "cash",
      clOrdId: clientOrderId(input.clientOrderId),
      side: input.side === "SELL" ? "sell" : "buy",
      ordType: "limit",
      sz: String(input.quantity),
      px: String(input.price),
    });
    return this.settleAccepted(pair, input.side, "LIMIT", array(root.data)[0], input.quantity, false);
  }

  async queryOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    return this.lookup(pairValue(input.pair), { orderId: input.orderId, clientOrderId: input.clientOrderId });
  }

  async cancelOrder(input: OrderLookupInput): Promise<NormalizedOrder | null> {
    const pair = pairValue(input.pair);
    if (!input.orderId && !input.clientOrderId) throw new Error("order_identifier_required");
    const body: Record<string, unknown> = { instId: instrumentId(pair) };
    if (input.orderId) body.ordId = input.orderId;
    else body.clOrdId = clientOrderId(String(input.clientOrderId));
    const root = await okxPrivateRequest(this.db, this.accountId, "POST", "/api/v5/trade/cancel-order", {}, body);
    const accepted = requireOkxItemSuccess(array(root.data)[0]);
    let latest: NormalizedOrder | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      latest = await this.lookup(pair, {
        orderId: text(accepted.ordId) || input.orderId,
        clientOrderId: text(accepted.clOrdId) || input.clientOrderId,
      });
      if (latest && ["cancelled", "filled", "rejected", "expired"].includes(latest.status)) return latest;
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 125));
    }
    return latest;
  }
}
