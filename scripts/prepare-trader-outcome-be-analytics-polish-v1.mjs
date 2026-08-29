import fs from "node:fs";
import path from "node:path";

const traderDir = path.join(process.cwd(), "app", "trader");
const piesCssPath = path.join(traderDir, "automation-bot-insight-pies.module.css");
const workspacePath = path.join(traderDir, "BotAnalyticsWorkspace.tsx");
const workspaceCssPath = path.join(traderDir, "bot-analytics-workspace.module.css");

for (const target of [piesCssPath, workspacePath, workspaceCssPath]) {
  if (!fs.existsSync(target)) throw new Error(`Outcome BE analytics polish target missing: ${target}`);
}

let piesCss = fs.readFileSync(piesCssPath, "utf8");
if (!piesCss.includes("OUTCOME_BE_WHITE_LABELS_V1")) {
  piesCss += `\n/* OUTCOME_BE_WHITE_LABELS_V1 */\n.breakEvenTag,.theoreticalBreakEvenTag,.breakEvenAbove,.breakEvenBelow{color:#fff!important;font-weight:400!important}\n`;
}
fs.writeFileSync(piesCssPath, piesCss);

let workspace = fs.readFileSync(workspacePath, "utf8");
const functionAt = workspace.indexOf("function BotAnalyticsWorkspace");
if (functionAt < 0) throw new Error("Bot workspace function missing");

if (!workspace.includes("type ExitConfigTarget =")) {
  const colorsAt = workspace.indexOf("const COLORS", 0);
  if (colorsAt < 0 || colorsAt > functionAt) throw new Error("Bot workspace BE type insertion point missing");
  const types = 'type ExitConfigTarget = { profitPct:number; allocationPct:number };\ntype ExitConfig = { takeProfit:number|null; takeProfitTargets:ExitConfigTarget[]; stopEnabled:boolean; stopPct:number|null };\n';
  workspace = workspace.slice(0, colorsAt) + types + workspace.slice(colorsAt);
}

if (!workspace.includes("const [exitConfig,setExitConfig]")) {
  const firstEffectAt = workspace.indexOf("  useEffect(", functionAt);
  if (firstEffectAt < 0) throw new Error("Bot workspace BE state insertion point missing");
  workspace = workspace.slice(0, firstEffectAt) + '  const [exitConfig,setExitConfig]=useState<ExitConfig|null>(null);\n\n' + workspace.slice(firstEffectAt);
}

if (!workspace.includes('rpc("trader_bot_exit_config"')) {
  const compareAt = workspace.indexOf("  const compare=", functionAt);
  if (compareAt < 0) throw new Error("Bot workspace BE effect insertion point missing");
  const configEffect = `  useEffect(()=>{\n    let cancelled=false;\n    setExitConfig(null);\n    if(automation.type!=="DCA")return()=>{cancelled=true;};\n    void (async()=>{\n      const {data,error:configError}=await browserSupabase.rpc("trader_bot_exit_config",{p_account_id:accountId,p_bot_id:automation.id});\n      if(cancelled||configError)return;\n      const value=(data||null) as ExitConfig|null;\n      if(value)setExitConfig(value);\n    })();\n    return()=>{cancelled=true;};\n  },[accountId,automation.id,automation.type]);\n\n`;
  workspace = workspace.slice(0, compareAt) + configEffect + workspace.slice(compareAt);
}

