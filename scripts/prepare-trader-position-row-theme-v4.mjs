import fs from "node:fs";
import path from "node:path";

// This runs before the final Position-row V3 transform. Patch that transform's
// build-workspace source so all earlier Trader transforms remain untouched.
const root = process.cwd();
const v3Path = path.join(root, "scripts", "prepare-trader-position-row-v3.mjs");
const tracePath = path.join(root, "app", "trader", "TradePriceTrace.tsx");
if (!fs.existsSync(v3Path) || !fs.existsSync(tracePath)) throw new Error("Positions theme V4 targets missing");

let v3 = fs.readFileSync(v3Path, "utf8");
const trace = fs.readFileSync(tracePath, "utf8");
let changes = 0;

for (const [from, to] of [["#6CB38C", "#27b978"], ["#B26F74", "#b87378"], ["rgba(178,111,116,.52)", "rgba(184,115,120,.52)"]]) {
  if (v3.includes(from)) { v3 = v3.replaceAll(from, to); changes += 1; }
}

const oldCancel = '      <button className={`${styles.iconAction} ${styles.cancelTrade}`} data-tip={accountMode === "live" ? "Cancel trade" : "Cancel trade · Live only"} aria-label="Cancel trade" disabled={busy || accountMode !== "live"} onClick={cancel}><span>⊘</span></button>';
const newCancel = '      {accountMode === "live" && <button className={`${styles.iconAction} ${styles.cancelTrade}`} data-tip="Cancel trade" aria-label="Cancel trade" disabled={busy} onClick={cancel}><span>⊘</span></button>}' ;
if (v3.includes(oldCancel)) { v3 = v3.replace(oldCancel, newCancel); changes += 1; }

const compactPairs = [
  ["gap:5px;min-width:127px;margin-left:auto", "gap:4px;min-width:0;margin-left:auto"],
  ["width:27px;height:27px;min-width:27px", "width:24px;height:24px;min-width:24px"],
  ["border-radius:8px;display:grid;place-items:center;font:400 13px/1", "border-radius:7px;display:grid;place-items:center;font:400 11px/1"],
];
for (const [from, to] of compactPairs) {
  if (v3.includes(from)) { v3 = v3.replaceAll(from, to); changes += 1; }
}

if (!trace.includes('const GREEN = "#27b978";') || !trace.includes('const RED = "#b87378";') || !trace.includes('const GUIDE = "rgba(188,188,188,.23)";')) {
  throw new Error("Position price trace is not using the final LabNarrative semantic palette");
}
if (!v3.includes('accountMode === "live" && <button') || !v3.includes('trader-live-cancel-control')) {
  throw new Error("Live-only no-sell Cancel action missing from final Position transform");
}
if (!v3.includes("#27b978") || !v3.includes("#b87378")) throw new Error("Final Position transform theme colors missing");

fs.writeFileSync(v3Path, v3);
console.log(`Prepared final Positions theme palette, tiny right-aligned actions and Live-only Cancel (${changes} source patches).`);
