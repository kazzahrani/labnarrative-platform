import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
const cssPath = path.join(process.cwd(), "app", "trader", "trader-dca-v2.module.css");
if (!fs.existsSync(shellPath) || !fs.existsSync(cssPath)) throw new Error("Positions intelligence targets missing");

let shell = fs.readFileSync(shellPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");
const marker = "POSITIONS_INTELLIGENCE_BAND_V3";

if (!shell.includes(marker)) {
  const totalsAnchor = '    const totalPnl = rows.reduce((sum, trade) => sum + trade.pnl, 0);';
  if (!shell.includes(totalsAnchor)) throw new Error("Positions intelligence could not find trade totals anchor");

  const analytics = `${totalsAnchor}
    // POSITIONS_INTELLIGENCE_BAND_V3
    const donutGradient = (segments: Array<{ value: number; color: string }>) => {
      const positive = segments.filter((segment) => segment.value > 0);
      const total = positive.reduce((sum, segment) => sum + segment.value, 0);
      if (!(total > 0)) return "conic-gradient(#343434 0deg 360deg)";
      let cursor = 0;
      return "conic-gradient(" + positive.map((segment) => {
        const from = cursor / total * 360;
        cursor += segment.value;
        const to = cursor / total * 360;
        return segment.color + " " + from.toFixed(2) + "deg " + to.toFixed(2) + "deg";
      }).join(",") + ")";
    };
    const remainingCost = (trade: Trade) => Math.max(0, Number((trade as Trade & { remainingCostBasis?: number }).remainingCostBasis ?? trade.invested ?? 0));
    const openDeployed = Math.max(0, activeTrades.reduce((sum, trade) => sum + remainingCost(trade), 0));
    const openReserved = Math.max(0, Number(stateAccount?.reserved ?? 0));
    const openAvailable = Math.max(0, Number(displayedAvailable || 0));
    const capitalTotal = openAvailable + openDeployed + openReserved;
    const capitalUtilization = capitalTotal > 0 ? (openDeployed + openReserved) / capitalTotal * 100 : 0;
    const capitalParts = [
      { label: "Available", value: openAvailable, color: "#6f8cff" },
      { label: "Deployed", value: openDeployed, color: "#27b978" },
      { label: "Reserved", value: openReserved, color: "#C8A45D" },
    ];
    const pairMap = new Map<string, number>();
    for (const trade of activeTrades) pairMap.set(trade.pair, (pairMap.get(trade.pair) ?? 0) + remainingCost(trade));
    const pairEntriesRaw = Array.from(pairMap.entries()).sort((a, b) => b[1] - a[1]);
    const pairEntries = pairEntriesRaw.length <= 5 ? pairEntriesRaw.map(([label, value]) => ({ label, value })) : [
      ...pairEntriesRaw.slice(0, 4).map(([label, value]) => ({ label, value })),
      { label: "Other", value: pairEntriesRaw.slice(4).reduce((sum, [, value]) => sum + value, 0) },
    ];
    const livePnlRows = [...activeTrades].sort((a, b) => Math.abs(Number(b.pnl || 0)) - Math.abs(Number(a.pnl || 0))).slice(0, 6);
    const livePnlMax = Math.max(0.01, ...livePnlRows.map((trade) => Math.abs(Number(trade.pnl || 0))));
    const hiddenLivePnlRows = Math.max(0, activeTrades.length - livePnlRows.length);
    const closedEpsilon = 0.005;
    const closedWins = closedTrades.filter((trade) => Number(trade.pnl || 0) > closedEpsilon).length;
    const closedLosses = closedTrades.filter((trade) => Number(trade.pnl || 0) < -closedEpsilon).length;
    const closedFlat = Math.max(0, closedTrades.length - closedWins - closedLosses);
    const winRateBase = closedWins + closedLosses;
    const closedWinRate = winRateBase > 0 ? closedWins / winRateBase * 100 : 0;
    const normalizeExitReason = (reason: string | null) => {
      const key = String(reason ?? "").trim().toLowerCase().replace(/[\\s-]+/g, "_");
      if (key.includes("trail")) return "Trailing";
      if (key.includes("stop_loss") || key === "sl" || key.includes("stoploss")) return "Stop Loss";
      if (key.includes("take_profit") || key === "tp" || key.includes("takeprofit")) return "Take Profit";
      if (key.includes("manual") || key.includes("user_close") || key.includes("market_close")) return "Manual";
      if (key.includes("max_hold") || key.includes("timeout") || key.includes("time_limit")) return "Timeout";
      return "Other";
    };
    const reasonColors: Record<string, string> = { "Take Profit": "#27b978", "Stop Loss": "#b87378", Trailing: "#55aebd", Manual: "#C8A45D", Timeout: "#9b79bd", Other: "#666b73" };
    const reasonMap = new Map<string, number>();
    for (const trade of closedTrades) { const label = normalizeExitReason(trade.closeReason); reasonMap.set(label, (reasonMap.get(label) ?? 0) + 1); }
    const exitReasons = Array.from(reasonMap.entries()).map(([label, value]) => ({ label, value, color: reasonColors[label] ?? reasonColors.Other })).sort((a, b) => b.value - a.value);
    const recentClosed = [...closedTrades].filter((trade) => trade.closedAt).sort((a, b) => new Date(a.closedAt ?? 0).getTime() - new Date(b.closedAt ?? 0).getTime()).slice(-8);
    const recentPnlMax = Math.max(0.01, ...recentClosed.map((trade) => Math.abs(Number(trade.pnl || 0))));
    const recentPnl = recentClosed.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    const holdingHours = closedTrades.map((trade) => {
      const opened = new Date(trade.openedAt ?? 0).getTime();
      const closed = new Date(trade.closedAt ?? 0).getTime();
      return opened > 0 && closed >= opened ? (closed - opened) / 3600000 : null;
    }).filter((value): value is number => value != null && Number.isFinite(value));
    const sortedHoldingHours = [...holdingHours].sort((a, b) => a - b);
    const holdingMedian = sortedHoldingHours.length ? (sortedHoldingHours.length % 2 ? sortedHoldingHours[(sortedHoldingHours.length - 1) / 2] : (sortedHoldingHours[sortedHoldingHours.length / 2 - 1] + sortedHoldingHours[sortedHoldingHours.length / 2]) / 2) : 0;
    const holdingMedianLabel = holdingMedian >= 24 ? (holdingMedian / 24).toFixed(1) + "d" : holdingMedian.toFixed(1) + "h";
    const holdingBuckets = [
      { label: "<1h", value: holdingHours.filter((hours) => hours < 1).length },
      { label: "1–6h", value: holdingHours.filter((hours) => hours >= 1 && hours < 6).length },
      { label: "6–24h", value: holdingHours.filter((hours) => hours >= 6 && hours < 24).length },
      { label: "1–3d", value: holdingHours.filter((hours) => hours >= 24 && hours < 72).length },
      { label: "3d+", value: holdingHours.filter((hours) => hours >= 72).length },
    ];
    const maxHoldingBucket = Math.max(1, ...holdingBuckets.map((bucket) => bucket.value));`;
  shell = shell.replace(totalsAnchor, analytics);

  const statsPattern = /      <div className=\{dca\.tradeStats\}>[\s\S]*?<\/div>\n      <div className=\{dca\.tradeTable\}>/;
  if (!statsPattern.test(shell)) throw new Error("Positions intelligence could not find the final static summary strip");

  const insightBand = `      {tradeState === "Active" ? <section className={dca.positionInsightBand}>
        <div className={dca.positionInsightSegment}>
          <div className={dca.positionInsightHead}><div><span>Capital at Work</span><small>Current cost basis + reserved capital</small></div><b>{capitalUtilization.toFixed(0)}% used</b></div>
          <div className={dca.positionCapitalLayout}><div className={dca.positionDonut} style={{background:donutGradient(capitalParts)}}><div><strong>{money(openDeployed)}</strong><small>deployed</small></div></div><div className={dca.positionLegend}>{capitalParts.map((item) => <div key={item.label} className={dca.positionLegendRow} title={item.label + " · " + money(item.value)}><i style={{background:item.color}}/><span>{item.label}</span><b>{money(item.value)}</b></div>)}</div></div>
        </div>
        <div className={dca.positionInsightSegment}>
          <div className={dca.positionInsightHead}><div><span>Pair Exposure</span><small>Current deployed capital by market</small></div><b>{pairEntriesRaw.length} market{pairEntriesRaw.length === 1 ? "" : "s"}</b></div>
          <div className={dca.positionExposureBars}>{pairEntries.length ? pairEntries.map((item) => { const share = openDeployed > 0 ? item.value / openDeployed * 100 : 0; return <div key={item.label} className={dca.positionExposureRow} title={item.label + " · " + money(item.value)}><span>{item.label.replace("/USDT", "")}</span><div><i style={{width:String(Math.max(2, share))+"%"}}/></div><b>{share.toFixed(1)}%</b></div>; }) : <div className={dca.positionInsightEmpty}>No open exposure</div>}</div>
        </div>
        <div className={dca.positionInsightSegment}>
          <div className={dca.positionInsightHead}><div><span>Live PnL Distribution</span><small>Largest open-position PnL moves</small></div><b className={totalPnl >= 0 ? dca.positionPositive : dca.positionNegative}>{money(totalPnl)}</b></div>
          <div className={dca.positionDivergeList}>{livePnlRows.length ? livePnlRows.map((trade) => { const value = Number(trade.pnl || 0); const magnitude = Math.max(2, Math.abs(value) / livePnlMax * 48); return <div key={trade.id} className={dca.positionDivergeRow} title={trade.botName + " · " + trade.pair + " · " + money(value)}><span>{trade.pair.replace("/USDT", "")}</span><div className={dca.positionDivergeTrack}><i className={dca.positionDivergeAxis}/><b className={value >= 0 ? dca.positionDivergePositive : dca.positionDivergeNegative} style={value >= 0 ? {left:"50%",width:String(magnitude)+"%"} : {right:"50%",width:String(magnitude)+"%"}}/></div><strong className={value >= 0 ? dca.positionPositive : dca.positionNegative}>{money(value)}</strong></div>; }) : <div className={dca.positionInsightEmpty}>No open positions</div>}{hiddenLivePnlRows > 0 && <small className={dca.positionMoreRows}>+{hiddenLivePnlRows} smaller position{hiddenLivePnlRows === 1 ? "" : "s"}</small>}</div>
        </div>
      </section> : <section className={dca.positionInsightBand}>
        <div className={dca.positionInsightSegment}>
          <div className={dca.positionInsightHead}><div><span>Exit Reasons</span><small>How completed positions were resolved</small></div><b>{closedWinRate.toFixed(1)}% win rate</b></div>
          <div className={dca.positionCapitalLayout}><div className={dca.positionDonut} style={{background:donutGradient(exitReasons)}}><div><strong>{closedTrades.length}</strong><small>closed</small></div></div><div className={dca.positionLegend}>{exitReasons.length ? exitReasons.slice(0, 4).map((item) => <div key={item.label} className={dca.positionLegendRow}><i style={{background:item.color}}/><span>{item.label}</span><b>{item.value}</b></div>) : <div className={dca.positionInsightEmpty}>No exit history</div>}<div className={dca.positionOutcomeLine}><span>{closedWins}W</span><span>{closedLosses}L</span><span>{closedFlat}BE</span></div></div></div>
        </div>
        <div className={dca.positionInsightSegment}>
          <div className={dca.positionInsightHead}><div><span>Recent Realized PnL</span><small>Latest completed positions</small></div><b className={recentPnl >= 0 ? dca.positionPositive : dca.positionNegative}>{money(recentPnl)}</b></div>
          <div className={dca.positionDivergeList}>{recentClosed.length ? recentClosed.map((trade) => { const value = Number(trade.pnl || 0); const magnitude = Math.max(2, Math.abs(value) / recentPnlMax * 48); return <div key={trade.id} className={dca.positionDivergeRow} title={trade.pair + " · " + money(value)}><span>{trade.pair.replace("/USDT", "")}</span><div className={dca.positionDivergeTrack}><i className={dca.positionDivergeAxis}/><b className={value >= 0 ? dca.positionDivergePositive : dca.positionDivergeNegative} style={value >= 0 ? {left:"50%",width:String(magnitude)+"%"} : {right:"50%",width:String(magnitude)+"%"}}/></div><strong className={value >= 0 ? dca.positionPositive : dca.positionNegative}>{money(value)}</strong></div>; }) : <div className={dca.positionInsightEmpty}>No completed positions</div>}</div>
        </div>
        <div className={dca.positionInsightSegment}>
          <div className={dca.positionInsightHead}><div><span>Holding Time</span><small>Completed-position duration profile</small></div><b>{holdingHours.length ? holdingMedianLabel + " median" : "—"}</b></div>
          <div className={dca.positionHoldChart}>{holdingBuckets.map((bucket) => <div key={bucket.label} className={dca.positionHoldBucket} title={bucket.label + " · " + bucket.value + " positions"}><div><i style={{height:String(bucket.value ? Math.max(8, bucket.value / maxHoldingBucket * 100) : 2)+"%"}}/></div><b>{bucket.value}</b><span>{bucket.label}</span></div>)}</div>
        </div>
      </section>}
      <div className={dca.tradeTable}>`;
  shell = shell.replace(statsPattern, insightBand);
}

const cssMarker = "/* positions-intelligence-band-v3 */";
if (!css.includes(cssMarker)) {
  css += `
${cssMarker}
.positionInsightBand{display:grid;grid-template-columns:1fr 1.08fr 1.18fr;margin:12px 0 16px;border:1px solid #343434;border-radius:17px;background:linear-gradient(145deg,rgba(255,255,255,.014),rgba(255,255,255,.004));overflow:hidden;min-height:150px}.positionInsightSegment{min-width:0;padding:13px 15px 12px;position:relative}.positionInsightSegment+.positionInsightSegment{border-left:1px solid #303030}.positionInsightHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.positionInsightHead>div{display:grid;gap:2px;min-width:0}.positionInsightHead span{font:700 10px/1.2 Tahoma,Arial,sans-serif;color:#e8e8e8;letter-spacing:.01em}.positionInsightHead small{font:400 7px/1.25 Tahoma,Arial,sans-serif;color:#696969;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.positionInsightHead>b{font:400 8px/1.2 Tahoma,Arial,sans-serif;color:#929292;white-space:nowrap}.positionCapitalLayout{display:grid;grid-template-columns:75px minmax(0,1fr);gap:12px;align-items:center}.positionDonut{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025);transition:transform .18s ease}.positionInsightSegment:hover .positionDonut{transform:scale(1.025)}.positionDonut:after{content:"";position:absolute;inset:11px;border-radius:50%;background:#202020;border:1px solid #2e2e2e}.positionDonut>div{position:relative;z-index:1;display:grid;text-align:center;gap:1px;max-width:52px}.positionDonut strong{font:700 9px/1.1 Tahoma,Arial,sans-serif;color:#e2e2e2;overflow:hidden;text-overflow:ellipsis}.positionDonut small{font:400 6px/1.2 Tahoma,Arial,sans-serif;color:#737373}.positionLegend{display:grid;gap:5px;min-width:0}.positionLegendRow{display:grid;grid-template-columns:6px minmax(0,1fr) auto;gap:6px;align-items:center;min-width:0}.positionLegendRow>i{width:6px;height:6px;border-radius:50%}.positionLegendRow>span{font:400 7px/1.2 Tahoma,Arial,sans-serif;color:#8a8a8a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.positionLegendRow>b{font:500 7px/1.2 Tahoma,Arial,sans-serif;color:#b0b0b0;white-space:nowrap}.positionOutcomeLine{display:flex;gap:8px;padding-top:4px;margin-top:1px;border-top:1px solid #2d2d2d}.positionOutcomeLine span{font:500 6px/1 Tahoma,Arial,sans-serif;color:#777}.positionExposureBars{display:grid;gap:7px;padding-top:1px}.positionExposureRow{display:grid;grid-template-columns:38px minmax(50px,1fr) 35px;gap:7px;align-items:center}.positionExposureRow>span,.positionExposureRow>b{font:500 7px/1 Tahoma,Arial,sans-serif;color:#929292;white-space:nowrap}.positionExposureRow>b{text-align:right;color:#aaa}.positionExposureRow>div{height:5px;border-radius:999px;background:#2d2d2d;overflow:hidden}.positionExposureRow>div>i{display:block;height:100%;max-width:100%;border-radius:999px;background:linear-gradient(90deg,#596eae,#7188cb);transition:width .28s ease}.positionDivergeList{display:grid;gap:5px}.positionDivergeRow{display:grid;grid-template-columns:36px minmax(70px,1fr) 55px;gap:6px;align-items:center;min-height:10px}.positionDivergeRow>span{font:500 6.5px/1 Tahoma,Arial,sans-serif;color:#898989;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.positionDivergeRow>strong{font:500 6.5px/1 Tahoma,Arial,sans-serif;text-align:right;white-space:nowrap}.positionDivergeTrack{height:7px;position:relative;border-radius:3px;background:#292929;overflow:hidden}.positionDivergeAxis{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#555;z-index:2}.positionDivergeTrack>b{position:absolute;top:1px;bottom:1px;border-radius:2px;min-width:2px;transition:width .25s ease}.positionDivergePositive{background:#27b978}.positionDivergeNegative{background:#b87378}.positionPositive{color:#27b978!important}.positionNegative{color:#b87378!important}.positionMoreRows{font:400 6px/1.1 Tahoma,Arial,sans-serif;color:#626262;text-align:right;padding-top:1px}.positionHoldChart{height:91px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;align-items:end;padding-top:3px}.positionHoldBucket{height:100%;display:grid;grid-template-rows:minmax(0,1fr) 11px 11px;gap:2px;text-align:center;align-items:end}.positionHoldBucket>div{height:100%;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #343434}.positionHoldBucket>div>i{display:block;width:min(18px,62%);min-height:2px;border-radius:3px 3px 1px 1px;background:linear-gradient(180deg,#6b7797,#4e566d);transition:height .28s ease}.positionHoldBucket>b{font:500 7px/1 Tahoma,Arial,sans-serif;color:#a6a6a6}.positionHoldBucket>span{font:400 6px/1 Tahoma,Arial,sans-serif;color:#676767;white-space:nowrap}.positionInsightEmpty{font:400 7px/1.3 Tahoma,Arial,sans-serif;color:#606060;padding:14px 0}.positionInsightSegment{transition:background .16s ease}.positionInsightSegment:hover{background:rgba(255,255,255,.008)}@media(max-width:1120px){.positionInsightBand{grid-template-columns:1fr 1fr}.positionInsightSegment:nth-child(3){grid-column:1/-1;border-left:0;border-top:1px solid #303030}.positionDivergeRow{grid-template-columns:45px minmax(90px,1fr) 62px}}@media(max-width:760px){.positionInsightBand{grid-template-columns:1fr}.positionInsightSegment+.positionInsightSegment,.positionInsightSegment:nth-child(3){grid-column:auto;border-left:0;border-top:1px solid #303030}.positionInsightHead small{white-space:normal}.positionCapitalLayout{grid-template-columns:72px minmax(0,1fr)}}
`;
}

fs.writeFileSync(shellPath, shell);
fs.writeFileSync(cssPath, css);
console.log("Prepared LabNarrative Positions Intelligence Band V3 with cost-basis exposure, diverging PnL and holding-time analytics.");
