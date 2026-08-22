import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const traderPath = path.join(root, "app/trader/TradingAgent.tsx");
const cssPath = path.join(root, "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const stateAnchor = '  const [startCondition, setStartCondition] = useState("Immediately");';
const stateBlock = `${stateAnchor}\n  // DCA BUILDER V2 STATE\n  const [dcaDirection, setDcaDirection] = useState<"Long" | "Short">("Long");\n  const [dcaOrderType, setDcaOrderType] = useState<"Market" | "Limit">("Market");\n  const [averagingEnabled, setAveragingEnabled] = useState(true);\n  const [averagingMode, setAveragingMode] = useState<"Dollar-cost averaging" | "Price ladder">("Dollar-cost averaging");\n  const [averagingConditionEnabled, setAveragingConditionEnabled] = useState(false);\n  const [reinvestProfit, setReinvestProfit] = useState(100);\n  const [dcaTrailing, setDcaTrailing] = useState(0);\n  const [maxHoldEnabled, setMaxHoldEnabled] = useState(false);\n  const [dcaAdvancedOpen, setDcaAdvancedOpen] = useState(false);\n  const [dcaBacktestOpen, setDcaBacktestOpen] = useState(false);\n  const [dcaConditions, setDcaConditions] = useState([{ id: 1, kind: "RSI", timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 30, aux1: 14, aux2: 1, aux3: 3 }]);`;
if (!source.includes("DCA BUILDER V2 STATE")) source = source.replace(stateAnchor, stateBlock);

source = source.replace(
  'stopEnabled: botStopEnabled, stopPct: botStopPct, startCondition, status: "Running", createdAt: new Date().toISOString(),',
  'stopEnabled: botStopEnabled, stopPct: botStopPct, startCondition: dcaConditions.length ? dcaConditions.map((condition) => condition.kind).join(" + ") : "Immediately", status: "Running", createdAt: new Date().toISOString(),'
);

const newBuilder = `  const DcaConditionEditor = ({ condition, index }: { condition: { id: number; kind: string; timeframe: string; length: number; comparator: string; signal: number; aux1: number; aux2: number; aux3: number }; index: number }) => {
    const update = (patch: Partial<typeof condition>) => setDcaConditions((items) => items.map((item) => item.id === condition.id ? { ...item, ...patch } : item));
    const indicators = ["QFL (only long signals)", "CQS Scalping", "TradingView custom signal", "TradingView Crypto Screener", "Ultimate Oscillator", "Bollinger Bands %B", "Moving Average (MA)", "Average Directional Index", "Stochastic", "MACD", "Parabolic SAR", "Money Flow Index", "Commodity Channel Index", "Heikin Ashi", "RSI"];
    return <div className={styles.dcaConditionCard}>
      <div className={styles.dcaConditionTitle}><span>Condition {index + 1}</span>{dcaConditions.length > 1 && <button onClick={() => setDcaConditions((items) => items.filter((item) => item.id !== condition.id))}>×</button>}</div>
      <select className={styles.dcaWideSelect} value={condition.kind} onChange={(e) => update({ kind: e.target.value })}>{indicators.map((indicator) => <option key={indicator}>{indicator}</option>)}</select>
      {condition.kind === "Stochastic" ? <div className={styles.dcaConditionGrid}>
        <label><span>K Length</span><input type="number" value={condition.aux1} onChange={(e) => update({ aux1: Number(e.target.value) })}/></label>
        <label><span>K Smoothing</span><input type="number" value={condition.aux2} onChange={(e) => update({ aux2: Number(e.target.value) })}/></label>
        <label><span>D Smoothing</span><input type="number" value={condition.aux3} onChange={(e) => update({ aux3: Number(e.target.value) })}/></label>
        <label><span>K Condition</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Less Than</option><option>Greater Than</option></select></label>
        <label><span>K Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
        <label><span>Condition</span><select><option>K Crossing Up D</option><option>K Crossing Down D</option></select></label>
        <label><span>Timeframe</span><select value={condition.timeframe} onChange={(e) => update({ timeframe: e.target.value })}><option>3 minutes</option><option>5 minutes</option><option>15 minutes</option><option>1 hour</option><option>4 hours</option><option>1 day</option><option>1 week</option></select></label>
      </div> : condition.kind === "Parabolic SAR" ? <div className={styles.dcaConditionGrid}>
        <label><span>Start</span><input type="number" step="0.01" value={condition.aux1 / 100} onChange={(e) => update({ aux1: Number(e.target.value) * 100 })}/></label>
        <label><span>Maximum</span><input type="number" step="0.1" value={condition.aux2 / 5} onChange={(e) => update({ aux2: Number(e.target.value) * 5 })}/></label>
        <label><span>Condition</span><select><option>Crossing (Long)</option><option>Crossing (Short)</option></select></label>
        <label><span>Timeframe</span><select value={condition.timeframe} onChange={(e) => update({ timeframe: e.target.value })}><option>3 minutes</option><option>5 minutes</option><option>15 minutes</option><option>1 hour</option><option>4 hours</option><option>1 day</option><option>1 week</option></select></label>
      </div> : <div className={styles.dcaConditionGrid}>
        <label><span>{condition.kind === "RSI" ? "RSI Length" : "Length / Period"}</span><input type="number" value={condition.length} onChange={(e) => update({ length: Number(e.target.value) })}/></label>
        <label><span>Timeframe</span><select value={condition.timeframe} onChange={(e) => update({ timeframe: e.target.value })}><option>3 minutes</option><option>5 minutes</option><option>15 minutes</option><option>1 hour</option><option>4 hours</option><option>1 day</option><option>1 week</option><option>1 month</option></select></label>
        <label><span>Condition</span><select value={condition.comparator} onChange={(e) => update({ comparator: e.target.value })}><option>Less Than</option><option>Greater Than</option><option>Crossing Up</option><option>Crossing Down</option></select></label>
        <label><span>Signal Value</span><input type="number" value={condition.signal} onChange={(e) => update({ signal: Number(e.target.value) })}/></label>
      </div>}
    </div>;
  };

  const dcaCreate = (
    <div className={styles.dcaBuilderPage}>
      <div className={styles.dcaBuilderTop}><h1>Create DCA Bot</h1><div><button onClick={() => setNotice("DCA guide will open here.")}>▣ Guide</button><button onClick={() => setNotice("Strategy presets will be added after the core DCA workflow is validated.")}>Strategy presets</button><button>☷</button></div></div>
      <div className={styles.dcaWorkspace}>
        <div className={styles.dcaFormColumn}>
          <section className={styles.dcaSection}>
            <div className={styles.dcaSectionHeader}><h2>Main</h2><span>Video tutorial</span><b>⌃</b></div>
            <div className={styles.dcaSectionBody}><div className={styles.dcaTwoCol}>
              <label><span>Name</span><input value={botName} onChange={(e) => setBotName(e.target.value)}/></label>
              <label><span>Exchange</span><div className={styles.dcaFakeSelect}>☆ ◆ Paper Account 1001863 | Binance Spot <small>{compactMoney(accountValue)}</small>⌄</div></label>
              <label><span>Direction ⓘ</span><div className={styles.dcaSegment}><button className={dcaDirection === "Long" ? styles.dcaSegmentActive : ""} onClick={() => setDcaDirection("Long")}>Long</button><button className={dcaDirection === "Short" ? styles.dcaSegmentActive : ""} onClick={() => setDcaDirection("Short")}>Short</button></div></label>
              <label><span>Pairs <em>{markets.length > 1 ? "Unselect all (" + markets.length + ")" : ""}</em></span><select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>{markets.map((market) => <option key={market.symbol} value={market.symbol}>{market.symbol}/USDT</option>)}</select></label>
            </div></div>
          </section>

          <section className={styles.dcaSection}>
            <div className={styles.dcaSectionHeader}><h2>Entry orders</h2><span>Video tutorial</span><b>⌃</b></div>
            <div className={styles.dcaSectionBody}>
              <div className={styles.dcaSubHead}><i className={styles.dcaBlueBar}/>Base order <small>ⓘ</small></div>
              <div className={styles.dcaTwoCol}><label><span>Base order size ⓘ</span><div className={styles.inputUnit}><input type="number" value={baseOrder} onChange={(e) => setBaseOrder(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></label><label><span>Start order type ⓘ</span><div className={styles.dcaSegment}><button className={dcaOrderType === "Market" ? styles.dcaSegmentActive : ""} onClick={() => setDcaOrderType("Market")}>Market</button><button className={dcaOrderType === "Limit" ? styles.dcaSegmentActive : ""} onClick={() => setDcaOrderType("Limit")}>Limit</button></div></label></div>
              <div className={styles.dcaToggleHead}><strong>⌁ Trade start condition ⓘ</strong><Toggle checked={dcaConditions.length > 0} onChange={(on) => setDcaConditions(on ? (dcaConditions.length ? dcaConditions : [{ id: Date.now(), kind: "RSI", timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 30, aux1: 14, aux2: 1, aux3: 3 }]) : [])}/><span>RSI, QFL, MACD, etc.</span></div>
              {dcaConditions.map((condition, index) => <DcaConditionEditor key={condition.id} condition={condition} index={index}/>)}
              <div className={styles.dcaConditionFooter}><button onClick={() => setDcaConditions((items) => [...items, { id: Date.now(), kind: "RSI", timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 30, aux1: 14, aux2: 1, aux3: 3 }])}>＋ Add condition</button><span>All conditions work on the “AND” condition</span></div>
              <button className={styles.dcaTechLink}>Technical Analysis start conditions ↗</button>
            </div>
          </section>

          <section className={styles.dcaSection}>
            <div className={styles.dcaSectionBody}>
              <div className={styles.dcaToggleHead}><strong><i className={styles.dcaYellowBar}/> Averaging orders ⓘ</strong><Toggle checked={averagingEnabled} onChange={setAveragingEnabled}/></div>
              {averagingEnabled && <><div className={styles.dcaSegment}><button className={averagingMode === "Dollar-cost averaging" ? styles.dcaSegmentActive : ""} onClick={() => setAveragingMode("Dollar-cost averaging")}>Dollar-cost averaging</button><button className={averagingMode === "Price ladder" ? styles.dcaSegmentActive : ""} onClick={() => setAveragingMode("Price ladder")}>Price ladder</button></div>
              <div className={styles.dcaTwoCol}>
                <label><span>Deviation to open first averaging order ⓘ</span><div className={styles.inputUnit}><input type="number" step="0.1" value={deviation} onChange={(e) => setDeviation(Math.max(.1, Number(e.target.value)))}/><b>%</b></div></label>
                <label><span>Averaging order size ⓘ</span><div className={styles.inputUnit}><input type="number" value={safetyOrder} onChange={(e) => setSafetyOrder(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></label>
                <label><span>Deviation step multiplier ⓘ</span><div className={styles.dcaHintInput}><input type="number" step="0.1" value={stepScale} onChange={(e) => setStepScale(Math.max(.1, Number(e.target.value)))}/><small>Last order price ≈ {money(dcaPreview.at(-1)?.price ?? selectedPrice)}</small></div></label>
                <label><span>Order size multiplier ⓘ</span><div className={styles.dcaHintInput}><input type="number" step="0.1" value={volumeScale} onChange={(e) => setVolumeScale(Math.max(.1, Number(e.target.value)))}/><small>Last order size: {compactMoney(dcaPreview.at(-1)?.amount ?? safetyOrder)}</small></div></label>
                <label><span>Averaging orders per trade ⓘ</span><input type="number" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value), 1, 20))}/></label>
                <label><span>Limit averaging orders placed on exchange ⓘ</span><input type="number" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value), 1, 20))}/></label>
              </div>
              <div className={styles.dcaToggleHead}><strong>⌁ Averaging orders condition ⓘ</strong><Toggle checked={averagingConditionEnabled} onChange={setAveragingConditionEnabled}/><span>RSI, QFL, MACD, etc.</span></div></>}
            </div>
          </section>

          <section className={styles.dcaSection}>
            <div className={styles.dcaSectionHeader}><h2>Exit orders</h2><span>Video tutorial</span><b>⌃</b></div>
            <div className={styles.dcaSectionBody}>
              <div className={styles.dcaSubHead}><i className={styles.dcaTealBar}/>Take profit <small>ⓘ</small></div>
              <div className={styles.dcaSegment}><button className={styles.dcaSegmentActive}>Price change, %</button><button>⌁ Conditions</button></div>
              <label className={styles.dcaFullLabel}><span>Take profit type ⓘ</span><select><option>Percentage from average price</option><option>Percentage from base order</option></select></label>
              <label className={styles.dcaFullLabel}><span>Target profit ⓘ</span><div className={styles.inputUnit}><input type="number" step="0.1" value={botTakeProfit} onChange={(e) => setBotTakeProfit(Number(e.target.value))}/><b>%</b></div></label>
              <button className={styles.dcaAddTarget}>＋ Add additional target profit step (1/4)</button>
              <div className={styles.dcaTwoCol}><label><span>Reinvest Profit ⓘ</span><div className={styles.inputUnit}><input type="number" value={reinvestProfit} onChange={(e) => setReinvestProfit(clamp(Number(e.target.value), 0, 100))}/><b>%</b></div></label><label><span>Trailing ⓘ</span><div className={styles.inputUnit}><input type="number" value={dcaTrailing} onChange={(e) => setDcaTrailing(Math.max(0, Number(e.target.value)))}/><b>%</b></div></label></div>
              <div className={styles.dcaCollapseRow}><strong><i className={styles.dcaRedBar}/> Stop Loss</strong><Toggle checked={botStopEnabled} onChange={setBotStopEnabled}/></div>
              {botStopEnabled && <div className={styles.dcaTwoCol}><label><span>Stop loss</span><div className={styles.inputUnit}><input type="number" value={botStopPct} onChange={(e) => setBotStopPct(Math.max(0, Number(e.target.value)))}/><b>%</b></div></label><label><span>Action</span><select><option>Close deal</option><option>Close and stop bot</option></select></label></div>}
              <div className={styles.dcaCollapseRow}><strong><i className={styles.dcaPurpleBar}/> Maximum hold period</strong><Toggle checked={maxHoldEnabled} onChange={setMaxHoldEnabled}/></div>
              {maxHoldEnabled && <div className={styles.dcaTwoCol}><label><span>Maximum hold period</span><input type="number" defaultValue={7}/></label><label><span>Unit</span><select><option>Days</option><option>Hours</option></select></label></div>}
            </div>
          </section>

          <section className={styles.dcaSection}>
            <button className={styles.dcaAdvancedToggle} onClick={() => setDcaAdvancedOpen((value) => !value)}><strong>Advanced</strong><span>Video tutorial &nbsp; {dcaAdvancedOpen ? "⌃" : "⌄"}</span></button>
            {dcaAdvancedOpen && <div className={styles.dcaSectionBody}><div className={styles.dcaTwoCol}><label><span>Maximum active deals</span><input type="number" defaultValue={1}/></label><label><span>Cooldown between deals, sec</span><input type="number" defaultValue={0}/></label></div></div>}
          </section>
        </div>

        <aside className={styles.dcaSummaryCard}>
          <div className={styles.dcaSummaryHead}><h2>Summary</h2><div><button>⌁</button><button>▦ {maxSafetyOrders}</button><button>⌁</button></div></div>
          <div className={styles.dcaSummaryRows}>
            <div><span>Balance</span><strong className={styles.dcaBlueValue}>▱ {compactMoney(accountValue).replace("$", "")} USDT</strong></div>
            <div><span>Max amount for bot usage ⓘ</span><strong>{compactMoney(dcaTotal).replace("$", "")} USDT</strong></div>
            <div><span>Max averaging order price deviation</span><strong>{dcaPreview.at(-1)?.deviation.toFixed(0) ?? 0}%</strong></div>
            <div><span>% of available balance to be used by the bot</span><strong>{(dcaTotal / Math.max(accountValue, 1) * 100).toFixed(2)}%</strong></div>
            <div><span>Trade start condition</span><strong>{dcaConditions.length ? dcaConditions.length + " bot start condition" + (dcaConditions.length > 1 ? "s" : "") : "Immediately"}</strong></div>
          </div>
          <button className={styles.dcaBacktest} onClick={() => setDcaBacktestOpen((value) => !value)}><span>↻ Backtest</span><b>{dcaBacktestOpen ? "⌃" : "⌄"}</b></button>
          {dcaBacktestOpen && <div className={styles.dcaBacktestBody}><strong>Paper backtest preview</strong><span>Estimated capital ladder: {compactMoney(dcaTotal)}</span><span>{dcaPreview.length} averaging levels configured</span></div>}
          <div className={styles.dcaStartRow}><button className={styles.dcaAiButton}>✦</button><button className={styles.dcaStartButton} onClick={createDcaBot}>Start bot</button></div>
          <button className={styles.dcaBackToBots} onClick={() => setDcaView("list")}>Back to bots</button>
        </aside>
      </div>
    </div>
  );

  return <main`;

const builderPattern = /  const dcaCreate = \([\s\S]*?\n  \);\n\n  return <main/;
if (!builderPattern.test(source)) throw new Error("Could not locate DCA builder block");
source = source.replace(builderPattern, newBuilder);

const cssMarker = "/* DCA BUILDER V2 */";
if (!css.includes(cssMarker)) css += `\n\n${cssMarker}\n.dcaBuilderPage{max-width:1290px;margin:0 auto;padding:18px 24px 44px}.dcaBuilderTop{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}.dcaBuilderTop h1{margin:0;color:#edf3f6;font-size:25px;letter-spacing:-.45px}.dcaBuilderTop>div{display:flex;gap:8px}.dcaBuilderTop button{height:34px;padding:0 13px;border:1px solid #2b404d;background:#1a2a34;border-radius:7px;color:#c5d0d7;font-weight:750;cursor:pointer}.dcaWorkspace{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:16px;align-items:start}.dcaFormColumn{display:flex;flex-direction:column;gap:15px;min-width:0}.dcaSection{background:#14232b;border:1px solid #192c36;border-radius:10px;overflow:hidden}.dcaSectionHeader{height:52px;padding:0 15px;display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:center}.dcaSectionHeader h2{margin:0;color:#d9e3e8;font-size:15px}.dcaSectionHeader span{color:#8ca1ae;border-bottom:1px dotted #657e8d}.dcaSectionHeader b{color:#91a6b2}.dcaSectionBody{padding:0 11px 13px}.dcaTwoCol{display:grid;grid-template-columns:1fr 1fr;gap:11px 12px}.dcaTwoCol label,.dcaFullLabel,.dcaConditionGrid label{display:flex;flex-direction:column;gap:5px}.dcaTwoCol label>span,.dcaFullLabel>span,.dcaConditionGrid label>span{color:#9aacb7;font-size:12px}.dcaTwoCol label>span em{float:right;color:#4ca9f6;font-style:normal;font-size:11px}.dcaTwoCol input,.dcaTwoCol select,.dcaFullLabel select,.dcaConditionGrid input,.dcaConditionGrid select,.dcaWideSelect{height:32px;border:1px solid #304856;background:#101f27;color:#d0d9df;border-radius:7px;padding:0 10px;width:100%}.dcaFakeSelect{height:32px;border:1px solid #304856;background:#101f27;border-radius:7px;padding:0 10px;display:flex;align-items:center;gap:6px;color:#cbd5da;white-space:nowrap;overflow:hidden}.dcaFakeSelect small{margin-left:auto;color:#9fb0ba}.dcaSegment{display:grid;grid-template-columns:1fr 1fr;border:1px solid #304856;border-radius:7px;overflow:hidden;background:#203746}.dcaSegment button{height:31px;border:0;background:transparent;color:#9eacb5;font-weight:750;cursor:pointer}.dcaSegment .dcaSegmentActive{background:#101f27;color:#e4ebef}.dcaSubHead{height:45px;border-top:1px solid #1f323d;border-bottom:1px solid #1f323d;display:flex;align-items:center;gap:8px;color:#d5dee3;font-weight:800}.dcaSubHead small{color:#7d94a2}.dcaBlueBar,.dcaYellowBar,.dcaTealBar,.dcaRedBar,.dcaPurpleBar{display:inline-block;width:3px;height:17px;border-radius:5px;background:#4aa7f7}.dcaYellowBar{background:#f0b900}.dcaTealBar{background:#16c3b6}.dcaRedBar{background:#ff607b}.dcaPurpleBar{background:#8b6bea}.dcaToggleHead{min-height:44px;margin-top:10px;background:#101e26;border-radius:7px;display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:9px;padding:0 11px}.dcaToggleHead strong{color:#d3dde2}.dcaToggleHead>span{justify-self:end;color:#9aabb5}.dcaConditionCard{margin-top:9px;background:#21323e;border:1px solid #263b49;border-radius:7px;padding:10px}.dcaConditionTitle{height:26px;display:flex;align-items:center;justify-content:space-between;color:#d8e1e5}.dcaConditionTitle button{border:0;background:none;color:#718b9a;font-size:20px;cursor:pointer}.dcaWideSelect{margin-bottom:10px;background:#13222b}.dcaConditionGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 11px}.dcaConditionGrid label:nth-child(7){grid-column:1/2}.dcaConditionFooter{display:flex;justify-content:space-between;align-items:center;margin-top:10px}.dcaConditionFooter button,.dcaAddTarget{height:32px;border:1px solid #324958;background:#20313e;border-radius:7px;color:#d5dee3;padding:0 14px;font-weight:750}.dcaConditionFooter span{color:#94a6b0}.dcaTechLink{margin-top:8px;border:0;background:none;color:#4ca9f6;font-weight:750;padding:0}.dcaHintInput{position:relative}.dcaHintInput input{padding-right:185px}.dcaHintInput small{position:absolute;right:9px;top:8px;color:#718d9d}.dcaSection .inputUnit{height:32px;border-radius:7px;background:#101f27}.dcaSection .inputUnit input{height:30px}.dcaFullLabel{margin-top:10px}.dcaAddTarget{width:100%;margin:10px 0}.dcaCollapseRow{height:43px;margin-top:12px;background:#101e26;border-radius:7px;display:flex;align-items:center;gap:9px;padding:0 11px}.dcaCollapseRow strong{flex:1}.dcaAdvancedToggle{height:50px;width:100%;border:0;background:#14232b;color:#d6e0e5;display:flex;align-items:center;justify-content:space-between;padding:0 15px;cursor:pointer}.dcaAdvancedToggle span{color:#91a5b1;border-bottom:1px dotted #657b89}.dcaSummaryCard{position:sticky;top:16px;background:#14232b;border:1px solid #192c36;border-radius:10px;padding:14px;min-height:342px}.dcaSummaryHead{display:flex;align-items:center;justify-content:space-between}.dcaSummaryHead h2{margin:0;color:#e0e7eb;font-size:16px}.dcaSummaryHead>div{display:flex}.dcaSummaryHead button{height:30px;border:1px solid #2a3f4c;background:#1d2f3a;color:#c3ced5;padding:0 10px}.dcaSummaryRows{margin-top:12px}.dcaSummaryRows>div{min-height:32px;display:flex;align-items:center;gap:10px;border-bottom:1px dotted #2c414d}.dcaSummaryRows span{color:#96a9b4;flex:1}.dcaSummaryRows strong{color:#d1d9de;text-align:right;font-size:12px}.dcaSummaryRows .dcaBlueValue{color:#4aa7f7}.dcaBacktest{width:100%;height:43px;margin-top:14px;border:0;background:#101f27;border-radius:8px;color:#d7e0e5;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-weight:800}.dcaBacktestBody{display:flex;flex-direction:column;gap:4px;background:#101f27;padding:10px 12px;color:#91a5b1}.dcaBacktestBody strong{color:#d6e0e5}.dcaStartRow{display:grid;grid-template-columns:42px 1fr;gap:8px;margin-top:14px}.dcaAiButton,.dcaStartButton{height:43px;border:0;border-radius:7px;font-weight:850}.dcaAiButton{background:#15313b;color:#1bc1b8}.dcaStartButton{background:#18b7b1;color:white}.dcaBackToBots{width:100%;margin-top:8px;border:0;background:transparent;color:#7f9daf;height:30px}.dcaSummaryCard button,.dcaBuilderPage button{cursor:pointer}@media(max-width:1050px){.dcaWorkspace{grid-template-columns:1fr}.dcaSummaryCard{position:static}.dcaConditionGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.dcaBuilderPage{padding:14px}.dcaTwoCol,.dcaConditionGrid{grid-template-columns:1fr}.dcaBuilderTop{align-items:flex-start;gap:12px}.dcaBuilderTop>div{flex-wrap:wrap;justify-content:flex-end}}\n`;

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared detailed DCA bot builder from supplied reference screenshots.");
