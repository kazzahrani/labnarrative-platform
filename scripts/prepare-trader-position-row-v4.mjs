import "./prepare-trader-exchange-aware-bots-v1.mjs";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const shellPath=path.join(root,"app","trader","TraderV2FullShell.tsx");
const dcaCssPath=path.join(root,"app","trader","trader-dca-v2.module.css");
const actionsCssPath=path.join(root,"app","trader","trade-actions-v2.module.css");
const metaCssPath=path.join(root,"app","trader","trade-row-meta-v2.module.css");
for(const file of [shellPath,dcaCssPath,actionsCssPath,metaCssPath])if(!fs.existsSync(file))throw new Error(`Position row V4 target missing: ${file}`);

let shell=fs.readFileSync(shellPath,"utf8");
let dcaCss=fs.readFileSync(dcaCssPath,"utf8");
let actionsCss=fs.readFileSync(actionsCssPath,"utf8");
let metaCss=fs.readFileSync(metaCssPath,"utf8");
let changes=0;

if(shell.includes('import TradePriceTrace from "./TradePriceTrace";')){
  shell=shell.replace('import TradePriceTrace from "./TradePriceTrace";','import PositionLevelStrip from "./PositionLevelStrip";');
  changes++;
}
if(shell.includes('import TradePnlValue from "./TradePnlValue";')){
  shell=shell.replace('import TradePnlValue from "./TradePnlValue";\n','');
  changes++;
}

const oldTrace='<TradePriceTrace accountId={currentAccount.id} tradeId={trade.id} pair={trade.pair} averagePrice={trade.averagePrice} livePrice={tradeState === "Active" ? trade.lastPrice : trade.exitPrice} stopLossPrice={trade.stopLossPrice} takeProfitPrice={trade.takeProfitPrice} openedAt={trade.openedAt} closedAt={trade.closedAt} active={tradeState === "Active"}/>';
const newTrace='<PositionLevelStrip averagePrice={trade.averagePrice} currentPrice={tradeState === "Active" ? trade.lastPrice : trade.exitPrice} stopLossPrice={trade.stopLossPrice} takeProfitPrice={trade.takeProfitPrice} nextAveragingPrice={trade.nextAveragingPrice} fills={trade.fills} pnl={trade.pnl} active={tradeState === "Active"}/>';
if(shell.includes(oldTrace)){shell=shell.replace(oldTrace,newTrace);changes++;}
if(!shell.includes('<PositionLevelStrip '))throw new Error("Fast Position level strip was not routed into final shell");

const oldPnl='<div className={`${dca.tradeValue} ${dca.pnlValue}`}><span>PnL</span><b className={trade.pnl >= 0 ? dca.green : dca.red}><TradePnlValue tradeId={trade.id} pnl={trade.pnl} active={tradeState === "Active"}/></b></div>';
const newPnl='<div className={`${dca.tradeValue} ${dca.pnlValue}`}><span>PnL</span><div className={dca.pnlNumbers}><small className={trade.pnl >= 0 ? dca.green : dca.red}>{money(trade.pnl)}</small><strong className={trade.pnl >= 0 ? dca.green : dca.red}>{pct(Number(trade.invested) > 0 ? Number(trade.pnl) / Number(trade.invested) * 100 : trade.pnlPct)}</strong></div></div>';
if(shell.includes(oldPnl)){shell=shell.replace(oldPnl,newPnl);changes++;}
if(!shell.includes('className={dca.pnlNumbers}'))throw new Error("Compact PnL hierarchy was not prepared");
if(!shell.includes('pnl={trade.pnl}'))throw new Error("Position level strip is not using authoritative trade PnL");

const cssMarker='/* position-row-v4-fast-map */';
if(!dcaCss.includes(cssMarker))dcaCss+=`\n${cssMarker}\n.tradeCard{height:104px!important;min-height:104px!important;padding:7px 12px 6px!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important}.tradeTop{grid-template-columns:minmax(190px,.95fr) minmax(235px,1.2fr) minmax(66px,.30fr) minmax(92px,.42fr) auto!important;gap:12px!important;align-items:center!important;min-height:58px!important}.tradeIdentity{align-self:center!important}.tradeIdentity strong{font-size:11.5px!important;line-height:1.15!important}.tradeIdentity small{font-size:7.5px!important;line-height:1.35!important;color:#707070!important}.investedValue span,.pnlValue span{font-size:6.5px!important;color:#656565!important;font-weight:400!important;letter-spacing:.02em!important}.investedValue b{font-size:8px!important;line-height:1.2!important;font-weight:400!important;color:#777!important}.pnlValue{display:grid!important;gap:2px!important}.pnlNumbers{display:grid!important;gap:0!important;align-items:start!important}.pnlNumbers small{font-size:7.5px!important;line-height:1.1!important;font-weight:400!important;opacity:.68!important}.pnlNumbers strong{font-size:13px!important;line-height:1.05!important;font-weight:800!important;letter-spacing:-.02em!important}.tradeTable .green,.positionInsightGrid .green{color:#6CB38C!important}.tradeTable .red,.positionInsightGrid .red{color:#B26F74!important}@media(max-width:1180px){.tradeTop{grid-template-columns:minmax(175px,.9fr) minmax(205px,1.12fr) minmax(62px,.28fr) minmax(86px,.40fr) auto!important;gap:9px!important}}@media(max-width:900px){.tradeCard{height:104px!important;min-height:104px!important}.tradeTop{grid-template-columns:minmax(160px,.9fr) minmax(190px,1.05fr) minmax(82px,.38fr) auto!important}.investedValue{display:none!important}}@media(max-width:760px){.tradeCard{height:auto!important;min-height:112px!important}.tradeTop{grid-template-columns:1fr auto!important;row-gap:6px!important}.tradeTop>div:nth-child(2){grid-column:1/-1}.investedValue,.pnlValue{display:grid!important}}\n`;

const actionMarker='/* position-icon-actions-v4 */';
if(!actionsCss.includes(actionMarker))actionsCss+=`\n${actionMarker}\n.actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important;min-width:100px!important;margin-left:auto!important}.actions .iconAction{width:22px!important;height:22px!important;min-width:22px!important;border-radius:7px!important;font-size:10px!important;padding:0!important}.actions .iconAction:before{bottom:calc(100% + 6px)!important;font-size:7.5px!important;padding:4px 6px!important}\n`;

const metaMarker='/* position-row-meta-v4 */';
if(!metaCss.includes(metaMarker))metaCss+=`\n${metaMarker}\n.meta{margin-top:4px!important;padding-top:5px!important;gap:10px!important;min-height:19px!important}.dcaLine,.tradeLine{gap:8px!important;font-size:7px!important;color:#626262!important}.dcaLine>span{color:#7a7a7a!important}.dcaLine b,.tradeLine b{color:#858585!important;font-weight:400!important}.tradeLine{margin-left:auto!important}@media(max-width:900px){.meta{flex-wrap:nowrap!important}.tradeLine{width:auto!important;margin-left:auto!important}}@media(max-width:760px){.meta{flex-wrap:wrap!important}.tradeLine{width:100%!important;margin-left:0!important}}\n`;

fs.writeFileSync(shellPath,shell);
fs.writeFileSync(dcaCssPath,dcaCss);
fs.writeFileSync(actionsCssPath,actionsCss);
fs.writeFileSync(metaCssPath,metaCss);
console.log(`Prepared fast aligned Positions rows with authoritative PnL outcomes (${changes} shell changes).`);
await import("./prepare-trader-position-protection-controls-v2.mjs");
