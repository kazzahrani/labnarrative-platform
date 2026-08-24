import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const chartPath = path.join(process.cwd(), "app/trader/DcaTradeChart.tsx");
let trader = fs.readFileSync(traderPath, "utf8");
let chart = fs.readFileSync(chartPath, "utf8");

// DCA_PENDING_CHART_ORDERS_V1
// The chart must visualize the exact same simultaneous pending averaging-order window
// that reserves capital and is eligible to fill in the execution engine.

if (!trader.includes("const dcaAveragingOrderLimit =") || !trader.includes("const dcaAveragingOrderPrice =") || !trader.includes("const dcaAveragingOrderAmount =")) {
  throw new Error("Pending DCA chart orders: authoritative averaging planner is missing.");
}

if (!trader.includes("const selectedDcaPendingAveragingOrders =")) {
  const anchor = "  const selectedDcaChartBot = selectedDcaChartTrade ? dcaBots.find((bot) => bot.id === selectedDcaChartTrade.botId) ?? null : null;";
  if (!trader.includes(anchor)) throw new Error("Pending DCA chart orders: selected chart bot anchor missing.");
  const block = [
    "  // DCA_PENDING_CHART_ORDERS_V1 — exact exchange-style pending DCA window for the selected live trade.",
    "  const selectedDcaPendingAveragingOrders = (() => {",
    "    if (!selectedDcaChartTrade || !selectedDcaChartBot || selectedDcaChartTrade.status !== \"Active\") return [] as Array<{ index: number; price: number; amount: number }>;",
    "    const activeCount = dcaAveragingOrderLimit(selectedDcaChartBot, selectedDcaChartTrade);",
    "    return Array.from({ length: activeCount }, (_, offset) => {",
    "      const zeroBasedIndex = selectedDcaChartTrade.averagingFilled + offset;",
    "      return {",
    "        index: zeroBasedIndex + 1,",
    "        price: dcaAveragingOrderPrice(selectedDcaChartBot, selectedDcaChartTrade.entryPrice, zeroBasedIndex),",
    "        amount: dcaAveragingOrderAmount(selectedDcaChartBot, zeroBasedIndex),",
    "      };",
    "    }).filter((order) => Number.isFinite(order.price) && order.price > 0 && Number.isFinite(order.amount) && order.amount > 0);",
    "  })();",
  ].join("\n");
  trader = trader.replace(anchor, anchor + "\n" + block);
}

if (!trader.includes("pendingAveragingOrders={selectedDcaPendingAveragingOrders}")) {
  const propAnchor = "        nextAveragingPrice={selectedDcaNextAveragingPrice}\n";
  if (!trader.includes(propAnchor)) throw new Error("Pending DCA chart orders: chart prop anchor missing.");
  trader = trader.replace(propAnchor, propAnchor + "        pendingAveragingOrders={selectedDcaPendingAveragingOrders}\n");
}

if (!chart.includes("pendingAveragingOrders?: Array<{ index: number; price: number; amount: number }>;")) {
  const typeAnchor = "  nextAveragingPrice?: number | null;\n";
  if (!chart.includes(typeAnchor)) throw new Error("Pending DCA chart orders: DcaTradeChart prop type anchor missing.");
  chart = chart.replace(typeAnchor, typeAnchor + "  pendingAveragingOrders?: Array<{ index: number; price: number; amount: number }>;\n");
}

if (!chart.includes("  pendingAveragingOrders,\n")) {
  const destructureAnchor = "  nextAveragingPrice,\n  onClose,\n";
  if (!chart.includes(destructureAnchor)) throw new Error("Pending DCA chart orders: DcaTradeChart destructure anchor missing.");
  chart = chart.replace(destructureAnchor, "  nextAveragingPrice,\n  pendingAveragingOrders,\n  onClose,\n");
}

const singleLineBlock = `    if (status === "Active" && nextAveragingPrice && nextAveragingPrice > 0) candleSeries.createPriceLine({
      price: nextAveragingPrice,
      color: "#2f87ff",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "Next DCA",
    });`;

if (!chart.includes("DCA_PENDING_PRICE_LINES_V1")) {
  if (!chart.includes(singleLineBlock)) throw new Error("Pending DCA chart orders: legacy single Next DCA line block missing.");
  const multiLineBlock = `    // DCA_PENDING_PRICE_LINES_V1 — every currently active averaging limit order is visible.
    if (status === "Active" && pendingAveragingOrders?.length) {
      pendingAveragingOrders.forEach((order) => {
        if (!(order.price > 0)) return;
        candleSeries.createPriceLine({
          price: order.price,
          color: "#2f87ff",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: \`DCA \${order.index} · \${order.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT\`,
        });
      });
    } else if (status === "Active" && nextAveragingPrice && nextAveragingPrice > 0) candleSeries.createPriceLine({
      price: nextAveragingPrice,
      color: "#2f87ff",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "Next DCA",
    });`;
  chart = chart.replace(singleLineBlock, multiLineBlock);
}

const depAnchor = "stopLossPrice, nextAveragingPrice, exitPrice";
if (!chart.includes("pendingAveragingOrders, exitPrice")) {
  if (!chart.includes(depAnchor)) throw new Error("Pending DCA chart orders: chart effect dependency anchor missing.");
  chart = chart.replace(depAnchor, "stopLossPrice, nextAveragingPrice, pendingAveragingOrders, exitPrice");
}

if (!trader.includes("selectedDcaPendingAveragingOrders")) throw new Error("Pending DCA chart orders: planner output missing from trader.");
if (!trader.includes("dcaAveragingOrderLimit(selectedDcaChartBot, selectedDcaChartTrade)")) throw new Error("Pending DCA chart orders: chart is not using execution-engine active window.");
if (!trader.includes("pendingAveragingOrders={selectedDcaPendingAveragingOrders}")) throw new Error("Pending DCA chart orders: pending array is not passed to chart.");
if (!chart.includes("DCA_PENDING_PRICE_LINES_V1")) throw new Error("Pending DCA chart orders: multiple live price lines were not installed.");
if (!chart.includes("pendingAveragingOrders.forEach((order)")) throw new Error("Pending DCA chart orders: chart does not iterate all active orders.");

fs.writeFileSync(traderPath, trader);
fs.writeFileSync(chartPath, chart);
console.log("Rendered every active pending DCA averaging order on the live trade chart from the authoritative execution window.");
