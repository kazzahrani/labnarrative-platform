import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const TICKERS = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  SPX: "^GSPC",
} as const;

const ALLOWED_INTERVALS = new Set(["60m", "1d"]);
type BenchmarkKey = keyof typeof TICKERS;
type Point = { at: string; price: number; returnPct: number };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}
function safeTime(value: unknown, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchBenchmark(key: BenchmarkKey, startMs: number, endMs: number, interval: string): Promise<Point[]> {
  const ticker = TICKERS[key];
  const bufferMs = interval === "60m" ? 3 * 86_400_000 : 8 * 86_400_000;
  const period1 = Math.max(0, Math.floor((startMs - bufferMs) / 1000));
  const period2 = Math.floor((endMs + (interval === "60m" ? 2 * 3_600_000 : 2 * 86_400_000)) / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${encodeURIComponent(interval)}&period1=${period1}&period2=${period2}&events=div%2Csplits&includeAdjustedClose=true`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LabNarrativeTrading/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${key}_benchmark_http_${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const adjusted: Array<number | null> = Array.isArray(result?.indicators?.adjclose?.[0]?.adjclose) ? result.indicators.adjclose[0].adjclose : [];
  const closes: Array<number | null> = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
  const raw = timestamps.map((seconds, index) => {
    const price = Number(adjusted[index] ?? closes[index]);
    return { atMs: Number(seconds) * 1000, price };
  }).filter((point) => Number.isFinite(point.atMs) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.atMs - b.atMs);
  if (!raw.length) return [];
  const prior = [...raw].reverse().find((point) => point.atMs <= startMs) ?? raw[0];
  const base = prior.price;
  return raw
    .filter((point) => point.atMs >= startMs - bufferMs && point.atMs <= endMs + bufferMs)
    .map((point) => ({
      at: new Date(point.atMs).toISOString(),
      price: point.price,
      returnPct: (point.price / base - 1) * 100,
    }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  try {
    const body = await req.json().catch(() => ({}));
    const now = Date.now();
    const endMs = Math.min(now + 3_600_000, safeTime(body?.endAt, now));
    const defaultStart = endMs - 90 * 86_400_000;
    const earliest = Date.UTC(2010, 0, 1);
    const startMs = Math.max(earliest, Math.min(endMs - 3_600_000, safeTime(body?.startAt, defaultStart)));
    const requestedInterval = typeof body?.interval === "string" && ALLOWED_INTERVALS.has(body.interval) ? body.interval : "1d";
    const requested = Array.isArray(body?.symbols)
      ? body.symbols.filter((value: unknown): value is BenchmarkKey => typeof value === "string" && value in TICKERS)
      : (Object.keys(TICKERS) as BenchmarkKey[]);
    const symbols = requested.length ? Array.from(new Set(requested)) : (Object.keys(TICKERS) as BenchmarkKey[]);
    const settled = await Promise.allSettled(symbols.map(async (key) => [key, await fetchBenchmark(key, startMs, endMs, requestedInterval)] as const));
    const series: Partial<Record<BenchmarkKey, Point[]>> = {};
    const errors: Partial<Record<BenchmarkKey, string>> = {};
    settled.forEach((result, index) => {
      const key = symbols[index];
      if (result.status === "fulfilled") series[result.value[0]] = result.value[1];
      else errors[key] = result.reason instanceof Error ? result.reason.message : "benchmark_failed";
    });
    return json(200, {
      ok: true,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      interval: requestedInterval,
      source: `Yahoo Finance ${requestedInterval} history`,
      series,
      errors,
    });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "benchmark_failed" });
  }
});