if (!workspace.includes("const historicalBreakEvenWinRate=")) {
  const exitPieAt = workspace.indexOf("  const exitPie=", functionAt);
  const exitPieEnd = exitPieAt < 0 ? -1 : workspace.indexOf(";\n", exitPieAt);
  if (exitPieAt < 0 || exitPieEnd < 0) throw new Error("Bot workspace BE calculation insertion point missing");
  const calc = `\n  const averageWinPnl=automation.wins>0?automation.grossProfit/automation.wins:0;\n  const averageLossPnl=automation.losses>0?automation.grossLoss/automation.losses:0;\n  const nonBreakevenShare=automation.closedTrades>0?(automation.wins+automation.losses)/automation.closedTrades:0;\n  const historicalBreakEvenWinRate=averageWinPnl>0&&averageLossPnl>0?nonBreakevenShare*averageLossPnl/(averageWinPnl+averageLossPnl)*100:null;\n  const historicalBreakEvenTitle=historicalBreakEvenWinRate==null?"Historical break-even needs at least one realized winning trade and one realized losing trade.":\`Historical break-even from the same closed trades and timeframe shown here. Average realized winner +$\${averageWinPnl.toFixed(2)}, average realized loser −$\${averageLossPnl.toFixed(2)}.\`;\n  const theoreticalTargets=exitConfig?.takeProfitTargets?.length?exitConfig.takeProfitTargets:Number(exitConfig?.takeProfit??0)>0?[{profitPct:Number(exitConfig?.takeProfit??0),allocationPct:100}]:[];\n  const theoreticalAllocation=theoreticalTargets.reduce((sum,target)=>sum+Math.max(0,Number(target.allocationPct??0)),0);\n  const weightedTakeProfit=theoreticalAllocation>0?theoreticalTargets.reduce((sum,target)=>sum+Math.max(0,Number(target.profitPct??0))*Math.max(0,Number(target.allocationPct??0)),0)/theoreticalAllocation:0;\n  const configuredStopLoss=Math.max(0,Number(exitConfig?.stopPct??0));\n  const theoreticalBreakEvenWinRate=exitConfig?.stopEnabled===true&&configuredStopLoss>0&&weightedTakeProfit>0?configuredStopLoss/(weightedTakeProfit+configuredStopLoss)*100:null;\n  const theoreticalBreakEvenTitle=theoreticalBreakEvenWinRate==null?"Theoretical break-even requires a DCA bot with an enabled Stop Loss and a valid current Take Profit plan.":\`Theoretical break-even from the bot's current exit configuration. Allocation-weighted TP \${weightedTakeProfit.toFixed(2)}%, Stop Loss \${configuredStopLoss.toFixed(2)}%.\`;`;
  workspace = workspace.slice(0, exitPieEnd + 2) + calc + workspace.slice(exitPieEnd + 2);
}

const outcomeAt = workspace.indexOf("<small>OUTCOME MIX</small>");
const exitAt = workspace.indexOf("<small>EXIT DISTRIBUTION</small>", outcomeAt);
if (outcomeAt < 0 || exitAt < 0) throw new Error("Bot workspace Outcome Mix boundaries missing");
let outcome = workspace.slice(outcomeAt, exitAt);

if (!outcome.includes("styles.breakEvenTags")) {
  const headFrom = '<small>OUTCOME MIX</small><h3>Trade quality</h3></div></div>';
  const headTo = '<small>OUTCOME MIX</small><h3>Trade quality</h3></div><div className={styles.breakEvenTags}><span className={`${styles.breakEvenTag} ${styles.theoreticalBreakEvenTag}`} title={theoreticalBreakEvenTitle}>Theoretical BE {theoreticalBreakEvenWinRate==null?"n/a":theoreticalBreakEvenWinRate.toFixed(1)+"%"}</span><span className={`${styles.breakEvenTag} ${historicalBreakEvenWinRate==null||automation.winRate==null?"":automation.winRate>=historicalBreakEvenWinRate?styles.breakEvenAbove:styles.breakEvenBelow}`} title={historicalBreakEvenTitle}>Historical BE {historicalBreakEvenWinRate==null?"n/a":historicalBreakEvenWinRate.toFixed(1)+"%"}</span></div></div>';
  if (!outcome.includes(headFrom)) throw new Error("Bot workspace Outcome Mix header anchor missing");
  outcome = outcome.replace(headFrom, headTo);
}

