import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Numeric inputs need to keep the user's text draft while focused. Converting every
// keystroke straight to Number() makes values such as "0.", ".5" and an empty
// field impossible to type naturally, especially while live prices re-render.
if (!source.includes("function NumericInput")) {
  const anchor = "function navGlyph(section: Section) {";
  const helpers = `type NumericInputProps = {\n  value: number;\n  onValueChange: (value: number) => void;\n  min?: number;\n  max?: number;\n  step?: number | string;\n  disabled?: boolean;\n  className?: string;\n  ariaLabel?: string;\n};\n\nfunction NumericInput({ value, onValueChange, min, max, step, disabled = false, className, ariaLabel }: NumericInputProps) {\n  const [draft, setDraft] = useState(Number.isFinite(value) ? String(value) : \"\");\n  const [focused, setFocused] = useState(false);\n\n  useEffect(() => {\n    if (!focused) setDraft(Number.isFinite(value) ? String(value) : \"\");\n  }, [value, focused]);\n\n  const normalize = (raw: string) => raw.replace(/,/g, \".\").trim();\n  const bounded = (next: number) => {\n    let result = next;\n    if (min != null) result = Math.max(min, result);\n    if (max != null) result = Math.min(max, result);\n    return result;\n  };\n\n  return <input\n    type=\"text\"\n    inputMode=\"decimal\"\n    autoComplete=\"off\"\n    spellCheck={false}\n    className={className}\n    aria-label={ariaLabel}\n    disabled={disabled}\n    data-step={step}\n    value={draft}\n    onFocus={() => setFocused(true)}\n    onChange={(event) => {\n      const raw = event.target.value;\n      setDraft(raw);\n      const normalized = normalize(raw);\n      if (normalized === \"\" || normalized === \"-\" || normalized === \".\" || normalized === \"-.\") return;\n      const parsed = Number(normalized);\n      if (Number.isFinite(parsed)) onValueChange(bounded(parsed));\n    }}\n    onBlur={() => {\n      setFocused(false);\n      const normalized = normalize(draft);\n      const parsed = normalized === \"\" ? 0 : Number(normalized);\n      const committed = bounded(Number.isFinite(parsed) ? parsed : value);\n      onValueChange(committed);\n      setDraft(String(committed));\n    }}\n  />;\n}\n\nfunction PairPicker({ markets, selectedSymbol, onSelect }: { markets: Market[]; selectedSymbol: string; onSelect: (symbol: string) => void }) {\n  const [open, setOpen] = useState(false);\n  const [query, setQuery] = useState(\"\");\n  const selected = markets.find((market) => market.symbol === selectedSymbol);\n  const matches = useMemo(() => {\n    const q = query.trim().toUpperCase();\n    const ranked = markets\n      .filter((market) => !q || market.symbol.toUpperCase().includes(q) || market.label.toUpperCase().includes(q))\n      .sort((a, b) => {\n        if (q) {\n          const aExact = a.symbol.toUpperCase() === q ? 3 : a.symbol.toUpperCase().startsWith(q) ? 2 : 0;\n          const bExact = b.symbol.toUpperCase() === q ? 3 : b.symbol.toUpperCase().startsWith(q) ? 2 : 0;\n          if (aExact !== bExact) return bExact - aExact;\n        }\n        return (b.quoteVolume24h || 0) - (a.quoteVolume24h || 0);\n      });\n    return ranked.slice(0, 24);\n  }, [markets, query]);\n\n  const choose = (symbol: string) => {\n    onSelect(symbol);\n    setQuery(\"\");\n    setOpen(false);\n  };\n\n  return <div className={styles.pairPicker}>\n    <button type=\"button\" className={styles.pairPickerButton} onClick={() => setOpen((value) => !value)} aria-expanded={open}>\n      <span><b>☆</b> {selectedSymbol}/USDT</span>\n      <span className={styles.pairPickerMeta}>{selected?.price != null ? money(selected.price) : \"—\"} <i>⌄</i></span>\n    </button>\n    {open && <div className={styles.pairPickerDropdown}>\n      <div className={styles.pairPickerSearch}><span>⌕</span><input autoFocus value={query} placeholder=\"Search coin, e.g. BTC, ETH, SOL\" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {\n        if (event.key === \"Escape\") setOpen(false);\n        if (event.key === \"Enter\" && matches[0]) choose(matches[0].symbol);\n      }}/></div>\n      <div className={styles.pairPickerResults}>\n        {matches.length ? matches.map((market) => <button type=\"button\" key={market.exchangeSymbol} className={market.symbol === selectedSymbol ? styles.pairPickerActive : \"\"} onClick={() => choose(market.symbol)}>\n          <span><b>{market.symbol}</b><small>{market.label} · USDT</small></span>\n          <span><strong>{market.price != null ? money(market.price) : \"—\"}</strong><small className={market.change24h >= 0 ? styles.greenText : styles.redText}>{pct(market.change24h)}</small></span>\n        </button>) : <p className={styles.pairPickerEmpty}>No Binance USDT pair found.</p>}\n      </div>\n    </div>}\n  </div>;\n}\n\n`;
  source = source.replace(anchor, helpers + anchor);
}

