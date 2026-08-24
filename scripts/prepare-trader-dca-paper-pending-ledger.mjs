import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (source.includes("DCA_PAPER_PENDING_ORDER_LEDGER_V1")) {
  console.log("DCA paper pending-order ledger already prepared.");
  process.exit(0);
}

if (!source.includes("const dcaAveragingOrderLimit =") || !source.includes("const dcaAveragingOrderPrice =") || !source.includes("const dcaAveragingOrderAmount =")) {
  throw new Error("Paper pending-order ledger: averaging planner is missing.");
}

// Replace the synthetic reservation helper with one canonical exchange-style paper order ledger.
const reserveStart = source.indexOf("  const dcaPendingAveragingReserveForTrade = (trade: DcaTrade) => {");
const reserveEndMarker = "  const dcaPendingAveragingReserved = activeDcaTrades.reduce((sum, trade) => sum + dcaPendingAveragingReserveForTrade(trade), 0);";
const reserveEnd = source.indexOf(reserveEndMarker, reserveStart);
if (reserveStart < 0 || reserveEnd < 0) throw new Error("Paper pending-order ledger: reservation block missing.");
const reserveBlockEnd = reserveEnd + reserveEndMarker.length;
const ledgerBlock = [
  "  // DCA_PAPER_PENDING_ORDER_LEDGER_V1 — these are the actual open paper limit orders.",
  "  const dcaPaperPendingAveragingOrdersForTrade = (trade: DcaTrade) => {",
  "    const bot = dcaBots.find((candidate) => candidate.id === trade.botId);",
  "    if (!bot || trade.status !== \"Active\" || bot.averagingEnabled === false) return [] as Array<{ id: string; tradeId: string; botId: string; pair: string; index: number; price: number; amount: number; quantity: number; status: \"Pending\" }> ;",
  "    const activePending = dcaAveragingOrderLimit(bot, trade);",
  "    const market = dcaMarketsRef.current.find((candidate) => candidate.symbol === trade.pair.split(\"/\")[0]);",
  "    const orders = Array.from({ length: activePending }, (_, offset) => {",
  "      const zeroBasedIndex = trade.averagingFilled + offset;",
  "      const plannedPrice = dcaAveragingOrderPrice(bot, trade.entryPrice, zeroBasedIndex);",
  "      const price = market?.tickSize ? floorToStep(plannedPrice, market.tickSize) : plannedPrice;",
  "      const plannedAmount = dcaAveragingOrderAmount(bot, zeroBasedIndex);",
  "      const quantity = price > 0 ? floorToStep(plannedAmount / price, market?.stepSize || 0) : 0;",
  "      const amount = quantity > 0 ? quantity * price : plannedAmount;",
  "      return {",
  "        id: trade.id + \":dca:\" + String(zeroBasedIndex + 1),",
  "        tradeId: trade.id, botId: bot.id, pair: trade.pair, index: zeroBasedIndex + 1, price, amount, quantity, status: \"Pending\" as const,",
  "      };",
  "    });",
  "    return orders.filter((order) => {",
  "      if (!(order.price > 0) || !(order.amount > 0)) return false;",
  "      if (!market) return true;",
  "      if (!(order.quantity > 0)) return false;",
  "      if (market.minQty > 0 && order.quantity + 1e-15 < market.minQty) return false;",
  "      if (market.maxQty > 0 && order.quantity - 1e-15 > market.maxQty) return false;",
  "      if (market.minNotional > 0 && order.amount + 1e-9 < market.minNotional) return false;",
  "      return true;",
  "    });",
  "  };",
  "  const dcaPaperPendingAveragingOrders = activeDcaTrades.flatMap((trade) => dcaPaperPendingAveragingOrdersForTrade(trade));",
  "  const dcaPendingAveragingReserveForTrade = (trade: DcaTrade) => dcaPaperPendingAveragingOrders.filter((order) => order.tradeId === trade.id).reduce((sum, order) => sum + order.amount, 0);",
  "  const dcaPendingAveragingReserved = dcaPaperPendingAveragingOrders.reduce((sum, order) => sum + order.amount, 0);",
].join("\n");
source = source.slice(0, reserveStart) + ledgerBlock + source.slice(reserveBlockEnd);

// The execution window now takes its simultaneous-order count from the pending-order ledger itself.
source = source.replaceAll(
  "const activePendingAtCycleStart = dcaAveragingOrderLimit(bot, item);",
  "const activePendingAtCycleStart = dcaPaperPendingAveragingOrdersForTrade(item).length;"
);