if (!outcome.includes("styles.theoreticalBreakEvenMarker")) {
  const donutAt = outcome.indexOf("className={styles.donut}");
  const donutCenterEnd = donutAt < 0 ? -1 : outcome.indexOf("</i>", donutAt);
  if (donutAt < 0 || donutCenterEnd < 0) throw new Error("Bot workspace Outcome Mix donut center missing");
  const markers = '{theoreticalBreakEvenWinRate!=null&&<div className={`${styles.breakEvenMarker} ${styles.theoreticalBreakEvenMarker}`} style={{transform:`rotate(${theoreticalBreakEvenWinRate*3.6}deg)`}} title={`Theoretical BE ${theoreticalBreakEvenWinRate.toFixed(1)}%`} aria-hidden="true"/>}{historicalBreakEvenWinRate!=null&&<div className={styles.breakEvenMarker} style={{transform:`rotate(${historicalBreakEvenWinRate*3.6}deg)`}} title={`Historical BE ${historicalBreakEvenWinRate.toFixed(1)}%`} aria-hidden="true"/>}';
  outcome = outcome.slice(0, donutCenterEnd + 4) + markers + outcome.slice(donutCenterEnd + 4);
}

workspace = workspace.slice(0, outcomeAt) + outcome + workspace.slice(exitAt);
for (const marker of [
  'rpc("trader_bot_exit_config"',
  "const historicalBreakEvenWinRate=",
  "const theoreticalBreakEvenWinRate=",
  "styles.breakEvenTags",
  "styles.breakEvenMarker",
  "styles.theoreticalBreakEvenMarker",
  "Theoretical BE",
  "Historical BE",
]) if (!workspace.includes(marker)) throw new Error(`Bot workspace dual BE missing ${marker}`);
fs.writeFileSync(workspacePath, workspace);

let workspaceCss = fs.readFileSync(workspaceCssPath, "utf8");
if (!workspaceCss.includes("BOT_WORKSPACE_DUAL_BE_V1")) {
  workspaceCss += `\n/* BOT_WORKSPACE_DUAL_BE_V1 */\n.breakEvenTags{display:flex;align-items:flex-end;justify-content:flex-end;gap:5px;flex-direction:column}\n.breakEvenTag{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid #4a4a4a;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:400;line-height:1;color:#fff;background:#252525;letter-spacing:.01em}\n.theoreticalBreakEvenTag{border-color:rgba(232,184,98,.42);background:rgba(232,184,98,.06)}\n.breakEvenAbove{border-color:rgba(94,226,160,.38);background:rgba(94,226,160,.07)}\n.breakEvenBelow{border-color:rgba(255,125,138,.38);background:rgba(255,125,138,.06)}\n.breakEvenMarker{position:absolute;inset:-5px;z-index:4;border-radius:50%;pointer-events:none;transform-origin:center center}\n.breakEvenMarker:before{content:"";position:absolute;left:50%;top:-1px;width:2px;height:19px;border-radius:2px;background:#f2f2f2;transform:translateX(-50%);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 7px rgba(255,255,255,.38)}\n.breakEvenMarker:after{content:"";position:absolute;left:50%;top:-3px;width:6px;height:6px;border-radius:50%;background:#f2f2f2;transform:translateX(-50%);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 6px rgba(255,255,255,.32)}\n.theoreticalBreakEvenMarker{z-index:3;inset:-5px}\n.theoreticalBreakEvenMarker:before{top:-1px;width:2px;height:19px;background:#e8b862;box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 7px rgba(232,184,98,.35)}\n.theoreticalBreakEvenMarker:after{top:-3px;width:6px;height:6px;background:#e8b862;box-shadow:0 0 0 1px rgba(0,0,0,.72),0 0 6px rgba(232,184,98,.28)}\n@media(max-width:900px){.breakEvenTags{align-items:flex-start}.breakEvenTag{font-size:8px;padding:3px 7px}}\n`;
}
for (const marker of [".breakEvenTags{", ".breakEvenMarker{", ".theoreticalBreakEvenMarker{"]) if (!workspaceCss.includes(marker)) throw new Error(`Bot workspace BE CSS missing ${marker}`);
fs.writeFileSync(workspaceCssPath, workspaceCss);

console.log("Applied white BE labels and dual theoretical/historical break-even markers to Analytics Bot Performance Workspace.");