// Market orders use selectedPrice directly; continuously copying every websocket
// tick into smartPrice was unnecessary state churn and made focused fields feel sticky.
source = source.replace(
  '  useEffect(() => {\n    if (selectedPrice && (smartOrderType === "Market" || smartPrice === 0)) setSmartPrice(selectedPrice);\n  }, [selectedPrice, smartOrderType, selectedSymbol, smartPrice]);',
  '  useEffect(() => {\n    if (selectedPrice && smartOrderType === "Limit" && smartPrice === 0) setSmartPrice(selectedPrice);\n  }, [selectedPrice, smartOrderType, selectedSymbol, smartPrice]);'
);

// Reduce UI churn from Binance bookTicker. 250ms is still effectively live for a
// paper-trade form, while avoiding dozens of full React renders per second.
source = source.replace(
  '    let retryTimer: number | null = null;\n    let stopped = false;',
  '    let retryTimer: number | null = null;\n    let stopped = false;\n    let lastBookUiUpdate = 0;'
);
source = source.replace(
  '          const stream = message.stream ?? "";\n          const price = stream.includes("miniTicker") ? Number(data.c) : NaN;',
  '          const stream = message.stream ?? "";\n          if (stream.includes("bookTicker")) {\n            const now = Date.now();\n            if (now - lastBookUiUpdate < 250) return;\n            lastBookUiUpdate = now;\n          }\n          const price = stream.includes("miniTicker") ? Number(data.c) : NaN;'
);

// Replace the giant native select with a searchable picker. Only matching rows are
// rendered, so selecting a symbol stays responsive even with the full Binance list.
const oldSelectors = '  const Selectors = () => <div className={styles.marketSelectors}><label><span>Exchange</span><div className={styles.fakeSelect}><b>◆</b> Paper Account 1001863 | Binance Spot account <small>{compactMoney(accountValue)}</small><i>⌄</i></div></label><label><span>Market</span><div className={styles.fakeSelect}><b className={styles.coinOrange}>●</b> USDT <small>0 USDT</small><i>⌄</i></div></label><label><span>Trading Pair</span><select value={selectedSymbol} onChange={(e) => { setSelectedSymbol(e.target.value); setSmartUnits(0); }}>{markets.map((market) => <option key={market.symbol} value={market.symbol}>☆ {market.symbol}/USDT</option>)}</select></label></div>;';
const newSelectors = `  const Selectors = () => <div className={styles.marketSelectors}><label><span>Exchange</span><div className={styles.fakeSelect}><b>◆</b> Paper Account 1001863 | Binance Spot account <small>{compactMoney(accountValue)}</small><i>⌄</i></div></label><label><span>Market</span><div className={styles.fakeSelect}><b className={styles.coinOrange}>●</b> USDT <small>0 USDT</small><i>⌄</i></div></label><label><span>Trading Pair</span><PairPicker markets={markets} selectedSymbol={selectedSymbol} onSelect={(symbol) => { setSelectedSymbol(symbol); setSmartUnits(0); setSmartPrice(0); }}/></label></div>;`;
source = source.replace(oldSelectors, newSelectors);

