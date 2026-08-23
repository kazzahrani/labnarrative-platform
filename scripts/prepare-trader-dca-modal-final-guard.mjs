import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const outerReturnToken = '  return <main className={styles.appShell}>';

if (source.includes('editingDcaTradeId') && !source.includes('const editingDcaTrade =')) {
  const outerReturnIndex = source.lastIndexOf(outerReturnToken);
  if (outerReturnIndex < 0) throw new Error('Could not locate TradingAgent outer return for edit trade state.');
  const editDerived = `  const editingDcaTrade = editingDcaTradeId ? dcaTrades.find((trade) => trade.id === editingDcaTradeId) ?? null : null;
  const editingDcaTradeBot = editingDcaTrade ? dcaBots.find((bot) => bot.id === editingDcaTrade.botId) ?? null : null;

`;
  source = source.slice(0, outerReturnIndex) + editDerived + source.slice(outerReturnIndex);
}

// SMARTTRADE ACTIONS RUNTIME FINAL V2
// Execute on pointer-down so table/row click layers cannot swallow the action.
// This is intentionally the final trader transform in prebuild.
const smartActionCellStart = '<td>{trade.status === "Active" ? <div className={styles.smartLedgerActions}>';
const smartActionCellEnd = '</td>';
const smartActionStartIndex = source.indexOf(smartActionCellStart);
if (smartActionStartIndex >= 0) {
  const smartActionEndIndex = source.indexOf(smartActionCellEnd, smartActionStartIndex);
  if (smartActionEndIndex < 0) throw new Error('Could not locate SmartTrade action cell end.');
  const oldCell = source.slice(smartActionStartIndex, smartActionEndIndex + smartActionCellEnd.length);
  if (!oldCell.includes('data-smart-action="close"')) throw new Error('SmartTrade compact action cell missing before runtime wiring.');
  const finalCell = '<td className={styles.smartActionsCell}>{trade.status === "Active" ? <div className={styles.smartLedgerActions}><button type="button" className={styles.smartActionIcon} data-smart-action="close" data-tooltip="Close at market price" title="Close at market price" aria-label="Close at market price" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); closeSmartTradeAtMarket(trade.id); }}>◉</button><button type="button" className={styles.smartActionIcon} data-smart-action="edit" data-tooltip="Edit" title="Edit" aria-label="Edit SmartTrade" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); openSmartTradeEdit(trade); }}>✎</button><button type="button" className={styles.smartActionIcon} data-smart-action="funds" data-tooltip="Add funds" title="Add funds" aria-label="Add funds" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); openSmartAddFunds(trade); }}>＋$</button><button type="button" className={styles.smartActionIcon} data-smart-action="refresh" data-tooltip="Refresh" title="Refresh" aria-label="Refresh SmartTrade" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); void refreshSmartTradeNow(trade.id); }}>↻</button></div> : <button type="button" className={styles.smartHistoryChartButton + " " + styles.smartActionIcon} data-smart-action="chart" data-tooltip="Open chart" title="Open chart" aria-label="Open SmartTrade chart" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedSmartTradeChartId(trade.id); }}>▥</button>}</td>';
  source = source.slice(0, smartActionStartIndex) + finalCell + source.slice(smartActionEndIndex + smartActionCellEnd.length);
} else if (!source.includes('className={styles.smartActionsCell}')) {
  throw new Error('Could not locate SmartTrade action cell for runtime wiring.');
}

if (!css.includes('/* SmartTrade action hit-area final */')) {
  css += `\n/* SmartTrade action hit-area final */\n.smartActionsCell{position:relative!important;z-index:200!important;isolation:isolate;overflow:visible!important;pointer-events:auto!important}.smartActionsCell .smartLedgerActions{position:relative!important;z-index:210!important;pointer-events:auto!important;overflow:visible!important}.smartActionsCell .smartActionIcon{position:relative!important;z-index:220!important;pointer-events:auto!important;touch-action:manipulation!important}.smartLedgerTable tbody tr>td:last-child{position:relative!important;z-index:200!important;pointer-events:auto!important;overflow:visible!important}\n`;
}

if (!source.includes('const selectedDcaChartTrade =')) throw new Error('Final DCA chart state missing.');
if (!source.includes('selectedDcaChartTrade && <DcaTradeChart')) throw new Error('Final DCA chart modal missing.');
if (!source.includes('const editingDcaTrade =')) throw new Error('Final DCA edit trade state missing.');
if (!source.includes('className={styles.dcaTradeEditOverlay}')) throw new Error('Final DCA edit modal missing.');
if (!source.includes('styles.dealPriceBar')) throw new Error('Final DCA embedded price bar missing.');
if (source.includes('styles.dealPriceBar3c') && !source.includes('styles.dealCurrentEndpoint')) throw new Error('3Commas DCA endpoint marker missing.');
if (!source.includes('onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); openSmartTradeEdit(trade); }}')) throw new Error('SmartTrade Edit pointer action missing.');
if (!source.includes('onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); openSmartAddFunds(trade); }}')) throw new Error('SmartTrade Add Funds pointer action missing.');
if (!source.includes('onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); void refreshSmartTradeNow(trade.id); }}')) throw new Error('SmartTrade Refresh pointer action missing.');

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Verified DCA modal state and forced SmartTrade actions above table hit layers with pointer-down execution.');
