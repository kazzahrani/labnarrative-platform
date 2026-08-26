import fs from "node:fs";
import path from "node:path";

const chartPath = path.join(process.cwd(), "app/trader/DcaTradeChartV2Workstation.tsx");
let source = fs.readFileSync(chartPath, "utf8");

if (source.includes("TRADER_CHART_LIVE_CANDLE_V1")) {
  console.log("Live trade chart candle stream already prepared.");
  process.exit(0);
}

const required = (before, after, label) => {
  if (!source.includes(before)) throw new Error(`Live chart: missing ${label}`);
  source = source.replace(before, after);
};

required(
  '  const marketLineRef = useRef<IPriceLine | null>(null);',
  '  const marketLineRef = useRef<IPriceLine | null>(null);\n  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null); // TRADER_CHART_LIVE_CANDLE_V1',
  "candle series ref",
);

required(
  '    const useHeikin = enabled.includes("Heikin Ashi");',
  '    candleSeriesRef.current = candleSeries;\n    const useHeikin = enabled.includes("Heikin Ashi");',
  "candle series assignment",
);

required(
  '    return () => { resize.disconnect(); chart.remove(); chartRef.current = null; marketLineRef.current = null; };',
  '    return () => { resize.disconnect(); candleSeriesRef.current = null; chart.remove(); chartRef.current = null; marketLineRef.current = null; };',
  "chart cleanup",
);

const structureAnchor = '  const structureSignature = useMemo(() => JSON.stringify({';
if (!source.includes(structureAnchor)) throw new Error("Live chart: missing structure signature anchor");

const liveEffect = String.raw`  // Keep the open Binance candle moving while the chart stays open without rebuilding the chart.
  useEffect(() => {
    if (trade.status !== "Active" || !candles.length) return;
    let cancelled = false;
    let busy = false;

    const refreshLiveCandle = async () => {
      if (cancelled || busy) return;
      busy = true;
      try {
        const params = new URLSearchParams({ symbol, interval, bars: "2", endTime: String(Date.now()) });
        const response = await fetch(`/api/trader/klines?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { candles?: Candle[] };
        const latest = Array.isArray(payload.candles) ? payload.candles.at(-1) : undefined;
        if (!latest || cancelled || !Number.isFinite(latest.close) || latest.close <= 0) return;

        const series = candleSeriesRef.current;
        if (series) {
          if (enabled.includes("Heikin Ashi")) {
            const merged = candles.at(-1)?.openTime === latest.openTime
              ? [...candles.slice(0, -1), latest]
              : [...candles, latest].slice(-HISTORY_BARS[interval]);
            const point = heikin(merged).at(-1);
            if (point) series.update(point);
          } else {
            series.update({ time: t(latest), open: latest.open, high: latest.high, low: latest.low, close: latest.close });
          }
        }
        marketLineRef.current?.applyOptions({ price: latest.close });

        const currentLast = candles.at(-1);
        if (!currentLast || latest.openTime > currentLast.openTime) {
          setCandles(current => {
            const last = current.at(-1);
            if (last?.openTime === latest.openTime) return [...current.slice(0, -1), latest];
            return [...current, latest].slice(-HISTORY_BARS[interval]);
          });
        }
      } catch {
        // A transient market-data miss should not disturb the open chart; the next tick retries.
      } finally {
        busy = false;
      }
    };

    void refreshLiveCandle();
    const timer = window.setInterval(() => { void refreshLiveCandle(); }, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [symbol, interval, trade.status, enabled, candles]);

`;
source = source.replace(structureAnchor, liveEffect + structureAnchor);

fs.writeFileSync(chartPath, source);
console.log("Trade chart live candle stream prepared");
