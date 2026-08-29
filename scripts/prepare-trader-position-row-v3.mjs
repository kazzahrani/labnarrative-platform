import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const shellPath=path.join(root,"app","trader","TraderV2FullShell.tsx");
const dcaCssPath=path.join(root,"app","trader","trader-dca-v2.module.css");
const actionsPath=path.join(root,"app","trader","TradeActionsV2.tsx");
const actionsCssPath=path.join(root,"app","trader","trade-actions-v2.module.css");
for(const file of [shellPath,dcaCssPath,actionsPath,actionsCssPath])if(!fs.existsSync(file))throw new Error(`Position row target missing: ${file}`);

let shell=fs.readFileSync(shellPath,"utf8");
let dcaCss=fs.readFileSync(dcaCssPath,"utf8");
let actions=fs.readFileSync(actionsPath,"utf8");
let actionsCss=fs.readFileSync(actionsCssPath,"utf8");
let changes=0;

if(shell.includes('import TradeLevelBar from "./TradeLevelBar";')){
  shell=shell.replace('import TradeLevelBar from "./TradeLevelBar";','import TradePriceTrace from "./TradePriceTrace";');changes++;
}
const oldTrace='<TradeLevelBar accountId={currentAccount.id} tradeId={trade.id} averagePrice={trade.averagePrice} livePrice={tradeState === "Active" ? trade.lastPrice : trade.exitPrice} stopLossPrice={trade.stopLossPrice} takeProfitPrice={trade.takeProfitPrice} active={tradeState === "Active"}/>';
const newTrace='<TradePriceTrace accountId={currentAccount.id} tradeId={trade.id} pair={trade.pair} averagePrice={trade.averagePrice} livePrice={tradeState === "Active" ? trade.lastPrice : trade.exitPrice} stopLossPrice={trade.stopLossPrice} takeProfitPrice={trade.takeProfitPrice} openedAt={trade.openedAt} closedAt={trade.closedAt} active={tradeState === "Active"}/>';
if(shell.includes(oldTrace)){shell=shell.replace(oldTrace,newTrace);changes++;}
if(!shell.includes('TradePriceTrace'))throw new Error("Position price trace was not routed into the final shell");

const investedOld='<div className={dca.tradeValue}><span>Invested</span><b>{money(trade.invested)}</b></div>';
const investedNew='<div className={`${dca.tradeValue} ${dca.investedValue}`}><span>Invested</span><b>{money(trade.invested)}</b></div>';
if(shell.includes(investedOld)){shell=shell.replace(investedOld,investedNew);changes++;}
const pnlOld='<div className={dca.tradeValue}><span>PnL</span><b className={trade.pnl >= 0 ? dca.green : dca.red}><TradePnlValue tradeId={trade.id} pnl={trade.pnl} active={tradeState === "Active"}/></b></div>';
const pnlNew='<div className={`${dca.tradeValue} ${dca.pnlValue}`}><span>PnL</span><b className={trade.pnl >= 0 ? dca.green : dca.red}><TradePnlValue tradeId={trade.id} pnl={trade.pnl} active={tradeState === "Active"}/></b></div>';
if(shell.includes(pnlOld)){shell=shell.replace(pnlOld,pnlNew);changes++;}

// Match the muted semantic colors used by the platform's existing analytics bars.
const colorPairs=[
  ['{ label: "Deployed", value: openInvested, color: "#2ee88f" }','{ label: "Deployed", value: openInvested, color: "#6CB38C" }'],
  ['{ label: "In profit", value: liveWins, color: "#2ee88f" }','{ label: "In profit", value: liveWins, color: "#6CB38C" }'],
  ['{ label: "In loss", value: liveLosses, color: "#ff6f7d" }','{ label: "In loss", value: liveLosses, color: "#B26F74" }'],
  ['{ label: "Winners", value: closedWins, color: "#2ee88f" }','{ label: "Winners", value: closedWins, color: "#6CB38C" }'],
  ['{ label: "Losers", value: closedLosses, color: "#ff6f7d" }','{ label: "Losers", value: closedLosses, color: "#B26F74" }'],
  ['"Take Profit": "#2ee88f"','"Take Profit": "#6CB38C"'],
  ['"Stop Loss": "#ff6f7d"','"Stop Loss": "#B26F74"'],
];
for(const [from,to] of colorPairs)if(shell.includes(from)){shell=shell.replaceAll(from,to);changes++;}

