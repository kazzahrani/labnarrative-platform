import { NextRequest, NextResponse } from "next/server";

type AssetType = "saudi_stock" | "reit" | "global_stock" | "crypto" | string;
type HistoryPoint = { date: string; timestamp: number; price: number; nativePrice: number };

const RANGE_MAP: Record<string, string> = { "1m": "1mo", "3m": "3mo", "1y": "1y", "5y": "5y" };

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizeSymbol(value: string | null) {
  if (!value) return "";
  return normalizeDigits(value).trim().toUpperCase().replace(/[^0-9A-Z.\-]/g, "");
}

function yahooTicker(symbol: string, assetType: AssetType) {
  if (assetType === "saudi_stock" || assetType === "reit") return symbol.endsWith(".SR") ? symbol : `${symbol}.SR`;
  if (assetType === "crypto") return symbol.includes("-") ? symbol : `${symbol}-USD`;
  return symbol;
}

function toSar(price: number, currency: string) {
  if (currency === "SAR") return price;
  if (currency === "USD") return price * 3.75;
  return price;
}

export async function GET(request: NextRequest) {
  const symbol = normalizeSymbol(request.nextUrl.searchParams.get("symbol"));
  const assetType = (request.nextUrl.searchParams.get("assetType") || "global_stock") as AssetType;
  const rangeKey = request.nextUrl.searchParams.get("range") || "1y";
  const range = RANGE_MAP[rangeKey] || "1y";
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const ticker = yahooTicker(symbol, assetType);
  const interval = range === "5y" ? "1wk" : "1d";
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false&events=div%2Csplits&includeAdjustedClose=true`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": "LabNarrative-Wealth-MVP/0.1" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return NextResponse.json({ error: "Historical market data unavailable" }, { status: 502 });
    const body = await response.json();
    const result = body?.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: "No historical data" }, { status: 404 });

    const currency = typeof result?.meta?.currency === "string" ? result.meta.currency.toUpperCase() : (assetType === "saudi_stock" || assetType === "reit" ? "SAR" : "USD");
    const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes: Array<number | null> = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote?.[0]?.close || [];
    const points: HistoryPoint[] = [];
    for (let index = 0; index < Math.min(timestamps.length, closes.length); index += 1) {
      const nativePrice = Number(closes[index]);
      const timestamp = Number(timestamps[index]);
      if (!Number.isFinite(nativePrice) || nativePrice <= 0 || !Number.isFinite(timestamp)) continue;
      points.push({
        timestamp,
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        nativePrice,
        price: toSar(nativePrice, currency),
      });
    }

    return NextResponse.json({
      symbol,
      ticker,
      assetType,
      range: rangeKey,
      currency,
      displayCurrency: currency === "USD" || currency === "SAR" ? "SAR" : currency,
      fxRateToSar: currency === "USD" ? 3.75 : 1,
      source: "Yahoo Finance historical fallback",
      isDelayed: true,
      points,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Historical market data unavailable" }, { status: 502 });
  }
}
