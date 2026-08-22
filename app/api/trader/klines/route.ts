import { NextRequest, NextResponse } from "next/server";

const BINANCE_DATA = "https://data-api.binance.vision";
const ALLOWED_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]);
const MAX_BARS = 6000;

function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRows(rows: unknown[][]) {
  return rows.map((row) => ({
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
}

async function fetchPage(params: URLSearchParams) {
  const response = await fetch(`${BINANCE_DATA}/api/v3/klines?${params.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`Binance ${response.status}`);
  return await response.json() as unknown[][];
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const interval = request.nextUrl.searchParams.get("interval") ?? "1m";
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 500);
  const rawBars = Number(request.nextUrl.searchParams.get("bars") ?? rawLimit);
  const bars = Math.max(1, Math.min(MAX_BARS, Number.isFinite(rawBars) ? Math.round(rawBars) : 500));
  const rawStartTime = request.nextUrl.searchParams.get("startTime");
  const rawEndTime = request.nextUrl.searchParams.get("endTime");
  const startTime = rawStartTime && /^\d+$/.test(rawStartTime) ? Number(rawStartTime) : null;
  const endTime = rawEndTime && /^\d+$/.test(rawEndTime) ? Number(rawEndTime) : Date.now();

  // TRADE_CHART_RANGE: this route supports ranged requests and paginated deep-history requests.
  if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Invalid symbol or interval." }, { status: 400 });
  }

  try {
    const collected: unknown[][] = [];

    if (startTime != null) {
      // Forward pagination for explicit ranges.
      let cursor = startTime;
      for (let page = 0; page < Math.ceil(bars / 1000) + 1 && collected.length < bars; page += 1) {
        const params = new URLSearchParams({
          symbol,
          interval,
          limit: String(Math.min(1000, bars - collected.length)),
          startTime: String(cursor),
          endTime: String(endTime),
        });
        const rows = await fetchPage(params);
        if (!rows.length) break;
        collected.push(...rows);
        const lastOpen = numeric(rows[rows.length - 1]?.[0]);
        if (!lastOpen || lastOpen >= endTime || rows.length < Number(params.get("limit"))) break;
        cursor = lastOpen + 1;
      }
    } else {
      // Backward pagination from now/endTime so the chart gets thousands of candles of context.
      let cursorEnd = endTime;
      const pages: unknown[][][] = [];
      for (let page = 0; page < Math.ceil(bars / 1000) + 1 && pages.reduce((sum, rows) => sum + rows.length, 0) < bars; page += 1) {
        const already = pages.reduce((sum, rows) => sum + rows.length, 0);
        const pageLimit = Math.min(1000, bars - already);
        const params = new URLSearchParams({
          symbol,
          interval,
          limit: String(pageLimit),
          endTime: String(cursorEnd),
        });
        const rows = await fetchPage(params);
        if (!rows.length) break;
        pages.unshift(rows);
        const firstOpen = numeric(rows[0]?.[0]);
        if (!firstOpen || rows.length < pageLimit) break;
        cursorEnd = firstOpen - 1;
      }
      for (const pageRows of pages) collected.push(...pageRows);
    }

    const deduped = Array.from(new Map(collected.map((row) => [numeric(row[0]), row])).values())
      .sort((a, b) => numeric(a[0]) - numeric(b[0]))
      .slice(-bars);
    const candles = normalizeRows(deduped);

    return NextResponse.json({
      source: "Binance Spot",
      symbol,
      interval,
      requestedBars: bars,
      loadedBars: candles.length,
      historyStart: candles[0]?.openTime ?? null,
      historyEnd: candles[candles.length - 1]?.closeTime ?? null,
      candles,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kline data unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
