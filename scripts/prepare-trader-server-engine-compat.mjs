import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// The server-engine pass is intentionally final, but its account replacement also supports
// the historical pre-DCA-only formula shape. Normalize the DCA-only lines to that shape just
// for the next transform; the server pass immediately replaces them with server ledger values.
if (source.includes('  const paperCapital = dcaFundsLocked;')) {
  source = source.replace('  const paperCapital = dcaFundsLocked;', '  const paperCapital = activeSmart.reduce((sum, trade) => sum + trade.amount, 0) + dcaFundsLocked;');
}
if (source.includes('  const paperUnrealizedPnl = activeDcaUnrealized;')) {
  source = source.replace('  const paperUnrealizedPnl = activeDcaUnrealized;', '  const paperUnrealizedPnl = smartUnrealized + activeDcaUnrealized;');
}

if (!source.includes('const paperCapital = activeSmart.reduce') || !source.includes('const paperUnrealizedPnl = smartUnrealized + activeDcaUnrealized')) {
  throw new Error('Server engine compatibility: DCA-only account anchors could not be normalized.');
}

fs.writeFileSync(traderPath, source);
console.log('Normalized final DCA-only account anchors for immediate server-ledger replacement.');
