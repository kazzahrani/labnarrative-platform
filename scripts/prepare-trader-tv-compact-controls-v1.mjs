import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chartPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");
const cssPath = path.join(root, "app/trader/dca-trade-workstation.module.css");
const actionsPath = path.join(root, "app/trader/TradeActionsV2.tsx");
const shellPaths = [
  path.join(root, "app/trader/TraderV2FullShell.tsx"),
  path.join(root, "app/trader/RealTradingWorkspace.tsx"),
];

const marker = "TRADER_TV_COMPACT_CONTROLS_V1";
let chart = fs.readFileSync(chartPath, "utf8");

if (!chart.includes(marker)) {
  const stateAnchor = '  const [showIndicators, setShowIndicators] = useState(false);';
  if (!chart.includes(stateAnchor)) throw new Error("Compact TV controls: indicator state anchor missing");
  chart = chart.replace(
    stateAnchor,
    `${stateAnchor}\n  const [showTimeframes, setShowTimeframes] = useState(false); // ${marker}`,
  );

  chart = chart.replace(
    /const OVERLAYS = new Set<IndicatorName>\(\[([^\]]*)\]\);/,
    (_match, values) => {
      const current = String(values);
      return current.includes('"Volume"')
        ? `const OVERLAYS = new Set<IndicatorName>([${current}]);`
        : `const OVERLAYS = new Set<IndicatorName>(["Volume", ${current}]);`;
    },
  );

  const candleAnchor = '    candleSeries.setData(useHeikin ? heikin(candles) : candles.map(c => ({ time: t(c), open: c.open, high: c.high, low: c.low, close: c.close })));';
  if (!chart.includes(candleAnchor)) throw new Error("Compact TV controls: candle anchor missing");
  chart = chart.replace(
    candleAnchor,
    `${candleAnchor}\n    if (enabled.includes("Volume")) {\n      const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", priceLineVisible: false, lastValueVisible: false, title: "Volume" });\n      volumeSeries.setData(candles.map(c => ({ time: t(c), value: c.volume, color: c.close >= c.open ? "rgba(106,171,145,.40)" : "rgba(179,103,111,.36)" })));\n      chart.priceScale("volume").applyOptions({ scaleMargins: { top: .76, bottom: 0 } });\n    }`,
  );

  const intervalAnchor = '<div className={styles.intervals}>{INTERVALS.map(item => <button key={item.value} className={interval === item.value ? styles.active : ""} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div>';
  if (!chart.includes(intervalAnchor)) throw new Error("Compact TV controls: interval toolbar anchor missing");
  chart = chart.replace(
    intervalAnchor,
    `<div className={styles.timeframeWrap}>\n          <button className={showTimeframes ? styles.active : ""} onClick={() => { setShowTimeframes(v => !v); setShowIndicators(false); }} aria-haspopup="menu" aria-expanded={showTimeframes}>\n            <span className={styles.timeframeIcon}>◷</span>{INTERVALS.find(item => item.value === interval)?.label ?? interval}<span className={styles.chevron}>⌄</span>\n          </button>\n          {showTimeframes && <div className={styles.timeframeMenu} role="menu">{INTERVALS.map(item => <button key={item.value} role="menuitem" className={interval === item.value ? styles.active : ""} onClick={() => { setInterval(item.value); setShowTimeframes(false); }}>{item.label}</button>)}</div>}\n        </div>`,
  );

  chart = chart.replace(
    'onClick={() => setShowIndicators(v => !v)}>ƒx&nbsp; Indicators</button>',
    'onClick={() => { setShowIndicators(v => !v); setShowTimeframes(false); }}>ƒx&nbsp; Indicators</button>',
  );

  fs.writeFileSync(chartPath, chart);
}

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes("trader-tv-compact-timeframe-v1")) {
  css += `\n/* trader-tv-compact-timeframe-v1 */\n.timeframeWrap{position:relative;display:flex;align-items:center}.timeframeWrap>button{min-width:66px;display:inline-flex;align-items:center;justify-content:center;gap:6px}.timeframeIcon{font-size:11px;color:#8f8f8f}.chevron{font-size:9px;color:#777;margin-left:2px}.timeframeMenu{position:absolute;top:35px;left:0;z-index:28;width:92px;padding:5px;background:#1d1d1d;border:1px solid #3a3a3a;border-radius:9px;box-shadow:0 18px 46px rgba(0,0,0,.58);display:grid;gap:2px}.timeframeMenu button{width:100%;justify-content:flex-start!important;text-align:left!important;padding:0 10px!important}.timeframeMenu button.active{background:#303030!important;color:#eee!important}.overlayLegends button:first-child{opacity:.82}\n`;
  fs.writeFileSync(cssPath, css);
}

for (const file of shellPaths) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  const original = text;
  text = text.replace(
    /function amount\(value: number\) \{\s*return new Intl\.NumberFormat\("en-US", \{ maximumFractionDigits: 8 \}\)\.format\(value\);\s*\}/,
    'function amount(value: number) {\n  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);\n}',
  );
  text = text.replace(
    /function qty\(value: number\) \{\s*return new Intl\.NumberFormat\("en-US", \{ maximumFractionDigits: 8 \}\)\.format\(value\);\s*\}/,
    'function qty(value: number) {\n  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);\n}',
  );
  if (text !== original) fs.writeFileSync(file, text);
}

if (fs.existsSync(actionsPath)) {
  let actions = fs.readFileSync(actionsPath, "utf8");
  if (!actions.includes("TRADER_LIVE_DCA_CONTROL_V2")) {
    const oldInvoke = `async function invokeTrade(accountMode: Props["accountMode"], body: Record<string, unknown>) {\n  return invokeFunction(accountMode === "live" ? "trader-live-trade-control" : "trader-trade-control", body);\n}`;
    const newInvoke = `async function invokeTrade(accountMode: Props["accountMode"], body: Record<string, unknown>) {\n  const action = String(body.action ?? ""); // TRADER_LIVE_DCA_CONTROL_V2\n  const functionName = accountMode === "live"\n    ? action === "update_trade" ? "trader-live-dca-control" : "trader-live-trade-control"\n    : "trader-trade-control";\n  return invokeFunction(functionName, body);\n}`;
    if (!actions.includes(oldInvoke)) throw new Error("Live DCA edit routing: invokeTrade anchor missing");
    actions = actions.replace(oldInvoke, newInvoke);
    actions = actions.replace(
      '  if (message.includes("binance_")) return `Binance rejected the action: ${message}`;',
      '  if (message.includes("gateway_500") || message.includes("timeout")) return "Binance took too long to answer. The DCA editor checked for an existing order before allowing a retry.";\n  if (message.includes("live_dca_control_failed")) return "The DCA edit could not be completed safely. No duplicate order will be created; please retry.";\n  if (message.includes("binance_")) return `Binance rejected the action: ${message}`;',
    );
    fs.writeFileSync(actionsPath, actions);
  }
}

console.log("Trader TV compact timeframe, in-price-pane volume, two-decimal display, and resilient DCA edit routing prepared");
