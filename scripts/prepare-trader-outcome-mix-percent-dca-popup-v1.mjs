import fs from "node:fs";
import path from "node:path";

const traderDir = path.join(process.cwd(), "app", "trader");
const piesPath = path.join(traderDir, "AutomationBotInsightPies.tsx");
const piesCssPath = path.join(traderDir, "automation-bot-insight-pies.module.css");
const workspacePath = path.join(traderDir, "BotAnalyticsWorkspace.tsx");
const analyticsPath = path.join(traderDir, "Analytics.tsx");
const configuratorPath = path.join(traderDir, "DcaBotConfigurator.tsx");
const configuratorCssPath = path.join(traderDir, "dca-bot-configurator.module.css");

for (const target of [piesPath, piesCssPath, workspacePath, analyticsPath, configuratorPath, configuratorCssPath]) {
  if (!fs.existsSync(target)) throw new Error(`Outcome Mix target missing: ${target}`);
}

// Shared bot insight pies: keep the closed-trade total in the center, remove the
// redundant headline win-rate number, and express Wins/Losses/Breakeven as shares.
let pies = fs.readFileSync(piesPath, "utf8");
if (!pies.includes("outcomeOnly?: boolean")) {
  const propsAnchor = "type Props = { accountId: string; botId: string };";
  if (!pies.includes(propsAnchor)) throw new Error("Outcome Mix shared pies Props anchor missing");
  pies = pies.replace(propsAnchor, "type Props = { accountId: string; botId: string; outcomeOnly?: boolean };" );
}
if (!pies.includes("outcomeOnly = false")) {
  const functionAnchor = "export default function AutomationBotInsightPies({ accountId, botId }: Props) {";
  if (!pies.includes(functionAnchor)) throw new Error("Outcome Mix shared pies function anchor missing");
  pies = pies.replace(functionAnchor, "export default function AutomationBotInsightPies({ accountId, botId, outcomeOnly = false }: Props) {");
}
pies = pies.replace(
  '<section className={styles.grid} aria-label="Bot performance outcome charts">',
  '<section className={`${styles.grid} ${outcomeOnly ? styles.outcomeOnly : ""}`} aria-label="Bot performance outcome charts">',
);
pies = pies.replace(
  '<header><small>OUTCOME MIX</small><div><span>Win rate</span><strong>{percent(stats.winRate)}</strong></div></header>',
  '<header><small>OUTCOME MIX</small></header>',
);
pies = pies.replace('<span>Wins</span><b>{stats.wins}</b>', '<span>Wins</span><b>{percent(stats.closedTrades ? stats.wins / stats.closedTrades * 100 : 0)}</b>');
pies = pies.replace('<span>Losses</span><b>{stats.losses}</b>', '<span>Losses</span><b>{percent(stats.closedTrades ? stats.losses / stats.closedTrades * 100 : 0)}</b>');
pies = pies.replace('<span>Breakeven</span><b>{stats.breakeven}</b>', '<span>Breakeven</span><b>{percent(stats.closedTrades ? stats.breakeven / stats.closedTrades * 100 : 0)}</b>');
for (const marker of [
  "outcomeOnly?: boolean",
  "outcomeOnly = false",
  "outcomeOnly ? styles.outcomeOnly",
  "stats.wins / stats.closedTrades * 100",
  "stats.losses / stats.closedTrades * 100",
  "stats.breakeven / stats.closedTrades * 100",
]) if (!pies.includes(marker)) throw new Error(`Outcome Mix shared pies missing ${marker}`);
if (pies.includes("<span>Win rate</span><strong>{percent(stats.winRate)}</strong>")) throw new Error("Outcome Mix shared pies still show headline win rate");
fs.writeFileSync(piesPath, pies);

// Outcome-only mode is deliberately compact so it fits beside Market in the upper
// half of the bot popup rather than pushing Entry Rule below the fold.
let piesCss = fs.readFileSync(piesCssPath, "utf8");
if (!piesCss.includes("OUTCOME_ONLY_POPUP_V2")) {
  piesCss += `
/* OUTCOME_ONLY_POPUP_V2 */
.outcomeOnly{grid-template-columns:minmax(0,1fr);margin:0;height:100%}
.outcomeOnly>.card{height:100%;min-height:132px;padding:12px 14px}
.outcomeOnly>.card:nth-child(n+2){display:none}
.outcomeOnly .card header{margin-bottom:8px}
.outcomeOnly .body{grid-template-columns:96px minmax(0,1fr);gap:13px}
.outcomeOnly .donut{width:96px}
.outcomeOnly .donut b{font-size:18px}
.outcomeOnly .legend p{padding:4px 0}
.outcomeOnly .roi{margin-top:6px;padding-top:6px}
@media(max-width:860px){.outcomeOnly .body{grid-template-columns:88px minmax(0,1fr)}.outcomeOnly .donut{width:88px}}
`;
}
fs.writeFileSync(piesCssPath, piesCss);

// Bot Performance Workspace Outcome Mix.
let workspace = fs.readFileSync(workspacePath, "utf8");
const workspaceOutcomeAt = workspace.indexOf("<small>OUTCOME MIX</small>");
const workspaceExitAt = workspace.indexOf("<small>EXIT DISTRIBUTION</small>", workspaceOutcomeAt);
if (workspaceOutcomeAt < 0 || workspaceExitAt < 0) throw new Error("Bot workspace Outcome Mix block missing");
let workspaceOutcome = workspace.slice(workspaceOutcomeAt, workspaceExitAt);
workspaceOutcome = workspaceOutcome.replace("<strong>{pct(automation.winRate)}</strong>", "");
workspaceOutcome = workspaceOutcome.replace(
  "<b>{count}</b></button>)}</div></div></article>",
  '<b>{automation.closedTrades ? (Number(count) / automation.closedTrades * 100).toFixed(1) + "%" : "0.0%"}</b></button>)}</div></div></article>',
);
workspace = workspace.slice(0, workspaceOutcomeAt) + workspaceOutcome + workspace.slice(workspaceExitAt);
if (workspaceOutcome.includes("<strong>{pct(automation.winRate)}</strong>")) throw new Error("Bot workspace Outcome Mix still shows headline win rate");
if (!workspaceOutcome.includes("Number(count) / automation.closedTrades * 100")) throw new Error("Bot workspace Outcome Mix percentages missing");
fs.writeFileSync(workspacePath, workspace);

