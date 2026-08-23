import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Multi-pair bots need a rotating scan cursor so "All coins" does not hammer hundreds of markets at once.
source = source.replace(
  'import { useEffect, useMemo, useState } from "react";',
  'import { useEffect, useMemo, useRef, useState } from "react";'
);

if (!source.includes('  pairs?: string[];')) {
  source = source.replace(
    '  pair: string;\n  baseOrder: number;',
    '  pair: string;\n  pairs?: string[];\n  allPairs?: boolean;\n  baseOrder: number;'
  );
}

if (!source.includes('DCA MULTI PAIR STATE')) {
  source = source.replace(
    '  const [selectedSymbol, setSelectedSymbol] = useState("BTC");',
    [
      '  const [selectedSymbol, setSelectedSymbol] = useState("BTC");',
      '  // DCA MULTI PAIR STATE',
      '  const [dcaSelectedPairs, setDcaSelectedPairs] = useState<string[]>(["BTC"]);',
      '  const [dcaAllPairs, setDcaAllPairs] = useState(false);',
      '  const [dcaPairsOpen, setDcaPairsOpen] = useState(false);',
      '  const [dcaPairSearch, setDcaPairSearch] = useState("");',
      '  const dcaScanCursorRef = useRef(0);',
    ].join("\n")
  );
}

if (!source.includes('const dcaBotPairSymbols = (bot: DcaBot)')) {
  source = source.replace(
    '  const selectedMarket = markets.find((item) => item.symbol === selectedSymbol) ?? markets[0] ?? FALLBACK_MARKETS[0];',
    [
      '  const dcaBotPairSymbols = (bot: DcaBot) => {',
      '    if (bot.allPairs) return markets.map((market) => market.symbol);',
      '    const stored = bot.pairs?.length ? bot.pairs : [bot.pair];',
      '    return Array.from(new Set(stored.map((pair) => pair.split("/")[0]).filter(Boolean)));',
      '  };',
      '  const dcaBotPairLabel = (bot: DcaBot) => {',
      '    const symbols = dcaBotPairSymbols(bot);',
      '    if (bot.allPairs) return "All coins (" + symbols.length + ")";',
      '    if (symbols.length <= 1) return (symbols[0] ?? bot.pair.split("/")[0]) + "/USDT";',
      '    return symbols.length + " pairs · " + symbols.slice(0, 3).map((symbol) => symbol + "/USDT").join(", ") + (symbols.length > 3 ? " +" + (symbols.length - 3) + " more" : "");',
      '  };',
      '  const effectiveDcaPairSymbols = dcaAllPairs ? markets.map((market) => market.symbol) : (dcaSelectedPairs.length ? dcaSelectedPairs : [selectedSymbol]);',
      '  const dcaPairSelectionLabel = dcaAllPairs ? "All coins (" + markets.length + ")" : effectiveDcaPairSymbols.length === 1 ? effectiveDcaPairSymbols[0] + "/USDT" : effectiveDcaPairSymbols.length + " pairs USDT";',
      '  const selectedMarket = markets.find((item) => item.symbol === selectedSymbol) ?? markets[0] ?? FALLBACK_MARKETS[0];',
    ].join("\n")
  );
}

