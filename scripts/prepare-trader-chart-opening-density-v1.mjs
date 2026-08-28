import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chartPath = path.join(root, "app", "trader", "DcaTradeChartV2Workstation.tsx");
const shellPath = path.join(root, "app", "trader", "TraderV2FullShell.tsx");

for (const file of [chartPath, shellPath]) {
  if (!fs.existsSync(file)) throw new Error(`Trader chart density target missing: ${file}`);
}

let chart = fs.readFileSync(chartPath, "utf8");
let shell = fs.readFileSync(shellPath, "utf8");

const replaceRequired = (text, from, to, label) => {
  if (!text.includes(from)) throw new Error(`Trader chart density: missing ${label}`);
  return text.replace(from, to);
};

// Match the compact opening density shown in the approved reference screenshot:
// about five horizontal pixels per 5m candle instead of the previous nine.
chart = replaceRequired(
  chart,
  "const DEFAULT_BAR_SPACING = 9;",
  "const DEFAULT_BAR_SPACING = 5; // TRADER_CHART_OPENING_DENSITY_V1",
  "default bar spacing",
);

// Give the price pane more vertical room and keep indicators short, TradingView-style.
// With one indicator this is 76% price / 24% indicator, matching the reference.
const sharePattern = /const layoutPriceShare = indicatorCount === 0 \? 1 : indicatorCount === 1 \? \.68 : indicatorCount === 2 \? \.58 : indicatorCount === 3 \? \.52 : indicatorCount === 4 \? \.48 : \.44;/;
if (!sharePattern.test(chart)) throw new Error("Trader chart density: missing indicator pane share formula");
chart = chart.replace(
  sharePattern,
  "const layoutPriceShare = indicatorCount === 0 ? 1 : indicatorCount === 1 ? .76 : indicatorCount === 2 ? .68 : indicatorCount === 3 ? .62 : indicatorCount === 4 ? .58 : .54;",
);

// Reset only the legacy wide-candle saved viewport once. New compact viewports are
// still remembered normally from then on.
chart = replaceRequired(
  chart,
  'const storageKey = "ln-trader-chart-viewport:" + viewportKey;',
  'const storageKey = "ln-trader-chart-viewport-v2:" + viewportKey;',
  "viewport storage key",
);

// TradingView Strategy positions should always open at 5m, independent of DCA entry
// condition timeframe. DCA keeps its existing smallest-entry-timeframe behavior.
if (!chart.includes('automationType?: "dca" | "tradingview_strategy";')) {
  chart = replaceRequired(
    chart,
    '  tradeId: string;\n  pair: string;',
    '  tradeId: string;\n  automationType?: "dca" | "tradingview_strategy";\n  pair: string;',
    "chart automation type prop",
  );
}
chart = replaceRequired(
  chart,
  '  const [interval, setInterval] = useState<Interval>(() => chooseInterval(props.createdAt, props.closedAt));',
  '  const [interval, setInterval] = useState<Interval>(() => props.automationType === "tradingview_strategy" ? "5m" : chooseInterval(props.createdAt, props.closedAt));',
  "initial interval state",
);
chart = replaceRequired(
  chart,
  '    if (entryInterval) setInterval(entryInterval);',
  '    if (props.automationType === "tradingview_strategy") setInterval("5m"); else if (entryInterval) setInterval(entryInterval);',
  "entry timeframe initialization",
);

// Feed the final automation type into the chart from the fully transformed position row.
if (!shell.includes('automationType={selectedTrade.automationType}')) {
  shell = replaceRequired(
    shell,
    'nextAveragingPrice={selectedTrade.nextAveragingPrice} onClose={() => setSelectedTradeId(null)}',
    'nextAveragingPrice={selectedTrade.nextAveragingPrice} automationType={selectedTrade.automationType} onClose={() => setSelectedTradeId(null)}',
    "selected position chart props",
  );
}

for (const required of [
  "DEFAULT_BAR_SPACING = 5",
  "indicatorCount === 1 ? .76",
  "ln-trader-chart-viewport-v2:",
  'props.automationType === "tradingview_strategy" ? "5m"',
  'automationType={selectedTrade.automationType}',
]) {
  const combined = chart + "\n" + shell;
  if (!combined.includes(required)) throw new Error(`Trader chart density final output missing: ${required}`);
}

fs.writeFileSync(chartPath, chart);
fs.writeFileSync(shellPath, shell);
console.log("Prepared compact chart opening density, shorter indicators, and 5m TradingView Strategy default.");
