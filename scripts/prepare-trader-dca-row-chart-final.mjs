import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Make the entire pair cell clickable so opening the trade chart is reliable.
const oldPairButton = '<td><button type="button" className={styles.dcaTradePairLink} onClick={() => setSelectedTradeChartId(trade.id)}>{symbol}/USDT</button><small>Paper Account 1001863</small></td>';
const oldPairStrong = '<td><strong>{symbol}/USDT</strong><small>Paper Account 1001863</small></td>';
const newPairCell = '<td className={styles.dcaTradePairCell} onClick={(event) => { event.stopPropagation(); setSelectedTradeChartId(trade.id); }}><button type="button" className={styles.dcaTradePairLink} onClick={(event) => { event.stopPropagation(); setSelectedTradeChartId(trade.id); }}>{symbol}/USDT</button><small>Paper Account 1001863</small></td>';
source = source.replace(oldPairButton, newPairCell);
source = source.replace(oldPairStrong, newPairCell);

// Put Buy, Market Price, Next DCA, TP, and SL on one horizontal price line.
const oldLevels = `return <div className={styles.dealTradeSnapshot}>
    <div className={styles.dealProgress}><i style={{ width: progressWidth }}/><span>Buy {money(trade.averagePrice)}</span><em>MP {money(current)}</em></div>
    <div className={styles.dealOrderLevels}>
      <span className={styles.dealTpLevel}><b>TP</b>{tpLevel ? money(tpLevel) : "—"}</span>
      <span className={styles.dealSlLevel}><b>SL</b>{slLevel ? money(slLevel) : "Off"}</span>
      <span className={styles.dealDcaLevel}><b>Next DCA</b>{nextDcaLevel ? money(nextDcaLevel) : "Complete"}</span>
    </div>
  </div>;`;

const newLevels = `return <div className={styles.dealTradeSnapshot}>
    <div className={styles.dealProgress}><i style={{ width: progressWidth }}/></div>
    <div className={styles.dealPriceLine}>
      <span><b>Buy</b>{money(trade.averagePrice)}</span>
      <span className={styles.dealMpLevel}><b>MP</b>{money(current)}</span>
      <span className={styles.dealDcaInline}><b>Next DCA</b>{nextDcaLevel ? money(nextDcaLevel) : "Complete"}</span>
      <span className={styles.dealTpInline}><b>TP</b>{tpLevel ? money(tpLevel) : "—"}</span>
      <span className={styles.dealSlInline}><b>SL</b>{slLevel ? money(slLevel) : "Off"}</span>
    </div>
  </div>;`;
source = source.replace(oldLevels, newLevels);

// The earlier chart transform created the chart state correctly but its modal insertion used a fragile formatted </main> match.
// Repair it here using the final </main> tag so the pair click always has a visible destination.
if (!source.includes('selectedDcaChartTrade && <DcaTradeChart')) {
  if (!source.includes('const selectedDcaChartTrade =')) {
    throw new Error('DCA trade chart state is missing from the final trader source.');
  }
  const closeMainIndex = source.lastIndexOf('</main>');
  if (closeMainIndex < 0) throw new Error('Could not locate the final trader </main> for DCA chart modal insertion.');
  const modal = `      {selectedDcaChartTrade && <DcaTradeChart
        pair={selectedDcaChartTrade.pair}
        status={selectedDcaChartTrade.status}
        entryPrice={selectedDcaChartTrade.entryPrice}
        averagePrice={selectedDcaChartTrade.averagePrice}
        createdAt={selectedDcaChartTrade.createdAt}
        closedAt={selectedDcaChartTrade.closedAt}
        exitPrice={selectedDcaChartTrade.exitPrice ?? (selectedDcaChartTrade.status === "Closed" ? selectedDcaChartTrade.lastPrice : undefined)}
        closeReason={selectedDcaChartTrade.closeReason}
        lastPrice={selectedDcaChartTrade.lastPrice}
        fills={selectedDcaChartTrade.fills}
        takeProfitPrice={selectedDcaTpPrice}
        stopLossPrice={selectedDcaSlPrice}
        nextAveragingPrice={selectedDcaNextAveragingPrice}
        onClose={() => setSelectedTradeChartId(null)}
      />}
`;
  source = source.slice(0, closeMainIndex) + modal + source.slice(closeMainIndex);
}

// Fail the production build if either requested behavior is ever lost by an earlier transform.
if (!source.includes('setSelectedTradeChartId(trade.id)')) {
  throw new Error('DCA pair click is not wired to selectedTradeChartId.');
}
if (!source.includes('selectedDcaChartTrade && <DcaTradeChart')) {
  throw new Error('DCA trade chart modal is missing from the final trader source.');
}
if (!source.includes('className={styles.dealPriceLine}')) {
  throw new Error('DCA trade levels were not moved to the inline price line.');
}

if (!css.includes('/* DCA final pair-click and inline levels */')) {
  css += `
/* DCA final pair-click and inline levels */
.dcaTradePairCell{cursor:pointer;position:relative}.dcaTradePairCell:hover{background:rgba(72,174,252,.035)}
.dcaTradePairCell .dcaTradePairLink{position:relative;z-index:1;display:inline-block;pointer-events:auto}
.dealTradeSnapshot{min-width:390px;margin-top:7px}
.dealProgress{height:8px!important;position:relative!important;margin:0!important;background:#d8e0e5!important;overflow:hidden!important}
.dealProgress>i{position:absolute!important;left:0!important;top:0!important;bottom:0!important;background:#f06b88!important;display:block!important}
.dealProgress>span,.dealProgress>em{display:none!important}
.dealPriceLine{display:flex;align-items:center;justify-content:flex-end;gap:13px;white-space:nowrap;margin-top:5px;font-size:10px;line-height:1.15;color:#aebdc7}
.dealPriceLine span{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;background:transparent}
.dealPriceLine b{font-size:10px;color:#91a7b5;font-weight:700}
.dealMpLevel,.dealMpLevel b{color:#18c8aa!important}.dealDcaInline,.dealDcaInline b{color:#54aefa!important}.dealTpInline,.dealTpInline b{color:#20c7aa!important}.dealSlInline,.dealSlInline b{color:#ff748a!important}
.dealOrderLevels{display:none!important}
@media(max-width:1180px){.dealTradeSnapshot{min-width:330px}.dealPriceLine{gap:8px;font-size:9px}.dealPriceLine b{font-size:9px}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Finalized DCA pair click-to-chart behavior, repaired chart modal insertion, and aligned Buy/MP/Next DCA/TP/SL on one line.");
