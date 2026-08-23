import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Active trades: keep percentage/current price on the live-price endpoint, not as loose text above the bar.
const activePnlPrefix = '<td><strong className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</strong><small className={pnl >= 0 ? styles.greenText : styles.redText}>{pct(pnlPct)}</small>{mode === "Active" && (() => {';
const activePnlReplacement = '<td>{mode === "Closed" && <><strong className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</strong><small className={pnl >= 0 ? styles.greenText : styles.redText}>{pct(pnlPct)}</small></>}{mode === "Active" && (() => {';
source = source.replace(activePnlPrefix, activePnlReplacement);

// Move active-trade USDT PnL under invested amount and base-asset quantity, as in 3Commas.
const volumeCell = '<td><span>{compactMoney(trade.invested)}</span><small>{trade.quantity.toFixed(8)} {symbol}</small></td>';
const volumeCellReplacement = '<td><span>{compactMoney(trade.invested)}</span><small>{trade.quantity.toFixed(8)} {symbol}</small>{mode === "Active" && <small className={pnl >= 0 ? styles.dealVolumePnlWin : styles.dealVolumePnlLoss}>{compactMoney(pnl)}</small>}</td>';
source = source.replace(volumeCell, volumeCellReplacement);

// Rebuild the active price bar to match 3Commas:
// - the full scale is neutral/white
// - ONLY the interval between Average Buy and Current Market Price is colored
// - loss => that interval is red
// - profit => that interval is green
// - current market price remains the outer endpoint of the scale in the direction of PnL.
const barStartToken = 'const mappedLevels = [current, trade.averagePrice, tpLevel, slLevel, nextDcaLevel]';
const barStart = source.indexOf(barStartToken);
const barEndToken = '})()}</td>';
const barEnd = barStart >= 0 ? source.indexOf(barEndToken, barStart) : -1;
if (barStart >= 0 && barEnd > barStart) {
  const block = [
    'const tradeIsWinning = current >= trade.averagePrice;',
    '  const mappedLevels = [trade.averagePrice, tpLevel, slLevel, nextDcaLevel].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);',
    '  const otherLow = Math.min(current, ...mappedLevels);',
    '  const otherHigh = Math.max(current, ...mappedLevels);',
    '  let barMin = tradeIsWinning ? otherLow : current;',
    '  let barMax = tradeIsWinning ? current : otherHigh;',
    '  if (!(barMax > barMin)) {',
    '    const pad = Math.max(Math.abs(current) * 0.01, 0.00000001);',
    '    barMin = current - pad;',
    '    barMax = current + pad;',
    '  }',
    '  const markerPct = (value: number) => Math.min(100, Math.max(0, ((value - barMin) / Math.max(barMax - barMin, 0.00000001)) * 100));',
    '  const markerLeft = (value: number) => String(markerPct(value)) + "%";',
    '  const currentPct = tradeIsWinning ? 100 : 0;',
    '  const buyPct = markerPct(trade.averagePrice);',
    '  const pnlSegmentLeft = Math.min(currentPct, buyPct);',
    '  const pnlSegmentWidth = Math.abs(currentPct - buyPct);',
    '  const currentLeft = String(currentPct) + "%";',
    '  return <div className={styles.dealTradeSnapshot}>',
    '    <div className={styles.dealPriceBar + " " + styles.dealPriceBar3c}>',
    '      <div className={styles.dealPriceTrack + " " + styles.dealPriceTrackNeutral}>',
    '        <i className={tradeIsWinning ? styles.dealPnlSegment + " " + styles.dealPnlSegmentWin : styles.dealPnlSegment + " " + styles.dealPnlSegmentLoss} style={{ left: String(pnlSegmentLeft) + "%", width: String(pnlSegmentWidth) + "%" }}/>',
    '      </div>',
    '      <span className={styles.dealCurrentEndpoint + " " + (tradeIsWinning ? styles.dealCurrentWin : styles.dealCurrentLoss)} style={{ left: currentLeft }}><b>{pct(pnlPct)}</b><em>{money(current)}</em></span>',
    '      <span className={styles.dealBarMarker + " " + styles.dealBuyMarker} style={{ left: markerLeft(trade.averagePrice) }}><b>Buy</b>{money(trade.averagePrice)}</span>',
    '      {nextDcaLevel ? <span className={styles.dealBarMarker + " " + styles.dealDcaMarker} style={{ left: markerLeft(nextDcaLevel) }}><b>DCA</b>{money(nextDcaLevel)}</span> : null}',
    '      {tpLevel ? <span className={styles.dealBarMarker + " " + styles.dealTpMarker} style={{ left: markerLeft(tpLevel) }}><b>TP</b>{money(tpLevel)}</span> : null}',
    '      {slLevel ? <span className={styles.dealBarMarker + " " + styles.dealSlMarker} style={{ left: markerLeft(slLevel) }}><b>SL</b>{money(slLevel)}</span> : null}',
    '    </div>',
    '  </div>;',
  ].join("\n");
  source = source.slice(0, barStart) + block + source.slice(barEnd);
}