const cancelHandlerMarker='POSITION_ROW_CANCEL_ACTION_V3';
if(!actions.includes(cancelHandlerMarker)){
  const anchor='\n  return <>\n';
  if(!actions.includes(anchor))throw new Error("Could not find TradeActions return anchor");
  const handler=`\n  // ${cancelHandlerMarker}\n  const cancel = async (event: React.MouseEvent) => {\n    event.stopPropagation();\n    if (accountMode !== "live") return;\n    const question = \`Cancel \${trade.pair} without selling? Outstanding trade orders will be cancelled, automation will stop managing this position, and the purchased coins will remain in your Binance Spot wallet.\`;\n    if (busy || !window.confirm(question)) return;\n    setBusy(true); setError("");\n    try {\n      await invokeFunction("trader-live-cancel-control", { accountId, tradeId: trade.id });\n      await onChanged();\n    } catch (caught) {\n      window.alert(errorText(caught instanceof Error ? caught.message : "Unable to cancel trade."));\n    } finally { setBusy(false); }\n  };\n`;
  actions=actions.replace(anchor,handler+anchor);changes++;
}
const oldActions='<div className={styles.actions} onClick={(event) => event.stopPropagation()}>\n      <button disabled={busy} onClick={(event) => { event.stopPropagation(); setError(""); setAmount(accountMode === "live" ? 10 : 25); setMode("add"); }}>Add funds</button>\n      <button disabled={busy} onClick={openEdit}>Edit trade</button>\n      <button className={styles.closeTrade} disabled={busy} onClick={close}>Close trade</button>\n    </div>';
const newActions='<div className={styles.actions} onClick={(event) => event.stopPropagation()}>\n      <button className={styles.iconAction} data-tip="Add funds" aria-label="Add funds" disabled={busy} onClick={(event) => { event.stopPropagation(); setError(""); setAmount(accountMode === "live" ? 10 : 25); setMode("add"); }}><span>＋</span></button>\n      <button className={styles.iconAction} data-tip="Edit trade" aria-label="Edit trade" disabled={busy} onClick={openEdit}><span>✎</span></button>\n      <button className={`${styles.iconAction} ${styles.closeTrade}`} data-tip="Close trade" aria-label="Close trade" disabled={busy} onClick={close}><span>×</span></button>\n      <button className={`${styles.iconAction} ${styles.cancelTrade}`} data-tip={accountMode === "live" ? "Cancel trade" : "Cancel trade · Live only"} aria-label="Cancel trade" disabled={busy || accountMode !== "live"} onClick={cancel}><span>⊘</span></button>\n    </div>';
if(actions.includes(oldActions)){actions=actions.replace(oldActions,newActions);changes++;}
if(!actions.includes('data-tip="Add funds"'))throw new Error("Position icon actions were not prepared");

const cssMarker='/* position-row-v3 */';
if(!dcaCss.includes(cssMarker))dcaCss+=`\n${cssMarker}\n.tradeCard{height:154px!important;min-height:154px!important;padding:9px 13px 8px!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important}.tradeTop{grid-template-columns:minmax(205px,.9fr) minmax(340px,1.62fr) minmax(78px,.38fr) minmax(132px,.58fr) auto!important;gap:12px!important;align-items:center!important;min-height:118px!important}.tradeIdentity strong{font-size:12px!important}.tradeIdentity small{font-size:8px!important;color:#727272!important}.investedValue span,.pnlValue span{font-size:7px!important;color:#666!important;font-weight:400!important}.investedValue b{font-size:9px!important;font-weight:400!important;color:#7d7d7d!important}.pnlValue>b{font-weight:400!important}.tradeTable .green,.positionInsightGrid .green{color:#6CB38C!important}.tradeTable .red,.positionInsightGrid .red{color:#B26F74!important}.tradeMeta{min-height:20px!important;padding-top:5px!important}.positionTrendPositive{background:#6CB38C!important}.positionTrendNegative{background:#B26F74!important}@media(max-width:1180px){.tradeTop{grid-template-columns:minmax(180px,.86fr) minmax(280px,1.45fr) minmax(72px,.36fr) minmax(122px,.56fr) auto!important}}@media(max-width:900px){.tradeCard{height:auto!important;min-height:150px!important}.tradeTop{grid-template-columns:minmax(165px,1fr) minmax(240px,1.35fr) minmax(118px,.58fr) auto!important}.investedValue{display:none!important}}@media(max-width:760px){.tradeTop{grid-template-columns:1fr auto!important}.tradeTop>div:nth-child(2){grid-column:1/-1}.investedValue,.pnlValue{display:grid!important}.tradeCard{height:auto!important}}\n`;

const actionCssMarker='/* position-icon-actions-v3 */';
if(!actionsCss.includes(actionCssMarker))actionsCss+=`\n${actionCssMarker}\n.actions{display:flex;align-items:center;justify-content:flex-end;gap:5px;min-width:127px;margin-left:auto}.actions .iconAction{position:relative;width:27px;height:27px;min-width:27px;padding:0;border:1px solid #383838;background:#242424;color:#8c8c8c;border-radius:8px;display:grid;place-items:center;font:400 13px/1 Tahoma,Arial,sans-serif;cursor:pointer}.actions .iconAction>span{display:block;transform:translateY(-.3px)}.actions .iconAction:hover:not(:disabled){background:#2b2b2b;color:#d6d6d6;border-color:#484848}.actions .closeTrade:hover:not(:disabled),.actions .cancelTrade:hover:not(:disabled){color:#B26F74;border-color:rgba(178,111,116,.52)}.actions .iconAction:disabled{opacity:.28;cursor:not-allowed}.actions .iconAction:before{content:attr(data-tip);position:absolute;right:0;bottom:calc(100% + 7px);padding:5px 7px;border-radius:7px;background:#111;color:#d3d3d3;border:1px solid #333;font:400 8px Tahoma,Arial,sans-serif;white-space:nowrap;opacity:0;pointer-events:none;transform:translateY(2px);transition:opacity .14s ease,transform .14s ease;z-index:15}.actions .iconAction:hover:before{opacity:1;transform:translateY(0)}\n`;

fs.writeFileSync(shellPath,shell);
fs.writeFileSync(dcaCssPath,dcaCss);
fs.writeFileSync(actionsPath,actions);
fs.writeFileSync(actionsCssPath,actionsCss);
console.log(`Prepared distinct Positions price traces and compact icon actions (${changes} changes).`);
