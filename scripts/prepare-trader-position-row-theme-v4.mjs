import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app", "trader", "TraderV2FullShell.tsx");
const dcaCssPath = path.join(root, "app", "trader", "trader-dca-v2.module.css");
const actionsPath = path.join(root, "app", "trader", "TradeActionsV2.tsx");
const actionsCssPath = path.join(root, "app", "trader", "trade-actions-v2.module.css");
const tracePath = path.join(root, "app", "trader", "TradePriceTrace.tsx");
for (const file of [shellPath, dcaCssPath, actionsPath, actionsCssPath, tracePath]) {
  if (!fs.existsSync(file)) throw new Error(`Positions theme target missing: ${file}`);
}

let shell = fs.readFileSync(shellPath, "utf8");
let dcaCss = fs.readFileSync(dcaCssPath, "utf8");
let actions = fs.readFileSync(actionsPath, "utf8");
let actionsCss = fs.readFileSync(actionsCssPath, "utf8");
const trace = fs.readFileSync(tracePath, "utf8");
let changes = 0;

// Use the same semantic green/red already established across LabNarrative Trading.
for (const [from, to] of [["#6CB38C", "#27b978"], ["#B26F74", "#b87378"]]) {
  if (shell.includes(from)) { shell = shell.replaceAll(from, to); changes += 1; }
  if (dcaCss.includes(from)) { dcaCss = dcaCss.replaceAll(from, to); changes += 1; }
  if (actionsCss.includes(from)) { actionsCss = actionsCss.replaceAll(from, to); changes += 1; }
}
actionsCss = actionsCss.replaceAll("rgba(178,111,116,.52)", "rgba(184,115,120,.52)");

// Cancel is a real no-sell action only for Live Binance positions. Do not expose a fake Paper control.
const oldCancel = '      <button className={`${styles.iconAction} ${styles.cancelTrade}`} data-tip={accountMode === "live" ? "Cancel trade" : "Cancel trade · Live only"} aria-label="Cancel trade" disabled={busy || accountMode !== "live"} onClick={cancel}><span>⊘</span></button>';
const newCancel = '      {accountMode === "live" && <button className={`${styles.iconAction} ${styles.cancelTrade}`} data-tip="Cancel trade" aria-label="Cancel trade" disabled={busy} onClick={cancel}><span>⊘</span></button>}' ;
if (actions.includes(oldCancel)) { actions = actions.replace(oldCancel, newCancel); changes += 1; }
if (!actions.includes('data-tip="Add funds"') || !actions.includes('data-tip="Edit trade"') || !actions.includes('data-tip="Close trade"')) {
  throw new Error("Positions icon actions missing before final theme pass");
}

const marker = "/* position-row-theme-v4 */";
if (!actionsCss.includes(marker)) {
  actionsCss += `\n${marker}\n.actions{gap:4px!important;min-width:0!important;margin-left:auto!important;justify-content:flex-end!important}.actions .iconAction{width:24px!important;height:24px!important;min-width:24px!important;border-radius:7px!important;font-size:11px!important}.actions .iconAction:before{bottom:calc(100% + 6px)!important;font-size:8px!important}.actions .closeTrade:hover:not(:disabled),.actions .cancelTrade:hover:not(:disabled){color:#b87378!important;border-color:rgba(184,115,120,.52)!important}\n`;
  changes += 1;
}

const dcaMarker = "/* position-row-theme-v4 */";
if (!dcaCss.includes(dcaMarker)) {
  dcaCss += `\n${dcaMarker}\n.tradeTable .green,.positionInsightGrid .green{color:#27b978!important}.tradeTable .red,.positionInsightGrid .red{color:#b87378!important}.positionTrendPositive{background:#27b978!important}.positionTrendNegative{background:#b87378!important}.investedValue b{font-weight:400!important;color:#777!important}.pnlValue>b{font-weight:400!important}\n`;
  changes += 1;
}

if (!trace.includes('const GREEN = "#27b978";') || !trace.includes('const RED = "#b87378";') || !trace.includes('const GUIDE = "rgba(188,188,188,.23)";')) {
  throw new Error("Position price trace is not using the final LabNarrative semantic palette");
}
if (!actions.includes('accountMode === "live" && <button') || !actions.includes('trader-live-cancel-control')) {
  throw new Error("Live-only no-sell Cancel action missing");
}

fs.writeFileSync(shellPath, shell);
fs.writeFileSync(dcaCssPath, dcaCss);
fs.writeFileSync(actionsPath, actions);
fs.writeFileSync(actionsCssPath, actionsCss);
console.log(`Finalized Positions row palette, compact actions and Live-only Cancel (${changes} changes).`);
