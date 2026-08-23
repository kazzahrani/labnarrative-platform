import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// DCA deal filters: Account / Bot / Pair, shared by Active and Closed ledgers.
if (!source.includes("dcaDealFiltersOpen")) {
  const stateAnchor = '  const [positionsOn, setPositionsOn] = useState(true);';
  source = source.replace(stateAnchor, [
    stateAnchor,
    '  const [dcaDealFiltersOpen, setDcaDealFiltersOpen] = useState(false);',
    '  const [dcaAccountFilter, setDcaAccountFilter] = useState("All");',
    '  const [dcaBotFilter, setDcaBotFilter] = useState("All");',
    '  const [dcaPairFilter, setDcaPairFilter] = useState("All");',
  ].join("\n"));
}

const rowsAnchor = '    const rows = mode === "Active" ? activeDcaTrades : closedDcaTrades;';
if (source.includes(rowsAnchor) && !source.includes("const rawDcaRows =")) {
  source = source.replace(rowsAnchor, [
    '    const rawDcaRows = mode === "Active" ? activeDcaTrades : closedDcaTrades;',
    '    const dcaFilterBots = dcaBots.filter((bot) => rawDcaRows.some((trade) => trade.botId === bot.id));',
    '    const dcaFilterPairs = Array.from(new Set(rawDcaRows.map((trade) => trade.pair))).sort();',
    '    const rows = rawDcaRows.filter((trade) => {',
    '      const accountMatch = dcaAccountFilter === "All" || dcaAccountFilter === "Paper Account 1001863";',
    '      const botMatch = dcaBotFilter === "All" || trade.botId === dcaBotFilter;',
    '      const pairMatch = dcaPairFilter === "All" || trade.pair === dcaPairFilter;',
    '      return accountMatch && botMatch && pairMatch;',
    '    });',
  ].join("\n"));
}

const oldFilters = '<section className={styles.dcaDealsFilters}><strong>Filters</strong><div><button>⚑ Clear</button><button>⌄</button></div></section>';
const newFilters = `<section className={styles.dcaDealsFilters}>
        <div className={styles.dcaDealsFiltersHeader}>
          <strong>Filters</strong>
          <div>
            <button type="button" onClick={() => { setDcaAccountFilter("All"); setDcaBotFilter("All"); setDcaPairFilter("All"); }}>Clear</button>
            <button type="button" aria-expanded={dcaDealFiltersOpen} onClick={() => setDcaDealFiltersOpen((open) => !open)}>{dcaDealFiltersOpen ? "▴" : "▾"}</button>
          </div>
        </div>
        {dcaDealFiltersOpen && <div className={styles.dcaDealsFilterGrid}>
          <label><span>Account</span><select value={dcaAccountFilter} onChange={(event) => setDcaAccountFilter(event.target.value)}><option value="All">All</option><option value="Paper Account 1001863">Paper Account 1001863</option></select></label>
          <label><span>Bot</span><select value={dcaBotFilter} onChange={(event) => setDcaBotFilter(event.target.value)}><option value="All">All</option>{dcaFilterBots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
          <label><span>Pair</span><select value={dcaPairFilter} onChange={(event) => setDcaPairFilter(event.target.value)}><option value="All">All</option>{dcaFilterPairs.map((pair) => <option key={pair} value={pair}>{pair}</option>)}</select></label>
        </div>}
      </section>`;
if (source.includes(oldFilters)) source = source.replace(oldFilters, newFilters);

// 3Commas-style price scale: include TP/SL/DCA beyond current price, but color ONLY Buy <-> Current.
const oldRange = [
  'const tradeIsWinning = current >= trade.averagePrice;',
  '  const mappedLevels = [trade.averagePrice, tpLevel, slLevel, nextDcaLevel].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);',
  '  const otherLow = Math.min(current, ...mappedLevels);',
  '  const otherHigh = Math.max(current, ...mappedLevels);',
  '  let barMin = tradeIsWinning ? otherLow : current;',
  '  let barMax = tradeIsWinning ? current : otherHigh;',
].join("\n");
const newRange = [
  'const tradeIsWinning = current >= trade.averagePrice;',
  '  const mappedLevels = [current, trade.averagePrice, tpLevel, slLevel, nextDcaLevel].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);',
  '  let barMin = Math.min(...mappedLevels);',
  '  let barMax = Math.max(...mappedLevels);',
].join("\n");
if (source.includes(oldRange)) source = source.replace(oldRange, newRange);
source = source.replace(
  '  const currentPct = tradeIsWinning ? 100 : 0;',
  '  const currentPct = markerPct(current);'
);

if (!source.includes("dcaDealFiltersOpen")) throw new Error("DCA filter state patch failed.");
if (!source.includes("dcaDealsFilterGrid")) throw new Error("DCA filter UI patch failed.");
if (!source.includes("const currentPct = markerPct(current);")) throw new Error("DCA white-outer-segment price-bar patch failed.");

if (!css.includes("/* DCA functional filters + compact uPnL bar */")) {
  css += `
/* DCA functional filters + compact uPnL bar */
.dcaDealsFilters{padding:0!important;overflow:hidden}
.dcaDealsFiltersHeader{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 16px}
.dcaDealsFiltersHeader>strong{font-size:17px;color:#cbd5dc}
.dcaDealsFiltersHeader>div{display:flex;gap:8px}
.dcaDealsFiltersHeader button{height:34px;border:1px solid #334955;background:#1c2d37;color:#aebdc7;border-radius:5px;padding:0 13px;cursor:pointer;font-weight:700}
.dcaDealsFiltersHeader button:hover{background:#243945;color:#e0e8ed}
.dcaDealsFilterGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:12px 16px 16px;border-top:1px solid #263b46}
.dcaDealsFilterGrid label{display:grid;gap:6px;color:#8fa7b6;font-size:12px;font-weight:750}
.dcaDealsFilterGrid label:last-child{grid-column:1/2}
.dcaDealsFilterGrid select{width:100%;height:36px;border:1px solid #314853;background:#14242d;color:#c5d0d7;border-radius:4px;padding:0 10px;outline:none}
.dcaDealsFilterGrid select:focus{border-color:#33b9bd}
.dealTradeSnapshot{min-width:0!important;width:300px!important;max-width:300px!important;padding-top:18px!important;padding-bottom:25px!important}
.dealPriceBar3c{width:300px!important;height:30px!important}
.dealPriceBar3c .dealPriceTrack{top:10px!important;height:7px!important}
.dealPriceBar3c .dealBarMarker{font-size:8px!important}
.dealCurrentEndpoint{top:-12px!important;font-size:9px!important}
.dealCurrentEndpoint b{font-size:10px!important}.dealCurrentEndpoint em{font-size:9px!important}
@media(max-width:1180px){.dealTradeSnapshot,.dealPriceBar3c{width:260px!important;max-width:260px!important}.dcaDealsFilterGrid{grid-template-columns:1fr}.dcaDealsFilterGrid label:last-child{grid-column:auto}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Enabled DCA Account/Bot/Pair filters, compacted uPnL bars, and kept all non-PnL segments white.");
