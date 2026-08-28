import fs from "node:fs";
import path from "node:path";

const analyticsPath = path.join(process.cwd(), "app", "trader", "Analytics.tsx");
const workspacePath = path.join(process.cwd(), "app", "trader", "BotAnalyticsWorkspace.tsx");
const analyticsCssPath = path.join(process.cwd(), "app", "trader", "analytics.module.css");
const workspaceCssPath = path.join(process.cwd(), "app", "trader", "bot-analytics-workspace.module.css");

for (const file of [analyticsPath, workspacePath, analyticsCssPath, workspaceCssPath]) {
  if (!fs.existsSync(file)) throw new Error(`Analytics motion target missing: ${file}`);
}

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Analytics motion missing ${label}`);
  return source.replace(from, to);
}

let analytics = fs.readFileSync(analyticsPath, "utf8");
if (!analytics.includes('from "./analytics-motion"')) {
  analytics = replaceOnce(
    analytics,
    'import { useCallback, useEffect, useMemo, useState } from "react";',
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
    "Analytics React import",
  );
  analytics = replaceOnce(
    analytics,
    'import styles from "./analytics.module.css";',
    'import styles from "./analytics.module.css";\nimport { AnimatedNumber, useAnalyticsMotion } from "./analytics-motion";',
    "Analytics motion import",
  );
}
if (!analytics.includes('{ value: "ytd", label: "YTD" }')) {
  analytics = replaceOnce(
    analytics,
    '  { value: "90d", label: "90D" },\n  { value: "all", label: "All" },',
    '  { value: "90d", label: "90D" },\n  { value: "ytd", label: "YTD" },\n  { value: "all", label: "All" },',
    "Analytics YTD range",
  );
}
if (!analytics.includes('const requestIdRef = useRef(0);')) {
  analytics = replaceOnce(
    analytics,
    '  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");',
    '  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");\n  const requestIdRef = useRef(0);\n  const [motionKey, setMotionKey] = useState(0);\n  const motionRoot = useAnalyticsMotion<HTMLDivElement>(motionKey);',
    "Analytics motion state",
  );
  analytics = replaceOnce(
    analytics,
    '    if (!accountId) return;\n    setLoading(true);',
    '    if (!accountId) return;\n    const requestId = ++requestIdRef.current;\n    setLoading(true);',
    "Analytics request sequence",
  );
  analytics = replaceOnce(
    analytics,
    '      if (response.ok !== true || !response.summary) throw new Error(response.error || "analytics_failed");\n      setSummary(response.summary);',
    '      if (response.ok !== true || !response.summary) throw new Error(response.error || "analytics_failed");\n      if (response.range !== range) throw new Error("analytics_range_mismatch");\n      if (requestId !== requestIdRef.current) return;\n      setSummary(response.summary);',
    "Analytics range validation",
  );
  analytics = replaceOnce(
    analytics,
    '      setSelectedId((current) => current === "all" || (response.automations ?? []).some((item) => item.id === current) ? current : "all");\n    } catch (caught) {\n      setError(caught instanceof Error ? caught.message : "Unable to load analytics.");\n    } finally {\n      setLoading(false);',
    '      setSelectedId((current) => current === "all" || (response.automations ?? []).some((item) => item.id === current) ? current : "all");\n      setMotionKey((current) => current + 1);\n    } catch (caught) {\n      if (requestId === requestIdRef.current) setError(caught instanceof Error ? caught.message : "Unable to load analytics.");\n    } finally {\n      if (requestId === requestIdRef.current) setLoading(false);',
    "Analytics stale request guard",
  );
  analytics = replaceOnce(analytics, '  return <div className={styles.analytics}>', '  return <div ref={motionRoot} className={styles.analytics}>', "Analytics motion root");
  analytics = analytics.replace('      <section className={styles.metrics}>', '      <section className={styles.metrics} data-analytics-motion>');
  analytics = analytics.replace('      <section className={styles.performanceCard}>', '      <section className={styles.performanceCard} data-analytics-motion>');
  analytics = analytics.replace('      <section className={styles.insightGrid}>', '      <section className={styles.insightGrid} data-analytics-motion>');
  analytics = analytics.replace('      <section className={styles.compareCard}>', '      <section className={styles.compareCard} data-analytics-motion>');

  analytics = analytics.replace('{money(summary?.realizedPnl)}', '<AnimatedNumber value={summary?.realizedPnl} format={(value) => money(value)} />');
  analytics = analytics.replace('{pct(summary?.realizedRoi)}', '<AnimatedNumber value={summary?.realizedRoi} format={(value) => pct(value)} />');
  analytics = analytics.replace('{plainPct(summary?.winRate)}', '<AnimatedNumber value={summary?.winRate} format={(value) => plainPct(value)} />');
  analytics = analytics.replace('{money(summary ? -summary.maxDrawdown : null)}', '<AnimatedNumber value={summary ? -summary.maxDrawdown : null} format={(value) => money(value)} />');
  analytics = analytics.replace('{summary?.runningAutomations ?? 0}<em> / {summary?.automationCount ?? 0}</em>', '<AnimatedNumber value={summary?.runningAutomations ?? 0} format={(value) => String(Math.round(value))} /><em> / <AnimatedNumber value={summary?.automationCount ?? 0} format={(value) => String(Math.round(value))} /></em>');
  analytics = analytics.replace('{money(selectedPnl)}</strong><span>{selectedClosed} closed trades</span>', '<AnimatedNumber value={selectedPnl} format={(value) => money(value)} /></strong><span><AnimatedNumber value={selectedClosed} format={(value) => String(Math.round(value))} /> closed trades</span>');

  analytics = analytics.replace(
    '<svg viewBox="0 0 920 260" role="img"',
    '<svg key={`analytics-chart-${motionKey}-${selectedId}-${range}`} viewBox="0 0 920 260" role="img"',
  );
  analytics = analytics.replace(
    '<path d={chart.line} className={`${styles.line} ${pnlClass(selectedPnl)}`} fill="none" vectorEffect="non-scaling-stroke"/>',
    '<path key={`analytics-line-${motionKey}-${selectedId}-${range}`} d={chart.line} pathLength="1" className={`${styles.line} ${styles.animatedLine} ${pnlClass(selectedPnl)}`} fill="none" vectorEffect="non-scaling-stroke"/>',
  );
  analytics = analytics.replace('<div className={styles.donut} style={{ background: outcomeGradient }}>', '<div key={`outcome-${motionKey}-${selectedId}-${range}`} className={`${styles.donut} ${styles.animatedDonut}`} style={{ background: outcomeGradient }}>');
  analytics = analytics.replace('<div className={styles.donut} style={{ background: exitGradient }}>', '<div key={`exit-${motionKey}-${selectedId}-${range}`} className={`${styles.donut} ${styles.animatedDonut}`} style={{ background: exitGradient }}>');
}
fs.writeFileSync(analyticsPath, analytics);

let workspace = fs.readFileSync(workspacePath, "utf8");
if (!workspace.includes('from "./analytics-motion"')) {
  workspace = replaceOnce(workspace, 'import styles from "./bot-analytics-workspace.module.css";', 'import styles from "./bot-analytics-workspace.module.css";\nimport { AnimatedNumber, useAnalyticsMotion } from "./analytics-motion";', "Workspace motion import");
}
if (!workspace.includes('{value:"ytd",label:"YTD"}')) {
  workspace = replaceOnce(workspace, 'const RANGE_OPTIONS = [{value:"7d",label:"7D"},{value:"30d",label:"30D"},{value:"90d",label:"90D"},{value:"all",label:"All"}];', 'const RANGE_OPTIONS = [{value:"7d",label:"7D"},{value:"30d",label:"30D"},{value:"90d",label:"90D"},{value:"ytd",label:"YTD"},{value:"all",label:"All"}];', "Workspace YTD range");
  workspace = replaceOnce(workspace, 'function since(range:string){ const days=range==="7d"?7:range==="30d"?30:range==="90d"?90:0; return days?new Date(Date.now()-days*86400000).toISOString():null; }', 'function since(range:string){ if(range==="ytd"){const now=new Date();return new Date(Date.UTC(now.getUTCFullYear(),0,1)).toISOString();} const days=range==="7d"?7:range==="30d"?30:range==="90d"?90:0; return days?new Date(Date.now()-days*86400000).toISOString():null; }', "Workspace YTD since");
}
if (!workspace.includes('const motionRoot=useAnalyticsMotion<HTMLDivElement>')) {
  workspace = replaceOnce(workspace, '  const [compareId,setCompareId]=useState("");', '  const [compareId,setCompareId]=useState("");\n  const motionKey=`${range}:${automation.id}:${automation.closedTrades}:${automation.realizedPnl}:${detail?.recentTrades?.length??0}`;\n  const motionRoot=useAnalyticsMotion<HTMLDivElement>(motionKey);', "Workspace motion root state");
  workspace = workspace.replace('<div className={styles.scroll}>', '<div ref={motionRoot} className={styles.scroll}>');
  workspace = workspace.replaceAll('<section className={styles.kpis}>', '<section className={styles.kpis} data-analytics-motion>');
  workspace = workspace.replaceAll('<section className={styles.chartCard}>', '<section className={styles.chartCard} data-analytics-motion>');
  workspace = workspace.replaceAll('<section className={styles.threeGrid}>', '<section className={styles.threeGrid} data-analytics-motion>');
  workspace = workspace.replaceAll('<section className={styles.splitGrid}>', '<section className={styles.splitGrid} data-analytics-motion>');
  workspace = workspace.replaceAll('<section className={styles.card}>', '<section className={styles.card} data-analytics-motion>');

  workspace = workspace.replace('{money(automation.realizedPnl)}</strong>', '<AnimatedNumber value={automation.realizedPnl} format={(value)=>money(value)} /></strong>');
  workspace = workspace.replace('{pct(automation.realizedRoi)}</strong>', '<AnimatedNumber value={automation.realizedRoi} format={(value)=>pct(value)} /></strong>');
  workspace = workspace.replace('<article><span>Trades</span><strong>{automation.closedTrades}</strong>', '<article><span>Trades</span><strong><AnimatedNumber value={automation.closedTrades} format={(value)=>String(Math.round(value))} /></strong>');
  workspace = workspace.replace('<article><span>Win rate</span><strong>{pct(automation.winRate)}</strong>', '<article><span>Win rate</span><strong><AnimatedNumber value={automation.winRate} format={(value)=>pct(value)} /></strong>');
  workspace = workspace.replace('{money(-automation.maxDrawdown)}</strong>', '<AnimatedNumber value={-automation.maxDrawdown} format={(value)=>money(value)} /></strong>');
  workspace = workspace.replace('{money(automation.expectancy)}</strong>', '<AnimatedNumber value={automation.expectancy} format={(value)=>money(value)} /></strong>');
  workspace = workspace.replace('{duration(automation.avgHoldMinutes)}</strong>', '<AnimatedNumber value={automation.avgHoldMinutes} format={(value)=>duration(value)} /></strong>');

  workspace = workspace.replace('<div className={styles.chart}><svg viewBox="0 0 900 230" preserveAspectRatio="none">', '<div className={styles.chart}><svg key={`bot-chart-${motionKey}-${chartMode}`} viewBox="0 0 900 230" preserveAspectRatio="none">');
  workspace = workspace.replace('<path d={chart.path} className={selectedTone} vectorEffect="non-scaling-stroke"/>', '<path key={`bot-line-${motionKey}-${chartMode}`} d={chart.path} pathLength="1" className={`${selectedTone} ${styles.animatedLine}`} vectorEffect="non-scaling-stroke"/>');
  workspace = workspace.replace('<div className={styles.donut} style={{background:outcomePie}}>', '<div key={`bot-outcome-${motionKey}`} className={`${styles.donut} ${styles.animatedDonut}`} style={{background:outcomePie}}>');
  workspace = workspace.replace('<div className={styles.donut} style={{background:exitPie}}>', '<div key={`bot-exit-${motionKey}`} className={`${styles.donut} ${styles.animatedDonut}`} style={{background:exitPie}}>');
}
fs.writeFileSync(workspacePath, workspace);

const motionCss = '\n@keyframes analyticsLineDraw{from{stroke-dasharray:1;stroke-dashoffset:1;opacity:.3}to{stroke-dasharray:1;stroke-dashoffset:0;opacity:1}}@keyframes analyticsDonutPop{0%{opacity:.45;transform:scale(.94) rotate(-3deg)}100%{opacity:1;transform:scale(1) rotate(0)}}.animatedLine{stroke-dasharray:1;animation:analyticsLineDraw .46s cubic-bezier(.2,.8,.2,1)}.animatedDonut{animation:analyticsDonutPop .32s cubic-bezier(.2,.8,.2,1)}@media(prefers-reduced-motion:reduce){.animatedLine,.animatedDonut{animation:none!important}.track i,.botBars button i{transition:none!important}}\n';
for (const cssPath of [analyticsCssPath, workspaceCssPath]) {
  let css = fs.readFileSync(cssPath, "utf8");
  if (!css.includes('@keyframes analyticsLineDraw')) css += motionCss;
  fs.writeFileSync(cssPath, css);
}

for (const marker of [
  '{ value: "ytd", label: "YTD" }',
  'analytics_range_mismatch',
  'data-analytics-motion',
  'styles.animatedLine',
]) if (!analytics.includes(marker)) throw new Error(`Analytics motion output missing ${marker}`);
for (const marker of ['{value:"ytd",label:"YTD"}', 'useAnalyticsMotion<HTMLDivElement>', 'styles.animatedLine']) if (!workspace.includes(marker)) throw new Error(`Workspace motion output missing ${marker}`);

console.log("Prepared Analytics YTD ranges, stale-response guards, animated metrics, charts, donuts and scroll motion.");
