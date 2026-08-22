import { NextResponse } from "next/server";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type MarketKind = "Crypto" | "US Stock" | "ETF" | "Commodity";
type UniverseItem = { symbol: string; label: string; kind: MarketKind; source: "binance" | "stooq"; sourceSymbol: string };
type ZoneType = "Historical bottom" | "Historical top retest" | "Multi-touch support";
type Zone = {
  low: number;
  high: number;
  center: number;
  distancePct: number;
  score: number;
  type: ZoneType;
  touches: number;
  reactionPct: number;
};
type Breakout = {
  type: "Downtrend line" | "Horizontal resistance" | "None";
  status: "Confirmed" | "First close" | "Watching";
  score: number;
  level: number | null;
  firstClose: number | null;
  confirmationClose: number | null;
  resistanceTouches: number;
  lineStartTime: number | null;
  lineStartPrice: number | null;
  lineEndTime: number | null;
  lineEndPrice: number | null;
};
type Opportunity = {
  symbol: string;
  label: string;
  kind: MarketKind;
  price: number;
  sourceStatus: "live" | "fallback";
  weeklyCandles: Candle[];
  monthlyCandles: Candle[];
  weekly: Zone;
  monthly: Zone;
  accumulationScore: number;
  accumulationStatus: "In buying zone" | "Approaching" | "Watch";
  preferredZoneLow: number;
  preferredZoneHigh: number;
  confluence: "Overlap" | "Near" | "Separate";
  breakout: Breakout;
};

const UNIVERSE: UniverseItem[] = [
  { symbol: "BTC", label: "Bitcoin", kind: "Crypto", source: "binance", sourceSymbol: "BTCUSDT" },
  { symbol: "ETH", label: "Ethereum", kind: "Crypto", source: "binance", sourceSymbol: "ETHUSDT" },
  { symbol: "SOL", label: "Solana", kind: "Crypto", source: "binance", sourceSymbol: "SOLUSDT" },
  { symbol: "BNB", label: "BNB", kind: "Crypto", source: "binance", sourceSymbol: "BNBUSDT" },
  { symbol: "AAPL", label: "Apple", kind: "US Stock", source: "stooq", sourceSymbol: "aapl.us" },
  { symbol: "MSFT", label: "Microsoft", kind: "US Stock", source: "stooq", sourceSymbol: "msft.us" },
  { symbol: "NVDA", label: "NVIDIA", kind: "US Stock", source: "stooq", sourceSymbol: "nvda.us" },
  { symbol: "AMZN", label: "Amazon", kind: "US Stock", source: "stooq", sourceSymbol: "amzn.us" },
  { symbol: "META", label: "Meta", kind: "US Stock", source: "stooq", sourceSymbol: "meta.us" },
  { symbol: "SPY", label: "S&P 500 ETF", kind: "ETF", source: "stooq", sourceSymbol: "spy.us" },
  { symbol: "QQQ", label: "Nasdaq 100 ETF", kind: "ETF", source: "stooq", sourceSymbol: "qqq.us" },
  { symbol: "IWM", label: "Russell 2000 ETF", kind: "ETF", source: "stooq", sourceSymbol: "iwm.us" },
  { symbol: "GOLD", label: "Gold (GLD proxy)", kind: "Commodity", source: "stooq", sourceSymbol: "gld.us" },
  { symbol: "SILVER", label: "Silver (SLV proxy)", kind: "Commodity", source: "stooq", sourceSymbol: "slv.us" },
  { symbol: "OIL", label: "Crude Oil (USO proxy)", kind: "Commodity", source: "stooq", sourceSymbol: "uso.us" },
];

