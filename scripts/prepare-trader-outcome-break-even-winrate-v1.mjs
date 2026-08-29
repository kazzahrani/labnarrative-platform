import fs from "node:fs";
import path from "node:path";

const traderDir = path.join(process.cwd(), "app", "trader");
const piesPath = path.join(traderDir, "AutomationBotInsightPies.tsx");
const piesCssPath = path.join(traderDir, "automation-bot-insight-pies.module.css");

for (const target of [piesPath, piesCssPath]) {
  if (!fs.existsSync(target)) throw new Error(`Break-even Outcome Mix target missing: ${target}`);
}

let pies = fs.readFileSync(piesPath, "utf8");

for (const marker of ["outcomeOnly?: boolean", "outcomeOnly = false", "avgWinPnl: number | null", "avgLossPnl: number | null", "type WorkspacePayload ="]) {
  if (!pies.includes(marker)) throw new Error(`Dual break-even Outcome Mix prerequisite missing ${marker}`);
}

const configTypesAnchor = 'type WorkspacePayload = { ok?: boolean; trades?: WorkspaceTrade[]; error?: string };';
const configTypes = `${configTypesAnchor}\ntype BotConfigTarget = { profitPct: number; allocationPct: number };\ntype BotConfig = { takeProfit?: number | null; takeProfitTargets?: BotConfigTarget[]; stopEnabled?: boolean; stopPct?: number | null };\ntype BotConfigPayload = { ok?: boolean; bot?: BotConfig; error?: string };`;
if (!pies.includes("type BotConfigTarget =")) {
  if (!pies.includes(configTypesAnchor)) throw new Error("Dual break-even bot config type anchor missing");
  pies = pies.replace(configTypesAnchor, configTypes);
}

const configStateAnchor = '  const [error, setError] = useState("");';
if (!pies.includes("const [config, setConfig]")) {
  if (!pies.includes(configStateAnchor)) throw new Error("Dual break-even config state anchor missing");
  pies = pies.replace(configStateAnchor, `${configStateAnchor}\n  const [config, setConfig] = useState<BotConfig | null>(null);`);
}

const configEffectAnchor = "\n  const exits = useMemo(() => {";
const configEffect = `\n  useEffect(() => {\n    let cancelled = false;\n    setConfig(null);\n    void (async () => {\n      const { data, error: invokeError } = await browserSupabase.functions.invoke(\"trader-dca-control\", { body: { action: \"bot_detail\", accountId, botId } });\n      if (cancelled || invokeError) return;\n      const payload = (data ?? {}) as BotConfigPayload;\n      if (payload.ok === true && payload.bot) setConfig(payload.bot);\n    })();\n    return () => { cancelled = true; };\n  }, [accountId, botId]);\n${configEffectAnchor}`;
if (!pies.includes('functions.invoke("trader-dca-control"')) {
  if (!pies.includes(configEffectAnchor)) throw new Error("Dual break-even config effect anchor missing");
  pies = pies.replace(configEffectAnchor, configEffect);
}