if (!source.includes('className={styles.dealCurrentEndpoint')) throw new Error('3Commas current-price endpoint marker was not inserted.');
if (!source.includes('styles.dealPnlSegmentLoss')) throw new Error('3Commas Buy-to-current PnL segment was not inserted.');
if (!source.includes('styles.dealVolumePnlLoss')) throw new Error('Active DCA PnL was not moved under Volume.');

if (!css.includes('/* DCA 3Commas endpoint bar v3 */')) {
  css += `
/* DCA 3Commas endpoint bar v3 */
.dealTradeSnapshot{min-width:420px;margin-top:0!important;padding-top:24px!important;padding-bottom:31px!important}
.dealPriceBar3c{height:34px!important;position:relative}
.dealPriceBar3c .dealPriceTrack{left:0!important;right:0!important;top:12px!important;height:8px!important;border-radius:0;overflow:hidden!important;background:#dce4e8!important}
.dealPriceBar3c .dealPriceTrackNeutral{background:#dce4e8!important}
.dealPriceBar3c .dealPnlSegment{position:absolute!important;top:0!important;bottom:0!important;display:block!important;z-index:2!important}
.dealPriceBar3c .dealPnlSegmentLoss{background:#f06780!important}
.dealPriceBar3c .dealPnlSegmentWin{background:#19b69f!important}
.dealPriceBar3c .dealPriceTrackWin,.dealPriceBar3c .dealPriceTrackLoss{background:#dce4e8!important}
.dealCurrentEndpoint{position:absolute;z-index:6;top:-13px;display:flex;align-items:center;gap:5px;white-space:nowrap;font-size:10px;line-height:1;color:#dbe4e9}
.dealCurrentEndpoint b{font-size:11px;font-weight:900}.dealCurrentEndpoint em{font-style:normal;color:#aebac3;font-size:10px;font-weight:650}
.dealCurrentEndpoint:after{content:"";position:absolute;top:14px;width:1px;height:15px;background:currentColor;opacity:.95}
.dealCurrentLoss{transform:none;color:#ff667d}.dealCurrentLoss:after{left:0}
.dealCurrentWin{transform:translateX(-100%);color:#18c8aa}.dealCurrentWin:after{right:0}
.dealPriceBar3c .dealBarMarker{font-size:9px;line-height:1;transform:translateX(-50%)}
.dealPriceBar3c .dealBuyMarker{top:25px;color:#c8d1d7}.dealPriceBar3c .dealBuyMarker:after{bottom:10px;top:auto;height:12px}
.dealPriceBar3c .dealTpMarker{top:38px;color:#22cbae}.dealPriceBar3c .dealTpMarker:after{bottom:10px;top:auto;height:25px}
.dealPriceBar3c .dealSlMarker{top:38px;color:#ff6b83}.dealPriceBar3c .dealSlMarker:after{bottom:10px;top:auto;height:25px}
.dealPriceBar3c .dealDcaMarker{top:38px;color:#55adf5}.dealPriceBar3c .dealDcaMarker:after{bottom:10px;top:auto;height:25px}
.dealVolumePnlWin,.dealVolumePnlLoss{display:block!important;margin-top:4px!important;font-size:12px!important;font-weight:750!important}
.dealVolumePnlWin{color:#19c9ad!important}.dealVolumePnlLoss{color:#ff667d!important}
@media(max-width:1180px){.dealTradeSnapshot{min-width:360px}.dealCurrentEndpoint b{font-size:10px}.dealCurrentEndpoint em{font-size:9px}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Matched 3Commas DCA bar: neutral track with only Buy-to-current interval colored.');
