import { NextRequest, NextResponse } from "next/server";

const BINANCE_DATA = "https://data-api.binance.vision";

function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit = [5, 10, 20, 50, 100].includes(rawLimit) ? rawLimit : 20;

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol." }, { status: 400 });

  try {
    const response = await fetch(`${BINANCE_DATA}/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`Binance ${response.status}`);
    const data = await response.json() as { lastUpdateId?: number; bids?: unknown[][]; asks?: unknown[][] };
    return NextResponse.json({
      source: "Binance Spot",
      symbol,
      lastUpdateId: data.lastUpdateId ?? null,
      bids: (data.bids ?? []).map((row) => ({ price: numeric(row[0]), quantity: numeric(row[1]) })),
      asks: (data.asks ?? []).map((row) => ({ price: numeric(row[0]), quantity: numeric(row[1]) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Order book unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
