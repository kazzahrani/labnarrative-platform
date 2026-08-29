import fs from "node:fs";
import path from "node:path";

const traderDir = path.join(process.cwd(), "app", "trader");
const piesPath = path.join(traderDir, "AutomationBotInsightPies.tsx");
const piesCssPath = path.join(traderDir, "automation-bot-insight-pies.module.css");

for (const target of [piesPath, piesCssPath]) {
  if (!fs.existsSync(target)) throw new Error(`Break-even Outcome Mix target missing: ${target}`);
}

let pies = fs.readFileSync(piesPath, "utf8");

for (const marker of ["outcomeOnly?: boolean", "outcomeOnly = false", "avgWinPnl: number | null", "avgLossPnl: number | null"]) {
  if (!pies.includes(marker)) throw new Error(`Historical break-even Outcome Mix prerequisite missing ${marker}`);
}

const calcAnchor = "  const exitTotal = exits.reduce((sum, item) => sum + item.trades, 0);";
const calcBlock = `${calcAnchor}\n  const averageWinPnl = Number(stats.avgWinPnl ?? 0);\n  const averageLossPnl = Math.abs(Number(stats.avgLossPnl ?? 0));\n  const nonBreakevenShare = stats.closedTrades > 0 ? (stats.wins + stats.losses) / stats.closedTrades : 0;\n  const breakEvenWinRate = averageWinPnl > 0 && averageLossPnl > 0\n    ? nonBreakevenShare * averageLossPnl / (averageWinPnl + averageLossPnl) * 100\n    : null;\n  const breakEvenTitle = breakEvenWinRate == null\n    ? \"Historical break-even needs at least one realized winning trade and one realized losing trade.\"\n    : \`Historical break-even for the same closed trades shown here. Average realized winner +$\${averageWinPnl.toFixed(2)}, average realized loser −$\${averageLossPnl.toFixed(2)}. The threshold also accounts for the observed breakeven-trade share.\`;`;
if (!pies.includes("const averageWinPnl =")) {
  if (!pies.includes(calcAnchor)) throw new Error("Historical break-even calculation anchor missing");
  pies = pies.replace(calcAnchor, calcBlock);
}

const headerFrom = "<header><small>OUTCOME MIX</small></header>";
const headerTo = `<header><small>OUTCOME MIX</small>{outcomeOnly && <span className={\`${'${styles.breakEvenTag}'} \${breakEvenWinRate == null || stats.winRate == null ? \"\" : stats.winRate >= breakEvenWinRate ? styles.breakEvenAbove : styles.breakEvenBelow}\`} title={breakEvenTitle}>Historical BE WR {breakEvenWinRate == null ? \"n/a\" : percent(breakEvenWinRate)}</span>}</header>`;
if (!pies.includes("Historical BE WR")) {
  if (!pies.includes(headerFrom)) throw new Error("Historical break-even header anchor missing");
  pies = pies.replace(headerFrom, headerTo);
}

const donutFrom = '<div className={styles.donut} style={{ background: outcomeGradient }}><i><b>{stats.closedTrades}</b><span>closed</span></i></div>';
const donutTo = '<div className={styles.donut} style={{ background: outcomeGradient }}><i><b>{stats.closedTrades}</b><span>closed</span></i>{outcomeOnly && breakEvenWinRate != null && <div className={styles.breakEvenMarker} style={{ transform: `rotate(${breakEvenWinRate * 3.6}deg)` }} aria-hidden="true" />}</div>';
if (!pies.includes("styles.breakEvenMarker")) {
  if (!pies.includes(donutFrom)) throw new Error("Historical break-even pie marker donut anchor missing");
  pies = pies.replace(donutFrom, donutTo);
}

for (const marker of [
  "const averageWinPnl =",
  "const averageLossPnl =",
  "nonBreakevenShare * averageLossPnl / (averageWinPnl + averageLossPnl) * 100",
  "Historical BE WR",
  "styles.breakEvenTag",
  "styles.breakEvenMarker",
  "breakEvenWinRate * 3.6",
]) if (!pies.includes(marker)) throw new Error(`Historical break-even Outcome Mix missing ${marker}`);
fs.writeFileSync(piesPath, pies);

let css = fs.readFileSync(piesCssPath, "utf8");
if (!css.includes("OUTCOME_BREAK_EVEN_WR_V1")) {
  css += `\n/* OUTCOME_BREAK_EVEN_WR_V1 */\n.breakEvenTag{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid #4a4a4a;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:700;line-height:1;color:#bdbdbd;background:#252525;letter-spacing:.01em}\n.breakEvenAbove{border-color:rgba(94,226,160,.35);color:#79ddb0;background:rgba(94,226,160,.07)}\n.breakEvenBelow{border-color:rgba(255,125,138,.32);color:#ef929b;background:rgba(255,125,138,.06)}\n.outcomeOnly .card header{display:flex;align-items:center;justify-content:space-between;gap:8px}\n@media(max-width:860px){.breakEvenTag{font-size:9px;padding:3px 7px}}\n`;
}
if (!css.includes("OUTCOME_BREAK_EVEN_PIE_MARKER_V1")) {
  css += `\n/* OUTCOME_BREAK_EVEN_PIE_MARKER_V1 */\n.breakEvenMarker{position:absolute;inset:-5px;z-index:3;border-radius:50%;pointer-events:none;transform-origin:center center}\n.breakEvenMarker:before{content:\"\";position:absolute;left:50%;top:-1px;width:2px;height:19px;border-radius:2px;background:#f2f2f2;transform:translateX(-50%);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 7px rgba(255,255,255,.38)}\n.breakEvenMarker:after{content:\"\";position:absolute;left:50%;top:-3px;width:6px;height:6px;border-radius:50%;background:#f2f2f2;transform:translateX(-50%);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 6px rgba(255,255,255,.32)}\n`;
}
for (const marker of [".breakEvenMarker{", ".breakEvenMarker:before", ".breakEvenMarker:after"]) if (!css.includes(marker)) throw new Error(`Historical break-even pie marker CSS missing ${marker}`);
fs.writeFileSync(piesCssPath, css);

console.log("Added historical realized-payoff break-even win-rate badge and ring marker to the DCA Outcome Mix popup.");
