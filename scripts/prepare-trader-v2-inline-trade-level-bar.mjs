import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app/trader/TraderV2FullShell.tsx");
const cssPath = path.join(root, "app/trader/trader-dca-v2.module.css");

let shell = fs.readFileSync(shellPath, "utf8");

const chartImport = shell.match(/import DcaTradeChart from "\.\/DcaTradeChart(?:V2Workstation)?";/)?.[0];
if (!chartImport) throw new Error("Could not find DCA chart import for trade-row preparation");
const extraImports = [
  'import TradeLevelBar from "./TradeLevelBar";',
  'import TradeActionsV2 from "./TradeActionsV2";',
  'import TradeRowMetaV2 from "./TradeRowMetaV2";',
];
for (const item of extraImports) {
  if (!shell.includes(item)) shell = shell.replace(chartImport, `${chartImport}\n${item}`);
}

shell = shell.replace('rows.map((trade) => { const bar = liveBarPosition(trade); return', 'rows.map((trade) => { return');

const tradesAnchor = shell.indexOf('const tradesPage = (tradeState: "Active" | "Closed") =>');
if (tradesAnchor < 0) throw new Error("Could not find V2 trades page");
const topStart = shell.indexOf('<div className={dca.tradeTop}>', tradesAnchor);
const chartButtonEnd = shell.indexOf('>TV Chart</button>', topStart);
if (topStart < 0 || chartButtonEnd < 0) throw new Error("Could not find legacy V2 trade top row");
const topEnd = shell.indexOf('</div>', chartButtonEnd) + '</div>'.length;
const replacementTop = `<div className={dca.tradeTop}><div className={dca.tradeIdentity}><strong>{trade.pair}</strong><small>{trade.botName} · {trade.executionMode}</small></div><TradeLevelBar accountId={currentAccount.id} tradeId={trade.id} averagePrice={trade.averagePrice} livePrice={tradeState === "Active" ? trade.lastPrice : trade.exitPrice} stopLossPrice={trade.stopLossPrice} takeProfitPrice={trade.takeProfitPrice} active={tradeState === "Active"}/><div className={dca.tradeValue}><span>Invested</span><b>{money(trade.invested)}</b></div><div className={dca.tradeValue}><span>PnL</span><b className={trade.pnl >= 0 ? dca.green : dca.red}>{money(trade.pnl)} · {pct(trade.pnlPct)}</b></div><TradeActionsV2 accountId={currentAccount.id} accountMode={currentAccount.mode} trade={trade} onChanged={() => loadWorkspace(true)}/></div>`;
shell = shell.slice(0, topStart) + replacementTop + shell.slice(topEnd);

const liveStart = shell.indexOf('{tradeState === "Active" && <div className={dca.liveStrip}>', topStart);
if (liveStart >= 0) {
  const metaStartAfterLive = shell.indexOf('<div className={dca.tradeMeta}>', liveStart);
  if (metaStartAfterLive < 0) throw new Error("Could not find trade meta after legacy live strip");
  shell = shell.slice(0, liveStart) + shell.slice(metaStartAfterLive);
}

const metaStart = shell.indexOf('<div className={dca.tradeMeta}>', topStart);
const articleEnd = shell.indexOf('</article>', metaStart);
if (metaStart < 0 || articleEnd < 0) throw new Error("Could not find legacy trade metadata");
const metaEnd = shell.lastIndexOf('</div>', articleEnd);
if (metaEnd < metaStart) throw new Error("Could not determine trade metadata end");
const replacementMeta = `<TradeRowMetaV2 tradeId={trade.id} averagingFilled={trade.averagingFilled} activeOrdersLimit={trade.activeOrdersLimit} maxAveraging={trade.maxAveraging} openedAt={trade.openedAt} closedAt={trade.closedAt} active={tradeState === "Active"}/>`;
shell = shell.slice(0, metaStart) + replacementMeta + shell.slice(metaEnd + '</div>'.length);

fs.writeFileSync(shellPath, shell);

let css = fs.readFileSync(cssPath, "utf8");
const marker = "/* trader-v2-inline-exact-level-bar-v2 */";
if (!css.includes(marker)) {
  css += `\n${marker}\n.tradeTop{grid-template-columns:minmax(185px,1.15fr) minmax(190px,.9fr) minmax(72px,.42fr) minmax(100px,.58fr) auto!important;gap:10px!important;align-items:center!important}.tradeCard{padding:10px 13px 9px!important}.tradeIdentity{min-width:0}.tradeIdentity strong,.tradeIdentity small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tradeValue{min-width:0}.tradeValue b{white-space:nowrap}.chartButton{display:none!important}@media(max-width:1180px){.tradeTop{grid-template-columns:minmax(170px,1fr) minmax(160px,.8fr) minmax(70px,.4fr) minmax(90px,.52fr) auto!important}}@media(max-width:900px){.tradeTop{grid-template-columns:minmax(160px,1fr) minmax(150px,.9fr) minmax(85px,.55fr) auto!important}.tradeTop>.tradeValue:nth-of-type(2){display:none!important}}@media(max-width:760px){.tradeTop{grid-template-columns:1fr auto!important}.tradeTop>.tradeValue{display:none!important}.tradeTop>div:nth-child(2){grid-column:1/-1}}\n`;
}
fs.writeFileSync(cssPath, css);
console.log("Trader V2 compact trade rows, exact levels, metadata and actions prepared");
