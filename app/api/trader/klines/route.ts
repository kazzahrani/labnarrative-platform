import { NextRequest, NextResponse } from "next/server";

const BINANCE_DATA = "https://data-api.binance.vision";
const ALLOWED_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]);

function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const interval = request.nextUrl.searchParams.get("interval") ?? "1m";
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 500);
  const limit = Math.max(1, Math.min(1000, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 500));

  if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Invalid symbol or interval." }, { status: 400 });
  }

  try {
    const response = await fetch(`${BINANCE_DATA}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Binance ${response.status}`);
    const rows = await response.json() as unknown[][];
    const candles = rows.map((row) => ({
      openTime: numeric(row[0]),
      open: numeric(row[1]),
      high: numeric(row[2]),
      low: numeric(row[3]),
      close: numeric(row[4]),
      volume: numeric(row[5]),
      closeTime: numeric(row[6]),
      quoteVolume: numeric(row[7]),
      trades: numeric(row[8]),
    }));
    return NextResponse.json({ source: "Binance Spot", symbol, interval, candles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kline data unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
