import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const outerReturnToken = '  return <main className={styles.appShell}>';

if (source.includes('editingDcaTradeId') && !source.includes('const editingDcaTrade =')) {
  const outerReturnIndex = source.lastIndexOf(outerReturnToken);
  if (outerReturnIndex < 0) throw new Error('Could not locate TradingAgent outer return for edit trade state.');
  const editDerived = `  const editingDcaTrade = editingDcaTradeId ? dcaTrades.find((trade) => trade.id === editingDcaTradeId) ?? null : null;
  const editingDcaTradeBot = editingDcaTrade ? dcaBots.find((bot) => bot.id === editingDcaTrade.botId) ?? null : null;

`;
  source = source.slice(0, outerReturnIndex) + editDerived + source.slice(outerReturnIndex);
}

if (!source.includes('const selectedDcaChartTrade =')) throw new Error('Final DCA chart state missing.');
if (!source.includes('selectedDcaChartTrade && <DcaTradeChart')) throw new Error('Final DCA chart modal missing.');
if (!source.includes('const editingDcaTrade =')) throw new Error('Final DCA edit trade state missing.');
if (!source.includes('className={styles.dcaTradeEditOverlay}')) throw new Error('Final DCA edit modal missing.');
if (!source.includes('styles.dealPriceBar')) throw new Error('Final DCA embedded price bar missing.');
if (source.includes('styles.dealPriceBar3c') && !source.includes('styles.dealCurrentEndpoint')) throw new Error('3Commas DCA endpoint marker missing.');

fs.writeFileSync(traderPath, source);
console.log('Verified outer-scope DCA chart/edit state and the final DCA price bar.');
