import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chartPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");
const drawingPath = path.join(root, "app/trader/ChartDrawingTools.tsx");
let source = fs.readFileSync(chartPath, "utf8");
const marker = "TRADER_CHART_DRAWING_TOOLS_V1";

if (!source.includes(marker)) {
  const required = (before, after, label) => {
    if (!source.includes(before)) throw new Error(`Chart drawing tools: missing ${label}`);
    source = source.replace(before, after);
  };

  required(
    'import styles from "./dca-trade-workstation.module.css";',
    `import styles from "./dca-trade-workstation.module.css";\nimport ChartDrawingTools from "./ChartDrawingTools"; // ${marker}`,
    "drawing tools import",
  );

  if (!source.includes("candleSeriesRef")) throw new Error("Chart drawing tools: candle series ref missing");

  const styledCanvas = '<div ref={containerRef} className={styles.canvas} style={{ height: `${canvasHeight}px` }}/>';
  const fittedCanvas = '<div ref={containerRef} className={styles.canvas}/>';
  const drawingLayer = '<ChartDrawingTools chartRef={chartRef} seriesRef={candleSeriesRef} candles={candles} memoryKey={`${accountId}|${tradeId}|${interval}`}/>';
  if (source.includes(styledCanvas)) source = source.replace(styledCanvas, styledCanvas + drawingLayer);
  else if (source.includes(fittedCanvas)) source = source.replace(fittedCanvas, fittedCanvas + drawingLayer);
  else throw new Error("Chart drawing tools: missing chart canvas");

  source = source.replace(
    'if (!Number.isFinite(price)) return; series.createPriceLine({ price, color: "#555", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });',
    'if (!Number.isFinite(price)) return; series.createPriceLine({ price, color: "#555", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title });',
  );

  source = source.replaceAll('lastValueVisible: true, title:', 'lastValueVisible: false, title:');

  source = source.replace(
    'textColor: "#a9a9a9",',
    'textColor: "#a9a9a9", fontSize: 9,',
  );
  source = source.replace(
    /rightPriceScale: \{ borderColor: "#343434", minimumWidth: \d+,/,
    'rightPriceScale: { borderColor: "#343434", minimumWidth: 58,',
  );

  source = source.replaceAll('title: "Avg. Buy Price"', 'title: "AVG"');
  source = source.replaceAll('title: "Next DCA"', 'title: "DCA"');
  source = source.replaceAll('title: `DCA ${order.sequence || index + 1}`', 'title: `D${order.sequence || index + 1}`');

  source = source.replace(
    /if \(trade\.status === "Closed" && trade\.exitPrice && trade\.exitPrice > 0\) candleSeries\.createPriceLine\(\{ price: trade\.exitPrice, color: "#e27883", lineWidth: 1, lineStyle: LineStyle\.Dashed, axisLabelVisible: true, title: trade\.closeReason \?\? "Exit" \}\);/,
    'if (trade.status === "Closed" && trade.exitPrice && trade.exitPrice > 0) candleSeries.createPriceLine({ price: trade.exitPrice, color: "#e27883", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: trade.closeReason ?? "Exit" });',
  );

  fs.writeFileSync(chartPath, source);
}

if (fs.existsSync(drawingPath)) {
  let drawing = fs.readFileSync(drawingPath, "utf8");
  drawing = drawing.replace(
    'const coords = drawing.points.map(xy).filter((p): p is { x: number; y: number } => Boolean(p));',
    'const coords = drawing.points.map(xy).filter(Boolean) as Array<{ x: number; y: number }>;',
  );
  fs.writeFileSync(drawingPath, drawing);
}

console.log("Trader chart drawing toolbar, compact trade labels and hidden indicator axis labels prepared");