const FALLBACK: Record<string, { price: number; base: number; trend: number; volatility: number }> = {
  BTC: { price: 77000, base: 43000, trend: 180, volatility: 0.10 },
  ETH: { price: 2420, base: 1800, trend: 7, volatility: 0.12 },
  SOL: { price: 94, base: 48, trend: 0.24, volatility: 0.16 },
  BNB: { price: 693, base: 350, trend: 2.0, volatility: 0.08 },
  AAPL: { price: 225, base: 145, trend: 0.52, volatility: 0.055 },
  MSFT: { price: 510, base: 280, trend: 1.35, volatility: 0.05 },
  NVDA: { price: 180, base: 55, trend: 0.75, volatility: 0.085 },
  AMZN: { price: 225, base: 115, trend: 0.66, volatility: 0.06 },
  META: { price: 760, base: 270, trend: 2.8, volatility: 0.07 },
  SPY: { price: 670, base: 390, trend: 1.7, volatility: 0.035 },
  QQQ: { price: 605, base: 315, trend: 1.8, volatility: 0.045 },
  IWM: { price: 235, base: 160, trend: 0.4, volatility: 0.05 },
  GOLD: { price: 330, base: 160, trend: 0.9, volatility: 0.035 },
  SILVER: { price: 38, base: 18, trend: 0.1, volatility: 0.07 },
  OIL: { price: 76, base: 55, trend: 0.12, volatility: 0.085 },
};

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchBinance(symbol: string): Promise<Candle[]> {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1w&limit=260`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Binance ${response.status}`);
  const rows = (await response.json()) as unknown[][];
  const candles = rows.map((row) => ({
    time: num(row[0]), open: num(row[1]), high: num(row[2]), low: num(row[3]), close: num(row[4]), volume: num(row[5]),
  })).filter((c) => c.close > 0 && c.high > 0 && c.low > 0);
  if (candles.length < 40) throw new Error("Insufficient Binance history");
  return candles;
}

async function fetchStooq(symbol: string): Promise<Candle[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=w`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Stooq ${response.status}`);
  const text = (await response.text()).trim();
  if (!text.startsWith("Date,Open,High,Low,Close")) throw new Error("Invalid Stooq response");
  const candles = text.split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(",");
    return { time: Date.parse(`${date}T00:00:00Z`), open: num(open), high: num(high), low: num(low), close: num(close), volume: num(volume) };
  }).filter((c) => Number.isFinite(c.time) && c.close > 0 && c.high > 0 && c.low > 0).slice(-520);
  if (candles.length < 40) throw new Error("Insufficient Stooq history");
  return candles;
}

function fallbackCandles(symbol: string): Candle[] {
  const cfg = FALLBACK[symbol] ?? { price: 100, base: 65, trend: 0.4, volatility: 0.06 };
  const count = 220;
  const result: Candle[] = [];
  let prev = cfg.base;
  for (let i = 0; i < count; i += 1) {
    const cycle = Math.sin(i / 8) * cfg.volatility + Math.sin(i / 21) * cfg.volatility * 0.65;
    const correction = i > 166 && i < 184 ? -cfg.volatility * 1.7 : 0;
    const recovery = i >= 194 ? (i - 194) * cfg.volatility * 0.007 : 0;
    const close = Math.max(1, cfg.base + cfg.trend * i) * (1 + cycle + correction + recovery);
    const open = prev;
    const high = Math.max(open, close) * (1 + cfg.volatility * 0.30);
    const low = Math.min(open, close) * (1 - cfg.volatility * 0.30);
    result.push({ time: Date.now() - (count - i) * 7 * 86400000, open, high, low, close, volume: 1000000 + i * 17000 });
    prev = close;
  }
  const scale = cfg.price / result[result.length - 1].close;
  return result.map((c) => ({ ...c, open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale }));
}

