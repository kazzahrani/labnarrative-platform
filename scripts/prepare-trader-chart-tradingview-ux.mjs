import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chartPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");
const cssPath = path.join(root, "app/trader/dca-trade-workstation.module.css");

let source = fs.readFileSync(chartPath, "utf8");
const required = (before, after, label) => {
  if (!source.includes(before)) throw new Error(`TradingView chart UX: missing ${label}`);
  source = source.replace(before, after);
};

required(
  '  const [autoY, setAutoY] = useState(true);\n  const initializedForTrade = useRef<string | null>(null);',
  '  const [autoY] = useState(true);\n  const [chartSettings, setChartSettings] = useState<Partial<Record<Exclude<IndicatorName, "Volume">, Condition>>>({});\n  const [editingIndicator, setEditingIndicator] = useState<IndicatorName | null>(null);\n  const [settingsDraft, setSettingsDraft] = useState<Condition | null>(null);\n  const initializedForTrade = useRef<string | null>(null);',
  "chart settings state",
);

required(
  '  const symbol = trade.pair.replace("/", "");\n\n  useEffect(() => {',
  `  const symbol = trade.pair.replace("/", "");
  const visualCondition = (name: Exclude<IndicatorName, "Volume">) => chartSettings[name] ?? conditionFor(name, conditions);
  const indicatorSummary = (name: IndicatorName) => {
    if (name === "Volume") return "Volume";
    const c = visualCondition(name);
    if (name === "RSI") return \`RSI \${normalizeLength(c.length, 14)}\`;
    if (name === "Stochastic") return \`Stoch \${normalizeLength(c.aux1, 14)} \${normalizeLength(c.aux2, 1)} \${normalizeLength(c.aux3, 3)}\`;
    if (name === "MACD") return \`MACD \${normalizeLength(c.aux1, 12)} \${normalizeLength(c.aux2, 26)} \${normalizeLength(c.aux3, 9)}\`;
    if (name === "Moving Average (MA)") return \`\${c.aux1 === 2 ? "WMA" : c.aux1 === 0 ? "SMA" : "EMA"} \${normalizeLength(c.aux2, 9)} / \${normalizeLength(c.aux3, 26)}\`;
    if (name === "Average Directional Index") return \`ADX \${normalizeLength(c.length, 14)}\`;
    if (name === "Bollinger Bands %B") return \`BB %B \${normalizeLength(c.length, 20)} · \${c.aux1 || 2}σ\`;
    if (name === "Money Flow Index") return \`MFI \${normalizeLength(c.length, 14)}\`;
    if (name === "Commodity Channel Index") return \`CCI \${normalizeLength(c.length, 20)}\`;
    if (name === "Ultimate Oscillator") return \`Ultimate \${normalizeLength(c.aux1, 7)} \${normalizeLength(c.aux2, 14)} \${normalizeLength(c.aux3, 28)}\`;
    if (name === "Parabolic SAR") return \`PSAR \${(c.aux1 ? c.aux1 / 100 : .02).toFixed(2)} · \${(c.aux2 ? c.aux2 / 5 : .2).toFixed(2)}\`;
    return "Heikin Ashi";
  };
  const openIndicatorSettings = (name: IndicatorName) => {
    setEditingIndicator(name);
    setSettingsDraft(name === "Volume" ? null : { ...visualCondition(name) });
    setShowIndicators(false);
  };
  const updateDraft = (patch: Partial<Condition>) => setSettingsDraft(current => current ? { ...current, ...patch } : current);
  const applyIndicatorSettings = () => {
    if (editingIndicator && editingIndicator !== "Volume" && settingsDraft) setChartSettings(current => ({ ...current, [editingIndicator]: settingsDraft }));
    setEditingIndicator(null); setSettingsDraft(null);
  };
  const resetDraft = () => {
    if (!editingIndicator || editingIndicator === "Volume") return;
    setSettingsDraft({ ...conditionFor(editingIndicator, conditions) });
  };

  useEffect(() => {`,
  "visual indicator helpers",
);

