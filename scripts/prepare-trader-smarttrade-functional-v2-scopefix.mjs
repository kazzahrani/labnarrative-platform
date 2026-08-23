import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (!source.includes('  const equalizeTakeProfitShares = (targets: TakeProfit[]) => {')) {
  const anchor = '  const stopPrice = effectiveEntry ? effectiveEntry * (1 - smartStopPct / 100) : 0;';
  if (!source.includes(anchor)) throw new Error('SmartTrade V2 scope fix: component derived-price anchor missing.');
  source = source.replace(anchor, [
    anchor,
    '  const equalizeTakeProfitShares = (targets: TakeProfit[]) => {',
    '    if (!targets.length) return targets;',
    '    const even = Math.floor((100 / targets.length) * 100) / 100;',
    '    return targets.map((target, index) => ({ ...target, share: index === targets.length - 1 ? Number((100 - even * (targets.length - 1)).toFixed(2)) : even }));',
    '  };',
  ].join('\n'));
}

if (!source.includes('const equalizeTakeProfitShares = (targets: TakeProfit[])')) throw new Error('SmartTrade V2 scope fix was not installed.');
fs.writeFileSync(traderPath, source);
console.log('Fixed SmartTrade TP share helper scope.');
