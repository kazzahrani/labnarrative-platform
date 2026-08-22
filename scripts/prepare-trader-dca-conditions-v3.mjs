import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const traderPath = path.join(root, "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const editor = String.raw`  const DcaConditionEditor = ({ condition, index }: { condition: { id: number; kind: string; timeframe: string; length: number; comparator: string; signal: number; aux1: number; aux2: number; aux3: number }; index: number }) => {
    const update = (patch: Partial<typeof condition>) => setDcaConditions((items) => items.map((item) => item.id === condition.id ? { ...item, ...patch } : item));
    const timeframes = ["3 minutes", "5 minutes", "15 minutes", "30 minutes", "1 hour", "2 hours", "4 hours", "8 hours", "12 hours", "1 day", "3 days", "1 week"];
    const indicators = ["QFL (only long signals)", "CQS Scalping", "TradingView custom signal", "TradingView Crypto Screener", "Ultimate Oscillator", "Bollinger Bands %B", "Moving Average (MA)", "Average Directional Index", "Stochastic", "MACD", "Parabolic SAR", "Money Flow Index", "Commodity Channel Index", "Heikin Ashi", "RSI"];
    const defaultsFor = (kind: string): Partial<typeof condition> => {
      if (kind === "RSI") return { timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 30, aux1: 14, aux2: 1, aux3: 3 };
      if (kind === "Stochastic") return { timeframe: "3 minutes", length: 0, comparator: "Less Than", signal: 20, aux1: 14, aux2: 1, aux3: 3 };
      if (kind === "Parabolic SAR") return { timeframe: "3 minutes", comparator: "Crossing (Long)", aux1: 2, aux2: 1 };
      if (kind === "Money Flow Index") return { timeframe: "3 minutes", length: 14, comparator: "Crossing Up", signal: 20 };
      if (kind === "Commodity Channel Index") return { timeframe: "3 minutes", length: 20, comparator: "Crossing Up", signal: -100 };
      if (kind === "Heikin Ashi") return { timeframe: "3 minutes", length: 1 };
      if (kind === "MACD") return { timeframe: "3 minutes", length: 0, comparator: "Crossing Up", aux1: 12, aux2: 26, aux3: 9 };
      if (kind === "Average Directional Index") return { timeframe: "3 minutes", length: 14, comparator: "Greater Than", signal: 50 };
      if (kind === "Moving Average (MA)") return { timeframe: "3 minutes", aux1: 0, aux2: 9, aux3: 26, comparator: "Crossing Up" };
      if (kind === "Bollinger Bands %B") return { timeframe: "3 minutes", length: 20, aux1: 2, comparator: "Crossing Up", signal: 0 };
      if (kind === "Ultimate Oscillator") return { timeframe: "3 minutes", aux1: 7, aux2: 14, aux3: 28, comparator: "Crossing Up", signal: 50 };
      if (kind === "TradingView Crypto Screener") return { timeframe: "15 minutes", comparator: "Buy" };
      return { timeframe: "3 minutes", length: 14, comparator: "Less Than", signal: 30 };
    };
    const timeframeSelect = <select value={condition.timeframe} onChange={(e) => update({ timeframe: e.target.value })}>{timeframes.map((tf) => <option key={tf}>{tf}</option>)}</select>;
    const compareSelect = <select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Less Than</option><option>Greater Than</option><option>Crossing Up</option><option>Crossing Down</option></select>;
    const unsupported = ["QFL (only long signals)", "CQS Scalping", "TradingView custom signal"].includes(condition.kind);

    return <div className={styles.dcaConditionCard}>
      <div className={styles.dcaConditionTitle}><span>{dcaConditions.length > 1 ? "Condition " + (index + 1) : "Condition"}</span>{dcaConditions.length > 1 && <button onClick={() => setDcaConditions((items) => items.filter((item) => item.id !== condition.id))}>×</button>}</div>
      <select className={styles.dcaWideSelect} value={condition.kind} onChange={(e) => { const kind = e.target.value; update({ kind, ...defaultsFor(kind) }); }}>{indicators.map((indicator) => <option key={indicator}>{indicator}</option>)}</select>

      {condition.kind === "RSI" && <div className={styles.dcaConditionGrid}>
        <label><span>RSI Length</span><input type="number" min="1" value={condition.length} onChange={(e) => update({ length: Number(e.target.value) })}/></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
        <label><span>Condition</span>{compareSelect}</label>
        <label><span>Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
      </div>}

      {condition.kind === "Stochastic" && <div className={styles.dcaConditionGrid}>
        <label><span>K Length</span><input type="number" min="1" value={condition.aux1} onChange={(e) => update({ aux1: Number(e.target.value) })}/></label>
        <label><span>K Smoothing</span><input type="number" min="1" value={condition.aux2} onChange={(e) => update({ aux2: Number(e.target.value) })}/></label>
        <label><span>D Smoothing</span><input type="number" min="1" value={condition.aux3} onChange={(e) => update({ aux3: Number(e.target.value) })}/></label>
        <label><span>K Condition</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Less Than</option><option>Greater Than</option></select></label>
        <label><span>K Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
        <label><span>Condition</span><select value={condition.length === 1 ? "K Crossing Down D" : "K Crossing Up D"} onChange={(e) => update({ length: e.target.value === "K Crossing Down D" ? 1 : 0 })}><option>K Crossing Up D</option><option>K Crossing Down D</option></select></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
      </div>}

      {condition.kind === "Parabolic SAR" && <div className={styles.dcaConditionGrid}>
        <label><span>Start</span><input type="number" step="0.01" value={(condition.aux1 / 100).toFixed(2)} onChange={(e) => update({ aux1: Number(e.target.value) * 100 })}/></label>
        <label><span>Maximum</span><input type="number" step="0.01" value={(condition.aux2 / 5).toFixed(2)} onChange={(e) => update({ aux2: Number(e.target.value) * 5 })}/></label>
        <label><span>Condition</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Crossing (Long)</option><option>Crossing (Short)</option></select></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
      </div>}

      {condition.kind === "Money Flow Index" && <div className={styles.dcaConditionGrid}>
        <label><span>MFI Length</span><input type="number" min="1" value={condition.length} onChange={(e) => update({ length: Number(e.target.value) })}/></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
        <label><span>Condition</span>{compareSelect}</label>
        <label><span>Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
      </div>}

      {condition.kind === "Commodity Channel Index" && <div className={styles.dcaConditionGrid}>
        <label><span>Length</span><input type="number" min="1" value={condition.length} onChange={(e) => update({ length: Number(e.target.value) })}/></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
        <label><span>Condition</span>{compareSelect}</label>
        <label><span>Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
      </div>}

      {condition.kind === "Heikin Ashi" && <div className={styles.dcaConditionGrid}>
        <label><span>Candles in a row</span><select value={condition.length} onChange={(e) => update({ length: Number(e.target.value) })}>{[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
      </div>}

      {condition.kind === "MACD" && <div className={styles.dcaConditionGrid}>
        <label><span>Fast Length</span><input type="number" min="1" value={condition.aux1} onChange={(e) => update({ aux1: Number(e.target.value) })}/></label>
        <label><span>Slow Length</span><input type="number" min="1" value={condition.aux2} onChange={(e) => update({ aux2: Number(e.target.value) })}/></label>
        <label><span>Signal Length</span><input type="number" min="1" value={condition.aux3} onChange={(e) => update({ aux3: Number(e.target.value) })}/></label>
        <label><span>MACD Trigger</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Crossing Up</option><option>Crossing Down</option></select></label>
        <label><span>Line Trigger</span><select value={condition.length === 1 ? "Greater Than 0" : "Less Than 0"} onChange={(e) => update({ length: e.target.value === "Greater Than 0" ? 1 : 0 })}><option>Less Than 0</option><option>Greater Than 0</option></select></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
      </div>}

      {condition.kind === "Average Directional Index" && <div className={styles.dcaConditionGrid}>
        <label><span>ADX and DI Length</span><input type="number" min="1" value={condition.length} onChange={(e) => update({ length: Number(e.target.value) })}/></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
        <label><span>Condition</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Greater Than</option><option>Less Than</option></select></label>
        <label><span>Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
      </div>}

      {condition.kind === "Moving Average (MA)" && <div className={styles.dcaConditionGrid}>
        <label><span>MA Type</span><select value={condition.aux1 === 1 ? "EMA" : condition.aux1 === 2 ? "WMA" : "SMA"} onChange={(e) => update({ aux1: e.target.value === "EMA" ? 1 : e.target.value === "WMA" ? 2 : 0 })}><option>SMA</option><option>EMA</option><option>WMA</option></select></label>
        <label><span>Fast MA</span><input type="number" min="1" value={condition.aux2} onChange={(e) => update({ aux2: Number(e.target.value) })}/></label>
        <label><span>Slow MA</span><input type="number" min="1" value={condition.aux3} onChange={(e) => update({ aux3: Number(e.target.value) })}/></label>
        <label><span>Condition</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Crossing Up</option><option>Crossing Down</option></select></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
      </div>}

      {condition.kind === "Bollinger Bands %B" && <div className={styles.dcaConditionGrid}>
        <label><span>BB% Period</span><input type="number" min="1" value={condition.length} onChange={(e) => update({ length: Number(e.target.value) })}/></label>
        <label><span>Deviation</span><input type="number" step="0.1" value={condition.aux1} onChange={(e) => update({ aux1: Number(e.target.value) })}/></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
        <label><span>Condition</span>{compareSelect}</label>
        <label><span>Signal Value</span><input type="number" step="0.01" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
      </div>}

      {condition.kind === "Ultimate Oscillator" && <div className={styles.dcaConditionGrid}>
        <label><span>Fast Length</span><input type="number" min="1" value={condition.aux1} onChange={(e) => update({ aux1: Number(e.target.value) })}/></label>
        <label><span>Middle Length</span><input type="number" min="1" value={condition.aux2} onChange={(e) => update({ aux2: Number(e.target.value) })}/></label>
        <label><span>Slow Length</span><input type="number" min="1" value={condition.aux3} onChange={(e) => update({ aux3: Number(e.target.value) })}/></label>
        <label><span>Condition</span>{compareSelect}</label>
        <label><span>Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
        <label><span>Timeframe</span>{timeframeSelect}</label>
      </div>}

      {condition.kind === "TradingView Crypto Screener" && <div className={styles.dcaConditionGrid}>
        <label><span>Timeframe</span>{timeframeSelect}</label>
        <label><span>Signal Value</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Buy</option><option>Strong Buy</option><option>Sell</option><option>Strong Sell</option></select></label>
      </div>}

      {unsupported && <div className={styles.dcaReferencePending}><strong>{condition.kind}</strong><span>Configuration will be matched from the next reference screenshot rather than guessed.</span></div>}
    </div>;
  };`;

const editorPattern = /  const DcaConditionEditor = \([\s\S]*?\n  const dcaCreate = \(/;
if (!editorPattern.test(source)) {
  console.error("Could not locate generated DCA condition editor. Ensure v2 runs before v3.");
  process.exit(1);
}
source = source.replace(editorPattern, editor + "\n\n  const dcaCreate = (");
source = source.replace("Historical-zone, breakout and DCA intelligence", "SmartTrade, DCA bots and market automation");

fs.writeFileSync(traderPath, source);
console.log("Prepared precise DCA condition configuration schemas from supplied screenshots.");
