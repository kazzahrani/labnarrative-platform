import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");
source = source.replace(
  '            if (false && item.averagingFilled < item.maxAveraging) {',
  '            if (false && bot && item.averagingFilled < item.maxAveraging) {'
);
if (!source.includes('if (false && bot && item.averagingFilled < item.maxAveraging)')) {
  throw new Error('Disabled legacy averaging branch TypeScript guard was not applied.');
}
fs.writeFileSync(traderPath, source);
console.log('Guarded disabled legacy DCA averaging branch for TypeScript.');
