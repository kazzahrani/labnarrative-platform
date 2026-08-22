import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const outerReturnToken = '  return <main className={styles.appShell}>';

// Make the entire pair cell clickable so opening the trade chart is reliable.
const oldPairButton = '<td><button type="button" className={styles.dcaTradePairLink} onClick={() => setSelectedTradeChartId(trade.id)}>{symbol}/USDT</button><small>Paper Account 1001863</small></td>';
const oldPairStrong = '<td><strong>{symbol}/USDT</strong><small>Paper Account 1001863</small></td>';
const newPairCell = '<td className={styles.dcaTradePairCell} onClick={(event) => { event.stopPropagation(); setSelectedTradeChartId(trade.id); }}><button type="button" className={styles.dcaTradePairLink} onClick={(event) => { event.stopPropagation(); setSelectedTradeChartId(trade.id); }}>{symbol}/USDT</button><small>Paper Account 1001863</small></td>';
source = source.replace(oldPairButton, newPairCell);
source = source.replace(oldPairStrong, newPairCell);

// Put Buy, Market Price, Next DCA, TP, and SL INSIDE one price-mapped red/green bar.
const oldLevels = `return <div className={styles.dealTradeSnapshot}>
    <div className={styles.dealProgress}><i style={{ width: progressWidth }}/><span>Buy {money(trade.averagePrice)}</span><em>MP {money(current)}</em></div>
    <div className={styles.dealOrderLevels}>
      <span className={styles.dealTpLevel}><b>TP</b>{tpLevel ? money(tpLevel) : "—"}</span>
      <span className={styles.dealSlLevel}><b>SL</b>{slLevel ? money(slLevel) : "Off"}</span>
      <span className={styles.dealDcaLevel}><b>Next DCA</b>{nextDcaLevel ? money(nextDcaLevel) : "Complete"}</span>
    </div>
  </div>;`;
const newLevels = `const mappedLevels = [current, trade.averagePrice, tpLevel, slLevel, nextDcaLevel].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const rawMin = Math.min(...mappedLevels);
  const rawMax = Math.max(...mappedLevels);
  const padding = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.008, 0.00000001);
  const barMin = Math.max(0, rawMin - padding);
  const barMax = rawMax + padding;
  const markerLeft = (value: number) => String(Math.min(97, Math.max(3, ((value - barMin) / Math.max(barMax - barMin, 0.00000001)) * 100))) + "%";
  const buyLeft = markerLeft(trade.averagePrice);
  const mpLeft = markerLeft(current);
  return <div className={styles.dealTradeSnapshot}>
    <div className={styles.dealPriceBar}>
      <div className={styles.dealPriceTrack}>
        <i className={styles.dealLossBand} style={{ width: buyLeft }}/>
        <i className={styles.dealProfitBand} style={{ left: buyLeft }}/>
      </div>
      <span className={styles.dealBarMarker + " " + styles.dealBuyMarker} style={{ left: buyLeft }}><b>Buy</b>{money(trade.averagePrice)}</span>
      <span className={styles.dealBarMarker + " " + styles.dealMpMarker} style={{ left: mpLeft }}><b>MP</b>{money(current)}</span>
      {nextDcaLevel ? <span className={styles.dealBarMarker + " " + styles.dealDcaMarker} style={{ left: markerLeft(nextDcaLevel) }}><b>DCA</b>{money(nextDcaLevel)}</span> : null}
      {tpLevel ? <span className={styles.dealBarMarker + " " + styles.dealTpMarker} style={{ left: markerLeft(tpLevel) }}><b>TP</b>{money(tpLevel)}</span> : null}
      {slLevel ? <span className={styles.dealBarMarker + " " + styles.dealSlMarker} style={{ left: markerLeft(slLevel) }}><b>SL</b>{money(slLevel)}</span> : null}
    </div>
  </div>;`;
source = source.replace(oldLevels, newLevels);

