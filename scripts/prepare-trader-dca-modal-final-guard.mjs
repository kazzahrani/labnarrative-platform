import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (source.includes('editingDcaTradeId') && !source.includes('const editingDcaTrade =')) {
  const mainOpenIndex = source.lastIndexOf('<main className={styles.appShell}>');
  if (mainOpenIndex < 0) throw new Error('Could not locate trader appShell for edit trade state.');
  const mainReturnIndex = source.lastIndexOf('  return (', mainOpenIndex);
  if (mainReturnIndex < 0) throw new Error('Could not locate trader main return for edit trade state.');
  const editDerived = `  const editingDcaTrade = editingDcaTradeId ? dcaTrades.find((trade) => trade.id === editingDcaTradeId) ?? null : null;
  const editingDcaTradeBot = editingDcaTrade ? dcaBots.find((bot) => bot.id === editingDcaTrade.botId) ?? null : null;

`;
  source = source.slice(0, mainReturnIndex) + editDerived + source.slice(mainReturnIndex);
}

if (!source.includes('const selectedDcaChartTrade =')) throw new Error('Final DCA chart state missing.');
if (!source.includes('selectedDcaChartTrade && <DcaTradeChart')) throw new Error('Final DCA chart modal missing.');
if (!source.includes('const editingDcaTrade =')) throw new Error('Final DCA edit trade state missing.');
if (!source.includes('className={styles.dcaTradeEditOverlay}')) throw new Error('Final DCA edit modal missing.');
if (!source.includes('className={styles.dealPriceLine}')) throw new Error('Final DCA inline trade levels missing.');

fs.writeFileSync(traderPath, source);
console.log('Verified final DCA chart/edit modal state and inline active-trade levels.');
