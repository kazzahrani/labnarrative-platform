import { NextRequest, NextResponse } from "next/server";

type AssetInput = {
  id: string;
  name: string;
  symbol: string | null;
  assetType: string | null;
  currentValue: number;
};

type PricePoint = { date: string; price: number };
type SeriesPoint = { date: string; value: number };

const RANGE_MAP: Record<string, { yahoo: string; interval: string }> = {
  "1m": { yahoo: "1mo", interval: "1d" },
  "3m": { yahoo: "3mo", interval: "1d" },
  "1y": { yahoo: "1y", interval: "1d" },
  "5y": { yahoo: "5y", interval: "1wk" },
};

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function cleanSymbol(value: string | null | undefined) {
  return normalizeDigits(value || "").trim().toUpperCase().replace(/[^0-9A-Z.\-]/g, "");
}

function yahooTicker(symbol: string, assetType: string | null) {
  if (!symbol) return "";
  if (assetType === "saudi_stock" || assetType === "reit") return symbol.endsWith(".SR") ? symbol : `${symbol}.SR`;
  if (assetType === "crypto") return symbol.includes("-") ? symbol : `${symbol}-USD`;
  return symbol;
}

function priceable(assetType: string | null) {
  return ["saudi_stock", "reit", "global_stock", "crypto"].includes(assetType || "");
}

function toSar(price: number, currency: string) {
  return currency === "USD" ? price * 3.75 : price;
}

async function fetchYahoo(ticker: string, range: string, interval: string): Promise<PricePoint[]> {
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false&events=div%2Csplits&includeAdjustedClose=true`;
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
    const currency = typeof result?.meta?.currency === "string" ? result.meta.currency.toUpperCase() : "SAR";
    const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes: Array<number | null> = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote?.[0]?.close || [];
    const points: PricePoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, closes.length); i += 1) {
      const native = Number(closes[i]);
      const ts = Number(timestamps[i]);
      if (!Number.isFinite(native) || native <= 0 || !Number.isFinite(ts)) continue;
      points.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: toSar(native, currency) });
    }
    return points;
  } catch {
    return [];
  }
}

function normalizeSeries(points: SeriesPoint[]) {
  if (!points.length || points[0].value <= 0) return [];
  const base = points[0].value;
  return points.map((point) => ({ date: point.date, value: (point.value / base) * 100 }));
}

function maxDrawdown(points: SeriesPoint[]) {
  let peak = 0;
  let worst = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    if (peak > 0) worst = Math.min(worst, (point.value - peak) / peak);
  }
  return worst * 100;
}

function annualizedVolatility(points: SeriesPoint[]) {
  if (points.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i - 1].value > 0) returns.push(points[i].value / points[i - 1].value - 1);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(Math.max(variance, 0)) * Math.sqrt(365) * 100;
}

function nearestValue(points: PricePoint[], date: string, cursor: { index: number; value: number | null }) {
  while (cursor.index < points.length && points[cursor.index].date <= date) {
    cursor.value = points[cursor.index].price;
    cursor.index += 1;
  }
  return cursor.value;
}

export async function POST(request: NextRequest) {
  let body: { assets?: AssetInput[]; range?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rangeKey = body.range && RANGE_MAP[body.range] ? body.range : "1y";
  const cfg = RANGE_MAP[rangeKey];
  const assets = Array.isArray(body.assets) ? body.assets.slice(0, 40).filter((asset) => asset && typeof asset.id === "string") : [];
  if (!assets.length) return NextResponse.json({ error: "No assets" }, { status: 400 });

  const pricedAssets = assets.filter((asset) => priceable(asset.assetType) && cleanSymbol(asset.symbol));
  const histories = await Promise.all(pricedAssets.map(async (asset) => {
    const ticker = yahooTicker(cleanSymbol(asset.symbol), asset.assetType);
    return { asset, ticker, points: await fetchYahoo(ticker, cfg.yahoo, cfg.interval) };
  }));

  const validHistories = histories.filter((item) => item.points.length >= 2);
  const firstDates = validHistories.map((item) => item.points[0].date).sort();
  const commonStart = firstDates.length ? firstDates[firstDates.length - 1] : null;
  const dateSet = new Set<string>();
  validHistories.forEach((item) => item.points.forEach((point) => { if (!commonStart || point.date >= commonStart) dateSet.add(point.date); }));
  const dates = [...dateSet].sort();

  const fixedValue = assets
    .filter((asset) => !validHistories.some((history) => history.asset.id === asset.id))
    .reduce((sum, asset) => sum + Math.max(Number(asset.currentValue) || 0, 0), 0);

  const cursors = new Map<string, { index: number; value: number | null }>();
  const lastPrices = new Map<string, number>();
  validHistories.forEach((item) => {
    cursors.set(item.asset.id, { index: 0, value: null });
    lastPrices.set(item.asset.id, item.points[item.points.length - 1].price);
  });

  const portfolio: SeriesPoint[] = [];
  for (const date of dates) {
    let total = fixedValue;
    for (const item of validHistories) {
      const cursor = cursors.get(item.asset.id)!;
      const price = nearestValue(item.points, date, cursor);
      const last = lastPrices.get(item.asset.id) || 0;
      const currentValue = Math.max(Number(item.asset.currentValue) || 0, 0);
      if (price && last > 0) total += currentValue * (price / last);
      else total += currentValue;
    }
    portfolio.push({ date, value: total });
  }

  const assetReturns = validHistories.map((item) => {
    const start = item.points.find((point) => !commonStart || point.date >= commonStart) || item.points[0];
    const end = item.points[item.points.length - 1];
    return {
      id: item.asset.id,
      name: item.asset.name,
      symbol: cleanSymbol(item.asset.symbol),
      assetType: item.asset.assetType,
      returnPercent: start.price > 0 ? (end.price / start.price - 1) * 100 : 0,
    };
  }).sort((a, b) => b.returnPercent - a.returnPercent);

  const benchmarkDefs = [
    { key: "tasi", name: "TASI", ticker: "^TASI.SR" },
    { key: "sp500", name: "S&P 500", ticker: "^GSPC" },
    { key: "bitcoin", name: "Bitcoin", ticker: "BTC-USD" },
  ];
  const benchmarks = await Promise.all(benchmarkDefs.map(async (benchmark) => {
    const points = await fetchYahoo(benchmark.ticker, cfg.yahoo, cfg.interval);
    const filtered = commonStart ? points.filter((point) => point.date >= commonStart) : points;
    return { ...benchmark, points: normalizeSeries(filtered.map((point) => ({ date: point.date, value: point.price }))) };
  }));

  const normalizedPortfolio = normalizeSeries(portfolio);
  const startValue = portfolio[0]?.value || 0;
  const endValue = portfolio[portfolio.length - 1]?.value || 0;
  const returnPercent = startValue > 0 ? (endValue / startValue - 1) * 100 : 0;

  return NextResponse.json({
    range: rangeKey,
    methodology: "current_holdings_replay",
    commonStart,
    source: "Yahoo Finance historical fallback",
    isDelayed: true,
    fixedValue,
    pricedAssets: validHistories.length,
    portfolio: normalizedPortfolio,
    portfolioValue: portfolio,
    benchmarks,
    assetReturns,
    metrics: {
      returnPercent,
      maxDrawdownPercent: maxDrawdown(portfolio),
      annualizedVolatilityPercent: annualizedVolatility(portfolio),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