const calcAnchor = "  const exitTotal = exits.reduce((sum, item) => sum + item.trades, 0);";
const calcBlock = `${calcAnchor}\n  const averageWinPnl = Number(stats.avgWinPnl ?? 0);\n  const averageLossPnl = Math.abs(Number(stats.avgLossPnl ?? 0));\n  const nonBreakevenShare = stats.closedTrades > 0 ? (stats.wins + stats.losses) / stats.closedTrades : 0;\n  const historicalBreakEvenWinRate = averageWinPnl > 0 && averageLossPnl > 0\n    ? nonBreakevenShare * averageLossPnl / (averageWinPnl + averageLossPnl) * 100\n    : null;\n  const historicalBreakEvenTitle = historicalBreakEvenWinRate == null\n    ? \"Historical break-even needs at least one realized winning trade and one realized losing trade.\"\n    : \`Historical break-even from the same closed trades shown here. Average realized winner +$\${averageWinPnl.toFixed(2)}, average realized loser −$\${averageLossPnl.toFixed(2)}. The threshold also accounts for the observed breakeven-trade share.\`;\n  const theoreticalTargets = config?.takeProfitTargets?.length\n    ? config.takeProfitTargets\n    : Number(config?.takeProfit ?? 0) > 0\n      ? [{ profitPct: Number(config?.takeProfit ?? 0), allocationPct: 100 }]\n      : [];\n  const theoreticalAllocation = theoreticalTargets.reduce((sum, target) => sum + Math.max(0, Number(target.allocationPct ?? 0)), 0);\n  const weightedTakeProfit = theoreticalAllocation > 0\n    ? theoreticalTargets.reduce((sum, target) => sum + Math.max(0, Number(target.profitPct ?? 0)) * Math.max(0, Number(target.allocationPct ?? 0)), 0) / theoreticalAllocation\n    : 0;\n  const configuredStopLoss = Math.max(0, Number(config?.stopPct ?? 0));\n  const theoreticalBreakEvenWinRate = config?.stopEnabled === true && configuredStopLoss > 0 && weightedTakeProfit > 0\n    ? configuredStopLoss / (weightedTakeProfit + configuredStopLoss) * 100\n    : null;\n  const theoreticalBreakEvenTitle = theoreticalBreakEvenWinRate == null\n    ? \"Theoretical break-even requires an enabled Stop Loss and a valid current Take Profit plan.\"\n    : \`Theoretical break-even from the bot's current exit configuration. Allocation-weighted TP \${weightedTakeProfit.toFixed(2)}%, Stop Loss \${configuredStopLoss.toFixed(2)}%.\`;`;
if (!pies.includes("const historicalBreakEvenWinRate =")) {
  if (!pies.includes(calcAnchor)) throw new Error("Dual break-even calculation anchor missing");
  pies = pies.replace(calcAnchor, calcBlock);
}

const headerFrom = "<header><small>OUTCOME MIX</small></header>";
const headerTo = `<header><small>OUTCOME MIX</small>{outcomeOnly && <div className={styles.breakEvenTags}><span className={\`${'${styles.breakEvenTag}'} ${'${styles.theoreticalBreakEvenTag}'}\`} title={theoreticalBreakEvenTitle}>Theoretical BE {theoreticalBreakEvenWinRate == null ? \"n/a\" : percent(theoreticalBreakEvenWinRate)}</span><span className={\`${'${styles.breakEvenTag}'} \${historicalBreakEvenWinRate == null || stats.winRate == null ? \"\" : stats.winRate >= historicalBreakEvenWinRate ? styles.breakEvenAbove : styles.breakEvenBelow}\`} title={historicalBreakEvenTitle}>Historical BE {historicalBreakEvenWinRate == null ? \"n/a\" : percent(historicalBreakEvenWinRate)}</span></div>}</header>`;
if (!pies.includes("Theoretical BE")) {
  if (!pies.includes(headerFrom)) throw new Error("Dual break-even header anchor missing");
  pies = pies.replace(headerFrom, headerTo);
}

const donutFrom = '<div className={styles.donut} style={{ background: outcomeGradient }}><i><b>{stats.closedTrades}</b><span>closed</span></i></div>';
const donutTo = '<div className={styles.donut} style={{ background: outcomeGradient }}><i><b>{stats.closedTrades}</b><span>closed</span></i>{outcomeOnly && theoreticalBreakEvenWinRate != null && <div className={`${styles.breakEvenMarker} ${styles.theoreticalBreakEvenMarker}`} style={{ transform: `rotate(${theoreticalBreakEvenWinRate * 3.6}deg)` }} title={`Theoretical BE ${percent(theoreticalBreakEvenWinRate)}`} aria-hidden="true" />}{outcomeOnly && historicalBreakEvenWinRate != null && <div className={styles.breakEvenMarker} style={{ transform: `rotate(${historicalBreakEvenWinRate * 3.6}deg)` }} title={`Historical BE ${percent(historicalBreakEvenWinRate)}`} aria-hidden="true" />}</div>';
if (!pies.includes("styles.theoreticalBreakEvenMarker")) {
  if (!pies.includes(donutFrom)) throw new Error("Dual break-even pie marker donut anchor missing");
  pies = pies.replace(donutFrom, donutTo);
}

