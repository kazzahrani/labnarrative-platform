import fs from "node:fs";
import path from "node:path";

const analyticsPath = path.join(process.cwd(), "app", "trader", "Analytics.tsx");
if (!fs.existsSync(analyticsPath)) throw new Error("Analytics capital-deployment target missing");
let source = fs.readFileSync(analyticsPath, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Analytics capital-deployment missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes("CAPITAL DEPLOYMENT")) {
  replaceOnce(
    '  const [sortKey, setSortKey] = useState<SortKey>("realizedPnl");',
    '  const [sortKey, setSortKey] = useState<SortKey>("realizedRoi");',
    "ROI default sort",
  );

  const exitAnchor = '  const exitGradient = pieGradient(exitStats.map((item, index) => ({ value: item.trades, color: PIE_COLORS[index % PIE_COLORS.length] })));';
  if (!source.includes(exitAnchor)) throw new Error("Analytics capital-deployment missing exit-gradient anchor");
  source = source.replace(exitAnchor, `${exitAnchor}\n  const capitalDeployment = useMemo(() => {\n    const rows = automations\n      .map((item) => ({ id: item.id, name: item.name, capitalUsed: Math.max(0, Number(item.capitalUsed ?? 0)) }))\n      .filter((item) => item.capitalUsed > 0)\n      .sort((a, b) => b.capitalUsed - a.capitalUsed);\n    const top = rows.slice(0, 5);\n    const other = rows.slice(5).reduce((sum, item) => sum + item.capitalUsed, 0);\n    return other > 0 ? [...top, { id: \"other\", name: \"Other automations\", capitalUsed: other }] : top;\n  }, [automations]);\n  const capitalDeploymentTotal = capitalDeployment.reduce((sum, item) => sum + item.capitalUsed, 0);\n  const capitalGradient = pieGradient(capitalDeployment.map((item, index) => ({ value: item.capitalUsed, color: PIE_COLORS[index % PIE_COLORS.length] })));`);

  const marketPattern = /        <article className=\{styles\.pairCard\}>[\s\S]*?<small>MARKET CONTRIBUTION<\/small>[\s\S]*?        <\/article>/;
  if (!marketPattern.test(source)) throw new Error("Analytics capital-deployment missing Market Contribution card");
  const capitalCard = [
    '        <article className={styles.pairCard}>',
    '          <div className={styles.miniHeader}><div><small>CAPITAL DEPLOYMENT</small></div></div>',
    '          <div className={styles.donutWrap}><div key={`capital-deployment-${motionKey}-${range}-${scope}-${type}`} className={`${styles.donut} ${styles.animatedDonut}`} style={{ background: capitalGradient }}><div><strong>{capitalDeploymentTotal > 0 ? `$${capitalDeploymentTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "$0"}</strong><span>capital used</span></div></div><div className={styles.legend}>{capitalDeployment.map((item, index) => <p key={item.id} title={`${item.name}: $${item.capitalUsed.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}/><span>{item.name}</span><b>{capitalDeploymentTotal > 0 ? `${(item.capitalUsed / capitalDeploymentTotal * 100).toFixed(1)}%` : "0.0%"}</b></p>)}{!capitalDeployment.length && <p><span>No deployed capital yet</span></p>}</div></div>',
    '        </article>',
  ].join("\n");
  source = source.replace(marketPattern, capitalCard);

  const oldEmphasis = '            <strong className={pnlClass(item.realizedPnl)}>{money(item.realizedPnl)}</strong>\n            <span className={pnlClass(item.realizedRoi)}>{pct(item.realizedRoi)}</span>';
  const newEmphasis = '            <span className={pnlClass(item.realizedPnl)}>{money(item.realizedPnl)}</span>\n            <strong className={pnlClass(item.realizedRoi)}>{pct(item.realizedRoi)}</strong>';
  replaceOnce(oldEmphasis, newEmphasis, "PnL/ROI table emphasis");

  source = source.replace('  const pairStats = selected?.pairs ?? aggregatePairs(automations);\n', '');
  source = source.replace('  const maxPairMagnitude = Math.max(0.000001, ...pairStats.map((item) => Math.abs(item.pnl)));\n', '');
}

for (const marker of [
  '<small>CAPITAL DEPLOYMENT</small>',
  'capitalDeploymentTotal',
  'useState<SortKey>("realizedRoi")',
  '<span className={pnlClass(item.realizedPnl)}>{money(item.realizedPnl)}</span>',
  '<strong className={pnlClass(item.realizedRoi)}>{pct(item.realizedRoi)}</strong>',
]) if (!source.includes(marker)) throw new Error(`Analytics capital-deployment output missing ${marker}`);
if (source.includes('<small>MARKET CONTRIBUTION</small>')) throw new Error("Market Contribution still present");

fs.writeFileSync(analyticsPath, source);
console.log("Replaced Market Contribution with Capital Deployment and emphasized ROI in the Performance Table.");
