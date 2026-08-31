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

const chartMarker = "// CORE_V2_POSITION_STRATEGY_CHART_V1";
if (!chart.includes(chartMarker)) {
  const intervalType = 'type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";';
  if (!/type Interval\s*=\s*[^;]+;/.test(chart)) throw new Error("Chart Interval type missing");
  chart = chart.replace(/type Interval\s*=\s*[^;]+;/, `${intervalType}\n${chartMarker}`);

  const intervals = `const INTERVALS: Array<{ value: Interval; label: string }> = [\n  { value: "1m", label: "1m" }, { value: "3m", label: "3m" }, { value: "5m", label: "5m" }, { value: "15m", label: "15m" }, { value: "30m", label: "30m" },\n  { value: "1h", label: "1H" }, { value: "2h", label: "2H" }, { value: "4h", label: "4H" }, { value: "6h", label: "6H" }, { value: "8h", label: "8H" }, { value: "12h", label: "12H" },\n  { value: "1d", label: "D" }, { value: "3d", label: "3D" }, { value: "1w", label: "W" }, { value: "1M", label: "M" },\n];`;
  chart = chart.replace(/const INTERVALS:\s*Array<\{ value: Interval; label: string \}>\s*=\s*\[[\s\S]*?\];/, intervals);
  const bars = 'const HISTORY_BARS: Record<Interval, number> = { "1m": 6000, "3m": 6000, "5m": 6000, "15m": 6000, "30m": 6000, "1h": 6000, "2h": 6000, "4h": 6000, "6h": 6000, "8h": 6000, "12h": 6000, "1d": 6000, "3d": 5000, "1w": 2500, "1M": 1200 };';
  chart = chart.replace(/const HISTORY_BARS:\s*Record<Interval, number>\s*=\s*\{[^;]+\};/, bars);

  const chooseAnchor = 'function chooseInterval(createdAt: string, closedAt?: string): Interval {';
  if (!chart.includes(chooseAnchor)) throw new Error("Chart chooseInterval anchor missing");
  const helpers = `const CONDITION_INTERVALS: Array<{ labels: string[]; interval: Interval; minutes: number }> = [\n  { labels: ["1 minute", "1m"], interval: "1m", minutes: 1 }, { labels: ["3 minutes", "3m"], interval: "3m", minutes: 3 }, { labels: ["5 minutes", "5m"], interval: "5m", minutes: 5 },\n  { labels: ["15 minutes", "15m"], interval: "15m", minutes: 15 }, { labels: ["30 minutes", "30m"], interval: "30m", minutes: 30 }, { labels: ["1 hour", "1h"], interval: "1h", minutes: 60 },\n  { labels: ["2 hours", "2h"], interval: "2h", minutes: 120 }, { labels: ["4 hours", "4h"], interval: "4h", minutes: 240 }, { labels: ["6 hours", "6h"], interval: "6h", minutes: 360 },\n  { labels: ["8 hours", "8h"], interval: "8h", minutes: 480 }, { labels: ["12 hours", "12h"], interval: "12h", minutes: 720 }, { labels: ["1 day", "1d"], interval: "1d", minutes: 1440 },\n  { labels: ["3 days", "3d"], interval: "3d", minutes: 4320 }, { labels: ["1 week", "1w"], interval: "1w", minutes: 10080 }, { labels: ["1 month", "1M"], interval: "1M", minutes: 43200 },\n];\nfunction smallestConditionInterval(conditions: Condition[], fallback: Interval): Interval {\n  const matched = conditions.flatMap((condition) => { const clean = String(condition.timeframe || "").trim().toLowerCase(); const item = CONDITION_INTERVALS.find((candidate) => candidate.labels.some((label) => label.toLowerCase() === clean)); return item ? [item] : []; }).sort((a, b) => a.minutes - b.minutes);\n  return matched[0]?.interval ?? fallback;\n}\n\n`;
  chart = chart.replace(chooseAnchor, helpers + chooseAnchor);

  const snapshotAnchor = 'async function loadSnapshot(accountId: string, tradeId: string) {';
  if (!chart.includes(snapshotAnchor)) throw new Error("Chart snapshot anchor missing");
  chart = chart.replace(snapshotAnchor, `${snapshotAnchor}\n  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";\n  const useProxy = host === "app.labnarrative.com" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");\n  if (useProxy) {\n    const { data: sessionData, error: sessionError } = await browserSupabase.auth.getSession();\n    const token = sessionData.session?.access_token || "";\n    if (sessionError || !token) throw new Error("unauthorized");\n    const response = await fetch("/api/trader/function-proxy", { method: "POST", headers: { authorization: \`Bearer \${token}\`, "content-type": "application/json" }, body: JSON.stringify({ name: "trader-chart-control", body: { accountId, tradeId } }), cache: "no-store" });\n    const result = await response.json().catch(() => ({})) as ChartSnapshot;\n    if (!response.ok || result.error || result.ok !== true) throw new Error(result.error || \`trade_chart_http_\${response.status}\`);\n    return result;\n  }`);

  chart = chart.replace(/const \[enabled, setEnabled\] = useState<IndicatorName\[]>\(\[[^\]]*\]\);/, 'const [enabled, setEnabled] = useState<IndicatorName[]>(["Volume"]);');

  const strategyEffectAnchor = '  useEffect(() => {\n    let cancelled = false;\n    const run = async () => {';
  if (!chart.includes(strategyEffectAnchor)) throw new Error("Chart candle effect anchor missing");
  const enforce = `  useEffect(() => {\n    if (!snapshot) return;\n    const strategy = Array.from(new Set(conditions.map((condition) => condition.kind).filter((name): name is IndicatorName => INDICATORS.includes(name as IndicatorName))));\n    setEnabled(Array.from(new Set<IndicatorName>(["Volume", ...strategy])));\n    setInterval(smallestConditionInterval(conditions, chooseInterval(trade.openedAt, trade.closedAt ?? undefined)));\n  }, [snapshot, tradeId]);\n\n`;
  chart = chart.replace(strategyEffectAnchor, enforce + strategyEffectAnchor);

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