const replacements = [
  ['conditionFor("Moving Average (MA)", conditions)', 'visualCondition("Moving Average (MA)")'],
  ['conditionFor("Parabolic SAR", conditions)', 'visualCondition("Parabolic SAR")'],
  ['conditionFor("RSI", conditions)', 'visualCondition("RSI")'],
  ['conditionFor("Stochastic", conditions)', 'visualCondition("Stochastic")'],
  ['conditionFor("MACD", conditions)', 'visualCondition("MACD")'],
  ['conditionFor("Average Directional Index", conditions)', 'visualCondition("Average Directional Index")'],
  ['conditionFor("Bollinger Bands %B", conditions)', 'visualCondition("Bollinger Bands %B")'],
  ['conditionFor("Money Flow Index", conditions)', 'visualCondition("Money Flow Index")'],
  ['conditionFor("Commodity Channel Index", conditions)', 'visualCondition("Commodity Channel Index")'],
  ['conditionFor("Ultimate Oscillator", conditions)', 'visualCondition("Ultimate Oscillator")'],
];
for (const [before, after] of replacements) source = source.replaceAll(before, after);

required(
  '  const structureSignature = useMemo(() => JSON.stringify({\n    fills: fills.map(f => [f.kind, f.side, f.price, f.at]),\n    orders: activeOrders.map(o => [o.id, o.kind, o.side, o.sequence, o.price]),\n    avg: trade.averagePrice, tp: trade.takeProfitPrice, sl: trade.stopLossPrice, exit: trade.exitPrice,\n  }), [fills, activeOrders, trade.averagePrice, trade.takeProfitPrice, trade.stopLossPrice, trade.exitPrice]);',
  '  const structureSignature = useMemo(() => JSON.stringify({\n    fills: fills.map(f => [f.kind, f.side, f.price, f.at]),\n    orders: activeOrders.map(o => [o.id, o.kind, o.side, o.sequence, o.price]),\n    avg: trade.averagePrice, tp: trade.takeProfitPrice, sl: trade.stopLossPrice, exit: trade.exitPrice,\n  }), [fills, activeOrders, trade.averagePrice, trade.takeProfitPrice, trade.stopLossPrice, trade.exitPrice]);\n  const conditionSignature = JSON.stringify(conditions);\n  const settingsSignature = JSON.stringify(chartSettings);',
  "stable indicator signatures",
);

source = source.replace(
  'title: "AVG"',
  'title: "Avg. Buy Price"',
);
source = source.replace(
  'title: "MARK"',
  'title: ""',
);
source = source.replace(
  '}, [candles, interval, enabled, paneOrder, paneHeights, priceHeight, autoY, conditions, structureSignature, canvasHeight]);',
  '}, [candles, interval, enabled, paneOrder, paneHeights, priceHeight, autoY, conditionSignature, settingsSignature, structureSignature, canvasHeight]);',
);

const renderStart = source.indexOf('  const toggle = (name: IndicatorName) =>');
if (renderStart < 0) throw new Error("TradingView chart UX: render helpers not found");
const returnStart = source.indexOf('  return <div className={styles.overlay}', renderStart);
if (returnStart < 0) throw new Error("TradingView chart UX: render return not found");
const renderEnd = source.lastIndexOf('\n}');
if (renderEnd <= returnStart) throw new Error("TradingView chart UX: component end not found");
const helpers = source.slice(renderStart, returnStart);
const simplifiedHelpers = helpers
  .replace(/  const adjustPane =[\s\S]*?\n  const strategyKinds = new Set\(conditions\.map\(c => c\.kind\)\);\n/, '  const strategyKinds = new Set(conditions.map(c => c.kind));\n  const paneTop = (name: IndicatorName) => { let top = priceHeight; for (const pane of separateEnabled) { if (pane === name) return top; top += paneHeights[pane] ?? 130; } return top; };\n');

