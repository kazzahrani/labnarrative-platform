import { NextResponse } from "next/server";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type MarketKind = "Crypto" | "US Stock" | "ETF" | "Commodity";
type UniverseItem = { symbol: string; label: string; kind: MarketKind; source: "binance" | "stooq"; sourceSymbol: string };

type Opportunity = {
  symbol: string;
  label: string;
  kind: MarketKind;
  price: number;
  zoneLow: number;
  zoneHigh: number;
  distancePct: number;
  score: number;
  zoneType: "Historical bottom" | "Historical top retest" | "Multi-touch support";
  touches: number;
  reactionPct: number;
  status: "In buying zone" | "Approaching" | "Watch";
  candles: Candle[];
  sourceStatus: "live" | "fallback";
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
  BTC: { price: 118400, base: 76000, trend: 520, volatility: 0.10 },
  ETH: { price: 4320, base: 2650, trend: 22, volatility: 0.12 },
  SOL: { price: 198, base: 112, trend: 1.3, volatility: 0.16 },
  BNB: { price: 795, base: 490, trend: 4.5, volatility: 0.08 },
  AAPL: { price: 244, base: 178, trend: 0.72, volatility: 0.055 },
  MSFT: { price: 522, base: 360, trend: 1.65, volatility: 0.05 },
  NVDA: { price: 184, base: 91, trend: 0.90, volatility: 0.085 },
  AMZN: { price: 236, base: 154, trend: 0.88, volatility: 0.06 },
  META: { price: 765, base: 420, trend: 3.35, volatility: 0.07 },
  SPY: { price: 672, base: 455, trend: 2.15, volatility: 0.035 },
  QQQ: { price: 606, base: 370, trend: 2.4, volatility: 0.045 },
  IWM: { price: 238, base: 188, trend: 0.55, volatility: 0.05 },
  GOLD: { price: 332, base: 182, trend: 1.55, volatility: 0.035 },
  SILVER: { price: 38, base: 20, trend: 0.18, volatility: 0.07 },
  OIL: { price: 76, base: 58, trend: 0.18, volatility: 0.085 },
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
  if (candles.length < 30) throw new Error("Binance returned insufficient weekly history");
  return candles;
}

async function fetchStooq(symbol: string): Promise<Candle[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=w`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Stooq ${response.status}`);
  const text = await response.text();
  const normalized = text.trim();
  if (!normalized.startsWith("Date,Open,High,Low,Close")) throw new Error("Stooq returned a non-CSV response");
  const lines = normalized.split(/\r?\n/).slice(1);
  const candles = lines.map((line) => {
    const [date, open, high, low, close, volume] = line.split(",");
    return {
      time: Date.parse(`${date}T00:00:00Z`), open: num(open), high: num(high), low: num(low), close: num(close), volume: num(volume),
    };
  }).filter((c) => Number.isFinite(c.time) && c.close > 0 && c.high > 0 && c.low > 0).slice(-520);
  if (candles.length < 30) throw new Error("Stooq returned insufficient weekly history");
  return candles;
}

function fallbackCandles(symbol: string): Candle[] {
  const cfg = FALLBACK[symbol] ?? { price: 100, base: 65, trend: 0.4, volatility: 0.06 };
  const count = 180;
  const result: Candle[] = [];
  let prev = cfg.base;
  for (let i = 0; i < count; i += 1) {
    const cycle = Math.sin(i / 8) * cfg.volatility + Math.sin(i / 21) * cfg.volatility * 0.7;
    const pullback = i > 132 && i < 150 ? -cfg.volatility * 1.8 : 0;
    const close = Math.max(1, cfg.base + cfg.trend * i) * (1 + cycle + pullback);
    const open = prev;
    const high = Math.max(open, close) * (1 + cfg.volatility * 0.32);
    const low = Math.min(open, close) * (1 - cfg.volatility * 0.32);
    result.push({ time: Date.now() - (count - i) * 7 * 86400000, open, high, low, close, volume: 1000000 + i * 17000 });
    prev = close;
  }
  const scale = cfg.price / result[result.length - 1].close;
  return result.map((c) => ({ ...c, open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale }));
}

function pivots(candles: Candle[], side: "low" | "high") {
  const points: { price: number; index: number }[] = [];
  const radius = 3;
  for (let i = radius; i < candles.length - radius; i += 1) {
    const value = side === "low" ? candles[i].low : candles[i].high;
    let valid = true;
    for (let j = i - radius; j <= i + radius; j += 1) {
      if (j === i) continue;
      const comparison = side === "low" ? candles[j].low : candles[j].high;
      if ((side === "low" && comparison < value) || (side === "high" && comparison > value)) { valid = false; break; }
    }
    if (valid) points.push({ price: value, index: i });
  }
  return points;
}

