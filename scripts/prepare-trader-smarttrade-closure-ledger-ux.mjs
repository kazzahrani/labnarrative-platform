import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (!source.includes("smartLedgerSessionStartedAt")) {
  const stateAnchor = '  const [smartTrades, setSmartTrades] = useState<SmartTrade[]>([]);';
  if (!source.includes(stateAnchor)) throw new Error("Could not locate SmartTrade state.");
  source = source.replace(
    stateAnchor,
    stateAnchor + '\n  const [smartLedgerSessionStartedAt] = useState(() => Date.now());'
  );
}

if (!source.includes("recentlyClosedSmart")) {
  const realizedAnchor = '  const smartRealized = smartTrades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);';
  if (!source.includes(realizedAnchor)) throw new Error("Could not locate SmartTrade realized ledger.");
  source = source.replace(
    realizedAnchor,
    realizedAnchor + '\n  const recentlyClosedSmart = closedSmart.filter((trade) => trade.closedAt && new Date(trade.closedAt).getTime() >= smartLedgerSessionStartedAt);'
  );
}

source = source.replace(
  '    const source = smartTab === "Active" ? activeSmart : closedSmart;',
  '    const source = smartTab === "Active" ? [...activeSmart, ...recentlyClosedSmart].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : closedSmart;'
);
source = source.replace(
  '  }, [smartTab, activeSmart, closedSmart, smartSearch, smartPairFilter]);',
  '  }, [smartTab, activeSmart, closedSmart, recentlyClosedSmart, smartSearch, smartPairFilter]);'
);

if (!source.includes('smartTab === "Active" ? [...activeSmart, ...recentlyClosedSmart]')) throw new Error("SmartTrade Active tab does not retain just-closed rows.");
if (!source.includes('recentlyClosedSmart, smartSearch')) throw new Error("SmartTrade row memo dependencies were not updated.");

fs.writeFileSync(traderPath, source);
console.log("Added 3Commas-style just-closed SmartTrade rows; History remains newest-first.");
