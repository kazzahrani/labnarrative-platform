import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chartPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");
const cssPath = path.join(root, "app/trader/dca-trade-workstation.module.css");

let source = fs.readFileSync(chartPath, "utf8");
const required = (before, after, label) => {
  if (!source.includes(before)) throw new Error(`Chart fit: missing ${label}`);
  source = source.replace(before, after);
};

required(
  '  CandlestickSeries,\n  ColorType,',
  '  BaselineSeries,\n  CandlestickSeries,\n  ColorType,',
  "baseline series import",
);

required(
  '  const separateEnabled = paneOrder.filter(name => enabled.includes(name) && !OVERLAYS.has(name));\n  const canvasHeight = Math.max(420, priceHeight + separateEnabled.reduce((sum, name) => sum + (paneHeights[name] ?? 130), 0));',
  `  const separateEnabled = paneOrder.filter(name => enabled.includes(name) && !OVERLAYS.has(name));
  const indicatorCount = separateEnabled.length;
  const layoutPriceShare = indicatorCount === 0 ? 1 : indicatorCount === 1 ? .68 : indicatorCount === 2 ? .58 : indicatorCount === 3 ? .52 : indicatorCount === 4 ? .48 : .44;
  const equalIndicatorShare = indicatorCount ? (1 - layoutPriceShare) / indicatorCount : 0;`,
  "dynamic canvas height",
);

required(
  '        const c = visualCondition("RSI"); const series = chart.addSeries(LineSeries, { color: "#b78de3", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: `RSI ${normalizeLength(c.length, 14)}` }, pane); series.setData(rsi(candles, normalizeLength(c.length, 14))); addThreshold(series, 70, "70"); addThreshold(series, 30, "30"); if (c.signal !== 30 && c.signal !== 70) addThreshold(series, c.signal, "Bot trigger");',
  `        const c = visualCondition("RSI");
        const band = chart.addSeries(BaselineSeries, { baseValue: { type: "price", price: 30 }, topFillColor1: "rgba(145,106,190,.13)", topFillColor2: "rgba(145,106,190,.13)", topLineColor: "rgba(145,106,190,0)", bottomFillColor1: "rgba(0,0,0,0)", bottomFillColor2: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane);
        if (candles.length) band.setData([{ time: t(candles[0]), value: 70 }, { time: t(candles[candles.length - 1]), value: 70 }]);
        const series = chart.addSeries(LineSeries, { color: "#b78de3", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: \`RSI \${normalizeLength(c.length, 14)}\` }, pane); series.setData(rsi(candles, normalizeLength(c.length, 14))); addThreshold(series, 70, "70"); addThreshold(series, 30, "30"); if (c.signal !== 30 && c.signal !== 70) addThreshold(series, c.signal, "Bot trigger");`,
  "RSI range band",
);

required(
  '        const c = visualCondition("Stochastic"); const st = stochastic(candles, normalizeLength(c.aux1, 14), normalizeLength(c.aux2, 1), normalizeLength(c.aux3, 3));\n        const k = chart.addSeries(LineSeries, { color: "#6ca6d9", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%K" }, pane); const d = chart.addSeries(LineSeries, { color: "#d6924e", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%D" }, pane); k.setData(st.k); d.setData(st.d); addThreshold(k, 80, "80"); addThreshold(k, 20, "20"); if (c.signal !== 20 && c.signal !== 80) addThreshold(k, c.signal, "Bot trigger");',
  `        const c = visualCondition("Stochastic"); const st = stochastic(candles, normalizeLength(c.aux1, 14), normalizeLength(c.aux2, 1), normalizeLength(c.aux3, 3));
        const band = chart.addSeries(BaselineSeries, { baseValue: { type: "price", price: 20 }, topFillColor1: "rgba(86,132,170,.12)", topFillColor2: "rgba(86,132,170,.12)", topLineColor: "rgba(86,132,170,0)", bottomFillColor1: "rgba(0,0,0,0)", bottomFillColor2: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane);
        if (candles.length) band.setData([{ time: t(candles[0]), value: 80 }, { time: t(candles[candles.length - 1]), value: 80 }]);
        const k = chart.addSeries(LineSeries, { color: "#6ca6d9", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%K" }, pane); const d = chart.addSeries(LineSeries, { color: "#d6924e", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%D" }, pane); k.setData(st.k); d.setData(st.d); addThreshold(k, 80, "80"); addThreshold(k, 20, "20"); if (c.signal !== 20 && c.signal !== 80) addThreshold(k, c.signal, "Bot trigger");`,
  "stochastic range band",
);

