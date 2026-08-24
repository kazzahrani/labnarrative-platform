import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// V4 guard fix: Move to Breakeven requires Stop Loss, but it must not require
// two Take Profit targets. It can activate after TP1 or trailing-TP activation.
source = source.replace(
  /^\s*if \(breakeven && smartTps\.length < 2\) \{ setNotice\("Move to Breakeven requires at least two Take Profit targets\."\); return; \}\s*$/gm,
  ""
);
source = source.replace(
  /^\s*if \(smartEditDraft\.breakeven && smartEditDraft\.takeProfits\.length < 2\) \{ setNotice\("Move to Breakeven requires at least two Take Profit targets\."\); return; \}\s*$/gm,
  ""
);
source = source.replace(
  /if \(value && smartTps\.length < 2\) \{ setNotice\("Move to Breakeven requires at least two Take Profit targets\."\); return; \}\s*/g,
  ""
);
source = source.replace(
  /if \(value && draft\.takeProfits\.length < 2\) \{ setNotice\("Move to Breakeven requires at least two Take Profit targets\."\); return draft; \}\s*/g,
  ""
);

if (source.includes("Move to Breakeven requires at least two Take Profit targets.")) {
  throw new Error("SmartTrade V4 guard fix: stale 2+ TP breakeven restriction remains.");
}
if (!source.includes('if (breakeven && !smartStopEnabled)')) {
  throw new Error("SmartTrade V4 guard fix: Stop Loss requirement for breakeven is missing.");
}
if (!source.includes('if (working.breakeven && tpHits.some(Boolean)) breakevenActivated = true;')) {
  throw new Error("SmartTrade V4 guard fix: TP-triggered breakeven activation is missing.");
}
if (!source.includes('if (working.breakeven) breakevenActivated = true;')) {
  throw new Error("SmartTrade V4 guard fix: trailing-TP breakeven activation is missing.");
}

fs.writeFileSync(traderPath, source);
console.log("Hardened SmartTrade breakeven eligibility: Stop Loss required; no artificial 2+ TP restriction.");