import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

source = source.replace(
  '            if (false && item.averagingFilled < item.maxAveraging) {',
  '            if (false && bot && item.averagingFilled < item.maxAveraging) {'
);

const branchToken = '            if (false && bot && item.averagingFilled < item.maxAveraging) {';
const branchStart = source.indexOf(branchToken);
if (branchStart < 0) throw new Error('Disabled legacy averaging branch TypeScript guard was not applied.');
const openBrace = source.indexOf('{', branchStart);
let depth = 0;
let branchEnd = -1;
for (let i = openBrace; i < source.length; i += 1) {
  if (source[i] === '{') depth += 1;
  else if (source[i] === '}') {
    depth -= 1;
    if (depth === 0) { branchEnd = i + 1; break; }
  }
}
if (branchEnd < 0) throw new Error('Could not locate disabled legacy averaging branch end.');
let branch = source.slice(branchStart, branchEnd);
branch = branch.replaceAll('bot.', 'bot!.');
source = source.slice(0, branchStart) + branch + source.slice(branchEnd);

if (!source.slice(branchStart, branchStart + branch.length).includes('bot!.deviation')) {
  throw new Error('Disabled legacy averaging branch non-null assertions were not applied.');
}

fs.writeFileSync(traderPath, source);
console.log('Made disabled legacy DCA averaging branch type-safe.');
