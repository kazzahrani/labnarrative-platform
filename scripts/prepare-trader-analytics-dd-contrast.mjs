import fs from "node:fs";
import path from "node:path";

const analyticsPath = path.join(process.cwd(), "app", "trader", "Analytics.tsx");
const workspacePath = path.join(process.cwd(), "app", "trader", "BotAnalyticsWorkspace.tsx");
const workspaceCssPath = path.join(process.cwd(), "app", "trader", "bot-analytics-workspace.module.css");
for (const target of [analyticsPath, workspacePath, workspaceCssPath]) {
  if (!fs.existsSync(target)) throw new Error(`Analytics DD polish target missing: ${target}`);
}

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Analytics DD polish missing ${label}`);
  return source.replace(from, to);
}

let analytics = fs.readFileSync(analyticsPath, "utf8");
if (!analytics.includes("capitalUsed?: number;")) {
  analytics = replaceOnce(
    analytics,
    '  maxCapitalMode?: "fixed" | "dynamic";\n  activePositions: number;',
    '  maxCapitalMode?: "fixed" | "dynamic";\n  capitalUsed?: number;\n  activePositions: number;',
    "Analytics automation capital-used field",
  );
}
if (!analytics.includes("capitalUsed?: number;\n  realizedPnl:")) {
  analytics = replaceOnce(
    analytics,
    'type Summary = {\n  realizedPnl: number;',
    'type Summary = {\n  capitalUsed?: number;\n  realizedPnl: number;',
    "Analytics summary capital-used field",
  );
}
analytics = replaceOnce(
  analytics,
  'type CapitalResponse = { ok?: boolean; automations?: Array<{ id: string; maxCapital: number | null; maxCapitalMode: "fixed" | "dynamic" }>; error?: string };',
  'type CapitalResponse = { ok?: boolean; range?: string; summaryCapitalUsed?: number; automations?: Array<{ id: string; maxCapital: number | null; maxCapitalMode: "fixed" | "dynamic"; capitalUsed: number }>; error?: string };',
  "Analytics capital response",
);
if (!analytics.includes("function drawdownPct(")) {
  analytics = replaceOnce(
    analytics,
    'function pct(value: number | null | undefined, digits = 2) {',
    'function drawdownPct(maxDrawdown: number | null | undefined, capitalUsed: number | null | undefined) {\n  if (maxDrawdown == null || !Number.isFinite(maxDrawdown) || capitalUsed == null || !Number.isFinite(capitalUsed) || capitalUsed <= 0) return null;\n  return -(Math.max(0, maxDrawdown) / capitalUsed * 100);\n}\nfunction pct(value: number | null | undefined, digits = 2) {',
    "Analytics drawdown formatter",
  );
}
analytics = replaceOnce(
  analytics,
  'browserSupabase.functions.invoke("trader-analytics-capital", { body: { accountId } })',
  'browserSupabase.functions.invoke("trader-analytics-capital", { body: { accountId, range } })',
  "Analytics capital range",
);
analytics = replaceOnce(
  analytics,
  '      setSummary(response.summary);\n      setOverallSeries(response.series ?? []);',
  '      setSummary({ ...response.summary, capitalUsed: capitalResponse.summaryCapitalUsed ?? 0 });\n      setOverallSeries(response.series ?? []);',
  "Analytics summary enrichment",
);

const animatedKpi = '<article><span>Max drawdown</span><strong className={styles.drawdown}><AnimatedNumber value={summary ? -summary.maxDrawdown : null} format={(value) => money(value)} /></strong><small>realized equity curve</small></article>';
const plainKpi = '<article><span>Max drawdown</span><strong className={styles.drawdown}>{money(summary ? -summary.maxDrawdown : null)}</strong><small>realized equity curve</small></article>';
const pctKpi = '<article><span>Max drawdown</span><strong className={styles.drawdown}><AnimatedNumber value={summary ? drawdownPct(summary.maxDrawdown, summary.capitalUsed) : null} format={(value) => pct(value)} /></strong><small>peak-to-trough ÷ capital used</small></article>';
if (analytics.includes(animatedKpi)) analytics = analytics.replace(animatedKpi, pctKpi);
else if (analytics.includes(plainKpi)) analytics = analytics.replace(plainKpi, '<article><span>Max drawdown</span><strong className={styles.drawdown}>{pct(summary ? drawdownPct(summary.maxDrawdown, summary.capitalUsed) : null)}</strong><small>peak-to-trough ÷ capital used</small></article>');
else throw new Error("Analytics DD polish missing max drawdown KPI");

analytics = replaceOnce(
  analytics,
  '<span className={item.maxDrawdown > 0 ? styles.negative : styles.neutral}>{item.maxDrawdown > 0 ? money(-item.maxDrawdown) : "$0.00"}</span>',
  '<span className={item.maxDrawdown > 0 ? styles.negative : styles.neutral}>{pct(drawdownPct(item.maxDrawdown, item.capitalUsed))}</span>',
  "Analytics table drawdown percent",
);

let workspace = fs.readFileSync(workspacePath, "utf8");
if (!workspace.includes("capitalUsed?: number;")) {
  workspace = replaceOnce(
    workspace,
    '  activePositions: number; maxActivePositions: number | null; closedTrades: number;',
    '  activePositions: number; maxActivePositions: number | null; capitalUsed?: number; closedTrades: number;',
    "Workspace automation capital-used field",
  );
}
if (!workspace.includes("function drawdownPct(")) {
  workspace = replaceOnce(
    workspace,
    'function pct(value:number|null|undefined,digits=1){',
    'function drawdownPct(maxDrawdown:number|null|undefined,capitalUsed:number|null|undefined){ if(maxDrawdown==null||!Number.isFinite(maxDrawdown)||capitalUsed==null||!Number.isFinite(capitalUsed)||capitalUsed<=0)return null; return -(Math.max(0,maxDrawdown)/capitalUsed*100); }\nfunction pct(value:number|null|undefined,digits=1){',
    "Workspace drawdown formatter",
  );
}
workspace = replaceOnce(
  workspace,
  'function chartValues(series:SeriesPoint[],mode:ChartMode){',
  'function chartValues(series:SeriesPoint[],mode:ChartMode,capitalUsed=0){',
  "Workspace chartValues signature",
);
workspace = replaceOnce(
  workspace,
  '  if(mode==="Drawdown"){let peak=0;return series.map(p=>{peak=Math.max(peak,p.cumulative);return -(peak-p.cumulative);});}',
  '  if(mode==="Drawdown"){let peak=0;return series.map(p=>{peak=Math.max(peak,p.cumulative);return capitalUsed>0?-(peak-p.cumulative)/capitalUsed*100:0;});}',
  "Workspace drawdown chart percent",
);
workspace = replaceOnce(
  workspace,
  '  const compare=automations.find(a=>a.id===compareId)||null;\n  const values=chartValues(automation.series,chartMode);',
  '  const compare=automations.find(a=>a.id===compareId)||null;\n  const capitalUsed=automation.capitalUsed??detail?.capital?.totalUsed??0;\n  const values=chartValues(automation.series,chartMode,capitalUsed);',
  "Workspace chart capital denominator",
);

const animatedWorkspaceKpi = '<article><span>Max drawdown</span><strong className={styles.negative}><AnimatedNumber value={-automation.maxDrawdown} format={(value)=>money(value)} /></strong></article>';
const plainWorkspaceKpi = '<article><span>Max drawdown</span><strong className={styles.negative}>{money(-automation.maxDrawdown)}</strong></article>';
const workspacePctKpi = '<article><span>Max drawdown</span><strong className={styles.negative}><AnimatedNumber value={drawdownPct(automation.maxDrawdown,capitalUsed)} format={(value)=>pct(value)} /></strong><small>vs capital used</small></article>';
if (workspace.includes(animatedWorkspaceKpi)) workspace = workspace.replace(animatedWorkspaceKpi, workspacePctKpi);
else if (workspace.includes(plainWorkspaceKpi)) workspace = workspace.replace(plainWorkspaceKpi, '<article><span>Max drawdown</span><strong className={styles.negative}>{pct(drawdownPct(automation.maxDrawdown,capitalUsed))}</strong><small>vs capital used</small></article>');
else throw new Error("Analytics DD polish missing workspace max drawdown KPI");

workspace = replaceOnce(
  workspace,
  '["Max DD",money(-automation.maxDrawdown),money(-compare.maxDrawdown)]',
  '["Max DD",pct(drawdownPct(automation.maxDrawdown,capitalUsed)),pct(drawdownPct(compare.maxDrawdown,compare.capitalUsed))]',
  "Workspace comparison drawdown percent",
);
workspace = replaceOnce(
  workspace,
  '{chartMode==="Trade frequency"?`${values.reduce((s,v)=>s+v,0)} trades`:money(values.at(-1))}',
  '{chartMode==="Trade frequency"?`${values.reduce((s,v)=>s+v,0)} trades`:chartMode==="Drawdown"?pct(values.at(-1)):money(values.at(-1))}',
  "Workspace drawdown chart metric",
);
workspace = replaceOnce(
  workspace,
  'style={{opacity:.25+.75*Math.min(1,Math.abs(m.pnl)/maxMonth)}}',
  'style={{opacity:.12+.28*Math.min(1,Math.abs(m.pnl)/maxMonth)}}',
  "Monthly heat intensity",
);

let workspaceCss = fs.readFileSync(workspaceCssPath, "utf8");
if (!workspaceCss.includes("TIME_INTELLIGENCE_CONTRAST_V2")) {
  workspaceCss += '\n/* TIME_INTELLIGENCE_CONTRAST_V2 */\n.monthGrid span{color:#d8d8d8}.monthGrid strong{color:#f5f5f5!important;text-shadow:0 1px 2px rgba(0,0,0,.42)}.monthGrid small{color:#c4c4c4}.monthGrid>div>i{filter:saturate(.9) brightness(.82)}\n';
}

for (const marker of [
  "capitalUsed?: number;",
  "drawdownPct(summary.maxDrawdown, summary.capitalUsed)",
  "peak-to-trough ÷ capital used",
  "drawdownPct(item.maxDrawdown, item.capitalUsed)",
]) if (!analytics.includes(marker)) throw new Error(`Analytics DD polish output missing ${marker}`);
for (const marker of [
  "chartValues(automation.series,chartMode,capitalUsed)",
  "drawdownPct(automation.maxDrawdown,capitalUsed)",
  'chartMode==="Drawdown"?pct(values.at(-1))',
  'opacity:.12+.28*Math.min',
]) if (!workspace.includes(marker)) throw new Error(`Workspace DD polish output missing ${marker}`);
if (!workspaceCss.includes("TIME_INTELLIGENCE_CONTRAST_V2")) throw new Error("Time Intelligence contrast CSS missing");

fs.writeFileSync(analyticsPath, analytics);
fs.writeFileSync(workspacePath, workspace);
fs.writeFileSync(workspaceCssPath, workspaceCss);
console.log("Prepared percentage Max DD and high-contrast Time Intelligence cards.");
