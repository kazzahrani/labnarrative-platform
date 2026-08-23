import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// Remember only closures that happen after this browser session starts. This lets a
// freshly completed deal remain visible in Active trades as a compact Completed row
// until the user reloads the page, matching the 3Commas behavior.
if (!source.includes("dcaLedgerSessionStartedAt")) {
  const stateAnchor = '  const [dcaTrades, setDcaTrades] = useState<DcaTrade[]>([]);';
  if (!source.includes(stateAnchor)) throw new Error("Could not locate DCA trades state.");
  source = source.replace(
    stateAnchor,
    stateAnchor + '\n  const [dcaLedgerSessionStartedAt] = useState(() => Date.now());'
  );
}

// Closed trades are always newest first. Never depend on insertion order because
// automatic TP/SL closures and restored localStorage data can arrive in mixed order.
const closedAnchor = '  const closedDcaTrades = dcaTrades.filter((trade) => trade.status === "Closed");';
if (source.includes(closedAnchor)) {
  source = source.replace(
    closedAnchor,
    [
      '  const closedDcaTrades = dcaTrades',
      '    .filter((trade) => trade.status === "Closed")',
      '    .sort((a, b) => (b.closedAt ? new Date(b.closedAt).getTime() : 0) - (a.closedAt ? new Date(a.closedAt).getTime() : 0));',
      '  const recentlyClosedDcaTrades = closedDcaTrades.filter((trade) => trade.closedAt && new Date(trade.closedAt).getTime() >= dcaLedgerSessionStartedAt);',
    ].join("\n")
  );
}

// The functional filters patch creates rawDcaRows. Active view temporarily keeps
// session-closed rows; Closed view uses the explicitly date-sorted ledger.
const rawRowsAnchor = '    const rawDcaRows = mode === "Active" ? activeDcaTrades : closedDcaTrades;';
if (source.includes(rawRowsAnchor)) {
  source = source.replace(
    rawRowsAnchor,
    '    const rawDcaRows = mode === "Active" ? [...activeDcaTrades, ...recentlyClosedDcaTrades].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : closedDcaTrades;'
  );
}

// A recently completed row on the Active page must immediately lose the live PnL bar,
// live PnL-under-volume display and action controls. It should read Completed just as
// the compact completed STG row does in the supplied 3Commas reference.
source = source.replace(
  'className={`${styles.dcaDealRow} ${mode === "Active" ? styles.dcaDealRowWithActions : ""}`}',
  'className={`${styles.dcaDealRow} ${trade.status === "Active" ? styles.dcaDealRowWithActions : ""}`}'
);
source = source.replaceAll(
  '{mode === "Active" && <tr className={styles.dcaTradeActionRow}>',
  '{trade.status === "Active" && <tr className={styles.dcaTradeActionRow}>'
);
source = source.replace(
  '<td>{mode === "Closed" && <><strong className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</strong><small className={pnl >= 0 ? styles.greenText : styles.redText}>{pct(pnlPct)}</small></>}{mode === "Active" && (() => {',
  '<td>{trade.status === "Closed" && <><strong className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</strong><small className={pnl >= 0 ? styles.greenText : styles.redText}>{pct(pnlPct)}</small></>}{trade.status === "Active" && (() => {'
);
source = source.replace(
  '{mode === "Active" && <small className={pnl >= 0 ? styles.dealVolumePnlWin : styles.dealVolumePnlLoss}>{compactMoney(pnl)}</small>}',
  '{trade.status === "Active" && <small className={pnl >= 0 ? styles.dealVolumePnlWin : styles.dealVolumePnlLoss}>{compactMoney(pnl)}</small>}'
);
source = source.replace(
  '{mode === "Active" ? "Active: " + Math.max(0, trade.maxAveraging - trade.averagingFilled) : "Filled: " + trade.averagingFilled}',
  '{trade.status === "Active" ? "Active: " + Math.max(0, trade.maxAveraging - trade.averagingFilled) : "Filled: " + trade.averagingFilled}'
);

// Current markup has changed a few times; normalize any direct status display without
// assuming an exact surrounding <td> shape.
if (!source.includes('trade.status === "Closed" ? "Completed" : "Active"')) {
  source = source.replace(/\{trade\.status\}/g, '{trade.status === "Closed" ? "Completed" : "Active"}');
}

if (!source.includes("recentlyClosedDcaTrades")) throw new Error("Recently closed DCA session rows were not installed.");
if (!source.includes('.sort((a, b) => (b.closedAt ? new Date(b.closedAt).getTime() : 0)')) throw new Error("Closed DCA date sorting was not installed.");

fs.writeFileSync(traderPath, source);
console.log("Added 3Commas-style just-closed DCA rows and newest-first Closed trades ordering.");
