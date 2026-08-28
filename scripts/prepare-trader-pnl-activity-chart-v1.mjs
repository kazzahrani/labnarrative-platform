import fs from "node:fs";
import path from "node:path";

const analyticsPath=path.join(process.cwd(),"app","trader","Analytics.tsx");
const workspacePath=path.join(process.cwd(),"app","trader","BotAnalyticsWorkspace.tsx");
for(const p of [analyticsPath,workspacePath])if(!fs.existsSync(p))throw new Error(`PnL Activity target missing: ${p}`);

let analytics=fs.readFileSync(analyticsPath,"utf8");
if(!analytics.includes('import PnlActivityChart from "./PnlActivityChart";')){
  const anchor='import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";';
  if(!analytics.includes(anchor))throw new Error("PnL Activity Analytics import anchor missing");
  analytics=analytics.replace(anchor,`${anchor}\nimport PnlActivityChart from "./PnlActivityChart";`);
}
if(!analytics.includes('<PnlActivityChart accountId={accountId} range={range} scope={scope} type={type} />')){
  const motion='<section className={styles.insightGrid} data-analytics-motion>';
  const raw='<section className={styles.insightGrid}>';
  const anchor=analytics.includes(motion)?motion:raw;
  if(!analytics.includes(anchor))throw new Error("PnL Activity Analytics insertion anchor missing");
  analytics=analytics.replace(anchor,`<PnlActivityChart accountId={accountId} range={range} scope={scope} type={type} />\n\n      ${anchor}`);
}

let workspace=fs.readFileSync(workspacePath,"utf8");
if(!workspace.includes('import PnlActivityChart from "./PnlActivityChart";')){
  const anchor='import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";';
  if(!workspace.includes(anchor))throw new Error("PnL Activity workspace import anchor missing");
  workspace=workspace.replace(anchor,`${anchor}\nimport PnlActivityChart from "./PnlActivityChart";`);
}
workspace=workspace.replace('type ChartMode = "Cumulative PnL" | "Trade PnL" | "Drawdown" | "Trade frequency";','type ChartMode = "Cumulative PnL" | "Drawdown" | "PnL & Activity";');
const oldValues=`function chartValues(series:SeriesPoint[],mode:ChartMode,capitalUsed=0){\n  if(mode==="Cumulative PnL")return series.map(p=>p.cumulative);\n  if(mode==="Trade PnL")return series.map(p=>p.pnl);\n  if(mode==="Drawdown"){let peak=0;return series.map(p=>{peak=Math.max(peak,p.cumulative);return capitalUsed>0?-(peak-p.cumulative)/capitalUsed*100:0;});}\n  const byDay=new Map<string,number>(); series.forEach(p=>{const k=new Date(p.at).toISOString().slice(0,10);byDay.set(k,(byDay.get(k)||0)+1);}); return Array.from(byDay.values());\n}`;
const newValues=`function chartValues(series:SeriesPoint[],mode:ChartMode,capitalUsed=0){\n  if(mode==="Cumulative PnL")return series.map(p=>p.cumulative);\n  if(mode==="Drawdown"){let peak=0;return series.map(p=>{peak=Math.max(peak,p.cumulative);return capitalUsed>0?-(peak-p.cumulative)/capitalUsed*100:0;});}\n  return [];\n}`;
if(workspace.includes(oldValues))workspace=workspace.replace(oldValues,newValues);
workspace=workspace.replace('(["Cumulative PnL","Trade PnL","Drawdown","Trade frequency"] as ChartMode[])','(["Cumulative PnL","Drawdown","PnL & Activity"] as ChartMode[])');
workspace=workspace.replace('{chartMode==="Trade frequency"?`${values.reduce((s,v)=>s+v,0)} trades`:chartMode==="Drawdown"?pct(values.at(-1)):money(values.at(-1))}','{chartMode==="Drawdown"?pct(values.at(-1)):money(values.at(-1))}');
const meta='<div className={styles.chartMeta}><strong className={selectedTone}>{chartMode==="Drawdown"?pct(values.at(-1)):money(values.at(-1))}</strong><span>{automation.series.length} recorded closes</span><span>Last activity {relative(automation.lastActivityAt)}</span></div>';
const benchmark='<BenchmarkPerformanceChart series={automation.series} capitalUsed={capitalUsed} mode={chartMode} range={range} compact referenceLabel={automation.name} />';
if(workspace.includes(meta)&&workspace.includes(benchmark)){
  const replacement=`{chartMode==="PnL & Activity"?<PnlActivityChart accountId={accountId} range={range} botId={automation.id} embedded />:<>${meta}\n          ${benchmark}</>}`;
  workspace=workspace.replace(`${meta}\n          ${benchmark}`,replacement);
}else if(!workspace.includes('chartMode==="PnL & Activity"?<PnlActivityChart'))throw new Error("PnL Activity Performance Explorer body anchor missing");

for(const marker of[
  'import PnlActivityChart from "./PnlActivityChart";',
  '<PnlActivityChart accountId={accountId} range={range} scope={scope} type={type} />',
])if(!analytics.includes(marker))throw new Error(`PnL Activity Analytics output missing ${marker}`);
for(const marker of[
  'type ChartMode = "Cumulative PnL" | "Drawdown" | "PnL & Activity";',
  '(["Cumulative PnL","Drawdown","PnL & Activity"] as ChartMode[])',
  'chartMode==="PnL & Activity"?<PnlActivityChart',
])if(!workspace.includes(marker))throw new Error(`PnL Activity workspace output missing ${marker}`);
if(workspace.includes('"Trade PnL"')||workspace.includes('"Trade frequency"'))throw new Error("Redundant Performance Explorer modes remain");

fs.writeFileSync(analyticsPath,analytics);fs.writeFileSync(workspacePath,workspace);
console.log("Prepared merged PnL & Activity charts for Analytics and Bot Performance Workspace.");
