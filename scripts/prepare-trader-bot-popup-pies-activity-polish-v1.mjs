import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
const activityCssPath = path.join(process.cwd(), "app", "trader", "pnl-activity-chart.module.css");
for (const target of [shellPath, activityCssPath]) if (!fs.existsSync(target)) throw new Error(`Bot popup polish target missing: ${target}`);

let shell = fs.readFileSync(shellPath, "utf8");
if (!shell.includes('import AutomationBotInsightPies from "./AutomationBotInsightPies";')) {
  const importAnchor = 'import CoinLogo from "./CoinLogo";';
  if (!shell.includes(importAnchor)) throw new Error("Bot popup pies import anchor missing");
  shell = shell.replace(importAnchor, `${importAnchor}\nimport AutomationBotInsightPies from "./AutomationBotInsightPies";`);
}

if (!shell.includes('<AutomationBotInsightPies accountId={currentAccount.id} botId={bot.id} />')) {
  const functionAnchor = '  const renderBotReadOnly = (bot: Bot) => <div className={dca.detailBody}>';
  const functionAt = shell.indexOf(functionAnchor);
  if (functionAt < 0) throw new Error("Bot popup read-only function anchor missing");
  const settingsAnchor = '    <div className={dca.settingsGrid}>';
  const settingsAt = shell.indexOf(settingsAnchor, functionAt);
  if (settingsAt < 0) throw new Error("Bot popup settings grid anchor missing");
  shell = shell.slice(0, settingsAt) + '    <AutomationBotInsightPies accountId={currentAccount.id} botId={bot.id} />\n' + shell.slice(settingsAt);
}

if (shell.includes('<small>ADVANCED ANALYTICS</small>') || shell.includes('Risk, efficiency & behavioral edge')) {
  throw new Error("Redundant Advanced Analytics suite heading should already be removed before bot popup polish");
}

fs.writeFileSync(shellPath, shell);

let css = fs.readFileSync(activityCssPath, "utf8");
if (!css.includes("PNL_ACTIVITY_TRADE_POLISH_V1")) {
  css += `\n/* PNL_ACTIVITY_TRADE_POLISH_V1 */\n.tradeToggle{border:0!important;background:transparent!important;box-shadow:none!important;padding:0 3px!important;height:29px;color:#717171!important}.tradeToggle:hover{color:#929292!important}.tradeToggleOn{border-color:transparent!important;background:transparent!important;color:#7b7b7b!important}.tradeToggle i{background:#3d3d3d!important}.tradeToggle i:after{background:#7a7a7a!important}.tradeToggleOn i{background:#555!important}.tradeToggleOn i:after{background:#aaa!important}.activityLine{stroke:#777!important;stroke-width:1.35!important;opacity:.42!important}.activityDot{fill:#888!important;opacity:.48!important}.tradeTick{fill:#696969!important;opacity:.72}.tradeAxisTitle{fill:#696969!important;opacity:.78}.tradeLegend{color:#686868!important}.lineKey{background:#777!important;opacity:.55}\n`;
}
fs.writeFileSync(activityCssPath, css);

for (const marker of [
  'import AutomationBotInsightPies from "./AutomationBotInsightPies";',
  '<AutomationBotInsightPies accountId={currentAccount.id} botId={bot.id} />',
]) if (!shell.includes(marker)) throw new Error(`Bot popup polish output missing ${marker}`);
if (!css.includes("PNL_ACTIVITY_TRADE_POLISH_V1")) throw new Error("PnL Activity trade-count polish CSS missing");

console.log("Added bot popup Outcome/Exit pies and softened the optional trade-count overlay.");