required(
  '    const panes = chart.panes(); if (panes[0]) panes[0].setHeight(priceHeight);\n    paneMap.forEach((index, name) => { if (panes[index]) panes[index].setHeight(paneHeights[name] ?? 130); });\n    const recentBars = interval === "1M" ? 120 : interval === "1w" ? 180 : interval === "1d" ? 320 : 420;\n    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - recentBars), to: candles.length + 8 });\n    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight })); resize.observe(host);',
  `    const fitPanes = () => {
      const panes = chart.panes();
      if (!panes[0]) return;
      if (!indicatorCount) return;
      const indicatorPanes = separateEnabled.flatMap(name => {
        const index = paneMap.get(name);
        return index != null && panes[index] ? [panes[index]] : [];
      });
      if (!indicatorPanes.length) return;
      const equalizeIndicators = () => {
        for (let pass = 0; pass < 7; pass += 1) {
          const average = indicatorPanes.reduce((sum, pane) => sum + pane.getHeight(), 0) / indicatorPanes.length;
          indicatorPanes.forEach(pane => pane.setHeight(average));
        }
      };
      equalizeIndicators();
      let totalPaneHeight = panes.reduce((sum, pane) => sum + pane.getHeight(), 0);
      panes[0].setHeight(Math.max(120, Math.round(totalPaneHeight * layoutPriceShare)));
      equalizeIndicators();
      totalPaneHeight = panes.reduce((sum, pane) => sum + pane.getHeight(), 0);
      panes[0].setHeight(Math.max(120, Math.round(totalPaneHeight * layoutPriceShare)));
    };
    fitPanes();
    const recentBars = interval === "1M" ? 120 : interval === "1w" ? 180 : interval === "1d" ? 320 : 420;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - recentBars), to: candles.length + 8 });
    const resize = new ResizeObserver(() => {
      chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
      requestAnimationFrame(fitPanes);
    }); resize.observe(host);`,
  "pane fitting",
);

source = source.replace(
  '}, [candles, interval, enabled, paneOrder, paneHeights, priceHeight, autoY, conditionSignature, settingsSignature, structureSignature, canvasHeight]);',
  '}, [candles, interval, enabled, paneOrder, autoY, conditionSignature, settingsSignature, structureSignature, indicatorCount, layoutPriceShare]);',
);

required(
  '  const paneTop = (name: IndicatorName) => { let top = priceHeight; for (const pane of separateEnabled) { if (pane === name) return top; top += paneHeights[pane] ?? 130; } return top; };',
  '  const paneTop = (name: IndicatorName) => { const index = separateEnabled.indexOf(name); return index < 0 ? 100 : (layoutPriceShare + index * equalIndicatorShare) * 100; };',
  "pane label position",
);

required(
  '        <div ref={containerRef} className={styles.canvas} style={{ height: `${canvasHeight}px` }}/>',
  '        <div ref={containerRef} className={styles.canvas}/>',
  "fixed canvas render",
);
required(
  '        <div className={styles.paneLabels} style={{ height: `${canvasHeight}px` }}>',
  '        <div className={styles.paneLabels}>',
  "fixed label overlay",
);
required(
  'style={{ top: `${paneTop(name) + 7}px` }}',
  'style={{ top: `calc(${paneTop(name)}% + 7px)` }}',
  "responsive pane label top",
);

fs.writeFileSync(chartPath, source);

let css = fs.readFileSync(cssPath, "utf8");
const oldViewport = '.chartViewport{position:relative;flex:1;min-height:0;overflow:auto;background:#121212}.canvas{width:100%;min-height:420px}';
const newViewport = '.chartViewport{position:relative;flex:1;min-height:0;overflow:hidden;background:#121212}.canvas{width:100%;height:100%;min-height:0}';
if (!css.includes(oldViewport)) throw new Error("Chart fit: missing chart viewport CSS");
css = css.replace(oldViewport, newViewport);
css = css.replace(
  '.paneLabels{position:absolute;left:0;right:0;top:0;z-index:8;pointer-events:none}',
  '.paneLabels{position:absolute;left:0;right:0;top:0;bottom:0;height:100%;z-index:8;pointer-events:none;overflow:hidden}',
);
css = css.replace('.topbar{height:64px;', '.topbar{height:58px;');
css = css.replace('.toolbar{height:43px;', '.toolbar{height:40px;');
fs.writeFileSync(cssPath, css);

console.log("Trading chart fitted with equal indicator panes and oscillator bands");