// Main Analytics Outcome Mix.
let analytics = fs.readFileSync(analyticsPath, "utf8");
const analyticsOutcomeAt = analytics.indexOf("<small>OUTCOME MIX</small>");
const analyticsExitAt = analytics.indexOf("<small>EXIT DISTRIBUTION</small>", analyticsOutcomeAt);
if (analyticsOutcomeAt < 0 || analyticsExitAt < 0) throw new Error("Main Analytics Outcome Mix block missing");
let analyticsOutcome = analytics.slice(analyticsOutcomeAt, analyticsExitAt);
analyticsOutcome = analyticsOutcome.replace(/<strong>\{plainPct\(selectedWinRate\)\}<\/strong>/g, "");
analyticsOutcome = analyticsOutcome.replace(
  "<span>Wins</span><b>{selectedWins}</b>",
  '<span>Wins</span><b>{selectedClosed ? (selectedWins / selectedClosed * 100).toFixed(1) + "%" : "0.0%"}</b>',
);
analyticsOutcome = analyticsOutcome.replace(
  "<span>Losses</span><b>{selectedLosses}</b>",
  '<span>Losses</span><b>{selectedClosed ? (selectedLosses / selectedClosed * 100).toFixed(1) + "%" : "0.0%"}</b>',
);
analyticsOutcome = analyticsOutcome.replace(
  "<span>Breakeven</span><b>{selectedBreakeven}</b>",
  '<span>Breakeven</span><b>{selectedClosed ? (selectedBreakeven / selectedClosed * 100).toFixed(1) + "%" : "0.0%"}</b>',
);
analytics = analytics.slice(0, analyticsOutcomeAt) + analyticsOutcome + analytics.slice(analyticsExitAt);
if (analyticsOutcome.includes("plainPct(selectedWinRate)")) throw new Error("Main Analytics Outcome Mix still shows headline win rate");
for (const marker of [
  "selectedWins / selectedClosed * 100",
  "selectedLosses / selectedClosed * 100",
  "selectedBreakeven / selectedClosed * 100",
]) if (!analyticsOutcome.includes(marker)) throw new Error(`Main Analytics Outcome Mix missing ${marker}`);
fs.writeFileSync(analyticsPath, analytics);

// The Automations screenshot popup is DcaBotConfigurator in view mode. Put Market
// and Outcome Mix in the same upper row, with Outcome Mix on the right and Entry Rule
// remaining full-width directly underneath.
let configurator = fs.readFileSync(configuratorPath, "utf8");
const insightImport = 'import AutomationBotInsightPies from "./AutomationBotInsightPies";';
if (!configurator.includes(insightImport)) {
  const importAnchor = 'import cfg from "./dca-bot-configurator.module.css";';
  if (!configurator.includes(importAnchor)) throw new Error("DCA configurator Outcome Mix import anchor missing");
  configurator = configurator.replace(importAnchor, `${importAnchor}\n${insightImport}`);
}
const marketCard = '<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Market</h3><p>{form.allPairs?"The strategy can scan the complete Binance Spot USDT universe.":"The strategy scans only these selected markets."}</p></div></div>{form.allPairs?<div className={cfg.allBadge}>ALL BINANCE USDT SPOT PAIRS</div>:<div className={cfg.chips}>{form.pairs.map(pair=><span key={pair}>{pair}</span>)}</div>}</section>';
const upperMarker = 'data-dca-outcome-upper-right-v1="true"';
if (!configurator.includes(upperMarker)) {
  if (!configurator.includes(marketCard)) throw new Error("DCA configurator final Market card anchor missing");
  const upperRow = `<div className={cfg.outcomeUpperGrid} data-dca-outcome-upper-right-v1="true">${marketCard}<div className={cfg.outcomeUpper}><AutomationBotInsightPies accountId={accountId} botId={botId!} outcomeOnly /></div></div>`;
  configurator = configurator.replace(marketCard, upperRow);
}
for (const marker of [insightImport, upperMarker, "accountId={accountId}", "botId={botId!}", "outcomeOnly"]) {
  if (!configurator.includes(marker)) throw new Error(`DCA configurator upper-right Outcome Mix missing ${marker}`);
}
fs.writeFileSync(configuratorPath, configurator);

let configuratorCss = fs.readFileSync(configuratorCssPath, "utf8");
if (!configuratorCss.includes("DCA_OUTCOME_UPPER_RIGHT_V1")) {
  configuratorCss += `
/* DCA_OUTCOME_UPPER_RIGHT_V1 */
.outcomeUpperGrid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(330px,.75fr);gap:12px;align-items:stretch}
.outcomeUpperGrid>.card{height:100%;margin:0}
.outcomeUpper{min-width:0;height:100%}
@media(max-width:980px){.outcomeUpperGrid{grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr)}}
@media(max-width:760px){.outcomeUpperGrid{grid-template-columns:1fr}}
`;
}
fs.writeFileSync(configuratorCssPath, configuratorCss);

console.log("Prepared percentage Outcome Mix and placed DCA popup Outcome Mix in the upper-right beside Market.");
