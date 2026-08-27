import fs from "node:fs";
import path from "node:path";

const shellPath=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
if(!fs.existsSync(shellPath))throw new Error("TradingView Strategy archive-copy target missing");
let source=fs.readFileSync(shellPath,"utf8");

const oldConfirm='    if (!currentAccount || busy || !window.confirm(`Close ${bot.name}? Its automation and position history will remain available.`)) return;';
const newConfirm='    const isTradingViewStrategy=bot.automationType === "tradingview_strategy";\n    const closeMessage=isTradingViewStrategy ? `Archive ${bot.name}? Its position history will remain available.` : `Close ${bot.name}? Its automation and position history will remain available.`;\n    if (!currentAccount || busy || !window.confirm(closeMessage)) return;';
if(!source.includes(oldConfirm))throw new Error("TradingView Strategy archive-copy could not find shared close confirmation");
source=source.replace(oldConfirm,newConfirm);

const oldNotice='      setWorkspace(result); setBotModalMode(null); setSelectedBotId(null); setNotice(`${bot.name} moved to Closed bots.`);';
const newNotice='      setWorkspace(result); setBotModalMode(null); setTvStrategyMode(null); setSelectedBotId(null); setNotice(isTradingViewStrategy ? `${bot.name} archived.` : `${bot.name} moved to Archived.`);';
if(!source.includes(oldNotice))throw new Error("TradingView Strategy archive-copy could not find shared close notice");
source=source.replace(oldNotice,newNotice);

for(const marker of['Archive ${bot.name}? Its position history will remain available.','setTvStrategyMode(null)','`${bot.name} archived.`'])if(!source.includes(marker))throw new Error(`TradingView Strategy archive-copy missing ${marker}`);
fs.writeFileSync(shellPath,source);
console.log("Polished TradingView Strategy Archive confirmation and completion copy; trading behavior unchanged.");