const newReturn = `  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={\`\${trade.pair} trade chart\`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.modal}>
      <header className={styles.topbar}>
        <div><h2>TV Chart</h2><p>{trade.pair} · BINANCE · {snapshot?.bot?.name ?? "DCA Bot"}</p></div>
        <button className={styles.close} onClick={onClose}>×</button>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.intervals}>{INTERVALS.map(item => <button key={item.value} className={interval === item.value ? styles.active : ""} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div>
        <div className={styles.tools}>
          <div className={styles.indicatorWrap}>
            <button className={showIndicators ? styles.active : ""} onClick={() => setShowIndicators(v => !v)}>ƒx&nbsp; Indicators</button>
            {showIndicators && <div className={styles.indicatorMenu}>
              <div className={styles.menuHead}><div><strong>Indicators</strong><small>Add indicators to this chart</small></div><button onClick={() => setShowIndicators(false)}>×</button></div>
              {INDICATORS.map(name => { const active = enabled.includes(name), strategy = strategyKinds.has(name); return <div className={styles.indicatorRow} key={name}>
                <button className={\`\${styles.check} \${active ? styles.checked : ""}\`} onClick={() => toggle(name)}><i/>{name}</button>
                {strategy && <b className={styles.botTag}>BOT</b>}
                <button className={styles.settingsButton} title={\`\${name} settings\`} onClick={() => openIndicatorSettings(name)}>⚙</button>
              </div>; })}
            </div>}
          </div>
        </div>
      </div>
      <div className={styles.chartViewport}>
        {loading && <div className={styles.state}>Loading chart…</div>}
        {error && <div className={\`\${styles.state} \${styles.error}\`}>{error}</div>}
        <div ref={containerRef} className={styles.canvas} style={{ height: \`\${canvasHeight}px\` }}/>
        <div className={styles.paneLabels} style={{ height: \`\${canvasHeight}px\` }}>
          <div className={styles.symbolLegend}><strong>{trade.pair}</strong><span>{interval.toUpperCase()} · BINANCE</span></div>
          <div className={styles.overlayLegends}>{enabled.filter(name => OVERLAYS.has(name)).map(name => <button key={name} onClick={() => openIndicatorSettings(name)}>{indicatorSummary(name)} <span>⚙</span></button>)}</div>
          {separateEnabled.map(name => <button key={name} className={styles.paneLegend} style={{ top: \`\${paneTop(name) + 7}px\` }} onClick={() => openIndicatorSettings(name)}>{indicatorSummary(name)} <span>⚙</span></button>)}
        </div>
      </div>

      {editingIndicator && <div className={styles.settingsBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingIndicator(null); setSettingsDraft(null); } }}>
        <section className={styles.settingsModal}>
          <header><div><small>INDICATOR SETTINGS</small><h3>{editingIndicator}</h3><p>Chart display only — your running bot is not changed.</p></div><button onClick={() => { setEditingIndicator(null); setSettingsDraft(null); }}>×</button></header>
          <div className={styles.settingsBody}>
            {editingIndicator === "Volume" && <div className={styles.noInputs}>Volume uses Binance candle volume and has no calculation inputs.</div>}
            {settingsDraft && <>
              {editingIndicator === "RSI" && <div className={styles.settingsGrid}><label><span>Length</span><input type="number" min="1" max="500" value={settingsDraft.length} onChange={e => updateDraft({ length: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Stochastic" && <div className={styles.settingsGrid}><label><span>%K Length</span><input type="number" min="1" value={settingsDraft.aux1} onChange={e => updateDraft({ aux1: Number(e.target.value) })}/></label><label><span>%K Smoothing</span><input type="number" min="1" value={settingsDraft.aux2} onChange={e => updateDraft({ aux2: Number(e.target.value) })}/></label><label><span>%D Smoothing</span><input type="number" min="1" value={settingsDraft.aux3} onChange={e => updateDraft({ aux3: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "MACD" && <div className={styles.settingsGrid}><label><span>Fast Length</span><input type="number" min="1" value={settingsDraft.aux1} onChange={e => updateDraft({ aux1: Number(e.target.value) })}/></label><label><span>Slow Length</span><input type="number" min="1" value={settingsDraft.aux2} onChange={e => updateDraft({ aux2: Number(e.target.value) })}/></label><label><span>Signal Length</span><input type="number" min="1" value={settingsDraft.aux3} onChange={e => updateDraft({ aux3: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Moving Average (MA)" && <div className={styles.settingsGrid}><label><span>MA Type</span><select value={settingsDraft.aux1} onChange={e => updateDraft({ aux1: Number(e.target.value) })}><option value={0}>SMA</option><option value={1}>EMA</option><option value={2}>WMA</option></select></label><label><span>Fast Length</span><input type="number" min="1" value={settingsDraft.aux2} onChange={e => updateDraft({ aux2: Number(e.target.value) })}/></label><label><span>Slow Length</span><input type="number" min="1" value={settingsDraft.aux3} onChange={e => updateDraft({ aux3: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Average Directional Index" && <div className={styles.settingsGrid}><label><span>ADX / DI Length</span><input type="number" min="1" value={settingsDraft.length} onChange={e => updateDraft({ length: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Bollinger Bands %B" && <div className={styles.settingsGrid}><label><span>Period</span><input type="number" min="1" value={settingsDraft.length} onChange={e => updateDraft({ length: Number(e.target.value) })}/></label><label><span>Deviation</span><input type="number" min="0.1" step="0.1" value={settingsDraft.aux1} onChange={e => updateDraft({ aux1: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Money Flow Index" && <div className={styles.settingsGrid}><label><span>Length</span><input type="number" min="1" value={settingsDraft.length} onChange={e => updateDraft({ length: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Commodity Channel Index" && <div className={styles.settingsGrid}><label><span>Length</span><input type="number" min="1" value={settingsDraft.length} onChange={e => updateDraft({ length: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Ultimate Oscillator" && <div className={styles.settingsGrid}><label><span>Fast Length</span><input type="number" min="1" value={settingsDraft.aux1} onChange={e => updateDraft({ aux1: Number(e.target.value) })}/></label><label><span>Middle Length</span><input type="number" min="1" value={settingsDraft.aux2} onChange={e => updateDraft({ aux2: Number(e.target.value) })}/></label><label><span>Slow Length</span><input type="number" min="1" value={settingsDraft.aux3} onChange={e => updateDraft({ aux3: Number(e.target.value) })}/></label></div>}
              {editingIndicator === "Parabolic SAR" && <div className={styles.settingsGrid}><label><span>Step</span><input type="number" min="0.001" step="0.01" value={(settingsDraft.aux1 ? settingsDraft.aux1 / 100 : .02)} onChange={e => updateDraft({ aux1: Number(e.target.value) * 100 })}/></label><label><span>Maximum</span><input type="number" min="0.01" step="0.01" value={(settingsDraft.aux2 ? settingsDraft.aux2 / 5 : .2)} onChange={e => updateDraft({ aux2: Number(e.target.value) * 5 })}/></label></div>}
              {editingIndicator === "Heikin Ashi" && <div className={styles.noInputs}>Heikin Ashi transforms the displayed candles and has no additional calculation input here.</div>}
            </>}
          </div>
          <footer><button onClick={() => { setEditingIndicator(null); setSettingsDraft(null); }}>Cancel</button>{editingIndicator !== "Volume" && <button onClick={resetDraft}>Defaults</button>}<button className={styles.apply} onClick={applyIndicatorSettings}>Apply</button></footer>
        </section>
      </div>}
    </section>
  </div>;`;

