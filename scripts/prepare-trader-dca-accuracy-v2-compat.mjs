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

const removeButtonContaining = (label) => {
  const needle = `>${label}</button>`;
  let index = source.indexOf(needle);
  while (index >= 0) {
    const start = source.lastIndexOf('<button', index);
    const end = index + needle.length;
    if (start < 0 || source.slice(start, index).includes('</button>')) throw new Error(`DCA accuracy compatibility: could not safely remove ${label} button.`);
    source = source.slice(0, start) + source.slice(end);
    index = source.indexOf(needle);
  }
};

// Real Binance execution is not wired yet. Remove every remaining notice-only
// connection/switch button so the DCA product never implies that it can place live orders.
removeButtonContaining('Connect Binance');
removeButtonContaining('Connect a new account');
removeButtonContaining('Switch to Real account');
source = source.replace(/<button\b[^>]*>Connect<\/button>/g, '');
source = source.replace('Build and test SmartTrades and DCA bots without sending real orders.', 'Build and test DCA bots without sending real orders.');

if (!source.includes(manualNormalized)) throw new Error('DCA accuracy compatibility: manual-close anchor not found.');
if (!source.includes(deleteNormalized)) throw new Error('DCA accuracy compatibility: bot-delete close anchor not found.');
if (source.includes('>Connect Binance</button>') || source.includes('>Switch to Real account</button>') || source.includes('>Connect a new account</button>')) throw new Error('DCA accuracy compatibility: fake live-account controls remain.');

fs.writeFileSync(traderPath, source);
console.log('Normalized DCA close anchors and structurally removed fake live Binance controls before final accuracy pass.');