const oldPicker = '<label><span>Pairs <em>{markets.length > 1 ? "Unselect all (" + markets.length + ")" : ""}</em></span><select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>{markets.map((market) => <option key={market.symbol} value={market.symbol}>{market.symbol}/USDT</option>)}</select></label>';
const newPicker = `<label className={styles.dcaPairsField}><span>Pairs <button type="button" className={styles.dcaPairsClear} onClick={() => { setDcaAllPairs(false); setDcaSelectedPairs([]); }}>Unselect all ({effectiveDcaPairSymbols.length})</button></span>
                <div className={styles.dcaPairsPicker}>
                  <button type="button" className={styles.dcaPairsTrigger} onClick={() => setDcaPairsOpen((open) => !open)}><strong>{dcaPairSelectionLabel}</strong><span>⌄</span></button>
                  {dcaPairsOpen && <div className={styles.dcaPairsMenu}>
                    <button type="button" className={styles.dcaAllPairsOption} onClick={() => { setDcaAllPairs((all) => !all); if (!dcaAllPairs) setDcaSelectedPairs([]); }}>
                      <i className={dcaAllPairs ? styles.dcaPairChecked : ""}>{dcaAllPairs ? "✓" : ""}</i><strong>All coins</strong><small>{markets.length} USDT pairs</small>
                    </button>
                    <div className={styles.dcaPairsSearch}><span>⌕</span><input autoFocus placeholder="Search coin" value={dcaPairSearch} onChange={(e) => setDcaPairSearch(e.target.value)}/></div>
                    <div className={styles.dcaPairsList}>{markets.filter((market) => !dcaPairSearch.trim() || market.symbol.toLowerCase().includes(dcaPairSearch.trim().toLowerCase()) || market.label.toLowerCase().includes(dcaPairSearch.trim().toLowerCase())).map((market) => {
                      const checked = dcaAllPairs || dcaSelectedPairs.includes(market.symbol);
                      return <button type="button" key={market.symbol} className={styles.dcaPairOption} onClick={() => {
                        if (dcaAllPairs) {
                          setDcaAllPairs(false);
                          setDcaSelectedPairs(markets.map((item) => item.symbol).filter((symbol) => symbol !== market.symbol));
                        } else {
                          setDcaSelectedPairs((items) => items.includes(market.symbol) ? items.filter((symbol) => symbol !== market.symbol) : [...items, market.symbol]);
                        }
                        setSelectedSymbol(market.symbol);
                      }}><i className={checked ? styles.dcaPairChecked : ""}>{checked ? "✓" : ""}</i><span>{market.symbol}/USDT</span><small>{market.label}</small></button>;
                    })}</div>
                    <div className={styles.dcaPairsFooter}><span>{effectiveDcaPairSymbols.length} selected</span><button type="button" onClick={() => setDcaPairsOpen(false)}>Done</button></div>
                  </div>}
                </div>
              </label>`;
if (source.includes(oldPicker)) source = source.replace(oldPicker, newPicker);

// Restore a sensible first selection if the user cleared all custom pairs.
if (!source.includes('DCA MULTI PAIR DEFAULT')) {
  const anchor = '  const selectedPrice = selectedMarket?.price ?? null;';
  source = source.replace(anchor, [
    anchor,
    '  // DCA MULTI PAIR DEFAULT',
    '  useEffect(() => {',
    '    if (!dcaAllPairs && dcaSelectedPairs.length === 0 && selectedSymbol) setDcaSelectedPairs([selectedSymbol]);',
    '  }, [dcaAllPairs, dcaSelectedPairs.length, selectedSymbol]);',
  ].join("\n"));
}

// Editing/copying a bot restores its complete pair universe.
source = source.replace(
  '    setSelectedSymbol(bot.pair.split("/")[0]);',
  [
    '    const editSymbols = bot.allPairs ? [] : dcaBotPairSymbols(bot);',
    '    setDcaAllPairs(Boolean(bot.allPairs));',
    '    setDcaSelectedPairs(editSymbols);',
    '    setSelectedSymbol((editSymbols[0] ?? bot.pair.split("/")[0]));',
  ].join("\n")
);

// Store the pair selection in the configured bot creator, including edit mode.
const creatorStart = source.indexOf('  const createConfiguredDcaBot = () => {');
const creatorEnd = source.indexOf('  const handleGlobalSearch = (value: string) => {', creatorStart);
if (creatorStart >= 0 && creatorEnd > creatorStart) {
  let creator = source.slice(creatorStart, creatorEnd);
  if (!creator.includes('const chosenPairSymbols = effectiveDcaPairSymbols')) {
    creator = creator.replace(
      '    const savedConditions = dcaConditions.map((condition) => ({ ...condition }));',
      [
        '    const savedConditions = dcaConditions.map((condition) => ({ ...condition }));',
        '    const chosenPairSymbols = Array.from(new Set(effectiveDcaPairSymbols.filter(Boolean)));',
        '    if (!chosenPairSymbols.length) { setNotice("Select at least one pair or choose All coins."); return; }',
        '    const chosenPairs = chosenPairSymbols.map((symbol) => symbol + "/USDT");',
        '    const primaryPair = chosenPairs[0];',
      ].join("\n")
    );
  }
  creator = creator.replaceAll(
    'pair: `${selectedSymbol}/USDT`,',
    'pair: primaryPair,\n        pairs: chosenPairs,\n        allPairs: dcaAllPairs,'
  );

  const immediateStart = creator.indexOf('    if (!savedConditions.length && selectedPrice && selectedPrice > 0) {');
  const immediateEnd = creator.indexOf('    setSelectedBotId(bot.id);', immediateStart);
  if (immediateStart >= 0 && immediateEnd > immediateStart) {
    const immediate = [
      '    if (!savedConditions.length) {',
      '      const now = new Date().toISOString();',
      '      const immediateTrades: DcaTrade[] = chosenPairs.flatMap((pair, index) => {',
      '        const symbol = pair.split("/")[0];',
      '        const price = markets.find((market) => market.symbol === symbol)?.price ?? 0;',
      '        if (!price || price <= 0) return [];',
      '        return [{',
      '          id: "deal-" + Date.now() + "-" + index + "-" + bot.id, botId: bot.id, botName: bot.name, pair,',
      '          entryPrice: price, averagePrice: price, quantity: bot.baseOrder / price, invested: bot.baseOrder,',
      '          averagingFilled: 0, maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: now, lastPrice: price,',
      '        }];',
      '      });',
      '      if (immediateTrades.length) setDcaTrades((current) => [...immediateTrades, ...current]);',
      '    }',
    ].join("\n") + "\n";
    creator = creator.slice(0, immediateStart) + immediate + creator.slice(immediateEnd);
  }
  source = source.slice(0, creatorStart) + creator + source.slice(creatorEnd);
}

