import fs from "node:fs";
import path from "node:path";

const portfolioPath = path.join(process.cwd(), "app", "trader", "PortfolioIntelligence.tsx");
const advancedPath = path.join(process.cwd(), "app", "trader", "PortfolioAdvancedInsights.tsx");
if (!fs.existsSync(portfolioPath)) throw new Error("Portfolio cleanup target missing");
if (!fs.existsSync(advancedPath)) throw new Error("Portfolio advanced insights target missing");

let portfolio = fs.readFileSync(portfolioPath, "utf8");
let advanced = fs.readFileSync(advancedPath, "utf8");

if (!advanced.includes("PORTFOLIO CLEANUP V2")) {
  const removedCharts = '    <div className={styles.twoCol}><CumulativePnlChart series={series}/><ReturnMap holdings={holdings} currentValue={currentValue}/></div>\n    <CostBasisChart holdings={holdings}/>\n';
  if (!advanced.includes(removedCharts)) throw new Error("Portfolio cleanup advanced chart block missing");
  advanced = advanced.replace(removedCharts, '    {/* PORTFOLIO CLEANUP V2 — intentionally removed cumulative P/L, allocation-return and cost-basis-vs-market charts. */}\n');
}

if (!portfolio.includes("PORTFOLIO CLEANUP V2")) {
  const destructure = '  const { accountId, accountName, accountKind, startingBalance, equity, available, balances, trades, bots, onRefresh } = props;';
  if (portfolio.includes(destructure)) {
    portfolio = portfolio.replace(destructure, '  const { accountId, accountName, accountKind, startingBalance, equity, available, balances, trades, bots } = props;');
  }

  const refresh = '{onRefresh && <button type="button" onClick={onRefresh}>↻ Refresh</button>}';
  if (!portfolio.includes(refresh)) throw new Error("Portfolio refresh button anchor missing");
  portfolio = portfolio.replace(refresh, '');

  const head = '<span>Asset</span><span>Quantity</span><span>Value</span><span>Allocation</span><span>Avg cost</span><span>Unrealized PnL</span><span>Source</span>';
  if (!portfolio.includes(head)) throw new Error("Portfolio Holdings header anchor missing");
  portfolio = portfolio.replace(head, '<span>Asset</span><span>Quantity</span><span>Value</span><span>Allocation</span><span>Avg cost</span><span>Unrealized PnL</span><span>Unrealized PnL %</span>');

  const sourceCell = '<span>{Array.from(row.sources).join(" + ")}</span>';
  if (!portfolio.includes(sourceCell)) throw new Error("Portfolio Holdings source cell anchor missing");
  portfolio = portfolio.replace(sourceCell, '<span className={row.pnl >= 0 ? styles.positive : styles.negative}>{row.pnlKnown && row.costValue > 0 && Math.abs(row.costQty - row.quantity) < Math.max(.00000001, row.quantity * .001) ? pct(row.pnl / row.costValue * 100) : "—"}</span>');

  const holdingsMarker = '    <section className={styles.card}><header><div><small>HOLDINGS</small><h2>Portfolio ledger</h2>';
  const holdingsStart = portfolio.indexOf(holdingsMarker);
  if (holdingsStart < 0) throw new Error("Portfolio Holdings section anchor missing");
  const holdingsEndTag = '</section>';
  const holdingsEnd = portfolio.indexOf(holdingsEndTag, holdingsStart);
  if (holdingsEnd < 0) throw new Error("Portfolio Holdings section end missing");
  const holdingsBlock = portfolio.slice(holdingsStart, holdingsEnd + holdingsEndTag.length);
  portfolio = portfolio.slice(0, holdingsStart) + portfolio.slice(holdingsEnd + holdingsEndTag.length);

  const advancedMarker = '    <PortfolioAdvancedInsights';
  const advancedStart = portfolio.indexOf(advancedMarker);
  if (advancedStart < 0) throw new Error("Portfolio advanced insights insertion anchor missing");
  portfolio = portfolio.slice(0, advancedStart) + `    {/* PORTFOLIO CLEANUP V2 — Holdings is intentionally promoted above performance charts. */}\n${holdingsBlock}\n\n` + portfolio.slice(advancedStart);
}

for (const marker of [
  "PORTFOLIO CLEANUP V2",
  "Unrealized PnL %",
  "Portfolio ledger",
]) if (!portfolio.includes(marker)) throw new Error(`Portfolio cleanup missing ${marker}`);
for (const removed of ["CUMULATIVE P&L", "ALLOCATION × RETURN", "COST BASIS VS MARKET"]) {
  const rendered = advanced.slice(advanced.indexOf("export default function PortfolioAdvancedInsights"));
  if (rendered.includes(removed)) throw new Error(`Portfolio cleanup still renders ${removed}`);
}
if (portfolio.includes('>↻ Refresh</button>')) throw new Error("Portfolio Refresh button still rendered");

fs.writeFileSync(portfolioPath, portfolio);
fs.writeFileSync(advancedPath, advanced);
console.log("Prepared Portfolio cleanup: Holdings promoted, PnL % added, redundant charts and Refresh removed.");

await import("./prepare-trader-analytics-capital-deployment-v1.mjs");