// Also upgrade builds that already contain the previous inline v1 markup.
const previousInline = `return <div className={styles.dealTradeSnapshot}>
    <div className={styles.dealProgress}><i style={{ width: progressWidth }}/></div>
    <div className={styles.dealPriceLine}>
      <span><b>Buy</b>{money(trade.averagePrice)}</span>
      <span className={styles.dealMpLevel}><b>MP</b>{money(current)}</span>
      <span className={styles.dealDcaInline}><b>Next DCA</b>{nextDcaLevel ? money(nextDcaLevel) : "Complete"}</span>
      <span className={styles.dealTpInline}><b>TP</b>{tpLevel ? money(tpLevel) : "—"}</span>
      <span className={styles.dealSlInline}><b>SL</b>{slLevel ? money(slLevel) : "Off"}</span>
    </div>
  </div>;`;
source = source.replace(previousInline, newLevels);

// Build selected-trade chart state in the OUTER TradingAgent component scope.
if (!source.includes('const selectedDcaChartTrade =')) {
  const outerReturnIndex = source.lastIndexOf(outerReturnToken);
  if (outerReturnIndex < 0) throw new Error('Could not locate TradingAgent outer main return.');
  const chartState = `  const selectedDcaChartTrade = selectedTradeChartId ? dcaTrades.find((trade) => trade.id === selectedTradeChartId) ?? null : null;
  const selectedDcaChartBot = selectedDcaChartTrade ? dcaBots.find((bot) => bot.id === selectedDcaChartTrade.botId) ?? null : null;
  const selectedDcaNextAveragingPrice = (() => {
    if (!selectedDcaChartTrade || !selectedDcaChartBot || selectedDcaChartTrade.status !== "Active" || selectedDcaChartTrade.averagingFilled >= selectedDcaChartTrade.maxAveraging) return null;
    let cumulativeDeviation = 0;
    let nextStep = selectedDcaChartBot.deviation;
    for (let index = 0; index <= selectedDcaChartTrade.averagingFilled; index += 1) {
      cumulativeDeviation += nextStep;
      nextStep *= selectedDcaChartBot.stepScale;
    }
    return selectedDcaChartTrade.entryPrice * (1 - cumulativeDeviation / 100);
  })();
  const selectedDcaTpPrice = selectedDcaChartTrade && selectedDcaChartBot?.takeProfit ? selectedDcaChartTrade.averagePrice * (1 + selectedDcaChartBot.takeProfit / 100) : null;
  const selectedDcaSlPrice = selectedDcaChartTrade && selectedDcaChartBot?.stopEnabled ? selectedDcaChartTrade.averagePrice * (1 - selectedDcaChartBot.stopPct / 100) : null;

`;
  source = source.slice(0, outerReturnIndex) + chartState + source.slice(outerReturnIndex);
}

