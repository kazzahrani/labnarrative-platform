import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const positionsPath = path.join(root, "app", "trader-v2", "PositionsApp.tsx");
const positionsCssPath = path.join(root, "app", "trader-v2", "positions-app.module.css");
const chartPath = path.join(root, "app", "trader", "DcaTradeChartV2Workstation.tsx");
for (const target of [positionsPath, positionsCssPath, chartPath]) if (!fs.existsSync(target)) throw new Error(`Core V2 position chart target missing: ${target}`);
let positions = fs.readFileSync(positionsPath, "utf8");
let positionsCss = fs.readFileSync(positionsCssPath, "utf8");
let chart = fs.readFileSync(chartPath, "utf8");

const marker = "CORE_V2_POSITION_TV_CHART_V1";
if (!positions.includes(marker)) {
  positions = positions.replace('import CoinLogo from "../trader/CoinLogo";', 'import CoinLogo from "../trader/CoinLogo";\nimport DcaTradeChartV2Workstation from "../trader/DcaTradeChartV2Workstation";\n// CORE_V2_POSITION_TV_CHART_V1');
  positions = positions.replace('  trade_id: string;\n  public_trade_no:', '  trade_id: string;\n  client_id: string | null;\n  public_trade_no:');
  positions = positions.replace('type PositionsResponse = {\n  ok?: boolean;', 'type PositionsResponse = {\n  ok?: boolean;\n  accountId?: string;');
  positions = positions.replace('function PositionRow({ position }: { position: Position }) {', 'function PositionRow({ position, onOpenChart }: { position: Position; onOpenChart: (position: Position) => void }) {');
  positions = positions.replace('  return <article className={styles.positionRow}>', '  return <article className={styles.positionRow} role="button" tabIndex={0} aria-label={`Open ${position.pair} TV chart`} onClick={() => onOpenChart(position)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenChart(position); } }}>');
  positions = positions.replace('      <div className={styles.actions}>', '      <div className={styles.actions} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>');
  positions = positions.replace('<button type="button" onClick={editExitPlan} disabled={!canEditExit}', '<button type="button" onClick={(event) => { event.stopPropagation(); editExitPlan(); }} disabled={!canEditExit}');
  positions = positions.replace('  const [error, setError] = useState("");\n  const nav = useMemo(() => NAV, []);', '  const [error, setError] = useState("");\n  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);\n  const nav = useMemo(() => NAV, []);');
  positions = positions.replace('positions.map((position) => <PositionRow key={position.trade_id} position={position} />)', 'positions.map((position) => <PositionRow key={position.trade_id} position={position} onOpenChart={setSelectedPosition} />)');
  const end = '    <main className={`${base.main} ${styles.main}`}><header className={`${base.topbar} ${styles.topbar}`}><div><div className={base.eyebrow}>Core V2</div><h1 className={base.title}>Positions</h1></div><div className={base.topActions}>{positionsData && <div className={base.status}><span className={base.dot} />{positions.length} open · {ageLabel(positionsData.ageMs)}{latencyMs != null ? ` · ${latencyMs} ms` : ""}</div>}<button className={base.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>\n  </div>;';
  if (!positions.includes(end)) throw new Error("Positions chart final return anchor missing");
  positions = positions.replace(end, '    <main className={`${base.main} ${styles.main}`}><header className={`${base.topbar} ${styles.topbar}`}><div><div className={base.eyebrow}>Core V2</div><h1 className={base.title}>Positions</h1></div><div className={base.topActions}>{positionsData && <div className={base.status}><span className={base.dot} />{positions.length} open · {ageLabel(positionsData.ageMs)}{latencyMs != null ? ` · ${latencyMs} ms` : ""}</div>}<button className={base.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>\n    {selectedPosition && positionsData?.accountId && <DcaTradeChartV2Workstation accountId={positionsData.accountId} tradeId={selectedPosition.client_id || selectedPosition.trade_id} pair={selectedPosition.pair} status={selectedPosition.status === "Closed" ? "Closed" : "Active"} entryPrice={finite(selectedPosition.average_price)} averagePrice={finite(selectedPosition.average_price)} createdAt={selectedPosition.opened_at || selectedPosition.updated_at || new Date().toISOString()} lastPrice={finite(selectedPosition.last_price)} takeProfitPrice={(() => { const target = (selectedPosition.take_profit_targets ?? []).map((item) => finite(item.profitPct)).find((value) => value > 0); return target && selectedPosition.average_price > 0 ? selectedPosition.average_price * (1 + target / 100) : null; })()} stopLossPrice={selectedPosition.stop_enabled && selectedPosition.stop_pct > 0 && selectedPosition.average_price > 0 ? selectedPosition.average_price * (1 - selectedPosition.stop_pct / 100) : null} onClose={() => setSelectedPosition(null)} />}\n  </div>;');
}

