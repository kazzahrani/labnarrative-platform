import fs from "node:fs";
import path from "node:path";

const traderDir = path.join(process.cwd(), "app", "trader");
const piesPath = path.join(traderDir, "AutomationBotInsightPies.tsx");
const piesCssPath = path.join(traderDir, "automation-bot-insight-pies.module.css");
const configuratorPath = path.join(traderDir, "DcaBotConfigurator.tsx");

for (const target of [piesPath, piesCssPath, configuratorPath]) {
  if (!fs.existsSync(target)) throw new Error(`Break-even Outcome Mix target missing: ${target}`);
}

let pies = fs.readFileSync(piesPath, "utf8");

const propsFrom = "type Props = { accountId: string; botId: string; outcomeOnly?: boolean };";
const propsTo = "type Props = { accountId: string; botId: string; outcomeOnly?: boolean; takeProfitPct?: number; stopEnabled?: boolean; stopLossPct?: number };";
if (!pies.includes(propsTo)) {
  if (!pies.includes(propsFrom)) throw new Error("Break-even badge Props anchor missing");
  pies = pies.replace(propsFrom, propsTo);
}

const fnFrom = "export default function AutomationBotInsightPies({ accountId, botId, outcomeOnly = false }: Props) {";
const fnTo = "export default function AutomationBotInsightPies({ accountId, botId, outcomeOnly = false, takeProfitPct, stopEnabled = false, stopLossPct }: Props) {";
if (!pies.includes(fnTo)) {
  if (!pies.includes(fnFrom)) throw new Error("Break-even badge function anchor missing");
  pies = pies.replace(fnFrom, fnTo);
}

const calcAnchor = "  const exitTotal = exits.reduce((sum, item) => sum + item.trades, 0);";
const calcBlock = `${calcAnchor}\n  const configuredTp = Number(takeProfitPct ?? 0);\n  const configuredSl = Number(stopLossPct ?? 0);\n  const breakEvenWinRate = stopEnabled && configuredTp > 0 && configuredSl > 0 ? configuredSl / (configuredTp + configuredSl) * 100 : null;\n  const breakEvenTitle = breakEvenWinRate == null\n    ? \"No fixed stop loss is configured, so a TP/SL break-even win rate is not defined.\"\n    : \`Minimum nominal win rate implied by TP \${configuredTp}% and SL \${configuredSl}% before fees, slippage, partial exits, trailing exits or other close reasons.\`;`;
if (!pies.includes("const breakEvenWinRate =")) {
  if (!pies.includes(calcAnchor)) throw new Error("Break-even calculation anchor missing");
  pies = pies.replace(calcAnchor, calcBlock);
}

const headerFrom = "<header><small>OUTCOME MIX</small></header>";
const headerTo = `<header><small>OUTCOME MIX</small>{outcomeOnly && <span className={\`${'${styles.breakEvenTag}'} \${breakEvenWinRate == null || stats.winRate == null ? \"\" : stats.winRate >= breakEvenWinRate ? styles.breakEvenAbove : styles.breakEvenBelow}\`} title={breakEvenTitle}>Break-even WR {breakEvenWinRate == null ? \"n/a\" : percent(breakEvenWinRate)}</span>}</header>`;
if (!pies.includes("Break-even WR")) {
  if (!pies.includes(headerFrom)) throw new Error("Break-even header anchor missing");
  pies = pies.replace(headerFrom, headerTo);
}

for (const marker of ["takeProfitPct?: number", "stopLossPct?: number", "configuredSl / (configuredTp + configuredSl) * 100", "Break-even WR", "styles.breakEvenTag"]) {
  if (!pies.includes(marker)) throw new Error(`Break-even Outcome Mix missing ${marker}`);
}
fs.writeFileSync(piesPath, pies);

let css = fs.readFileSync(piesCssPath, "utf8");
if (!css.includes("OUTCOME_BREAK_EVEN_WR_V1")) {
  css += `\n/* OUTCOME_BREAK_EVEN_WR_V1 */\n.breakEvenTag{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid #4a4a4a;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:700;line-height:1;color:#bdbdbd;background:#252525;letter-spacing:.01em}\n.breakEvenAbove{border-color:rgba(94,226,160,.35);color:#79ddb0;background:rgba(94,226,160,.07)}\n.breakEvenBelow{border-color:rgba(255,125,138,.32);color:#ef929b;background:rgba(255,125,138,.06)}\n.outcomeOnly .card header{display:flex;align-items:center;justify-content:space-between;gap:8px}\n@media(max-width:860px){.breakEvenTag{font-size:9px;padding:3px 7px}}\n`;
}
fs.writeFileSync(piesCssPath, css);

let configurator = fs.readFileSync(configuratorPath, "utf8");
const callFrom = "<AutomationBotInsightPies accountId={accountId} botId={botId!} outcomeOnly />";
const callTo = "<AutomationBotInsightPies accountId={accountId} botId={botId!} outcomeOnly takeProfitPct={form.takeProfit} stopEnabled={form.stopEnabled} stopLossPct={form.stopPct} />";
if (!configurator.includes(callTo)) {
  if (!configurator.includes(callFrom)) throw new Error("Break-even DCA popup component call missing");
  configurator = configurator.replace(callFrom, callTo);
}
for (const marker of ["takeProfitPct={form.takeProfit}", "stopEnabled={form.stopEnabled}", "stopLossPct={form.stopPct}"]) {
  if (!configurator.includes(marker)) throw new Error(`Break-even DCA popup missing ${marker}`);
}
fs.writeFileSync(configuratorPath, configurator);

console.log("Added nominal TP/SL break-even win-rate badge to the DCA Outcome Mix popup.");