// The condition evaluator receives the pair being scanned rather than assuming one pair per bot.
source = source.replace(
  '  const evaluateDcaCondition = async (bot: DcaBot, condition: NonNullable<DcaBot["conditions"]>[number]) => {\n    const symbol = bot.pair.replace("/", "");',
  '  const evaluateDcaCondition = async (bot: DcaBot, pair: string, condition: NonNullable<DcaBot["conditions"]>[number]) => {\n    const symbol = pair.replace("/", "");'
);

// Replace the one-bot/one-pair evaluator with pair-aware scanning. All-coins bots rotate in batches to keep the UI responsive.
const engineMarker = source.indexOf('  // DCA PAPER ENGINE V1');
const evalStart = source.indexOf('  useEffect(() => {', engineMarker);
const manageStart = source.indexOf('  useEffect(() => {\n    let cancelled = false;\n    let busy = false;\n    const manageTrades = async () => {', evalStart);
if (engineMarker >= 0 && evalStart >= 0 && manageStart > evalStart) {
  const multiPairEvaluator = `  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const evaluateBots = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const activeKeys = new Set(dcaTrades.filter((trade) => trade.status === "Active").map((trade) => trade.botId + "|" + trade.pair));
        let availableCapital = Math.max(0, DEMO_BALANCE - dcaTrades.filter((trade) => trade.status === "Active").reduce((sum, trade) => sum + trade.invested, 0));
        for (const bot of dcaBots) {
          if (cancelled || bot.status !== "Running") continue;
          const pairUniverse = dcaBotPairSymbols(bot).map((symbol) => symbol + "/USDT");
          if (!pairUniverse.length) continue;
          const batchSize = Math.min(pairUniverse.length, 35);
          const startIndex = pairUniverse.length > batchSize ? dcaScanCursorRef.current % pairUniverse.length : 0;
          const scanPairs = pairUniverse.length <= batchSize ? pairUniverse : Array.from({ length: batchSize }, (_, index) => pairUniverse[(startIndex + index) % pairUniverse.length]);
          if (pairUniverse.length > batchSize) dcaScanCursorRef.current = (startIndex + batchSize) % pairUniverse.length;
          for (const pair of scanPairs) {
            if (cancelled || availableCapital < bot.baseOrder) break;
            const key = bot.id + "|" + pair;
            if (activeKeys.has(key)) continue;
            const conditions = bot.conditions ?? [];
            let shouldOpen = conditions.length === 0 && (!bot.startCondition || bot.startCondition === "Immediately");
            let triggerPrice = markets.find((market) => market.symbol === pair.split("/")[0])?.price ?? 0;
            if (conditions.length > 0) {
              shouldOpen = true;
              for (const condition of conditions) {
                const result = await evaluateDcaCondition(bot, pair, condition);
                if (result.price > 0) triggerPrice = result.price;
                if (!result.ok) { shouldOpen = false; break; }
              }
            }
            if (!shouldOpen || triggerPrice <= 0 || cancelled) continue;
            const quantity = bot.baseOrder / triggerPrice;
            const trade: DcaTrade = {
              id: "deal-" + Date.now() + "-" + pair.replace("/", "") + "-" + bot.id,
              botId: bot.id, botName: bot.name, pair,
              entryPrice: triggerPrice, averagePrice: triggerPrice, quantity, invested: bot.baseOrder, averagingFilled: 0,
              maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: new Date().toISOString(), lastPrice: triggerPrice,
            };
            setDcaTrades((items) => items.some((item) => item.botId === bot.id && item.pair === pair && item.status === "Active") ? items : [trade, ...items]);
            activeKeys.add(key);
            availableCapital -= bot.baseOrder;
          }
        }
      } finally { busy = false; }
    };
    void evaluateBots();
    const timer = window.setInterval(() => { void evaluateBots(); }, 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [dcaBots, dcaTrades, markets]);

`;
  source = source.slice(0, evalStart) + multiPairEvaluator + source.slice(manageStart);
}