// Insert the chart modal using the actual final </main>.
if (!source.includes('selectedDcaChartTrade && <DcaTradeChart')) {
  const closeMainIndex = source.lastIndexOf('</main>');
  if (closeMainIndex < 0) throw new Error('Could not locate final trader </main>.');
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

if (!source.includes('setSelectedTradeChartId(trade.id)')) throw new Error('DCA pair click is not wired.');
if (!source.includes('const selectedDcaChartTrade =')) throw new Error('DCA chart state missing.');
if (!source.includes('selectedDcaChartTrade && <DcaTradeChart')) throw new Error('DCA chart modal missing.');
if (!source.includes('className={styles.dealPriceBar}')) throw new Error('DCA embedded price bar missing.');

if (!css.includes('/* DCA final pair-click and inline levels */')) {
  css += `
/* DCA final pair-click and inline levels */
.dcaTradePairCell{cursor:pointer;position:relative}.dcaTradePairCell:hover{background:rgba(72,174,252,.035)}
.dcaTradePairCell .dcaTradePairLink{position:relative;z-index:1;display:inline-block;pointer-events:auto}
.dealOrderLevels{display:none!important}
`;
}

if (!css.includes('/* DCA embedded price markers v2 */')) {
  css += `
/* DCA embedded price markers v2 */
.dealTradeSnapshot{min-width:420px;margin-top:7px;padding-top:19px;padding-bottom:21px}
.dealPriceLine,.dealProgress{display:none!important}
.dealPriceBar{height:30px;position:relative;width:100%;min-width:420px;overflow:visible}
.dealPriceTrack{position:absolute;left:0;right:0;top:13px;height:8px;background:#dce4e8;overflow:hidden}
.dealPriceTrack>i{position:absolute;top:0;bottom:0;display:block}
.dealLossBand{left:0;background:#f16983}.dealProfitBand{right:0;background:#1cb69f}
.dealBarMarker{position:absolute;z-index:3;transform:translateX(-50%);display:flex;align-items:center;gap:3px;white-space:nowrap;font-size:9px;line-height:1;color:#aebcc5;text-shadow:0 1px 0 #10202a}
.dealBarMarker b{font-size:9px;font-weight:850}
.dealBarMarker:after{content:"";position:absolute;left:50%;width:1px;background:currentColor;opacity:.9}
.dealBuyMarker{top:-8px;color:#c5ced4}.dealBuyMarker:after{top:11px;height:14px}.dealBuyMarker b{color:#c5ced4}
.dealMpMarker{top:24px;color:#22d0b3}.dealMpMarker:after{bottom:11px;height:12px}.dealMpMarker b{color:#22d0b3}
.dealDcaMarker{top:24px;color:#52adf8}.dealDcaMarker:after{bottom:11px;height:12px}.dealDcaMarker b{color:#52adf8}
.dealTpMarker{top:-8px;color:#2bd3b5}.dealTpMarker:after{top:11px;height:14px}.dealTpMarker b{color:#2bd3b5}
.dealSlMarker{top:24px;color:#ff7188}.dealSlMarker:after{bottom:11px;height:12px}.dealSlMarker b{color:#ff7188}
.dcaDealsTableCard th:nth-child(3),.dcaDealsTableCard td:nth-child(3){min-width:450px}
@media(max-width:1180px){.dealTradeSnapshot,.dealPriceBar{min-width:360px}.dcaDealsTableCard th:nth-child(3),.dcaDealsTableCard td:nth-child(3){min-width:390px}.dealBarMarker,.dealBarMarker b{font-size:8px}}
`;
}

if (!css.includes('/* DCA advanced trade chart v3 */')) {
  css += `
/* DCA advanced trade chart v3 */
.tradeChartOverlay{padding:0!important;background:#0b141c!important}
.tradeChartModal{border:0!important;min-height:100vh!important;background:#111923!important;grid-template-rows:auto auto 1fr!important}
.tradeChartTopbar{min-height:56px;padding:10px 16px!important;background:#17232d!important}.tradeChartTopbar h2{font-size:22px!important}.tradeChartTopbar p{font-size:11px!important}
.tradeChartToolbar{padding:0 12px!important;min-height:46px;background:#101923!important;border-top:1px solid #22313d!important;align-items:stretch!important}
.tradeChartToolbarLeft{display:flex;align-items:center;gap:10px;min-width:0}.tradeChartIntervals{height:100%;align-items:stretch}.tradeChartIntervals button{min-width:42px;padding:0 10px!important;height:46px;font-weight:700}
.tradeChartTools{display:flex;align-items:center;gap:5px;border-left:1px solid #273642;padding-left:10px}.tradeChartTools button{border:1px solid transparent;background:transparent;color:#9aa9b5;border-radius:4px;padding:6px 9px;cursor:pointer;font-size:11px}.tradeChartTools button:hover,.tradeChartTools button[data-active="true"]{background:#1d2b36;border-color:#334755;color:#e2e8ec}
.tradeChartLegend{justify-content:flex-end;padding:6px 0}.tradeChartHistoryBadge{border:1px solid #2c414e;border-radius:4px;padding:4px 7px;color:#7f95a4!important;background:#13212a}
.tradeChartBody{background:#111923!important}.tradeChartCanvas{inset:0!important}.tradeChartState{z-index:6!important}
.tradeChartStatusStrip{position:absolute;left:12px;top:8px;z-index:5;display:flex;gap:8px;pointer-events:none}.tradeChartStatusStrip span{font-size:10px;color:#8da0ad;background:rgba(15,26,35,.84);border:1px solid #2b3b47;border-radius:3px;padding:4px 6px}
@media(max-width:900px){.tradeChartToolbar{height:auto;padding:4px 8px!important;flex-direction:column!important}.tradeChartToolbarLeft{width:100%;overflow-x:auto}.tradeChartTools{padding-left:6px}.tradeChartLegend{width:100%;justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap!important}.tradeChartIntervals button{height:38px}.tradeChartModal{grid-template-rows:auto auto 1fr!important}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Embedded TP/SL/DCA/Buy/MP in mapped DCA price bar and prepared advanced trade chart styling.');
