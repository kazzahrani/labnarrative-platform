import fs from "node:fs";
import path from "node:path";

const analyticsPath=path.join(process.cwd(),"app","trader","Analytics.tsx");
const workspacePath=path.join(process.cwd(),"app","trader","BotAnalyticsWorkspace.tsx");
for(const target of [analyticsPath,workspacePath])if(!fs.existsSync(target))throw new Error(`Benchmark analytics target missing: ${target}`);

let analytics=fs.readFileSync(analyticsPath,"utf8");
if(!analytics.includes('import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";')){
  const anchor='import styles from "./analytics.module.css";';
  if(!analytics.includes(anchor))throw new Error("Benchmark analytics import anchor missing");
  analytics=analytics.replace(anchor,`${anchor}\nimport BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";`);
}
const mainChart=/<div className=\{styles\.lineChart\}>[\s\S]*?<div className=\{styles\.chartAxis\}>[\s\S]*?<\/div>\s*<\/div>/;
if(!mainChart.test(analytics))throw new Error("Benchmark analytics main chart block missing");
analytics=analytics.replace(mainChart,'<BenchmarkPerformanceChart series={chartSeries} capitalUsed={summary?.capitalUsed ?? 0} mode="Cumulative PnL" range={range} />');

let workspace=fs.readFileSync(workspacePath,"utf8");
if(!workspace.includes('import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";')){
  const anchor='import styles from "./bot-analytics-workspace.module.css";';
  if(!workspace.includes(anchor))throw new Error("Benchmark workspace import anchor missing");
  workspace=workspace.replace(anchor,`${anchor}\nimport BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";`);
}
const workspaceChart=/<div className=\{styles\.chart\}><svg[\s\S]*?<\/svg>\{!values\.length&&<div>No closed trades in this period\.<\/div>\}<\/div>/;
if(!workspaceChart.test(workspace))throw new Error("Benchmark workspace Performance Explorer chart missing");
workspace=workspace.replace(workspaceChart,'<BenchmarkPerformanceChart series={automation.series} capitalUsed={capitalUsed} mode={chartMode} range={range} compact />');

for(const marker of [
  'import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";',
  '<BenchmarkPerformanceChart series={chartSeries} capitalUsed={summary?.capitalUsed ?? 0} mode="Cumulative PnL" range={range} />',
])if(!analytics.includes(marker))throw new Error(`Benchmark analytics output missing ${marker}`);
for(const marker of [
  'import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";',
  '<BenchmarkPerformanceChart series={automation.series} capitalUsed={capitalUsed} mode={chartMode} range={range} compact />',
])if(!workspace.includes(marker))throw new Error(`Benchmark workspace output missing ${marker}`);

fs.writeFileSync(analyticsPath,analytics);
fs.writeFileSync(workspacePath,workspace);
console.log("Prepared benchmark-aware Analytics charts with explicit axes in the Performance Explorer and main overview.");