const cssMarker = "/* CORE_V2_POSITION_TV_CHART_V1 */";
if (!positionsCss.includes(cssMarker)) positionsCss += `\n${cssMarker}\n.positionRow{cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}.positionRow:hover{border-color:#414141;background:#121212;transform:translateY(-1px)}.positionRow:focus-visible{outline:1px solid #656565;outline-offset:2px}.actions{cursor:default}\n`;

const chartMarker = "CORE_V2_POSITION_STRATEGY_CHART_V1";
if (!chart.includes(chartMarker)) {
  const importAnchor = 'import styles from "./dca-trade-workstation.module.css";';
  if (!chart.includes(importAnchor)) throw new Error("Chart strategy marker anchor missing");
  chart = chart.replace(importAnchor, `${importAnchor} // ${chartMarker}`);

  const snapshotAnchor = 'async function loadSnapshot(accountId: string, tradeId: string) {';
  if (!chart.includes(snapshotAnchor)) throw new Error("Chart snapshot anchor missing");
  chart = chart.replace(snapshotAnchor, `${snapshotAnchor}\n  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";\n  const useProxy = host === "app.labnarrative.com" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");\n  if (useProxy) {\n    const { data: sessionData, error: sessionError } = await browserSupabase.auth.getSession();\n    const token = sessionData.session?.access_token || "";\n    if (sessionError || !token) throw new Error("unauthorized");\n    const response = await fetch("/api/trader/function-proxy", { method: "POST", headers: { authorization: \`Bearer \${token}\`, "content-type": "application/json" }, body: JSON.stringify({ name: "trader-chart-control", body: { accountId, tradeId } }), cache: "no-store" });\n    const result = await response.json().catch(() => ({})) as ChartSnapshot;\n    if (!response.ok || result.error || result.ok !== true) throw new Error(result.error || \`trade_chart_http_\${response.status}\`);\n    return result;\n  }`);

  chart = chart.replace(/const \[enabled, setEnabled\] = useState<IndicatorName\[]>\(\[[^\]]*\]\);/, 'const [enabled, setEnabled] = useState<IndicatorName[]>(["Volume"]);');
  chart = chart.replace('    if (strategy.length) setEnabled(Array.from(new Set<IndicatorName>(["Volume", ...strategy])));', '    setEnabled(Array.from(new Set<IndicatorName>(["Volume", ...strategy])));');

  const toggleMatch = /const toggle = \(name: IndicatorName\) =>[^;]+;/;
  if (toggleMatch.test(chart)) chart = chart.replace(toggleMatch, 'const coreRequiredIndicators = new Set(conditions.map((condition) => condition.kind));\n  const toggle = (name: IndicatorName) => { if (name === "Volume" || coreRequiredIndicators.has(name)) return; setEnabled(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]); };');

  const returnAnchor = '  return <div className={styles.overlay}';
  if (!chart.includes(returnAnchor)) throw new Error("Chart return anchor missing");
  chart = chart.replace(returnAnchor, '  const chartIndicatorNames = Array.from(new Set<IndicatorName>(["Volume", ...conditions.map((condition) => condition.kind).filter((name): name is IndicatorName => INDICATORS.includes(name as IndicatorName))]));\n\n' + returnAnchor);
  chart = chart.replace(/INDICATORS\.map\(/g, 'chartIndicatorNames.map(');
  chart = chart.replace(/Other toggles use standard defaults\./g, 'Only indicators used by this bot are shown. Volume is always included.');
}

for (const required of [marker, "DcaTradeChartV2Workstation", "selectedPosition", "onOpenChart", "client_id"]) if (!positions.includes(required)) throw new Error(`Core V2 position chart output missing ${required}`);
for (const required of [chartMarker, "smallestConditionInterval", 'useState<IndicatorName[]>(["Volume"])', "chartIndicatorNames", 'name: "trader-chart-control"']) if (!chart.includes(required)) throw new Error(`Strategy chart output missing ${required}`);
fs.writeFileSync(positionsPath, positions);
fs.writeFileSync(positionsCssPath, positionsCss);
fs.writeFileSync(chartPath, chart);
console.log("Prepared Core V2 row-click TV chart with bot-derived timeframe and entry indicators.");