// SmartTrade editable values now use draft-preserving inputs.
source = source.replaceAll(
  '<input type="number" min="0" step="0.000001" value={smartUnits} onChange={(e) => setSmartUnits(Math.max(0, Number(e.target.value)))}/>',
  '<NumericInput min={0} step="0.000001" value={smartUnits} onValueChange={setSmartUnits} ariaLabel={`${selectedSymbol} units`}/>'
);
source = source.replace(
  '<input type="number" disabled={smartOrderType === "Market"} value={effectiveEntry || 0} onChange={(e) => setSmartPrice(Number(e.target.value))}/>',
  '<NumericInput min={0} disabled={smartOrderType === "Market"} value={effectiveEntry || 0} onValueChange={setSmartPrice} ariaLabel="Order price"/>'
);
source = source.replace(
  '<input type="number" step="0.01" disabled={smartOrderType === "Market"} value={effectiveEntry || 0} onChange={(e) => setSmartPrice(Number(e.target.value))}/>',
  '<NumericInput min={0} step="0.01" disabled={smartOrderType === "Market"} value={effectiveEntry || 0} onValueChange={setSmartPrice} ariaLabel="Order price"/>'
);
source = source.replace(
  '<input type="number" value={trailingBuyPct} onChange={(e) => setTrailingBuyPct(Number(e.target.value))}/>',
  '<NumericInput min={0} value={trailingBuyPct} onValueChange={setTrailingBuyPct} ariaLabel="Trailing buy percent"/>'
);
source = source.replace(
  '<input value={tpPrice ? tpPrice.toFixed(5) : "0"} onChange={(e) => { const price = Number(e.target.value); if (effectiveEntry) setSmartTps((items) => items.map((tp, i) => i === 0 ? { ...tp, target: (price / effectiveEntry - 1) * 100 } : tp)); }}/>',
  '<NumericInput min={0} value={tpPrice || 0} onValueChange={(price) => { if (effectiveEntry) setSmartTps((items) => items.map((tp, i) => i === 0 ? { ...tp, target: (price / effectiveEntry - 1) * 100 } : tp)); }} ariaLabel="Take profit price"/>'
);
source = source.replace(
  '<input type="number" value={tp.target} onChange={(e) => setSmartTps((items) => items.map((item,i) => i === index ? { ...item, target: Number(e.target.value) } : item))}/>',
  '<NumericInput value={tp.target} onValueChange={(value) => setSmartTps((items) => items.map((item,i) => i === index ? { ...item, target: value } : item))} ariaLabel={`Take profit ${index + 1} target`}/>'
);
source = source.replace(
  '<input type="number" value={tp.share} onChange={(e) => setSmartTps((items) => items.map((item,i) => i === index ? { ...item, share: Number(e.target.value) } : item))}/>',
  '<NumericInput min={0} max={100} value={tp.share} onValueChange={(value) => setSmartTps((items) => items.map((item,i) => i === index ? { ...item, share: value } : item))} ariaLabel={`Take profit ${index + 1} share`}/>'
);
source = source.replace(
  '<input type="number" value={-trailingTpDeviation} onChange={(e) => setTrailingTpDeviation(Math.abs(Number(e.target.value)))}/>',
  '<NumericInput value={-trailingTpDeviation} onValueChange={(value) => setTrailingTpDeviation(Math.abs(value))} ariaLabel="Trailing take profit deviation"/>'
);
source = source.replace(
  '<input value={stopPrice ? stopPrice.toFixed(5) : "0"} onChange={(e) => { const price = Number(e.target.value); if (effectiveEntry) setSmartStopPct(Math.max(0, (1 - price / effectiveEntry) * 100)); }}/>',
  '<NumericInput min={0} value={stopPrice || 0} onValueChange={(price) => { if (effectiveEntry) setSmartStopPct(Math.max(0, (1 - price / effectiveEntry) * 100)); }} ariaLabel="Stop loss price"/>'
);
source = source.replace(
  '<input disabled={!stopTimeout} value={stopTimeoutSec} onChange={(e) => setStopTimeoutSec(Math.max(0, Number(e.target.value)))}/>',
  '<NumericInput min={0} disabled={!stopTimeout} value={stopTimeoutSec} onValueChange={setStopTimeoutSec} ariaLabel="Stop loss timeout seconds"/>'
);

// Searchable pair dropdown styling.
if (!css.includes(".pairPicker{")) {
  css += `\n/* SmartTrade responsive searchable pair picker */\n.pairPicker{position:relative;width:100%}\n.pairPickerButton{width:100%;height:32px;border:1px solid #2b4352;background:var(--input);border-radius:4px;color:#bac9d2;padding:0 9px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;text-align:left}\n.pairPickerButton>span:first-child{font-weight:750;color:#d1dce2}.pairPickerButton b{color:#7997aa;margin-right:5px}.pairPickerMeta{display:flex;align-items:center;gap:8px;color:#718d9d;font-size:11px;white-space:nowrap}.pairPickerMeta i{font-style:normal}\n.pairPickerDropdown{position:absolute;z-index:80;top:37px;left:0;right:0;background:#102029;border:1px solid #35505f;border-radius:6px;box-shadow:0 16px 40px rgba(0,0,0,.38);overflow:hidden;min-width:320px}\n.pairPickerSearch{height:43px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid #263b49;background:#0e1c24;color:#6f8c9d}.pairPickerSearch input{min-width:0;flex:1;height:30px;border:0;background:transparent;color:#e0e8ec;padding:0}.pairPickerSearch input::placeholder{color:#617d8e}\n.pairPickerResults{max-height:330px;overflow:auto;padding:5px}.pairPickerResults>button{width:100%;min-height:48px;border:0;border-radius:4px;background:transparent;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;gap:18px;color:#bfd0d8;cursor:pointer;text-align:left}.pairPickerResults>button:hover,.pairPickerResults>.pairPickerActive{background:#1b303a}.pairPickerResults>button>span{display:flex;flex-direction:column;gap:2px}.pairPickerResults>button>span:last-child{text-align:right;align-items:flex-end}.pairPickerResults b,.pairPickerResults strong{color:#e1e9ed;font-size:12px}.pairPickerResults small{color:#6f8c9d;font-size:10px}.pairPickerEmpty{margin:0;padding:18px 10px;color:#718d9d;text-align:center;font-size:11px}\n`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared lag-free SmartTrade inputs and searchable Binance pair picker.");