for (const marker of [
  "type BotConfigTarget =",
  'functions.invoke("trader-dca-control"',
  "const historicalBreakEvenWinRate =",
  "const theoreticalBreakEvenWinRate =",
  "weightedTakeProfit",
  "Theoretical BE",
  "Historical BE",
  "styles.breakEvenTags",
  "styles.breakEvenMarker",
  "styles.theoreticalBreakEvenMarker",
  "historicalBreakEvenWinRate * 3.6",
  "theoreticalBreakEvenWinRate * 3.6",
]) if (!pies.includes(marker)) throw new Error(`Dual break-even Outcome Mix missing ${marker}`);
fs.writeFileSync(piesPath, pies);

let css = fs.readFileSync(piesCssPath, "utf8");
if (!css.includes("OUTCOME_BREAK_EVEN_WR_V1")) {
  css += `\n/* OUTCOME_BREAK_EVEN_WR_V1 */\n.breakEvenTags{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}\n.breakEvenTag{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid #4a4a4a;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:400;line-height:1;color:#c8c8c8;background:#252525;letter-spacing:.01em}\n.theoreticalBreakEvenTag{border-color:rgba(232,184,98,.34);color:#cdbd9c;background:rgba(232,184,98,.06)}\n.breakEvenAbove{border-color:rgba(94,226,160,.35);color:#a7d8c0;background:rgba(94,226,160,.07)}\n.breakEvenBelow{border-color:rgba(255,125,138,.32);color:#d7a0a6;background:rgba(255,125,138,.06)}\n.outcomeOnly .card header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}\n@media(max-width:860px){.breakEvenTags{gap:4px}.breakEvenTag{font-size:9px;padding:3px 7px}}\n`;
}
if (!css.includes("OUTCOME_BREAK_EVEN_PIE_MARKER_V1")) {
  css += `\n/* OUTCOME_BREAK_EVEN_PIE_MARKER_V1 */\n.breakEvenMarker{position:absolute;inset:-5px;z-index:4;border-radius:50%;pointer-events:none;transform-origin:center center}\n.breakEvenMarker:before{content:\"\";position:absolute;left:50%;top:-1px;width:2px;height:19px;border-radius:2px;background:#f2f2f2;transform:translateX(-50%);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 7px rgba(255,255,255,.38)}\n.breakEvenMarker:after{content:\"\";position:absolute;left:50%;top:-3px;width:6px;height:6px;border-radius:50%;background:#f2f2f2;transform:translateX(-50%);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 6px rgba(255,255,255,.32)}\n.theoreticalBreakEvenMarker{z-index:3;inset:-5px}\n.theoreticalBreakEvenMarker:before{top:-1px;width:2px;height:19px;background:#e8b862;box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 7px rgba(232,184,98,.35)}\n.theoreticalBreakEvenMarker:after{top:-3px;width:6px;height:6px;background:#e8b862;box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 6px rgba(232,184,98,.28)}\n`;
}
for (const marker of [".breakEvenTags{", ".theoreticalBreakEvenTag{", ".breakEvenMarker{", ".theoreticalBreakEvenMarker{"]) if (!css.includes(marker)) throw new Error(`Dual break-even pie marker CSS missing ${marker}`);
fs.writeFileSync(piesCssPath, css);

console.log("Added theoretical current-plan and historical realized-payoff break-even win rates with equal-size markers and lighter labels.");
