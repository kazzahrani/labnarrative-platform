import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const manualWithChartExit = '      return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade), closeReason: "Manual close", exitPrice: dcaTradePrice(trade) };';
const manualNormalized = '      return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade), closeReason: "Manual close" };';
const deleteWithChartExit = '      return { ...trade, status: "Closed", closedAt, realizedPnl: dcaTradePnl(trade), closeReason: "Bot deleted", exitPrice: dcaTradePrice(trade) };';
const deleteNormalized = '      return { ...trade, status: "Closed", closedAt, realizedPnl: dcaTradePnl(trade), closeReason: "Bot deleted" };';

if (source.includes(manualWithChartExit)) source = source.replace(manualWithChartExit, manualNormalized);
if (source.includes(deleteWithChartExit)) source = source.replace(deleteWithChartExit, deleteNormalized);

if (!source.includes(manualNormalized)) throw new Error('DCA accuracy compatibility: manual-close anchor not found.');
if (!source.includes(deleteNormalized)) throw new Error('DCA accuracy compatibility: bot-delete close anchor not found.');

fs.writeFileSync(traderPath, source);
console.log('Normalized DCA close anchors for final executable-bid accuracy pass.');
