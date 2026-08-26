import fs from "node:fs";
import path from "node:path";

const chartPath = path.join(process.cwd(), "app/trader/DcaTradeChartV2Workstation.tsx");
let source = fs.readFileSync(chartPath, "utf8");

if (!source.includes("TRADER_CHART_VIEWPORT_STABILITY_V1")) {
  const required = (before, after, label) => {
    if (!source.includes(before)) throw new Error(`Chart viewport stability: missing ${label}`);
    source = source.replace(before, after);
  };

  required(
    'type Interval = "3m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";',
    'type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M"; // TRADER_CHART_VIEWPORT_STABILITY_V1',
    "interval type",
  );

  required(
    `const INTERVALS: Array<{ value: Interval; label: string }> = [\n  { value: "3m", label: "3m" }, { value: "5m", label: "5m" }, { value: "15m", label: "15m" },\n  { value: "1h", label: "1H" }, { value: "4h", label: "4H" }, { value: "1d", label: "D" },\n  { value: "1w", label: "W" }, { value: "1M", label: "M" },\n];\nconst HISTORY_BARS: Record<Interval, number> = { "3m": 6000, "5m": 6000, "15m": 6000, "1h": 6000, "4h": 6000, "1d": 6000, "1w": 2500, "1M": 1200 };`,
    `const INTERVALS: Array<{ value: Interval; label: string }> = [\n  { value: "1m", label: "1m" }, { value: "3m", label: "3m" }, { value: "5m", label: "5m" }, { value: "15m", label: "15m" }, { value: "30m", label: "30m" },\n  { value: "1h", label: "1H" }, { value: "2h", label: "2H" }, { value: "4h", label: "4H" }, { value: "6h", label: "6H" }, { value: "8h", label: "8H" }, { value: "12h", label: "12H" },\n  { value: "1d", label: "D" }, { value: "3d", label: "3D" }, { value: "1w", label: "W" }, { value: "1M", label: "M" },\n];\nconst HISTORY_BARS: Record<Interval, number> = { "1m": 6000, "3m": 6000, "5m": 6000, "15m": 6000, "30m": 6000, "1h": 6000, "2h": 6000, "4h": 6000, "6h": 6000, "8h": 6000, "12h": 6000, "1d": 6000, "3d": 4000, "1w": 2500, "1M": 1200 };\nconst INTERVAL_MS: Record<Interval, number> = { "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "6h": 21_600_000, "8h": 28_800_000, "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000, "1w": 604_800_000, "1M": 2_592_000_000 };\nconst DEFAULT_BAR_SPACING = 9;\nfunction conditionInterval(value: string): Interval | null {\n  const raw = String(value || "").trim();\n  if (raw === "1M") return "1M";\n  const key = raw.toLowerCase();\n  const aliases: Record<string, Interval> = {\n    "1m": "1m", "1 minute": "1m", "1 minutes": "1m",\n    "3m": "3m", "3 minute": "3m", "3 minutes": "3m",\n    "5m": "5m", "5 minute": "5m", "5 minutes": "5m",\n    "15m": "15m", "15 minute": "15m", "15 minutes": "15m",\n    "30m": "30m", "30 minute": "30m", "30 minutes": "30m",\n    "1h": "1h", "1 hour": "1h",\n    "2h": "2h", "2 hour": "2h", "2 hours": "2h",\n    "4h": "4h", "4 hour": "4h", "4 hours": "4h",\n    "6h": "6h", "6 hour": "6h", "6 hours": "6h",\n    "8h": "8h", "8 hour": "8h", "8 hours": "8h",\n    "12h": "12h", "12 hour": "12h", "12 hours": "12h",\n    "1d": "1d", "1 day": "1d",\n    "3d": "3d", "3 day": "3d", "3 days": "3d",\n    "1w": "1w", "1 week": "1w",\n    "1 month": "1M", "month": "1M", "monthly": "1M",\n  };\n  return aliases[key] ?? null;\n}\nfunction smallestConditionInterval(conditions: Condition[]): Interval | null {\n  const intervals = conditions.map((condition) => conditionInterval(condition.timeframe)).filter((value): value is Interval => Boolean(value));\n  if (!intervals.length) return null;\n  return intervals.reduce((smallest, current) => INTERVAL_MS[current] < INTERVAL_MS[smallest] ? current : smallest);\n}`,
    "interval controls",
  );

  required(
    '  const initializedForTrade = useRef<string | null>(null);',
    '  const initializedForTrade = useRef<string | null>(null);\n  const viewportMemoryRef = useRef<Record<string, { from: number; to: number }>>({});',
    "viewport memory ref",
  );

  required(
    '    const strategy = Array.from(new Set(conditions.map(c => c.kind).filter((name): name is IndicatorName => INDICATORS.includes(name as IndicatorName))));\n    if (strategy.length) setEnabled(Array.from(new Set<IndicatorName>(["Volume", ...strategy])));',
    '    const strategy = Array.from(new Set(conditions.map(c => c.kind).filter((name): name is IndicatorName => INDICATORS.includes(name as IndicatorName))));\n    if (strategy.length) setEnabled(Array.from(new Set<IndicatorName>(["Volume", ...strategy])));\n    const entryInterval = smallestConditionInterval(conditions);\n    if (entryInterval) setInterval(entryInterval);',
    "strategy initialization",
  );

  required(
    '      timeScale: { borderColor: "#343434", timeVisible: !["1d", "1w", "1M"].includes(interval), secondsVisible: false, rightOffset: 8, barSpacing: interval === "1M" ? 8 : interval === "1w" ? 7 : 5, minBarSpacing: .8 },',
    '      timeScale: { borderColor: "#343434", timeVisible: !["1d", "3d", "1w", "1M"].includes(interval), secondsVisible: false, rightOffset: 8, barSpacing: DEFAULT_BAR_SPACING, minBarSpacing: .8 },',
    "default bar spacing",
  );

  required(
    `    fitPanes();\n    const recentBars = interval === "1M" ? 120 : interval === "1w" ? 180 : interval === "1d" ? 320 : 420;\n    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - recentBars), to: candles.length + 8 });`,
    `    fitPanes();\n    const viewportKey = accountId + "|" + tradeId + "|" + interval;\n    const storageKey = "ln-trader-chart-viewport:" + viewportKey;\n    let savedViewport = viewportMemoryRef.current[viewportKey] ?? null;\n    if (!savedViewport) {\n      try {\n        const raw = window.localStorage.getItem(storageKey);\n        if (raw) {\n          const parsed = JSON.parse(raw) as { from?: number; to?: number };\n          if (Number.isFinite(parsed.from) && Number.isFinite(parsed.to) && Number(parsed.to) > Number(parsed.from)) savedViewport = { from: Number(parsed.from), to: Number(parsed.to) };\n        }\n      } catch {}\n    }\n    if (savedViewport) {\n      chart.timeScale().setVisibleLogicalRange(savedViewport);\n    } else {\n      chart.timeScale().applyOptions({ barSpacing: DEFAULT_BAR_SPACING });\n      const usableWidth = Math.max(360, host.clientWidth - 92);\n      const visibleBars = Math.max(45, Math.min(candles.length, Math.floor(usableWidth / DEFAULT_BAR_SPACING)));\n      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - visibleBars), to: candles.length + 8 });\n    }\n    const rememberViewport = (range: { from: number; to: number } | null) => {\n      if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || range.to <= range.from) return;\n      const next = { from: Number(range.from), to: Number(range.to) };\n      viewportMemoryRef.current[viewportKey] = next;\n      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}\n    };\n    chart.timeScale().subscribeVisibleLogicalRangeChange(rememberViewport);`,
    "viewport initialization",
  );

  required(
    '    return () => { resize.disconnect(); candleSeriesRef.current = null; chart.remove(); chartRef.current = null; marketLineRef.current = null; };',
    '    return () => {\n      rememberViewport(chart.timeScale().getVisibleLogicalRange());\n      chart.timeScale().unsubscribeVisibleLogicalRangeChange(rememberViewport);\n      resize.disconnect(); candleSeriesRef.current = null; chart.remove(); chartRef.current = null; marketLineRef.current = null;\n    };',
    "viewport cleanup",
  );

  const fitDeps = '}, [candles, interval, enabled, paneOrder, autoY, conditionSignature, settingsSignature, structureSignature, indicatorCount, layoutPriceShare]);';
  const legacyDeps = '  }, [candles, interval, enabled, paneOrder, paneHeights, priceHeight, autoY, conditions, structureSignature, canvasHeight]);';
  if (source.includes(fitDeps)) {
    source = source.replace(fitDeps, '}, [accountId, tradeId, candles, interval, enabled, paneOrder, autoY, conditionSignature, settingsSignature, structureSignature, indicatorCount, layoutPriceShare]);');
  } else if (source.includes(legacyDeps)) {
    source = source.replace(legacyDeps, '  }, [accountId, tradeId, candles, interval, enabled, paneOrder, paneHeights, priceHeight, autoY, conditions, structureSignature, canvasHeight]);');
  } else {
    throw new Error("Chart viewport stability: missing chart effect dependencies");
  }
}

fs.writeFileSync(chartPath, source);
console.log("Trader chart viewport stability and entry timeframe prepared");