source = source.slice(0, renderStart) + simplifiedHelpers + newReturn + source.slice(renderEnd);
fs.writeFileSync(chartPath, source);

let css = fs.readFileSync(cssPath, "utf8");
css = `.overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:28px;font-family:Tahoma,Arial,sans-serif;color:#eee}
.modal{width:min(1180px,calc(100vw - 72px));height:min(760px,calc(100vh - 92px));min-width:760px;min-height:520px;max-width:calc(100vw - 28px);max-height:calc(100vh - 28px);resize:both;overflow:hidden;background:#151515;border:1px solid #343434;border-radius:16px;box-shadow:0 28px 90px rgba(0,0,0,.62);display:flex;flex-direction:column}
.topbar{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#191919;border-bottom:1px solid #303030}.topbar h2{margin:0 0 5px;font-size:20px;line-height:1;color:#ddd}.topbar p{margin:0;color:#858585;font-size:9px}.close{width:34px;height:34px;border:0;background:transparent;color:#aaa;font-size:28px;line-height:1;cursor:pointer;border-radius:8px}.close:hover{background:#282828;color:#fff}
.toolbar{height:43px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;background:#171717;border-bottom:1px solid #303030}.intervals,.tools{display:flex;align-items:center;gap:3px}.toolbar button{border:1px solid transparent;background:transparent;color:#999;border-radius:6px;height:29px;padding:0 9px;font:700 9px Tahoma,Arial,sans-serif;cursor:pointer}.toolbar button:hover{color:#e0e0e0;background:#232323}.toolbar button.active,.active{background:#292929!important;border-color:#404040!important;color:#eee!important}
.indicatorWrap{position:relative}.indicatorMenu{position:absolute;top:35px;right:0;width:340px;max-height:min(520px,68vh);overflow:auto;background:#1d1d1d;border:1px solid #3a3a3a;border-radius:10px;box-shadow:0 20px 55px rgba(0,0,0,.6);z-index:25;padding:6px}.menuHead{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 10px;border-bottom:1px solid #303030}.menuHead>div{display:grid;gap:2px}.menuHead strong{font-size:11px}.menuHead small{font-size:8px;color:#777}.menuHead button{font-size:16px}.indicatorRow{min-height:36px;display:grid;grid-template-columns:minmax(0,1fr) auto 30px;align-items:center;gap:6px;border-bottom:1px solid #292929;padding:2px}.check{justify-self:stretch!important;text-align:left!important;display:flex!important;align-items:center!important;gap:8px!important;padding:0 6px!important}.check i{width:13px;height:13px;border:1px solid #555;border-radius:3px;background:#242424;display:inline-block}.checked i{background:#ddd;border-color:#ddd;box-shadow:inset 0 0 0 3px #242424}.botTag{font-size:7px;letter-spacing:.07em;background:#28382f;color:#75c79f;border:1px solid #385043;border-radius:4px;padding:3px 4px}.settingsButton{width:28px!important;padding:0!important;color:#777!important;font-size:12px!important}.settingsButton:hover{color:#ddd!important}
.chartViewport{position:relative;flex:1;min-height:0;overflow:auto;background:#121212}.canvas{width:100%;min-height:420px}.state{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:12;background:rgba(30,30,30,.95);border:1px solid #3b3b3b;color:#bdbdbd;padding:8px 11px;border-radius:7px;font-size:9px;pointer-events:none}.error{color:#e79ca3;border-color:#6b3f44}
.paneLabels{position:absolute;left:0;right:0;top:0;z-index:8;pointer-events:none}.symbolLegend{position:absolute;top:9px;left:12px;display:flex;align-items:center;gap:6px;background:rgba(18,18,18,.72);padding:3px 5px;border-radius:4px;pointer-events:none}.symbolLegend strong{font-size:11px;color:#c7c7c7}.symbolLegend span{font-size:8px;color:#777}.overlayLegends{position:absolute;top:34px;left:12px;display:flex;gap:5px;flex-wrap:wrap;max-width:70%;pointer-events:auto}.overlayLegends button,.paneLegend{border:0;background:rgba(18,18,18,.78);color:#9d9d9d;font:700 8px Tahoma,Arial,sans-serif;border-radius:4px;padding:3px 5px;cursor:pointer}.overlayLegends button:hover,.paneLegend:hover{background:#292929;color:#ddd}.overlayLegends span,.paneLegend span{font-size:8px;color:#666;margin-left:3px}.paneLegend{position:absolute;left:12px;pointer-events:auto;z-index:9}
.settingsBackdrop{position:absolute;inset:0;z-index:40;background:rgba(0,0,0,.42);display:grid;place-items:center}.settingsModal{width:min(440px,calc(100% - 40px));background:#1d1d1d;border:1px solid #3b3b3b;border-radius:12px;box-shadow:0 22px 70px rgba(0,0,0,.65);overflow:hidden}.settingsModal>header{display:flex;align-items:flex-start;justify-content:space-between;padding:16px;border-bottom:1px solid #303030}.settingsModal>header small{display:block;font-size:7px;letter-spacing:.12em;color:#777;margin-bottom:4px}.settingsModal>header h3{margin:0 0 4px;font-size:17px;color:#ddd}.settingsModal>header p{margin:0;font-size:8px;color:#777}.settingsModal>header button{border:0;background:transparent;color:#999;font-size:21px;cursor:pointer}.settingsBody{padding:16px}.settingsGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.settingsGrid label{display:grid;gap:6px}.settingsGrid span{font-size:8px;color:#999}.settingsGrid input,.settingsGrid select{height:34px;border:1px solid #3b3b3b;border-radius:7px;background:#151515;color:#ddd;padding:0 9px;font:10px Tahoma,Arial,sans-serif;outline:none}.settingsGrid input:focus,.settingsGrid select:focus{border-color:#666}.noInputs{font-size:9px;line-height:1.6;color:#888;padding:8px 0}.settingsModal>footer{display:flex;justify-content:flex-end;gap:7px;padding:11px 16px;border-top:1px solid #303030}.settingsModal>footer button{height:31px;border:1px solid #3a3a3a;border-radius:7px;background:#242424;color:#aaa;padding:0 12px;font:700 8px Tahoma,Arial,sans-serif;cursor:pointer}.settingsModal>footer button:hover{color:#eee}.settingsModal>footer .apply{background:#e0e0e0;color:#161616;border-color:#e0e0e0}
@media(max-width:820px){.overlay{padding:8px}.modal{width:calc(100vw - 16px);height:calc(100vh - 16px);min-width:0;min-height:0;resize:none;border-radius:12px}.topbar{height:56px}.toolbar{height:auto;min-height:42px;gap:5px;align-items:flex-start;flex-direction:column;padding:5px 8px}.intervals{max-width:100%;overflow:auto}.indicatorMenu{position:fixed;left:12px;right:12px;top:112px;width:auto}.settingsGrid{grid-template-columns:1fr}}`;
fs.writeFileSync(cssPath, css);
console.log("TradingView-style DCA chart UX prepared");