// Bot list/detail pages should describe the selected universe, not only the legacy primary pair.
source = source.replaceAll('<td>{bot.pair}</td>', '<td>{dcaBotPairLabel(bot)}</td>');
source = source.replaceAll('<p>{bot.pair} · Paper Account 1001863</p>', '<p>{dcaBotPairLabel(bot)} · Paper Account 1001863</p>');
source = source.replaceAll('<div><span>Pairs</span><strong>{bot.pair}</strong></div>', '<div><span>Pairs</span><strong>{dcaBotPairLabel(bot)}</strong></div>');

// Summary reflects the worst-case capital if every chosen pair simultaneously reaches the full averaging ladder.
source = source.replace(
  '<div><span>Max amount for bot usage ⓘ</span><strong>{compactMoney(dcaTotal).replace("$", "")} USDT</strong></div>',
  '<div><span>Max amount for bot usage ⓘ</span><strong>{compactMoney(dcaTotal * Math.max(1, effectiveDcaPairSymbols.length)).replace("$", "")} USDT</strong></div>'
);
source = source.replace(
  '<div><span>% of available balance to be used by the bot</span><strong>{(dcaTotal / Math.max(accountValue, 1) * 100).toFixed(2)}%</strong></div>',
  '<div><span>% of available balance to be used by the bot</span><strong>{(dcaTotal * Math.max(1, effectiveDcaPairSymbols.length) / Math.max(accountValue, 1) * 100).toFixed(2)}%</strong></div>'
);

if (!css.includes('.dcaPairsPicker')) {
  css += `

/* DCA multi-pair / all-coins selector */
.dcaPairsField { position: relative; }
.dcaPairsField > span { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dcaPairsClear { border: 0 !important; background: transparent !important; color: #4da7ff !important; padding: 0 !important; font-size: 12px !important; cursor: pointer; }
.dcaPairsPicker { position: relative; }
.dcaPairsTrigger { width: 100%; min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 13px; border: 1px solid #30485a; border-radius: 6px; background: #101d25; color: #d8e3eb; text-align: left; cursor: pointer; }
.dcaPairsTrigger strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcaPairsMenu { position: absolute; z-index: 120; top: calc(100% + 5px); left: 0; right: 0; min-width: 360px; max-height: 520px; display: flex; flex-direction: column; border: 1px solid #52616d; border-radius: 7px; background: #202327; box-shadow: 0 18px 46px rgba(0,0,0,.48); overflow: hidden; }
.dcaAllPairsOption, .dcaPairOption { width: 100%; border: 0; background: transparent; color: #e0e5e9; display: grid; grid-template-columns: 22px minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px 13px; text-align: left; cursor: pointer; }
.dcaAllPairsOption { border-bottom: 1px solid #3b4045; background: #262a2f; }
.dcaAllPairsOption:hover, .dcaPairOption:hover { background: #30353a; }
.dcaAllPairsOption small, .dcaPairOption small { color: #8ea1af; font-size: 11px; }
.dcaPairOption span { font-weight: 650; }
.dcaAllPairsOption i, .dcaPairOption i { width: 17px; height: 17px; border: 1px solid #73828e; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-style: normal; font-size: 12px; }
.dcaPairChecked { background: #18b8ae !important; border-color: #18b8ae !important; color: #08171c !important; }
.dcaPairsSearch { margin: 10px; min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid #3e4b55; border-radius: 5px; background: #151b20; color: #91a3af; }
.dcaPairsSearch input { width: 100%; border: 0 !important; outline: 0; background: transparent !important; color: #e4ebef; min-height: 34px; }
.dcaPairsList { overflow-y: auto; min-height: 120px; max-height: 330px; }
.dcaPairsFooter { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; border-top: 1px solid #3b4045; background: #262a2f; color: #9aabb6; font-size: 12px; }
.dcaPairsFooter button { border: 0; border-radius: 5px; background: #18b8ae; color: #062126; font-weight: 800; padding: 7px 16px; cursor: pointer; }
@media (max-width: 720px) { .dcaPairsMenu { min-width: 100%; width: min(92vw, 420px); right: auto; } }
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Enabled multi-pair and All coins DCA bots with batched live-condition scanning.");