function aggregateMonthly(weekly: Candle[]): Candle[] {
  const buckets = new Map<string, Candle>();
  for (const candle of weekly) {
    const d = new Date(candle.time);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { ...candle, time: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) });
    } else {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

function pivots(candles: Candle[], side: "low" | "high", radius: number) {
  const points: { price: number; index: number; time: number }[] = [];
  for (let i = radius; i < candles.length - radius; i += 1) {
    const value = side === "low" ? candles[i].low : candles[i].high;
    let valid = true;
    for (let j = i - radius; j <= i + radius; j += 1) {
      if (j === i) continue;
      const comparison = side === "low" ? candles[j].low : candles[j].high;
      if ((side === "low" && comparison < value) || (side === "high" && comparison > value)) { valid = false; break; }
    }
    if (valid) points.push({ price: value, index: i, time: candles[i].time });
  }
  return points;
}

function zoneDistance(price: number, low: number, high: number) {
  if (price >= low && price <= high) return 0;
  if (price < low) return ((low - price) / price) * 100;
  return ((price - high) / high) * 100;
}

function analyzeZone(candles: Candle[], price: number, timeframe: "weekly" | "monthly"): Zone {
  const radius = timeframe === "monthly" ? 2 : 3;
  const tolerance = timeframe === "monthly" ? 0.055 : 0.035;
  const width = timeframe === "monthly" ? 0.04 : 0.025;
  const lows = pivots(candles, "low", radius);
  const highs = pivots(candles, "high", radius);
  const candidates: { center: number; type: ZoneType; touches: number; reaction: number }[] = [];

  const addCandidates = (points: typeof lows, type: ZoneType) => {
    for (const p of points.slice(timeframe === "monthly" ? -18 : -28)) {
      if (p.price <= 0 || p.price > price * 1.18) continue;
      const peers = (type === "Historical top retest" ? highs : lows).filter((x) => Math.abs(x.price - p.price) / p.price <= tolerance);
      const touches = Math.max(1, peers.length);
      const horizon = timeframe === "monthly" ? 8 : 14;
      const after = candles.slice(p.index + 1, Math.min(candles.length, p.index + horizon));
      const maxAfter = after.length ? Math.max(...after.map((c) => c.high)) : p.price;
      const reaction = Math.max(0, ((maxAfter - p.price) / p.price) * 100);
      candidates.push({ center: p.price, type: touches >= 3 && type !== "Historical top retest" ? "Multi-touch support" : type, touches, reaction });
    }
  };

  addCandidates(lows, "Historical bottom");
  addCandidates(highs.filter((x) => x.price < price), "Historical top retest");

  if (!candidates.length) {
    const history = candles.slice(0, -2);
    const recent = history.reduce((best, c) => c.low < best ? c.low : best, history[0]?.low ?? price);
    candidates.push({ center: recent, type: "Historical bottom", touches: 1, reaction: Math.max(0, ((price - recent) / recent) * 100) });
  }

  const ranked = candidates.map((c) => {
    const distance = ((price - c.center) / c.center) * 100;
    const proximity = Math.max(0, 34 - Math.abs(distance) * (timeframe === "monthly" ? 0.85 : 1.25));
    const touchScore = Math.min(24, c.touches * 5.5);
    const reactionScore = Math.min(22, c.reaction / (timeframe === "monthly" ? 5 : 3.2));
    const typeScore = c.type === "Multi-touch support" ? 18 : c.type === "Historical top retest" ? 15 : 12;
    return { ...c, distance, rawScore: proximity + touchScore + reactionScore + typeScore };
  }).filter((c) => c.distance > -8 && c.distance < (timeframe === "monthly" ? 55 : 38)).sort((a, b) => b.rawScore - a.rawScore);

  const best = ranked[0] ?? candidates.map((c) => ({ ...c, distance: ((price - c.center) / c.center) * 100, rawScore: 45 })).sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))[0];
  const low = best.center * (1 - width);
  const high = best.center * (1 + width);
  return {
    low,
    high,
    center: best.center,
    distancePct: zoneDistance(price, low, high),
    score: Math.max(30, Math.min(98, Math.round(best.rawScore))),
    type: best.type,
    touches: best.touches,
    reactionPct: best.reaction,
  };
}

