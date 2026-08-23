import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const before = source;

// Keep the real Maximum active trades field in Main, but remove the duplicate
// Maximum active deals control wherever an older Advanced section still renders it.
source = source.replace(
  /\s*<label><span>Maximum active deals<\/span><input[^>]*\/?>\s*<\/label>/g,
  ""
);

// Handle multiline JSX variants conservatively without touching the Main
// "Maximum active trades" control.
source = source.replace(
  /\s*<label>\s*<span>Maximum active deals<\/span>[\s\S]*?<\/label>/g,
  ""
);

if (source.includes("Maximum active deals")) {
  throw new Error("Duplicate Maximum active deals control is still present after cleanup.");
}

fs.writeFileSync(traderPath, source);
console.log(before === source ? "Maximum active deals was already absent." : "Removed duplicate Maximum active deals from DCA Advanced section.");
