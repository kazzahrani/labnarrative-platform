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
  '  const separateEnabled = paneOrder.filter(name => enabled.includes(name) && !OVERLAYS.has(name));\n  const canvasHeight = Math.max(420, priceHeight + separateEnabled.reduce((sum, name) => sum + (paneHeights[name] ?? 130), 0));',
  '  const separateEnabled = paneOrder.filter(name => enabled.includes(name) && !OVERLAYS.has(name));\n  const paneWeightTotal = Math.max(1, priceHeight + separateEnabled.reduce((sum, name) => sum + (paneHeights[name] ?? 130), 0));',
  "dynamic canvas height",
);

required(
  '    const panes = chart.panes(); if (panes[0]) panes[0].setHeight(priceHeight);\n    paneMap.forEach((index, name) => { if (panes[index]) panes[index].setHeight(paneHeights[name] ?? 130); });\n    const recentBars = interval === "1M" ? 120 : interval === "1w" ? 180 : interval === "1d" ? 320 : 420;\n    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - recentBars), to: candles.length + 8 });\n    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight })); resize.observe(host);',
  `    const fitPanes = () => {
      const panes = chart.panes();
      if (!panes[0]) return;
      const available = Math.max(260, host.clientHeight);
      if (!separateEnabled.length) { panes[0].setHeight(available); return; }
      const indicatorWeight = Math.max(1, separateEnabled.reduce((sum, name) => sum + (paneHeights[name] ?? 130), 0));
      const rawPriceShare = priceHeight / Math.max(1, priceHeight + indicatorWeight);
      const minimumPriceShare = separateEnabled.length >= 6 ? .40 : separateEnabled.length >= 3 ? .46 : .54;
      const maximumPriceShare = separateEnabled.length >= 6 ? .54 : .68;
      const priceShare = Math.max(minimumPriceShare, Math.min(maximumPriceShare, rawPriceShare));
      const pricePixels = Math.max(120, Math.round(available * priceShare));
      panes[0].setHeight(pricePixels);
      const remaining = Math.max(1, available - pricePixels);
      paneMap.forEach((index, name) => {
        if (!panes[index]) return;
        const weight = paneHeights[name] ?? 130;
        panes[index].setHeight(Math.max(18, Math.round(remaining * weight / indicatorWeight)));
      });
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
  '}, [candles, interval, enabled, paneOrder, paneHeights, priceHeight, autoY, conditionSignature, settingsSignature, structureSignature]);',
);

required(
  '  const paneTop = (name: IndicatorName) => { let top = priceHeight; for (const pane of separateEnabled) { if (pane === name) return top; top += paneHeights[pane] ?? 130; } return top; };',
  '  const paneTop = (name: IndicatorName) => { let top = priceHeight; for (const pane of separateEnabled) { if (pane === name) return top / paneWeightTotal * 100; top += paneHeights[pane] ?? 130; } return top / paneWeightTotal * 100; };',
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

console.log("Trading chart fitted to fixed modal viewport");