// The live chart must display those same open order records, not independently recompute them.
const chartStart = source.indexOf("  // DCA_PENDING_CHART_ORDERS_V1");
const tpPctAnchor = source.indexOf("  const selectedDcaTpPct", chartStart);
const tpPriceAnchor = source.indexOf("  const selectedDcaTpPrice", chartStart);
const chartEnd = tpPctAnchor >= 0 ? tpPctAnchor : tpPriceAnchor;
if (chartStart < 0 || chartEnd < 0) throw new Error("Paper pending-order ledger: selected trade pending-order chart block missing.");
const chartBlock = [
  "  // DCA_PENDING_CHART_ORDERS_V1 — chart renders the actual pending paper-order ledger.",
  "  const selectedDcaPendingAveragingOrders = selectedDcaChartTrade",
  "    ? dcaPaperPendingAveragingOrders.filter((order) => order.tradeId === selectedDcaChartTrade.id).map((order) => ({ index: order.index, price: order.price, amount: order.amount }))",
  "    : [];",
  "  const selectedDcaNextAveragingPrice = selectedDcaPendingAveragingOrders[0]?.price ?? null;",
  "",
].join("\n");
source = source.slice(0, chartStart) + chartBlock + source.slice(chartEnd);

// Broker-style accounting: Reserved means open order cash, not already-filled spot positions.
const reservedExpression = "(dcaPendingAveragingReserved + dcaPendingEntryReserved)";
source = source.replaceAll("<small>{compactMoney(paperCapital)} reserved</small>", `<small>{compactMoney(${reservedExpression})} reserved in open orders</small>`);
source = source.replaceAll("<div><span>Reserved</span><b>{compactMoney(paperCapital)}</b></div>", `<div><span>Reserved</span><b>{compactMoney(${reservedExpression})}</b></div>`);

// Make the active-trade row expose both how many exchange-style paper orders are open and how much they reserve.
const averagingCellNeedle = '<td data-dca-averaging-live="true"><span>Completed: {trade.averagingFilled}</span><small>{mode === "Active" ? "Active: " + (() => { const activeBot = dcaBots.find((candidate) => candidate.id === trade.botId); const remaining = Math.max(0, trade.maxAveraging - trade.averagingFilled); if (!activeBot) return Math.min(remaining, Math.max(0, trade.activeOrdersLimit ?? trade.maxAveraging)); return dcaAveragingOrderLimit(activeBot, trade); })() : "Filled: " + trade.averagingFilled}</small><small>Max: {trade.maxAveraging}</small></td>';
if (source.includes(averagingCellNeedle)) {
  const averagingCellReplacement = '<td data-dca-averaging-live="true"><span>Completed: {trade.averagingFilled}</span><small>{mode === "Active" ? "Active: " + dcaPaperPendingAveragingOrders.filter((order) => order.tradeId === trade.id).length : "Filled: " + trade.averagingFilled}</small>{mode === "Active" && <small>Reserved: {compactMoney(dcaPaperPendingAveragingOrders.filter((order) => order.tradeId === trade.id).reduce((sum, order) => sum + order.amount, 0))}</small>}<small>Max: {trade.maxAveraging}</small></td>';
  source = source.replace(averagingCellNeedle, averagingCellReplacement);
}

// Build guards: do not allow UI, reservation and execution to drift apart again.
if (!source.includes("DCA_PAPER_PENDING_ORDER_LEDGER_V1")) throw new Error("Paper pending-order ledger marker missing.");
if (!source.includes("const dcaPaperPendingAveragingOrders = activeDcaTrades.flatMap")) throw new Error("Paper pending-order ledger array missing.");
if (!source.includes("dcaPendingAveragingReserved = dcaPaperPendingAveragingOrders.reduce")) throw new Error("Reserved cash is not derived from pending orders.");
if (!source.includes("activePendingAtCycleStart = dcaPaperPendingAveragingOrdersForTrade(item).length")) throw new Error("Execution is not bounded by pending-order ledger.");
if (!source.includes("dcaPaperPendingAveragingOrders.filter((order) => order.tradeId === selectedDcaChartTrade.id)")) throw new Error("Chart is not rendering pending-order ledger.");
if (!source.includes("selectedDcaNextAveragingPrice = selectedDcaPendingAveragingOrders[0]?.price ?? null")) throw new Error("Next DCA compatibility value is not derived from pending-order ledger.");
if (!source.includes("reserved in open orders")) throw new Error("Dashboard Reserved is not broker-style open-order cash.");
if (source.includes("selectedDcaTpPrice = selectedDcaChartTrade && selectedDcaTpPct > 0") && !source.includes("const selectedDcaTpPct")) throw new Error("TP override declaration was lost by pending-order transform.");

fs.writeFileSync(traderPath, source);
console.log("Prepared authoritative paper pending DCA order ledger: reservation, fills and chart use the same open orders.");