function detectHorizontalBreakout(candles: Candle[]): Breakout | null {
  if (candles.length < 30) return null;
  const n = candles.length;
  const history = candles.slice(0, n - 2);
  const highs = pivots(history, "high", 3).slice(-24);
  const candidates = highs.map((p) => {
    const peers = highs.filter((x) => Math.abs(x.price - p.price) / p.price <= 0.025);
    const level = peers.reduce((sum, x) => sum + x.price, 0) / peers.length;
    return { level, touches: peers.length, lastIndex: Math.max(...peers.map((x) => x.index)) };
  }).filter((x) => x.touches >= 2 && x.level > 0).sort((a, b) => b.touches - a.touches || b.lastIndex - a.lastIndex);
  const resistance = candidates[0];
  if (!resistance) return null;

  const prev2 = candles[n - 3];
  const first = candles[n - 2];
  const confirm = candles[n - 1];
  const buffer = 1.002;
  const wasBelow = prev2.close <= resistance.level * 1.01;
  const firstAbove = first.close > resistance.level * buffer;
  const secondAbove = confirm.close > resistance.level * buffer;
  const lastAbove = confirm.close > resistance.level * buffer;
  const status: Breakout["status"] = wasBelow && firstAbove && secondAbove ? "Confirmed" : lastAbove && first.close <= resistance.level * buffer ? "First close" : "Watching";
  const distance = ((confirm.close - resistance.level) / resistance.level) * 100;
  const score = Math.max(35, Math.min(98, Math.round(48 + resistance.touches * 8 + (status === "Confirmed" ? 22 : status === "First close" ? 10 : 0) - Math.max(0, distance - 12))));

  return {
    type: "Horizontal resistance",
    status,
    score,
    level: resistance.level,
    firstClose: firstAbove ? first.close : null,
    confirmationClose: status === "Confirmed" ? confirm.close : null,
    resistanceTouches: resistance.touches,
    lineStartTime: null,
    lineStartPrice: null,
    lineEndTime: null,
    lineEndPrice: null,
  };
}

function detectTrendlineBreakout(candles: Candle[]): Breakout | null {
  if (candles.length < 36) return null;
  const n = candles.length;
  const history = candles.slice(0, n - 2);
  const highs = pivots(history, "high", 3).slice(-14);
  let best: { a: typeof highs[number]; b: typeof highs[number]; slope: number } | null = null;

  for (let i = 0; i < highs.length - 1; i += 1) {
    for (let j = i + 1; j < highs.length; j += 1) {
      const a = highs[i]; const b = highs[j];
      if (b.index - a.index < 4 || b.price >= a.price * 0.995) continue;
      const slope = (b.price - a.price) / (b.index - a.index);
      if (slope >= 0) continue;
      if (!best || b.index > best.b.index || (b.index === best.b.index && a.index > best.a.index)) best = { a, b, slope };
    }
  }
  if (!best) return null;

  const lineAt = (index: number) => best!.a.price + best!.slope * (index - best!.a.index);
  const prev2 = candles[n - 3];
  const first = candles[n - 2];
  const confirm = candles[n - 1];
  const linePrev = lineAt(n - 3);
  const lineFirst = lineAt(n - 2);
  const lineConfirm = lineAt(n - 1);
  if (lineConfirm <= 0) return null;
  const buffer = 1.002;
  const wasBelow = prev2.close <= linePrev * 1.012;
  const firstAbove = first.close > lineFirst * buffer;
  const secondAbove = confirm.close > lineConfirm * buffer;
  const lastAbove = confirm.close > lineConfirm * buffer;
  const status: Breakout["status"] = wasBelow && firstAbove && secondAbove ? "Confirmed" : lastAbove && first.close <= lineFirst * buffer ? "First close" : "Watching";
  const slopePct = Math.abs(best.slope / best.a.price) * 100;
  const score = Math.max(35, Math.min(98, Math.round(55 + Math.min(14, slopePct * 40) + (status === "Confirmed" ? 24 : status === "First close" ? 10 : 0))));

  return {
    type: "Downtrend line",
    status,
    score,
    level: lineConfirm,
    firstClose: firstAbove ? first.close : null,
    confirmationClose: status === "Confirmed" ? confirm.close : null,
    resistanceTouches: 2,
    lineStartTime: best.a.time,
    lineStartPrice: best.a.price,
    lineEndTime: confirm.time,
    lineEndPrice: lineConfirm,
  };
}

