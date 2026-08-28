import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "PortfolioIntelligence.tsx");
if (!fs.existsSync(target)) throw new Error("Portfolio performance insights target missing");
let source = fs.readFileSync(target, "utf8");

if (!source.includes("PORTFOLIO SNAPSHOT V2")) throw new Error("Portfolio snapshot redesign must run before performance insights");
if (!source.includes("PAPER PORTFOLIO TIME MACHINE V1")) throw new Error("Paper Portfolio history must run before performance insights");

if (!source.includes("PORTFOLIO PERFORMANCE INSIGHTS V1")) {
  const importAnchor = 'import PortfolioValueSnapshot from "./PortfolioValueSnapshot";';
  if (!source.includes(importAnchor)) throw new Error("Portfolio advanced insights import anchor missing");
  source = source.replace(importAnchor, `${importAnchor}\nimport PortfolioAdvancedInsights from "./PortfolioAdvancedInsights";\n// PORTFOLIO PERFORMANCE INSIGHTS V1 — long-term holdings + market-aware portfolio analytics.`);

  source = source.replace('type AllocationMode = "asset" | "source" | "bot";\n', '');
  source = source.replace('  const [allocationMode, setAllocationMode] = useState<AllocationMode>("asset");\n', '');

  const allocationDataStart = source.indexOf('  const allocationItems = useMemo(() => {');
  const selectedTradesStart = source.indexOf('  const selectedClosedTrades = trades.filter(', allocationDataStart);
  if (allocationDataStart < 0 || selectedTradesStart <= allocationDataStart) throw new Error("Portfolio allocation data block missing");
  source = source.slice(0, allocationDataStart) + source.slice(selectedTradesStart);

  const contribStart = source.indexOf('  const contributions = useMemo(() => {');
  const contribEnd = source.indexOf('  const contributionMax =', contribStart);
  if (contribStart < 0 || contribEnd <= contribStart) throw new Error("Portfolio contribution calculation block missing");
  const contributionCode = `  const contributions = useMemo(() => {\n    const map = new Map<string, { pnl: number; trades: number; holdingPnl: number; realizedPnl: number }>();\n    selectedRows.forEach((row) => {\n      if (row.source === "cash" || row.unrealizedPnl == null || !row.symbol) return;\n      const current = map.get(row.symbol) ?? { pnl: 0, trades: 0, holdingPnl: 0, realizedPnl: 0 };\n      const holdingPnl = finite(row.unrealizedPnl);\n      current.holdingPnl += holdingPnl;\n      current.pnl += holdingPnl;\n      map.set(row.symbol, current);\n    });\n    selectedClosedTrades.forEach((trade) => {\n      const symbol = baseAsset(trade.pair);\n      const current = map.get(symbol) ?? { pnl: 0, trades: 0, holdingPnl: 0, realizedPnl: 0 };\n      const realizedPnl = finite(trade.realizedPnl, finite(trade.pnl));\n      current.realizedPnl += realizedPnl;\n      current.pnl += realizedPnl;\n      current.trades += 1;\n      map.set(symbol, current);\n    });\n    return Array.from(map.entries()).map(([symbol, data]) => ({ symbol, ...data })).filter((row) => Math.abs(row.pnl) > .000001 || row.trades > 0).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 10);\n  }, [selectedRows, selectedClosedTrades]);\n`;
  source = source.slice(0, contribStart) + contributionCode + source.slice(contribEnd);

  const allocationGridStart = source.indexOf('    <div className={styles.twoCol}>\n      <section className={styles.card}><header><div><small>ALLOCATION INTELLIGENCE</small>');
  const contributionGridStart = source.indexOf('    <div className={styles.twoCol}>\n      <section className={styles.card}><header><div><small>RETURN CONTRIBUTION</small>', allocationGridStart);
  if (allocationGridStart < 0 || contributionGridStart <= allocationGridStart) throw new Error("Portfolio Allocation Intelligence grid missing");
  const advanced = `    <PortfolioAdvancedInsights\n      series={wealthSeries}\n      base={historyBase}\n      range={range}\n      currentValue={currentValue}\n      cashValue={cashValue}\n      coreValue={coreValue}\n      botValue={botExposure}\n      holdings={holdings.map((row) => {\n        const averageCost = row.costQty > 0 && Math.abs(row.costQty - row.quantity) < Math.max(.00000001, row.quantity * .001) ? row.costValue / row.costQty : STABLES.has(row.symbol) ? 1 : null;\n        const price = row.quantity > 0 ? row.value / row.quantity : null;\n        return { symbol: row.symbol, value: row.value, quantity: row.quantity, price, averageCost, unrealizedPnl: row.pnlKnown ? row.pnl : null };\n      })}\n    />\n\n`;
  source = source.slice(0, allocationGridStart) + advanced + source.slice(contributionGridStart);

  source = source.replace('<small>RETURN CONTRIBUTION</small><h2>What created realized return</h2>', '<small>RETURN CONTRIBUTION</small><h2>What created portfolio return</h2>');
  source = source.replace('<small>{row.trades} trades</small>', '<small>{row.holdingPnl !== 0 && row.trades ? `Holding + ${row.trades} trades` : row.holdingPnl !== 0 ? "Long-term holding" : `${row.trades} trades`}</small>');
  source = source.replace('No realized contribution in this selected period and scope.', 'No return contribution is available in this selected portfolio scope.');
}

for (const marker of [
  "PORTFOLIO PERFORMANCE INSIGHTS V1",
  "PortfolioAdvancedInsights",
  "What created portfolio return",
  "Long-term holding",
  "holdingPnl",
]) if (!source.includes(marker)) throw new Error(`Portfolio performance insights missing ${marker}`);
if (source.includes('ALLOCATION INTELLIGENCE')) throw new Error('Allocation Intelligence repetition still present');

fs.writeFileSync(target, source);
console.log("Prepared advanced Portfolio performance charts and long-term return contribution.");
