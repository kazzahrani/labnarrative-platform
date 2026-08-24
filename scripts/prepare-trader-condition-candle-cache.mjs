import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (!source.includes("DCA_CONDITION_CANDLE_CACHE_V1")) {
  const evaluatorAnchor = '  const evaluateDcaCondition = async (bot: DcaBot, pair: string, condition: NonNullable<DcaBot["conditions"]>[number]) => {';
  if (!source.includes(evaluatorAnchor)) throw new Error("DCA candle cache: condition evaluator anchor missing.");

  const helper = String.raw`  // DCA_CONDITION_CANDLE_CACHE_V1
  // Entry indicators consume CLOSED candles. Cache each symbol/timeframe until the
  // next candle can close, and deduplicate concurrent requests across conditions.
  const dcaConditionCandleCacheRef = useRef(new Map<string, {
    expiresAt: number;
    candles: Array<{ open: number; high: number; low: number; close: number; volume: number; closeTime: number }>;
    livePrice: number;
  }>());
  const dcaConditionCandleFlightRef = useRef(new Map<string, Promise<{
    candles: Array<{ open: number; high: number; low: number; close: number; volume: number; closeTime: number }>;
    livePrice: number;
  }>>());
  const dcaConditionIntervalMs = (interval: string) => ({
    "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "6h": 21_600_000,
    "8h": 28_800_000, "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000,
    "1w": 604_800_000,
  } as Record<string, number>)[interval] ?? 0;
  const dcaConditionExpiry = (interval: string, lastClosedAt: number) => {
    const now = Date.now();
    if (interval === "1M" && lastClosedAt > 0) {
      const next = new Date(lastClosedAt + 1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return Math.max(now + 5_000, next.getTime() + 1_000);
    }
    const duration = dcaConditionIntervalMs(interval);
    if (duration > 0 && lastClosedAt > 0) {
      const nextClose = lastClosedAt + duration;
      if (nextClose > now) return nextClose + 1_000;
    }
    return now + Math.max(5_000, Math.min(30_000, duration ? Math.floor(duration / 10) : 15_000));
  };
  const loadDcaConditionCandles = async (symbol: string, interval: string) => {
    const key = symbol.toUpperCase() + "|" + interval;
    const now = Date.now();
    const cached = dcaConditionCandleCacheRef.current.get(key);
    if (cached && cached.expiresAt > now) return { candles: cached.candles, livePrice: cached.livePrice };
    const existing = dcaConditionCandleFlightRef.current.get(key);
    if (existing) return existing;
    const request = (async () => {
      try {
        const response = await fetch("/api/trader/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + encodeURIComponent(interval) + "&limit=260", { cache: "no-store" });
        if (!response.ok) return { candles: [], livePrice: 0 };
        const data = await response.json() as { candles?: Array<{ open: number; high: number; low: number; close: number; volume: number; closeTime: number }> };
        const allCandles = data.candles ?? [];
        const candles = allCandles.filter((candle) => candle.closeTime < Date.now() && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
        const livePrice = allCandles.at(-1)?.close ?? candles.at(-1)?.close ?? 0;
        dcaConditionCandleCacheRef.current.set(key, {
          expiresAt: dcaConditionExpiry(interval, candles.at(-1)?.closeTime ?? 0),
          candles,
          livePrice,
        });
        return { candles, livePrice };
      } catch {
        return { candles: [], livePrice: 0 };
      } finally {
        dcaConditionCandleFlightRef.current.delete(key);
      }
    })();
    dcaConditionCandleFlightRef.current.set(key, request);
    return request;
  };

`;
  source = source.replace(evaluatorAnchor, helper + evaluatorAnchor);

  const oldFetch = [
    '    const response = await fetch("/api/trader/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + encodeURIComponent(interval) + "&limit=260", { cache: "no-store" });',
    '    if (!response.ok) return { ok: false, price: 0, value: null as number | null };',
    '    const data = await response.json() as { candles?: Array<{ open: number; high: number; low: number; close: number; volume: number; closeTime: number }> };',
    '    const candles = (data.candles ?? []).filter((candle) => candle.closeTime < Date.now() && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));',
    '    const livePrice = data.candles?.at(-1)?.close ?? candles.at(-1)?.close ?? 0;',
  ].join("\n");
  if (!source.includes(oldFetch)) throw new Error("DCA candle cache: raw condition fetch block missing.");
  source = source.replace(oldFetch, [
    '    const { candles, livePrice } = await loadDcaConditionCandles(symbol, interval);',
  ].join("\n"));
}

for (const token of ["DCA_CONDITION_CANDLE_CACHE_V1", "loadDcaConditionCandles", "dcaConditionCandleFlightRef", "const { candles, livePrice } = await loadDcaConditionCandles(symbol, interval);"]) {
  if (!source.includes(token)) throw new Error(`DCA candle cache guard missing: ${token}`);
}

fs.writeFileSync(traderPath, source);
console.log("Prepared closed-candle-aware DCA condition cache and request deduplication.");
