import { NextResponse } from "next/server";

type BinanceFilter = {
  filterType: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minNotional?: string;
  tickSize?: string;
};

type BinanceSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
  filters?: BinanceFilter[];
};

type ExchangeInfo = { symbols?: BinanceSymbol[] };
type Ticker24h = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  bidPrice: string;
  askPrice: string;
  highPrice: string;
  lowPrice: string;
};

const BINANCE_DATA = "https://data-api.binance.vision";

function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function filterValue(filters: BinanceFilter[] | undefined, filterType: string, key: keyof BinanceFilter) {
  const filter = filters?.find((item) => item.filterType === filterType);
  return numeric(filter?.[key]);
}

export async function GET() {
  try {
    const [exchangeResponse, tickerResponse] = await Promise.all([
      fetch(`${BINANCE_DATA}/api/v3/exchangeInfo`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }),
      fetch(`${BINANCE_DATA}/api/v3/ticker/24hr`, { next: { revalidate: 15 }, signal: AbortSignal.timeout(8000) }),
    ]);

    if (!exchangeResponse.ok || !tickerResponse.ok) {
      throw new Error(`Binance market data failed (${exchangeResponse.status}/${tickerResponse.status})`);
    }

    const exchange = await exchangeResponse.json() as ExchangeInfo;
    const tickers = await tickerResponse.json() as Ticker24h[];
    const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

    const markets = (exchange.symbols ?? [])
      .filter((item) => item.status === "TRADING" && item.quoteAsset === "USDT" && item.isSpotTradingAllowed !== false)
      .map((item) => {
        const ticker = tickerMap.get(item.symbol);
        const minNotional = filterValue(item.filters, "NOTIONAL", "minNotional") || filterValue(item.filters, "MIN_NOTIONAL", "minNotional");
        return {
          symbol: item.baseAsset,
          exchangeSymbol: item.symbol,
          label: item.baseAsset,
          quoteAsset: item.quoteAsset,
          price: numeric(ticker?.lastPrice) || null,
          bid: numeric(ticker?.bidPrice) || null,
          ask: numeric(ticker?.askPrice) || null,
          change24h: numeric(ticker?.priceChangePercent),
          quoteVolume24h: numeric(ticker?.quoteVolume),
          high24h: numeric(ticker?.highPrice) || null,
          low24h: numeric(ticker?.lowPrice) || null,
          minQty: filterValue(item.filters, "LOT_SIZE", "minQty"),
          maxQty: filterValue(item.filters, "LOT_SIZE", "maxQty"),
          stepSize: filterValue(item.filters, "LOT_SIZE", "stepSize"),
          minNotional,
          tickSize: filterValue(item.filters, "PRICE_FILTER", "tickSize"),
        };
      })
      .filter((item) => item.price != null)
      .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

    return NextResponse.json({
      source: "Binance Spot",
      live: true,
      quoteAsset: "USDT",
      generatedAt: new Date().toISOString(),
      markets,
    }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (error) {
    return NextResponse.json({
      source: "Binance Spot",
      live: false,
      quoteAsset: "USDT",
      generatedAt: new Date().toISOString(),
      markets: [],
      error: error instanceof Error ? error.message : "Market data unavailable",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
