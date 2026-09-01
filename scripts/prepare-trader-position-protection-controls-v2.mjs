import fs from "node:fs";
import path from "node:path";
await import("./prepare-trader-position-protection-controls-v1.mjs");
const file=path.join(process.cwd(),"app/trader/TradeActionsV2.tsx");
let source=fs.readFileSync(file,"utf8");
source=source.replaceAll("\\`","`").replaceAll("\\${","${");
fs.writeFileSync(file,source);
console.log("Normalized generated SL/TP action templates.");