function detectBreakout(candles: Candle[]): Breakout {
  const horizontal = detectHorizontalBreakout(candles);
  const trendline = detectTrendlineBreakout(candles);
  const rank = (b: Breakout | null) => !b ? -1 : (b.status === "Confirmed" ? 200 : b.status === "First close" ? 100 : 0) + b.score;
  const best = rank(trendline) > rank(horizontal) ? trendline : horizontal;
  return best ?? {
    type: "None", status: "Watching", score: 30, level: null, firstClose: null, confirmationClose: null, resistanceTouches: 0,
    lineStartTime: null, lineStartPrice: null, lineEndTime: null, lineEndPrice: null,
  };
}

function analyze(item: UniverseItem, weeklyCandles: Candle[], sourceStatus: "live" | "fallback"): Opportunity {
  const price = weeklyCandles[weeklyCandles.length - 1].close;
  const monthlyCandles = aggregateMonthly(weeklyCandles);
  const weekly = analyzeZone(weeklyCandles, price, "weekly");
  const monthly = analyzeZone(monthlyCandles, price, "monthly");
  const overlapLow = Math.max(weekly.low, monthly.low);
  const overlapHigh = Math.min(weekly.high, monthly.high);
  const centersPct = Math.abs(weekly.center - monthly.center) / ((weekly.center + monthly.center) / 2) * 100;
  const overlaps = overlapLow <= overlapHigh;
  const confluence: Opportunity["confluence"] = overlaps ? "Overlap" : centersPct <= 10 ? "Near" : "Separate";
  const confluenceBonus = overlaps ? 10 : centersPct <= 10 ? 6 : centersPct <= 18 ? 3 : 0;
  const accumulationScore = Math.max(30, Math.min(99, Math.round(weekly.score * 0.55 + monthly.score * 0.45 + confluenceBonus)));
  const nearestDistance = Math.min(weekly.distancePct, monthly.distancePct);
  const inEither = weekly.distancePct === 0 || monthly.distancePct === 0;
  const accumulationStatus: Opportunity["accumulationStatus"] = inEither ? "In buying zone" : nearestDistance <= 5 ? "Approaching" : "Watch";
  let preferredZoneLow: number;
  let preferredZoneHigh: number;
  if (overlaps) {
    preferredZoneLow = overlapLow;
    preferredZoneHigh = overlapHigh;
  } else if (weekly.score >= monthly.score) {
    preferredZoneLow = weekly.low;
    preferredZoneHigh = weekly.high;
  } else {
    preferredZoneLow = monthly.low;
    preferredZoneHigh = monthly.high;
  }

  return {
    symbol: item.symbol,
    label: item.label,
    kind: item.kind,
    price,
    sourceStatus,
    weeklyCandles: weeklyCandles.slice(-104),
    monthlyCandles: monthlyCandles.slice(-60),
    weekly,
    monthly,
    accumulationScore,
    accumulationStatus,
    preferredZoneLow,
    preferredZoneHigh,
    confluence,
    breakout: detectBreakout(weeklyCandles),
  };
}

export async function GET() {
  const results = await Promise.all(UNIVERSE.map(async (item) => {
    try {
      const weekly = item.source === "binance" ? await fetchBinance(item.sourceSymbol) : await fetchStooq(item.sourceSymbol);
      return analyze(item, weekly, "live");
    } catch {
      return analyze(item, fallbackCandles(item.symbol), "fallback");
    }
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    universe: UNIVERSE.length,
    fxIncluded: false,
    opportunities: results,
  }, { headers: { "Cache-Control": "no-store" } });
}
