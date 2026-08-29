import fs from "node:fs";
import path from "node:path";

const traderDir = path.join(process.cwd(), "app", "trader");
const piesPath = path.join(traderDir, "AutomationBotInsightPies.tsx");
const piesCssPath = path.join(traderDir, "automation-bot-insight-pies.module.css");
const workspacePath = path.join(traderDir, "BotAnalyticsWorkspace.tsx");
const analyticsPath = path.join(traderDir, "Analytics.tsx");
const shellPath = path.join(traderDir, "TraderV2FullShell.tsx");

for (const target of [piesPath, piesCssPath, workspacePath, analyticsPath, shellPath]) {
  if (!fs.existsSync(target)) throw new Error(`Outcome Mix target missing: ${target}`);
}

let pies = fs.readFileSync(piesPath, "utf8");
if (!pies.includes("outcomeOnly?:boolean")) {
  pies = pies.replace('type Props={accountId:string;automationId:string;automationName:string};','type Props={accountId:string;automationId:string;automationName:string;outcomeOnly?:boolean};');
}
if (!pies.includes("function outcomeShare(")) {
  const helperAnchor = "function gradient(";
  if (!pies.includes(helperAnchor)) throw new Error("Outcome Mix pies gradient helper anchor missing");
  pies = pies.replace(helperAnchor, 'function outcomeShare(value:number,total:number){return total>0?(value/total*100).toFixed(1)+"%":"0.0%";}\nfunction gradient(');
}
pies = pies.replace("export default function AutomationBotInsightPies({accountId,automationId,automationName}:Props){","export default function AutomationBotInsightPies({accountId,automationId,automationName,outcomeOnly=false}:Props){");
pies = pies.replace('<div className={styles.grid}>','<div className={`${styles.grid} ${outcomeOnly?styles.outcomeOnly:""}`}>');
pies = pies.replace('<header><small>OUTCOME MIX</small><div><span>Win rate</span><strong>{percent(bot.winRate,1)}</strong></div></header>','<header><small>OUTCOME MIX</small></header>');
pies = pies.replace('<span>Wins</span><b>{bot.wins}</b>','<span>Wins</span><b>{outcomeShare(bot.wins,bot.closedTrades)}</b>');
pies = pies.replace('<span>Losses</span><b>{bot.losses}</b>','<span>Losses</span><b>{outcomeShare(bot.losses,bot.closedTrades)}</b>');
pies = pies.replace('<span>Breakeven</span><b>{bot.breakeven}</b>','<span>Breakeven</span><b>{outcomeShare(bot.breakeven,bot.closedTrades)}</b>');
for (const marker of ["outcomeOnly?:boolean","function outcomeShare(",'outcomeOnly?styles.outcomeOnly',"outcomeShare(bot.wins,bot.closedTrades)","outcomeShare(bot.losses,bot.closedTrades)","outcomeShare(bot.breakeven,bot.closedTrades)"]) if (!pies.includes(marker)) throw new Error(`Outcome Mix shared pies missing ${marker}`);
if (pies.includes("<span>Win rate</span><strong>{percent(bot.winRate,1)}</strong>")) throw new Error("Outcome Mix shared pies still show headline win rate");
fs.writeFileSync(piesPath, pies);

let piesCss = fs.readFileSync(piesCssPath, "utf8");
if (!piesCss.includes("OUTCOME_ONLY_POPUP_V1")) piesCss += '\n/* OUTCOME_ONLY_POPUP_V1 */\n.outcomeOnly{grid-template-columns:minmax(0,1fr)}\n.outcomeOnly>.card:nth-child(n+2){display:none}\n';
fs.writeFileSync(piesCssPath, piesCss);

let workspace = fs.readFileSync(workspacePath, "utf8");
const workspaceOutcomeAt = workspace.indexOf("<small>OUTCOME MIX</small>");
const workspaceExitAt = workspace.indexOf("<small>EXIT DISTRIBUTION</small>", workspaceOutcomeAt);
if (workspaceOutcomeAt < 0 || workspaceExitAt < 0) throw new Error("Bot workspace Outcome Mix block missing");
let workspaceOutcome = workspace.slice(workspaceOutcomeAt, workspaceExitAt);
workspaceOutcome = workspaceOutcome.replace("<strong>{pct(automation.winRate)}</strong>", "");
workspaceOutcome = workspaceOutcome.replace("<b>{count}</b></button>)}</div></div></article>",'<b>{automation.closedTrades ? (Number(count) / automation.closedTrades * 100).toFixed(1) + "%" : "0.0%"}</b></button>)}</div></div></article>');
workspace = workspace.slice(0, workspaceOutcomeAt) + workspaceOutcome + workspace.slice(workspaceExitAt);
if (workspaceOutcome.includes("<strong>{pct(automation.winRate)}</strong>")) throw new Error("Bot workspace Outcome Mix still shows headline win rate");
if (!workspaceOutcome.includes("Number(count) / automation.closedTrades * 100")) throw new Error("Bot workspace Outcome Mix percentages missing");
fs.writeFileSync(workspacePath, workspace);