function analyze(item: UniverseItem, candles: Candle[], sourceStatus: "live" | "fallback"): Opportunity | null {
  if (candles.length < 30) return null;
  const price = candles[candles.length - 1].close;
  const lows = pivots(candles, "low");
  const highs = pivots(candles, "high");
  const candidates: { center: number; type: Opportunity["zoneType"]; touches: number; reaction: number }[] = [];

  const buildCandidates = (points: { price: number; index: number }[], type: Opportunity["zoneType"]) => {
    for (const p of points.slice(-24)) {
      if (p.price <= 0 || p.price > price * 1.12) continue;
      const tolerance = 0.035;
      const nearLows = lows.filter((x) => Math.abs(x.price - p.price) / p.price <= tolerance);
      const nearHighs = highs.filter((x) => Math.abs(x.price - p.price) / p.price <= tolerance);
      const touches = Math.max(1, type === "Historical top retest" ? nearHighs.length : nearLows.length);
      const after = candles.slice(p.index + 1, Math.min(candles.length, p.index + 14));
      const maxAfter = after.length ? Math.max(...after.map((c) => c.high)) : p.price;
      const reaction = Math.max(0, ((maxAfter - p.price) / p.price) * 100);
      candidates.push({ center: p.price, type: touches >= 3 && type !== "Historical top retest" ? "Multi-touch support" : type, touches, reaction });
    }
  };

  buildCandidates(lows, "Historical bottom");
  buildCandidates(highs.filter((x) => x.price < price), "Historical top retest");
  if (!candidates.length) {
    const recentLow = candles.slice(0, -3).reduce((best, candle, index) => candle.low < best.price ? { price: candle.low, index } : best, { price: candles[0].low, index: 0 });
    candidates.push({ center: recentLow.price, type: "Historical bottom", touches: 1, reaction: Math.max(0, ((price - recentLow.price) / recentLow.price) * 100) });
  }

  const ranked = candidates.map((c) => {
    const distance = ((price - c.center) / c.center) * 100;
    const proximity = Math.max(0, 32 - Math.abs(distance) * 1.35);
    const touchScore = Math.min(22, c.touches * 5.5);
    const reactionScore = Math.min(22, c.reaction / 3.2);
    const typeScore = c.type === "Historical top retest" ? 16 : c.type === "Multi-touch support" ? 18 : 12;
    return { ...c, distance, rawScore: proximity + touchScore + reactionScore + typeScore };
  }).filter((c) => c.distance > -5 && c.distance < 35).sort((a, b) => b.rawScore - a.rawScore);

  const best = ranked[0] ?? candidates.map((c) => ({ ...c, distance: ((price - c.center) / c.center) * 100, rawScore: 50 })).sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))[0];
  const zoneLow = best.center * 0.975;
  const zoneHigh = best.center * 1.025;
  const distancePct = price < zoneLow ? ((zoneLow - price) / price) * 100 : price > zoneHigh ? ((price - zoneHigh) / zoneHigh) * 100 : 0;
  const score = Math.max(35, Math.min(98, Math.round(best.rawScore)));
  const status: Opportunity["status"] = price >= zoneLow && price <= zoneHigh ? "In buying zone" : distancePct <= 5 ? "Approaching" : "Watch";

  return {
    symbol: item.symbol,
    label: item.label,
    kind: item.kind,
    price,
    zoneLow,
    zoneHigh,
    distancePct,
    score,
    zoneType: best.type,
    touches: best.touches,
    reactionPct: best.reaction,
    status,
    candles: candles.slice(-104),
    sourceStatus,
  };
}

export async function GET() {
  const results = await Promise.all(UNIVERSE.map(async (item) => {
    try {
      const candles = item.source === "binance" ? await fetchBinance(item.sourceSymbol) : await fetchStooq(item.sourceSymbol);
      const analyzed = analyze(item, candles, "live");
      if (!analyzed) throw new Error("Live feed could not produce a valid weekly zone");
      return analyzed;
    } catch {
      return analyze(item, fallbackCandles(item.symbol), "fallback");
    }
  }));

  const opportunities = results.filter(Boolean).sort((a, b) => {
    const aa = a as Opportunity; const bb = b as Opportunity;
    const statusWeight = (s: Opportunity["status"]) => s === "In buying zone" ? 30 : s === "Approaching" ? 15 : 0;
    return (bb.score + statusWeight(bb.status)) - (aa.score + statusWeight(aa.status));
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    universe: UNIVERSE.length,
    fxIncluded: false,
    opportunities,
  }, { headers: { "Cache-Control": "no-store" } });
}
