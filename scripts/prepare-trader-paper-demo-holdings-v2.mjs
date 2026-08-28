import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "PortfolioIntelligence.tsx");
if (!fs.existsSync(target)) throw new Error("Portfolio Intelligence target missing");
let source = fs.readFileSync(target, "utf8");

if (!source.includes("PAPER CORE HOLDINGS V2")) {
  const typeAnchor = 'type SeriesPoint = { at: string; pnl: number; cumulative: number };';
  if (!source.includes(typeAnchor)) throw new Error("Paper core holdings type anchor missing");
  source = source.replace(typeAnchor, `${typeAnchor}\n// PAPER CORE HOLDINGS V2 — demo-only long-term allocation, separate from bot execution bankroll.\ntype PaperCoreHolding = { symbol: string; quantity: number | string; average_cost: number | string; acquired_at: string; metadata?: Record<string, unknown> };`);

  const signature = 'function buildAttribution(accountKind: AccountKind, balances: Balance[], available: number, activeTrades: Trade[]): HoldingRow[] {';
  const nextSignature = 'function buildAttribution(accountKind: AccountKind, balances: Balance[], available: number, activeTrades: Trade[], paperCoreHoldings: PaperCoreHolding[] = [], paperPrices: Record<string, number> = {}): HoldingRow[] {';
  if (!source.includes(signature)) throw new Error("Paper core holdings attribution signature missing");
  source = source.replace(signature, nextSignature);

  const oldPaper = `  if (accountKind === "paper") {\n    const cash: HoldingRow = { key: "cash-USDT", symbol: "USDT", quantity: Math.max(0, available), price: 1, value: Math.max(0, available), source: "cash", botId: null, botName: null, averageCost: 1, unrealizedPnl: 0 };\n    return [cash, ...botRowsRaw];\n  }`;
  const newPaper = `  if (accountKind === "paper") {\n    // PAPER CORE HOLDINGS V2 — represent historical demo purchases as Core holdings while leaving execution accounting untouched.\n    const coreRows: HoldingRow[] = paperCoreHoldings.map((holding) => {\n      const qty = Math.max(0, finite(holding.quantity));\n      const averageCost = Math.max(0, finite(holding.average_cost));\n      const livePrice = Math.max(0, finite(paperPrices[holding.symbol], averageCost));\n      return {\n        key: \`core-\${holding.symbol}\`, symbol: holding.symbol, quantity: qty, price: livePrice || averageCost || null,\n        value: qty * (livePrice || averageCost), source: "core" as const, botId: null, botName: null,\n        averageCost: averageCost || null, unrealizedPnl: averageCost > 0 ? (livePrice - averageCost) * qty : null,\n      };\n    }).filter((row) => row.quantity > 0);\n    const purchaseCost = paperCoreHoldings.reduce((sum, holding) => sum + Math.max(0, finite(holding.quantity)) * Math.max(0, finite(holding.average_cost)), 0);\n    const cashAmount = Math.max(0, available - purchaseCost);\n    const cash: HoldingRow = { key: "cash-USDT", symbol: "USDT", quantity: cashAmount, price: 1, value: cashAmount, source: "cash", botId: null, botName: null, averageCost: 1, unrealizedPnl: 0 };\n    return [cash, ...coreRows, ...botRowsRaw];\n  }`;
  if (!source.includes(oldPaper)) throw new Error("Paper core holdings paper branch missing");
  source = source.replace(oldPaper, newPaper);

  const stateAnchor = '  const lastSnapshotAt = useRef(0);';
  if (!source.includes(stateAnchor)) throw new Error("Paper core holdings state anchor missing");
  source = source.replace(stateAnchor, `${stateAnchor}\n  const [paperCoreHoldings, setPaperCoreHoldings] = useState<PaperCoreHolding[]>([]);\n  const [paperPrices, setPaperPrices] = useState<Record<string, number>>({});\n  const [paperCoreReady, setPaperCoreReady] = useState(accountKind !== "paper");`);

  const oldMemo = '  const allRows = useMemo(() => buildAttribution(accountKind, balances, available, activeTrades), [accountKind, balances, available, activeTrades]);';
  const newMemo = '  const allRows = useMemo(() => buildAttribution(accountKind, balances, available, activeTrades, paperCoreHoldings, paperPrices), [accountKind, balances, available, activeTrades, paperCoreHoldings, paperPrices]);';
  if (!source.includes(oldMemo)) throw new Error("Paper core holdings attribution memo missing");
  source = source.replace(oldMemo, newMemo);

  const effectAnchor = '  useEffect(() => {\n    let active = true;\n    setPrefsReady(false); setHistoryReady(false);';
  if (!source.includes(effectAnchor)) throw new Error("Paper core holdings effect anchor missing");
  const paperEffect = `  useEffect(() => {\n    let active = true;\n    if (accountKind !== "paper") { setPaperCoreHoldings([]); setPaperPrices({}); setPaperCoreReady(true); return () => { active = false; }; }\n    setPaperCoreReady(false);\n    const loadPrices = async () => {\n      try {\n        const response = await fetch("/api/trader/markets", { cache: "no-store" });\n        const payload = await response.json() as { markets?: Array<{ symbol?: string; price?: number }> };\n        if (!active) return;\n        const next: Record<string, number> = {};\n        for (const market of payload.markets ?? []) if (market.symbol && Number.isFinite(Number(market.price)) && Number(market.price) > 0) next[market.symbol] = Number(market.price);\n        setPaperPrices(next);\n      } catch { /* keep cost basis as the truthful fallback mark */ }\n    };\n    void (async () => {\n      const result = await browserSupabase.from("trader_paper_core_holdings").select("symbol,quantity,average_cost,acquired_at,metadata").eq("account_id", accountId).order("acquired_at", { ascending: true });\n      if (!active) return;\n      setPaperCoreHoldings((result.data ?? []) as PaperCoreHolding[]);\n      await loadPrices();\n      if (active) setPaperCoreReady(true);\n    })();\n    const timer = window.setInterval(() => { void loadPrices(); }, 60_000);\n    return () => { active = false; window.clearInterval(timer); };\n  }, [accountId, accountKind]);\n\n`;
  source = source.replace(effectAnchor, `${paperEffect}${effectAnchor}`);

  const snapshotGuard = '    if (!prefsReady || !allRows.length || Date.now() - lastSnapshotAt.current < 60_000) return;';
  const nextSnapshotGuard = '    if (!prefsReady || !paperCoreReady || !allRows.length || Date.now() - lastSnapshotAt.current < 60_000) return;';
  if (!source.includes(snapshotGuard)) throw new Error("Paper core holdings snapshot guard missing");
  source = source.replace(snapshotGuard, nextSnapshotGuard);

  const snapshotDeps = '  }, [accountId, accountKind, prefsReady, allRows]);';
  const nextSnapshotDeps = '  }, [accountId, accountKind, prefsReady, paperCoreReady, allRows]);';
  if (!source.includes(snapshotDeps)) throw new Error("Paper core holdings snapshot dependencies missing");
  source = source.replace(snapshotDeps, nextSnapshotDeps);
}

for (const marker of [
  "PAPER CORE HOLDINGS V2",
  'from("trader_paper_core_holdings")',
  'fetch("/api/trader/markets"',
  'available - purchaseCost',
  'paperCoreReady',
]) if (!source.includes(marker)) throw new Error(`Paper demo holdings V2 missing ${marker}`);

fs.writeFileSync(target, source);
console.log("Prepared Paper Account long-term core holdings for Portfolio Intelligence.");