let analytics = fs.readFileSync(analyticsPath, "utf8");
const analyticsOutcomeAt = analytics.indexOf("<small>OUTCOME MIX</small>");
const analyticsExitAt = analytics.indexOf("<small>EXIT DISTRIBUTION</small>", analyticsOutcomeAt);
if (analyticsOutcomeAt < 0 || analyticsExitAt < 0) throw new Error("Main Analytics Outcome Mix block missing");
let analyticsOutcome = analytics.slice(analyticsOutcomeAt, analyticsExitAt);
analyticsOutcome = analyticsOutcome.replace(/<strong>\{plainPct\(selectedWinRate\)\}<\/strong>/g, "");
analyticsOutcome = analyticsOutcome.replace("<span>Wins</span><b>{selectedWins}</b>",'<span>Wins</span><b>{selectedClosed ? (selectedWins / selectedClosed * 100).toFixed(1) + "%" : "0.0%"}</b>');
analyticsOutcome = analyticsOutcome.replace("<span>Losses</span><b>{selectedLosses}</b>",'<span>Losses</span><b>{selectedClosed ? (selectedLosses / selectedClosed * 100).toFixed(1) + "%" : "0.0%"}</b>');
analyticsOutcome = analyticsOutcome.replace("<span>Breakeven</span><b>{selectedBreakeven}</b>",'<span>Breakeven</span><b>{selectedClosed ? (selectedBreakeven / selectedClosed * 100).toFixed(1) + "%" : "0.0%"}</b>');
analytics = analytics.slice(0, analyticsOutcomeAt) + analyticsOutcome + analytics.slice(analyticsExitAt);
if (analyticsOutcome.includes("plainPct(selectedWinRate)")) throw new Error("Main Analytics Outcome Mix still shows headline win rate");
for (const marker of ["selectedWins / selectedClosed * 100","selectedLosses / selectedClosed * 100","selectedBreakeven / selectedClosed * 100"]) if (!analyticsOutcome.includes(marker)) throw new Error(`Main Analytics Outcome Mix missing ${marker}`);
fs.writeFileSync(analyticsPath, analytics);

let shell = fs.readFileSync(shellPath, "utf8");
const importLine = 'import AutomationBotInsightPies from "./AutomationBotInsightPies";';
if (!shell.includes(importLine)) {
  const importAnchor = 'import CoinLogo from "./CoinLogo";';
  if (!shell.includes(importAnchor)) throw new Error("DCA Outcome Mix popup import anchor missing");
  shell = shell.replace(importAnchor, `${importAnchor}\n${importLine}`);
}
const dcaPieMarker = 'data-dca-outcome-mix-v1="true"';
if (!shell.includes(dcaPieMarker)) {
  const readOnlyAt = shell.indexOf("  const renderBotReadOnly = (bot: Bot) =>");
  const editorAt = shell.indexOf("  const renderBotEditor", readOnlyAt);
  if (readOnlyAt < 0 || editorAt < 0) throw new Error("DCA read-only popup function boundaries missing");
  let readOnlyBlock = shell.slice(readOnlyAt, editorAt);
  const closeAt = readOnlyBlock.lastIndexOf("</div>;");
  if (closeAt < 0) throw new Error("DCA read-only popup closing anchor missing");
  const outcome = `    <div data-dca-outcome-mix-v1="true"><AutomationBotInsightPies accountId={currentAccount.id} automationId={bot.id} automationName={bot.name} outcomeOnly /></div>\n`;
  readOnlyBlock = readOnlyBlock.slice(0, closeAt) + outcome + readOnlyBlock.slice(closeAt);
  shell = shell.slice(0, readOnlyAt) + readOnlyBlock + shell.slice(editorAt);
}
for (const marker of [importLine,dcaPieMarker,"automationId={bot.id}","automationName={bot.name}","outcomeOnly"]) if (!shell.includes(marker)) throw new Error(`DCA Outcome Mix popup output missing ${marker}`);
fs.writeFileSync(shellPath, shell);

console.log("Prepared percentage Outcome Mix presentation and DCA Automations popup pie.");
