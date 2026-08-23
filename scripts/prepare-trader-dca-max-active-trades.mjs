import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// Persist a per-bot concurrency limit. Legacy bots default to one active deal.
if (!source.includes("  maxActiveTrades?: number;")) {
  source = source.replace(
    "  maxSafetyOrders: number;\n  deviation: number;",
    "  maxSafetyOrders: number;\n  maxActiveTrades?: number;\n  deviation: number;"
  );
}

if (!source.includes("const [maxActiveTrades, setMaxActiveTrades]")) {
  source = source.replace(
    '  const [maxSafetyOrders, setMaxSafetyOrders] = useState(5);',
    '  const [maxSafetyOrders, setMaxSafetyOrders] = useState(5);\n  const [maxActiveTrades, setMaxActiveTrades] = useState(1);'
  );
}

// Add the visible configuration field immediately after the multi-pair selector in Main.
if (!source.includes("Maximum active trades ⓘ")) {
  const pairFieldStart = source.indexOf('<label className={styles.dcaPairsField}>');
  const pairFieldEnd = pairFieldStart >= 0 ? source.indexOf('</label>', pairFieldStart) : -1;
  if (pairFieldStart >= 0 && pairFieldEnd > pairFieldStart) {
    const field = '\n              <label><span>Maximum active trades ⓘ</span><input type="number" min={1} max={100} value={maxActiveTrades} onChange={(e) => setMaxActiveTrades(clamp(Math.round(Number(e.target.value) || 1), 1, 100))}/></label>';
    source = source.slice(0, pairFieldEnd + '</label>'.length) + field + source.slice(pairFieldEnd + '</label>'.length);
  }
}

// Editing/copying an existing bot restores the stored concurrency limit.
source = source.replace(
  '    setMaxSafetyOrders(bot.maxSafetyOrders);',
  '    setMaxSafetyOrders(bot.maxSafetyOrders);\n    setMaxActiveTrades(Math.max(1, bot.maxActiveTrades ?? 1));'
);

// Store the limit on both updated and newly-created bots.
const creatorStart = source.indexOf('  const createConfiguredDcaBot = () => {');
const creatorEnd = source.indexOf('  const handleGlobalSearch = (value: string) => {', creatorStart);
if (creatorStart >= 0 && creatorEnd > creatorStart) {
  let creator = source.slice(creatorStart, creatorEnd);
  creator = creator.replaceAll(
    '        maxSafetyOrders,\n        deviation,',
    '        maxSafetyOrders,\n        maxActiveTrades,\n        deviation,'
  );
  // Immediate multi-pair bots may open only up to the configured concurrency limit.
  creator = creator.replace(
    'const immediateTrades: DcaTrade[] = chosenPairs.flatMap((pair, index) => {',
    'const immediateTrades: DcaTrade[] = chosenPairs.slice(0, maxActiveTrades).flatMap((pair, index) => {'
  );
  source = source.slice(0, creatorStart) + creator + source.slice(creatorEnd);
}

// Enforce the same limit in the live condition scanner.
const botLoop = [
  '        for (const bot of dcaBots) {',
  '          if (cancelled || bot.status !== "Running") continue;',
  '          const pairUniverse = dcaBotPairSymbols(bot).map((symbol) => symbol + "/USDT");',
].join("\n");
if (source.includes(botLoop)) {
  source = source.replace(botLoop, [
    '        for (const bot of dcaBots) {',
    '          if (cancelled || bot.status !== "Running") continue;',
    '          const botMaxActiveTrades = Math.max(1, bot.maxActiveTrades ?? 1);',
    '          let activeForBot = dcaTrades.filter((trade) => trade.botId === bot.id && trade.status === "Active").length;',
    '          if (activeForBot >= botMaxActiveTrades) continue;',
    '          const pairUniverse = dcaBotPairSymbols(bot).map((symbol) => symbol + "/USDT");',
  ].join("\n"));
}
source = source.replace(
  '          for (const pair of scanPairs) {\n            if (cancelled || availableCapital < bot.baseOrder) break;',
  '          for (const pair of scanPairs) {\n            if (activeForBot >= botMaxActiveTrades) break;\n            if (cancelled || availableCapital < bot.baseOrder) break;'
);
source = source.replace(
  '            activeKeys.add(key);\n            availableCapital -= bot.baseOrder;',
  '            activeKeys.add(key);\n            activeForBot += 1;\n            availableCapital -= bot.baseOrder;'
);

