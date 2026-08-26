import fs from "node:fs";
import path from "node:path";

const chartPath = path.join(process.cwd(), "app/trader/DcaTradeChartV2Workstation.tsx");
let source = fs.readFileSync(chartPath, "utf8");
const marker = "TRADER_CHART_AXIS_CLEANUP_V1";

if (!source.includes(marker)) {
  const importAnchor = 'import styles from "./dca-trade-workstation.module.css";';
  if (!source.includes(importAnchor)) throw new Error("Chart axis cleanup: source anchor missing");
  source = source.replace(importAnchor, `${importAnchor} // ${marker}`);

  // Hide indicator series' right-axis last-value tags while preserving the candle/market price tag.
  source = source.replaceAll('lastValueVisible: true, title:', 'lastValueVisible: false, title:');

  // Threshold labels such as RSI 20/80, stochastic triggers, MACD zero etc. stay drawn as lines but lose axis tags.
  source = source.replace(
    'if (!Number.isFinite(price)) return; series.createPriceLine({ price, color: "#555", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });',
    'if (!Number.isFinite(price)) return; series.createPriceLine({ price, color: "#555", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title });',
  );

  // Make all scale typography substantially smaller and reclaim right-side width.
  source = source.replace(
    'layout: { background: { type: ColorType.Solid, color: "#121212" }, textColor: "#a9a9a9", attributionLogo:',
    'layout: { background: { type: ColorType.Solid, color: "#121212" }, textColor: "#a9a9a9", fontSize: 8, attributionLogo:',
  );
  source = source.replace(
    /rightPriceScale: \{ borderColor: "#343434", minimumWidth: \d+,/,
    'rightPriceScale: { borderColor: "#343434", minimumWidth: 54,',
  );

  // Compact the user-relevant trade labels only.
  source = source.replaceAll('title: "Avg. Buy Price"', 'title: "AVG"');
  source = source.replaceAll('title: "Next DCA"', 'title: "DCA"');
  source = source.replaceAll('title: `DCA ${order.sequence || index + 1}`', 'title: `D${order.sequence || index + 1}`');

  // A completed TP/SL/manual exit is already represented by its execution marker; do not add a second right-axis exit tag.
  source = source.replace(
    /if \(trade\.status === "Closed" && trade\.exitPrice && trade\.exitPrice > 0\) candleSeries\.createPriceLine\(\{ price: trade\.exitPrice, color: "#e27883", lineWidth: 1, lineStyle: LineStyle\.Dashed, axisLabelVisible: true, title: trade\.closeReason \?\? "Exit" \}\);/,
    'if (trade.status === "Closed" && trade.exitPrice && trade.exitPrice > 0) candleSeries.createPriceLine({ price: trade.exitPrice, color: "#e27883", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: trade.closeReason ?? "Exit" });',
  );
}

fs.writeFileSync(chartPath, source);
console.log("Trader chart compact trade labels and hidden indicator axis labels prepared");
