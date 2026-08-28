import fs from "node:fs";
import path from "node:path";

const analyticsPath=path.join(process.cwd(),"app","trader","Analytics.tsx");
const workspacePath=path.join(process.cwd(),"app","trader","BotAnalyticsWorkspace.tsx");
const advancedPath=path.join(process.cwd(),"app","trader","AdvancedBotAnalytics.tsx");
for(const p of [analyticsPath,workspacePath,advancedPath])if(!fs.existsSync(p))throw new Error(`PnL Activity target missing: ${p}`);

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
workspace=workspace.replace('type ChartMode = "Cumulative PnL" | "Trade PnL" | "Drawdown" | "Trade frequency";','type ChartMode = "Cumulative PnL" | "Drawdown";');
const oldValues=`function chartValues(series:SeriesPoint[],mode:ChartMode,capitalUsed=0){\n  if(mode==="Cumulative PnL")return series.map(p=>p.cumulative);\n  if(mode==="Trade PnL")return series.map(p=>p.pnl);\n  if(mode==="Drawdown"){let peak=0;return series.map(p=>{peak=Math.max(peak,p.cumulative);return capitalUsed>0?-(peak-p.cumulative)/capitalUsed*100:0;});}\n  const byDay=new Map<string,number>(); series.forEach(p=>{const k=new Date(p.at).toISOString().slice(0,10);byDay.set(k,(byDay.get(k)||0)+1);}); return Array.from(byDay.values());\n}`;
const newValues=`function chartValues(series:SeriesPoint[],mode:ChartMode,capitalUsed=0){\n  if(mode==="Cumulative PnL")return series.map(p=>p.cumulative);\n  if(mode==="Drawdown"){let peak=0;return series.map(p=>{peak=Math.max(peak,p.cumulative);return capitalUsed>0?-(peak-p.cumulative)/capitalUsed*100:0;});}\n  return [];\n}`;
if(workspace.includes(oldValues))workspace=workspace.replace(oldValues,newValues);
workspace=workspace.replace('(["Cumulative PnL","Trade PnL","Drawdown","Trade frequency"] as ChartMode[])','(["Cumulative PnL","Drawdown"] as ChartMode[])');
workspace=workspace.replace('{chartMode==="Trade frequency"?`${values.reduce((s,v)=>s+v,0)} trades`:chartMode==="Drawdown"?pct(values.at(-1)):money(values.at(-1))}','{chartMode==="Drawdown"?pct(values.at(-1)):money(values.at(-1))}');
const advancedCall='<AdvancedBotAnalytics range={range} automation={automation} automations={automations} detail={detail} />';
if(workspace.includes(advancedCall))workspace=workspace.replace(advancedCall,'<AdvancedBotAnalytics accountId={accountId} range={range} automation={automation} automations={automations} detail={detail} />');
else if(!workspace.includes('<AdvancedBotAnalytics accountId={accountId}'))throw new Error("PnL Activity advanced workspace call anchor missing");

let advanced=fs.readFileSync(advancedPath,"utf8");
if(!advanced.includes('import PnlActivityChart from "./PnlActivityChart";')){
  const anchor='import styles from "./advanced-bot-analytics.module.css";';
  if(!advanced.includes(anchor))throw new Error("PnL Activity advanced import anchor missing");
  advanced=advanced.replace(anchor,`${anchor}\nimport PnlActivityChart from "./PnlActivityChart";`);
}
advanced=advanced.replace('type Props={range:string;automation:Automation;automations:Automation[];detail:Detail};','type Props={accountId:string;range:string;automation:Automation;automations:Automation[];detail:Detail};');
advanced=advanced.replace('export default function AdvancedBotAnalytics({range,automation,automations,detail}:Props){','export default function AdvancedBotAnalytics({accountId,range,automation,automations,detail}:Props){');
const suiteHead='    <div className={styles.suiteHead}><div><small>ADVANCED ANALYTICS</small><h3>Risk, efficiency & behavioral edge</h3></div><span>{trades.length} closed trades sampled · {range.toUpperCase()}</span></div>';
const activity='<PnlActivityChart accountId={accountId} range={range} botId={automation.id} />';
if(advanced.includes(suiteHead)&&!advanced.includes(activity))advanced=advanced.replace(suiteHead,`${suiteHead}\n    ${activity}`);
else if(!advanced.includes(activity))throw new Error("PnL Activity advanced insertion anchor missing");

for(const marker of[
  'import PnlActivityChart from "./PnlActivityChart";',
  '<PnlActivityChart accountId={accountId} range={range} scope={scope} type={type} />',
])if(!analytics.includes(marker))throw new Error(`PnL Activity Analytics output missing ${marker}`);
for(const marker of[
  'type ChartMode = "Cumulative PnL" | "Drawdown";',
  '(["Cumulative PnL","Drawdown"] as ChartMode[])',
  '<AdvancedBotAnalytics accountId={accountId}',
])if(!workspace.includes(marker))throw new Error(`PnL Activity workspace output missing ${marker}`);
if(workspace.includes('"Trade PnL"')||workspace.includes('"Trade frequency"')||workspace.includes('"PnL & Activity"'))throw new Error("Redundant Performance Explorer modes remain");
for(const marker of[
  'import PnlActivityChart from "./PnlActivityChart";',
  'type Props={accountId:string;',
  'AdvancedBotAnalytics({accountId,range,automation,automations,detail}:Props)',
  '<PnlActivityChart accountId={accountId} range={range} botId={automation.id} />',
])if(!advanced.includes(marker))throw new Error(`PnL Activity advanced output missing ${marker}`);

fs.writeFileSync(analyticsPath,analytics);fs.writeFileSync(workspacePath,workspace);fs.writeFileSync(advancedPath,advanced);
console.log("Prepared PnL & Activity in main Analytics and Bot Advanced Analytics with concise Performance Explorer.");
