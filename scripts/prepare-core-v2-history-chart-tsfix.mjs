import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader-v2", "HistoryApp.tsx");
if (!fs.existsSync(target)) throw new Error("Core V2 History target missing");
let source = fs.readFileSync(target, "utf8");
const before = "closeReason={selectedTrade.closeReason}";
const after = "closeReason={selectedTrade.closeReason || undefined}";
if (source.includes(before)) source = source.replace(before, after);
if (!source.includes(after)) throw new Error("Core V2 History chart closeReason guard missing");
fs.writeFileSync(target, source);
console.log("Prepared Core V2 History chart prop type guard.");
