import fs from "node:fs";
import path from "node:path";

const shellPath=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
const configuratorPath=path.join(process.cwd(),"app","trader","TradingViewStrategyConfigurator.tsx");
if(!fs.existsSync(shellPath)||!fs.existsSync(configuratorPath))throw new Error("TradingView Strategy copy-polish target missing");
let source=fs.readFileSync(shellPath,"utf8");
let configurator=fs.readFileSync(configuratorPath,"utf8");

const oldConfirm='    if (!currentAccount || busy || !window.confirm(`Close ${bot.name}? Its automation and position history will remain available.`)) return;';
const newConfirm='    const isTradingViewStrategy=bot.automationType === "tradingview_strategy";\n    const closeMessage=isTradingViewStrategy ? `Archive ${bot.name}? Its position history will remain available.` : `Close ${bot.name}? Its automation and position history will remain available.`;\n    if (!currentAccount || busy || !window.confirm(closeMessage)) return;';
if(!source.includes(oldConfirm))throw new Error("TradingView Strategy archive-copy could not find shared close confirmation");
source=source.replace(oldConfirm,newConfirm);

const oldNotice='      setWorkspace(result); setBotModalMode(null); setSelectedBotId(null); setNotice(`${bot.name} moved to Closed bots.`);';
const newNotice='      setWorkspace(result); setBotModalMode(null); setTvStrategyMode(null); setSelectedBotId(null); setNotice(isTradingViewStrategy ? `${bot.name} archived.` : `${bot.name} moved to Archived.`);';
if(!source.includes(oldNotice))throw new Error("TradingView Strategy archive-copy could not find shared close notice");
source=source.replace(oldNotice,newNotice);

const copyReplacements=[
  ["TradingView order contracts determine the requested base-asset quantity.","TradingView contracts and strategy order price determine the requested USDT order size."],
  ["Uses strategy.order.contracts as the requested base-asset quantity.","Uses strategy.order.contracts × strategy.order.price to derive the requested USDT order size."],
  ["Open TradingView strategy quantity","Open TradingView strategy size"],
];
for(const[from,to]of copyReplacements){if(!configurator.includes(from))throw new Error(`TradingView Strategy sizing copy missing: ${from}`);configurator=configurator.replace(from,to)}

for(const marker of['Archive ${bot.name}? Its position history will remain available.','setTvStrategyMode(null)','`${bot.name} archived.`'])if(!source.includes(marker))throw new Error(`TradingView Strategy archive-copy missing ${marker}`);
for(const marker of["contracts and strategy order price determine the requested USDT order size","strategy.order.contracts × strategy.order.price","Open TradingView strategy size"])if(!configurator.includes(marker))throw new Error(`TradingView Strategy sizing copy missing ${marker}`);
fs.writeFileSync(shellPath,source);
fs.writeFileSync(configuratorPath,configurator);
console.log("Polished TradingView Strategy archive and dynamic-sizing copy; trading behavior unchanged.");
