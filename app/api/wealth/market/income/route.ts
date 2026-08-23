import { NextRequest, NextResponse } from "next/server";

type AssetRequest = {
  holdingId: string;
  symbol: string;
  assetType: string;
  quantity: number;
  assetName?: string;
};

type IncomeEvent = {
  holdingId: string;
  symbol: string;
  assetName: string;
  eventDate: string;
  timestamp: number;
  amountPerUnitNative: number;
  amountPerUnitSar: number;
  totalSar: number;
  nativeCurrency: string;
  source: string;
};

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizeSymbol(value: unknown) {
  if (typeof value !== "string") return "";
  return normalizeDigits(value).trim().toUpperCase().replace(/[^0-9A-Z.\-]/g, "");
}

function yahooTicker(symbol: string, assetType: string) {
  if (assetType === "saudi_stock" || assetType === "reit") return symbol.endsWith(".SR") ? symbol : `${symbol}.SR`;
  if (assetType === "crypto") return symbol.includes("-") ? symbol : `${symbol}-USD`;
  return symbol;
}

function toSar(amount: number, currency: string) {
  if (currency === "USD") return amount * 3.75;
  return amount;
}

async function fetchIncome(asset: AssetRequest): Promise<IncomeEvent[]> {
  const symbol = normalizeSymbol(asset.symbol);
  if (!symbol || !Number.isFinite(asset.quantity) || asset.quantity <= 0) return [];
  const ticker = yahooTicker(symbol, asset.assetType);
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5y&includePrePost=false&events=div&includeAdjustedClose=true`;
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": "LabNarrative-Wealth-MVP/0.1" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];
    const body = await response.json();
    const result = body?.chart?.result?.[0];
    if (!result) return [];
    const currency = typeof result?.meta?.currency === "string" ? result.meta.currency.toUpperCase() : (asset.assetType === "saudi_stock" || asset.assetType === "reit" ? "SAR" : "USD");
    const raw = result?.events?.dividends;
    if (!raw || typeof raw !== "object") return [];
    return Object.values(raw).flatMap((entry: any) => {
      const amount = Number(entry?.amount);
      const timestamp = Number(entry?.date);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(timestamp)) return [];
      const amountPerUnitSar = toSar(amount, currency);
      return [{
        holdingId: asset.holdingId,
        symbol,
        assetName: asset.assetName || symbol,
        eventDate: new Date(timestamp * 1000).toISOString().slice(0, 10),
        timestamp,
        amountPerUnitNative: amount,
        amountPerUnitSar,
        totalSar: amountPerUnitSar * asset.quantity,
        nativeCurrency: currency,
        source: "Yahoo Finance dividend history fallback",
      } satisfies IncomeEvent];
    });
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  let body: { assets?: AssetRequest[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const assets = Array.isArray(body.assets) ? body.assets.slice(0, 30).map((asset) => ({
    holdingId: String(asset.holdingId || ""),
    symbol: normalizeSymbol(asset.symbol),
    assetType: String(asset.assetType || ""),
    quantity: Number(asset.quantity || 0),
    assetName: String(asset.assetName || ""),
  })).filter((asset) => asset.holdingId && asset.symbol && Number.isFinite(asset.quantity) && asset.quantity > 0) : [];

  const batches = await Promise.all(assets.map(fetchIncome));
  const events = batches.flat().sort((a, b) => b.timestamp - a.timestamp);
  return NextResponse.json({
    events,
    assetsRequested: assets.length,
    assetsWithIncome: new Set(events.map((event) => event.holdingId)).size,
    source: "Yahoo Finance historical fallback",
    isDelayed: true,
  }, { headers: { "Cache-Control": "no-store" } });
}