// IMPORTANT: keep the scanner alive while trade marks and market prices update.
// Previously the evaluator depended on dcaTrades/markets, so every 5-second mark-to-market
// update cancelled an in-progress All-coins scan. A closed trade could therefore free a slot
// while the scanner kept restarting before reaching another qualifying pair.
if (!source.includes("DCA SCANNER LIVE STATE REFS")) {
  if (!source.includes("useRef")) {
    source = source.replace(
      'import { useEffect, useMemo, useState } from "react";',
      'import { useEffect, useMemo, useRef, useState } from "react";'
    );
  }
  source = source.replace(
    '  const [dcaTrades, setDcaTrades] = useState<DcaTrade[]>([]);',
    '  const [dcaTrades, setDcaTrades] = useState<DcaTrade[]>([]);\n  // DCA SCANNER LIVE STATE REFS\n  const dcaTradesRef = useRef<DcaTrade[]>([]);\n  const dcaMarketsRef = useRef<Market[]>([]);'
  );

  const persistenceAnchor = '  useEffect(() => { localStorage.setItem("labnarrative-dca-trades-v1", JSON.stringify(dcaTrades)); }, [dcaTrades]);';
  if (source.includes(persistenceAnchor)) {
    source = source.replace(
      persistenceAnchor,
      persistenceAnchor + '\n  useEffect(() => { dcaTradesRef.current = dcaTrades; }, [dcaTrades]);\n  useEffect(() => { dcaMarketsRef.current = markets; }, [markets]);'
    );
  }

  const engineMarker = source.indexOf('  // DCA PAPER ENGINE V1');
  const evalStart = source.indexOf('  useEffect(() => {', engineMarker);
  const manageStart = source.indexOf('  useEffect(() => {\n    let cancelled = false;\n    let busy = false;\n    const manageTrades = async () => {', evalStart);
  if (engineMarker >= 0 && evalStart >= 0 && manageStart > evalStart) {
    let evaluator = source.slice(evalStart, manageStart);
    evaluator = evaluator.replaceAll('dcaTrades.filter(', 'dcaTradesRef.current.filter(');
    evaluator = evaluator.replace(
      'const pairUniverse = dcaBotPairSymbols(bot).map((symbol) => symbol + "/USDT");',
      'const pairUniverse = bot.allPairs\n            ? dcaMarketsRef.current.map((market) => market.symbol + "/USDT")\n            : Array.from(new Set((bot.pairs?.length ? bot.pairs : [bot.pair]).map((pair) => pair.includes("/") ? pair : pair + "/USDT")));'
    );
    evaluator = evaluator.replace(
      'let triggerPrice = markets.find((market) => market.symbol === pair.split("/")[0])?.price ?? 0;',
      'let triggerPrice = dcaMarketsRef.current.find((market) => market.symbol === pair.split("/")[0])?.price ?? 0;'
    );
    evaluator = evaluator.replace(
      'const timer = window.setInterval(() => { void evaluateBots(); }, 8000);',
      'const timer = window.setInterval(() => { void evaluateBots(); }, 4000);'
    );
    evaluator = evaluator.replace('  }, [dcaBots, dcaTrades, markets]);', '  }, [dcaBots]);');
    source = source.slice(0, evalStart) + evaluator + source.slice(manageStart);
  }
}

// DCA bot list: show actual open deals / configured maximum instead of hardcoded 1/1.
source = source.replace(
  '<td>1 / 1</td>',
  '<td>{dcaTrades.filter((trade) => trade.botId === bot.id && trade.status === "Active").length} / {Math.max(1, bot.maxActiveTrades ?? 1)}</td>'
);

// Bot detail Stats must use the configured maximum too.
source = source.replace(
  '<div><span>Max active trades</span><strong>1</strong></div>',
  '<div><span>Max active trades</span><strong>{Math.max(1, bot.maxActiveTrades ?? 1)}</strong></div>'
);

// Capital summary should reflect the maximum simultaneous deals, not every selected pair.
source = source.replace(
  'compactMoney(dcaTotal * Math.max(1, effectiveDcaPairSymbols.length)).replace("$", "")',
  'compactMoney(dcaTotal * Math.max(1, Math.min(effectiveDcaPairSymbols.length, maxActiveTrades))).replace("$", "")'
);
source = source.replace(
  '(dcaTotal * Math.max(1, effectiveDcaPairSymbols.length) / Math.max(accountValue, 1) * 100).toFixed(2)',
  '(dcaTotal * Math.max(1, Math.min(effectiveDcaPairSymbols.length, maxActiveTrades)) / Math.max(accountValue, 1) * 100).toFixed(2)'
);

if (!source.includes("Maximum active trades ⓘ")) throw new Error("Maximum active trades field was not inserted.");
if (!source.includes("maxActiveTrades?: number;")) throw new Error("DCA bot concurrency type was not inserted.");
if (!source.includes('activeForBot >= botMaxActiveTrades')) throw new Error("DCA scanner concurrency enforcement was not inserted.");
if (!source.includes('trade.botId === bot.id && trade.status === "Active").length} / {Math.max(1, bot.maxActiveTrades ?? 1)')) throw new Error("DCA bot Active trades counter was not made live.");
if (!source.includes("DCA SCANNER LIVE STATE REFS")) throw new Error("DCA scanner live state refs were not inserted.");
if (!source.includes('}, [dcaBots]);')) throw new Error("DCA scanner still restarts on trade/market updates.");

fs.writeFileSync(traderPath, source);
console.log("Added real maximum-active-trades configuration and persistent post-close DCA re-arming.");
