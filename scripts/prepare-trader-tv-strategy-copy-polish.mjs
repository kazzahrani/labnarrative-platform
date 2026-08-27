import fs from "node:fs";
import path from "node:path";

const shellPath=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
const configuratorPath=path.join(process.cwd(),"app","trader","TradingViewStrategyConfigurator.tsx");
if(!fs.existsSync(shellPath)||!fs.existsSync(configuratorPath))throw new Error("TradingView Strategy copy-polish target missing");
let source=fs.readFileSync(shellPath,"utf8");
const configurator=fs.readFileSync(configuratorPath,"utf8");

const oldConfirm='    if (!currentAccount || busy || !window.confirm(`Close ${bot.name}? Its automation and position history will remain available.`)) return;';
const newConfirm='    const isTradingViewStrategy=bot.automationType === "tradingview_strategy";\n    const closeMessage=isTradingViewStrategy ? `Archive ${bot.name}? Its position history will remain available.` : `Close ${bot.name}? Its automation and position history will remain available.`;\n    if (!currentAccount || busy || !window.confirm(closeMessage)) return;';
if(!source.includes(oldConfirm))throw new Error("TradingView Strategy archive-copy could not find shared close confirmation");
source=source.replace(oldConfirm,newConfirm);

const oldNotice='      setWorkspace(result); setBotModalMode(null); setSelectedBotId(null); setNotice(`${bot.name} moved to Closed bots.`);';
const newNotice='      setWorkspace(result); setBotModalMode(null); setTvStrategyMode(null); setSelectedBotId(null); setNotice(isTradingViewStrategy ? `${bot.name} archived.` : `${bot.name} moved to Archived.`);';
if(!source.includes(oldNotice))throw new Error("TradingView Strategy archive-copy could not find shared close notice");
source=source.replace(oldNotice,newNotice);

const oldTvModal='{tvStrategyMode && currentAccount && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setTvStrategyMode(null); }}><section className={styles.modal}>';
const newTvModal='{tvStrategyMode && currentAccount && <div className={styles.backdrop} style={{padding:12,overflow:"hidden"}} onMouseDown={(event) => { if (event.target === event.currentTarget) setTvStrategyMode(null); }}><section className={styles.modal} style={{maxHeight:"calc(100dvh - 24px)",overflowY:"auto",overscrollBehavior:"contain"}}>';
if(!source.includes(oldTvModal))throw new Error("TradingView Strategy viewport guard could not find strategy modal");
source=source.replace(oldTvModal,newTvModal);

for(const marker of['Archive ${bot.name}? Its position history will remain available.','setTvStrategyMode(null)','`${bot.name} archived.`','maxHeight:"calc(100dvh - 24px)"','overflowY:"auto"'])if(!source.includes(marker))throw new Error(`TradingView Strategy final shell missing ${marker}`);
for(const marker of["One Strategy Message","Exit Protection","Copy message"])if(!configurator.includes(marker))throw new Error(`TradingView Strategy final copy missing ${marker}`);
fs.writeFileSync(shellPath,source);
console.log("Polished TradingView Strategy archive copy, verified compact UI, and constrained the modal to a scrollable viewport-safe height.");
