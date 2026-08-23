import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const chartPath = path.join(process.cwd(), "app/trader/DcaTradeChart.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let chart = fs.readFileSync(chartPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// SMARTTRADE LEDGER PARITY V1
// Upgrade SmartTrade from a decorative list into the same execution-ledger model used by DCA trades.
const smartTypeStart = source.indexOf('type SmartTrade = {');
const smartTypeEnd = smartTypeStart >= 0 ? source.indexOf('\n};\ntype DcaBot', smartTypeStart) : -1;
if (smartTypeStart >= 0 && smartTypeEnd > smartTypeStart) {
  const smartType = [
    'type SmartTrade = {',
    '  id: string;',
    '  pair: string;',
    '  side: "Buy" | "Sell";',
    '  orderType: "Market" | "Limit";',
    '  entryPrice: number;',
    '  amount: number; // current remaining cost basis reserved by the open position',
    '  totalInvested?: number; // cumulative quote volume, retained for history',
    '  quantity?: number; // current remaining base quantity',
    '  averagePrice?: number;',
    '  lastPrice?: number;',
    '  takeProfits: TakeProfit[];',
    '  tpHits?: boolean[];',
    '  stopEnabled: boolean;',
    '  stopPct: number;',
    '  trailingTp?: boolean;',
    '  trailingTpDeviation?: number;',
    '  trailingActivated?: boolean;',
    '  trailingPeak?: number;',
    '  status: "Active" | "Closed";',
    '  createdAt: string;',
    '  closedAt?: string;',
    '  exitPrice?: number;',
    '  closeReason?: string;',
    '  realizedPnl?: number;',
    '  fills?: Array<{ kind: "Base" | "Averaging" | "Add Funds"; price: number; amount: number; quantity: number; at: string }>;',
    '};',
  ].join('\n');
  source = source.slice(0, smartTypeStart) + smartType + source.slice(smartTypeEnd + '\n};'.length);
}

if (!source.includes('type SmartEditDraft =')) {
  source = source.replace('type DcaBot = {', [
    'type SmartEditDraft = { takeProfits: TakeProfit[]; stopEnabled: boolean; stopPct: number; trailingTp: boolean; trailingTpDeviation: number };',
    'type SmartAddFundsDraft = { amount: number; percent: number; orderType: "Market" | "Limit"; price: number };',
    'type DcaBot = {',
  ].join('\n'));
}

// Pure helpers: all SmartTrade screens and exit paths use the same math.
if (!source.includes('function smartTradeAveragePrice(')) {
  const navAnchor = 'function navGlyph(section: Section) {';
  const helpers = [
    'function smartTradeAveragePrice(trade: SmartTrade) { return trade.averagePrice && trade.averagePrice > 0 ? trade.averagePrice : trade.entryPrice; }',
    'function smartTradeQuantity(trade: SmartTrade) {',
    '  const average = smartTradeAveragePrice(trade);',
    '  return trade.quantity != null && Number.isFinite(trade.quantity) ? Math.max(0, trade.quantity) : (average > 0 ? Math.max(0, trade.amount / average) : 0);',
    '}',
    'function smartTradeDirection(trade: SmartTrade) { return trade.side === "Buy" ? 1 : -1; }',
    'function smartTradePnlAt(trade: SmartTrade, price: number) { return (price - smartTradeAveragePrice(trade)) * smartTradeQuantity(trade) * smartTradeDirection(trade); }',
    'function smartTradeTpPrices(trade: SmartTrade) {',
    '  const average = smartTradeAveragePrice(trade);',
    '  const direction = smartTradeDirection(trade);',
    '  return trade.takeProfits.map((target) => average * (1 + direction * target.target / 100));',
    '}',
    'function smartTradeStopPrice(trade: SmartTrade) {',
    '  if (!trade.stopEnabled) return null;',
    '  const average = smartTradeAveragePrice(trade);',
    '  return average * (1 - smartTradeDirection(trade) * trade.stopPct / 100);',
    '}',
    'function smartTradeReached(trade: SmartTrade, price: number, level: number) { return trade.side === "Buy" ? price >= level : price <= level; }',
    'function smartTradeStopReached(trade: SmartTrade, price: number, level: number) { return trade.side === "Buy" ? price <= level : price >= level; }',
    'function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number): SmartTrade {',
    '  if (trade.status !== "Active" || !Number.isFinite(currentPrice) || currentPrice <= 0) return trade;',
    '  const average = smartTradeAveragePrice(trade);',
    '  let quantity = smartTradeQuantity(trade);',
    '  let amount = Number.isFinite(trade.amount) ? Math.max(0, trade.amount) : average * quantity;',
    '  let realizedPnl = trade.realizedPnl ?? 0;',
    '  let tpHits = trade.tpHits?.length === trade.takeProfits.length ? [...trade.tpHits] : trade.takeProfits.map(() => false);',
    '  const direction = smartTradeDirection(trade);',
    '  const base: SmartTrade = { ...trade, averagePrice: average, quantity, amount, totalInvested: trade.totalInvested ?? trade.amount, lastPrice: currentPrice, tpHits, realizedPnl };',
    '  const stopLevel = smartTradeStopPrice(base);',
    '  if (stopLevel && smartTradeStopReached(base, currentPrice, stopLevel)) {',
    '    const exitPnl = (currentPrice - average) * quantity * direction;',
    '    return { ...base, status: "Closed", quantity: 0, amount: 0, realizedPnl: realizedPnl + exitPnl, closedAt: new Date().toISOString(), exitPrice: currentPrice, closeReason: "Stop Loss" };',
    '  }',
    '  const tpPrices = smartTradeTpPrices(base);',
    '  if (base.trailingTp && tpPrices.length) {',
    '    const activationIndex = tpHits.findIndex((hit) => !hit);',
    '    const activation = tpPrices[Math.max(0, activationIndex)];',
    '    const reached = activation != null && smartTradeReached(base, currentPrice, activation);',
    '    let trailingActivated = Boolean(base.trailingActivated) || reached;',
    '    let trailingPeak = base.trailingPeak ?? currentPrice;',
    '    if (trailingActivated) {',
    '      trailingPeak = base.side === "Buy" ? Math.max(trailingPeak, currentPrice) : Math.min(trailingPeak, currentPrice);',
    '      const deviation = Math.max(0.01, base.trailingTpDeviation ?? 0.2) / 100;',
    '      const trailingExit = base.side === "Buy" ? currentPrice <= trailingPeak * (1 - deviation) : currentPrice >= trailingPeak * (1 + deviation);',
    '      if (trailingExit) {',
    '        const exitPnl = (currentPrice - average) * quantity * direction;',
    '        return { ...base, trailingActivated, trailingPeak, status: "Closed", quantity: 0, amount: 0, realizedPnl: realizedPnl + exitPnl, closedAt: new Date().toISOString(), exitPrice: currentPrice, closeReason: "Take Profit" };',
    '      }',
    '    }',
    '    return { ...base, trailingActivated, trailingPeak };',
    '  }',
    '  for (let index = 0; index < tpPrices.length; index += 1) {',
    '    if (tpHits[index] || !smartTradeReached(base, currentPrice, tpPrices[index])) continue;',
    '    const remainingShareWeight = base.takeProfits.reduce((sum, target, targetIndex) => sum + (tpHits[targetIndex] ? 0 : Math.max(0, target.share)), 0);',
    '    const targetWeight = Math.max(0, base.takeProfits[index]?.share ?? 0);',
    '    const closeFraction = remainingShareWeight > 0 ? Math.min(1, targetWeight / remainingShareWeight) : 1;',
    '    const closeQty = Math.min(quantity, quantity * closeFraction);',
    '    realizedPnl += (currentPrice - average) * closeQty * direction;',
    '    quantity = Math.max(0, quantity - closeQty);',
    '    amount = Math.max(0, amount - average * closeQty);',
    '    tpHits[index] = true;',
    '  }',
    '  const allTargetsDone = tpHits.length > 0 && tpHits.every(Boolean);',
    '  if (allTargetsDone || quantity <= 1e-12) {',
    '    return { ...base, tpHits, quantity: 0, amount: 0, realizedPnl, status: "Closed", closedAt: new Date().toISOString(), exitPrice: currentPrice, closeReason: "Take Profit" };',
    '  }',
    '  return { ...base, tpHits, quantity, amount, realizedPnl };',
    '}',
    '',
  ].join('\n');
  source = source.replace(navAnchor, helpers + navAnchor);
}

if (!source.includes('const [selectedSmartTradeChartId,')) {
  source = source.replace(
    '  const [showFilters, setShowFilters] = useState(false);',
    [
      '  const [showFilters, setShowFilters] = useState(false);',
      '  const [selectedSmartTradeChartId, setSelectedSmartTradeChartId] = useState<string | null>(null);',
      '  const [editingSmartTradeId, setEditingSmartTradeId] = useState<string | null>(null);',
      '  const [smartEditDraft, setSmartEditDraft] = useState<SmartEditDraft | null>(null);',
      '  const [smartAddFundsTradeId, setSmartAddFundsTradeId] = useState<string | null>(null);',
      '  const [smartAddFundsDraft, setSmartAddFundsDraft] = useState<SmartAddFundsDraft>({ amount: 0, percent: 10, orderType: "Market", price: 0 });',
    ].join('\n')
  );
}

source = source.replace(
  '      if (savedSmart) setSmartTrades(JSON.parse(savedSmart));',
  [
    '      if (savedSmart) {',
    '        const parsedSmart = JSON.parse(savedSmart) as SmartTrade[];',
    '        setSmartTrades(parsedSmart.map((trade) => {',
    '          const averagePrice = smartTradeAveragePrice(trade);',
    '          const quantity = smartTradeQuantity(trade);',
    '          return {',
    '            ...trade,',
    '            averagePrice,',
    '            quantity,',
    '            totalInvested: trade.totalInvested ?? trade.amount,',
    '            lastPrice: trade.lastPrice ?? trade.exitPrice ?? trade.entryPrice,',
    '            tpHits: trade.tpHits?.length === trade.takeProfits.length ? trade.tpHits : trade.takeProfits.map(() => false),',
    '            realizedPnl: trade.realizedPnl ?? 0,',
    '            fills: trade.fills?.length ? trade.fills : [{ kind: "Base" as const, price: trade.entryPrice, amount: trade.amount, quantity, at: trade.createdAt }],',
    '          };',
    '        }));',
    '      }',
  ].join('\n')
);

const createStart = source.indexOf('  const createSmartTrade = (forcedSide?: "Buy" | "Sell") => {');
const createEnd = createStart >= 0 ? source.indexOf('  const createConfiguredDcaBot =', createStart) : -1;
const fallbackCreateEnd = createStart >= 0 ? source.indexOf('  const createDcaBot =', createStart) : -1;
const actualCreateEnd = createEnd > createStart ? createEnd : fallbackCreateEnd;
if (createStart >= 0 && actualCreateEnd > createStart) {
  let block = source.slice(createStart, actualCreateEnd);
  const tradeStart = block.indexOf('    const trade: SmartTrade = {');
  const tradeEnd = tradeStart >= 0 ? block.indexOf('    };', tradeStart) : -1;
  if (tradeStart >= 0 && tradeEnd > tradeStart) {
    const replacement = [
      '    const smartCreatedAt = new Date().toISOString();',
      '    const trade: SmartTrade = {',
      '      id: `st-${Date.now()}`,',
      '      pair: `${selectedSymbol}/USDT`, side, orderType: smartOrderType, entryPrice: entry, amount: total, totalInvested: total,',
      '      quantity: smartUnits, averagePrice: entry, lastPrice: entry,',
      '      takeProfits: tpEnabled ? smartTps : [], tpHits: (tpEnabled ? smartTps : []).map(() => false),',
      '      stopEnabled: smartStopEnabled, stopPct: smartStopPct, trailingTp, trailingTpDeviation,',
      '      status: "Active", createdAt: smartCreatedAt, realizedPnl: 0,',
      '      fills: [{ kind: "Base", price: entry, amount: total, quantity: smartUnits, at: smartCreatedAt }],',
      '    };',
    ].join('\n');
    block = block.slice(0, tradeStart) + replacement + block.slice(tradeEnd + '    };'.length);
    source = source.slice(0, createStart) + block + source.slice(actualCreateEnd);
  }
}

source = source.replace(
  '  const activeSmart = smartTrades.filter((trade) => trade.status === "Active");\n  const closedSmart = smartTrades.filter((trade) => trade.status === "Closed");',
  [
    '  const activeSmart = smartTrades.filter((trade) => trade.status === "Active");',
    '  const closedSmart = smartTrades.filter((trade) => trade.status === "Closed").sort((a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime());',
    '  const smartRealized = smartTrades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);',
  ].join('\n')
);

const smartPnlStart = source.indexOf('  const smartUnrealized = activeSmart.reduce');
const accountStart = smartPnlStart >= 0 ? source.indexOf('  const accountValue =', smartPnlStart) : -1;
if (smartPnlStart >= 0 && accountStart > smartPnlStart) {
  const smartPnl = [
    '  const smartUnrealized = activeSmart.reduce((sum, trade) => {',
    '    const symbol = trade.pair.split("/")[0];',
    '    const current = markets.find((market) => market.symbol === symbol)?.price ?? trade.lastPrice ?? smartTradeAveragePrice(trade);',
    '    if (!current) return sum;',
    '    return sum + smartTradePnlAt(trade, current);',
    '  }, 0);',
  ].join('\n') + '\n';
  source = source.slice(0, smartPnlStart) + smartPnl + source.slice(accountStart);
}
source = source.replace('  const paperRealizedPnl = dcaRealized;', '  const paperRealizedPnl = dcaRealized + smartRealized;');

source = source.replace(
  [
    '    const currentPrice = markets.find((market) => market.symbol === symbol)?.price ?? trade.entryPrice;',
    '    if (!currentPrice || !trade.entryPrice) return;',
    '    const direction = trade.side === "Buy" ? 1 : -1;',
    '    const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.amount * direction;',
    '    const markedValue = Math.max(0, trade.amount + pnl);',
    '    const quantity = currentPrice > 0 ? markedValue / currentPrice : 0;',
    '    addPortfolioHolding(symbol, markedValue, quantity);',
  ].join('\n'),
  [
    '    const currentPrice = markets.find((market) => market.symbol === symbol)?.price ?? trade.lastPrice ?? smartTradeAveragePrice(trade);',
    '    if (!currentPrice) return;',
    '    const quantity = smartTradeQuantity(trade);',
    '    const markedValue = Math.max(0, trade.amount + smartTradePnlAt(trade, currentPrice));',
    '    if (trade.side === "Buy") addPortfolioHolding(symbol, markedValue, quantity);',
  ].join('\n')
);

const ordersStart = source.indexOf('  const OrdersTable = ({ compact = false }');
const ordersEnd = ordersStart >= 0 ? source.indexOf('  const ModeTabs =', ordersStart) : -1;
if (ordersStart >= 0 && ordersEnd > ordersStart) {
  const orders = [
    '  const SmartTradePriceBar = ({ trade, current }: { trade: SmartTrade; current: number }) => {',
    '    const average = smartTradeAveragePrice(trade);',
    '    const direction = smartTradeDirection(trade);',
    '    const pnlPct = average > 0 ? ((current - average) / average) * 100 * direction : 0;',
    '    const tpPrices = smartTradeTpPrices(trade);',
    '    const stopPrice = smartTradeStopPrice(trade);',
    '    const addFills = (trade.fills ?? []).filter((fill) => fill.kind !== "Base");',
    '    const levels = [current, average, ...tpPrices, ...(stopPrice ? [stopPrice] : []), ...addFills.map((fill) => fill.price)].filter((value) => Number.isFinite(value) && value > 0);',
    '    let min = Math.min(...levels);',
    '    let max = Math.max(...levels);',
    '    if (!(max > min)) { const pad = Math.max(Math.abs(current) * 0.01, 0.00000001); min = current - pad; max = current + pad; }',
    '    const markerPct = (value: number) => Math.min(100, Math.max(0, ((value - min) / Math.max(max - min, 0.00000001)) * 100));',
    '    const currentPos = markerPct(current);',
    '    const averagePos = markerPct(average);',
    '    const segmentLeft = Math.min(currentPos, averagePos);',
    '    const segmentWidth = Math.abs(currentPos - averagePos);',
    '    const winning = pnlPct >= 0;',
    '    return <div className={styles.smartLedgerSnapshot}>',
    '      <div className={styles.dealPriceBar + " " + styles.dealPriceBar3c + " " + styles.smartLedgerPriceBar}>',
    '        <div className={styles.dealPriceTrack + " " + styles.dealPriceTrackNeutral}><i className={winning ? styles.dealPnlSegment + " " + styles.dealPnlSegmentWin : styles.dealPnlSegment + " " + styles.dealPnlSegmentLoss} style={{ left: `${segmentLeft}%`, width: `${segmentWidth}%` }}/></div>',
    '        <span className={styles.smartCurrentMarker + " " + (winning ? styles.dealCurrentWin : styles.dealCurrentLoss)} style={{ left: `${currentPos}%` }}><b>{pct(pnlPct)}</b><em>{money(current)}</em></span>',
    '        <span className={styles.dealBarMarker + " " + styles.dealBuyMarker} style={{ left: `${averagePos}%` }}><b>{trade.side === "Buy" ? "Buy" : "Sell"}</b>{money(average)}</span>',
    '        {tpPrices.map((price, index) => <span key={`tp-${index}`} className={styles.dealBarMarker + " " + styles.dealTpMarker} style={{ left: `${markerPct(price)}%` }}><b>TP{tpPrices.length > 1 ? index + 1 : ""}</b>{money(price)}</span>)}',
    '        {stopPrice ? <span className={styles.dealBarMarker + " " + styles.dealSlMarker} style={{ left: `${markerPct(stopPrice)}%` }}><b>SL</b>{money(stopPrice)}</span> : null}',
    '        {addFills.slice(-3).map((fill, index) => <span key={`${fill.at}-${index}`} className={styles.dealBarMarker + " " + styles.dealDcaMarker} style={{ left: `${markerPct(fill.price)}%` }}><b>{fill.kind === "Averaging" ? "DCA" : "ADD"}</b>{money(fill.price)}</span>)}',
    '      </div>',
    '    </div>;',
    '  };',
    '',
    '  const OrdersTable = ({ compact = false }: { compact?: boolean }) => (',
    '    <section className={`${styles.ordersArea} ${compact ? styles.ordersAreaCompact : ""}`}>',
    '      <button className={styles.openOrdersBar}><strong>You have {activeSmart.length} open {activeSmart.length === 1 ? "order" : "orders"}</strong><span>⌄</span></button>',
    '      <div className={styles.ordersTabs}><button className={smartTab === "Active" ? styles.ordersTabActive : ""} onClick={() => setSmartTab("Active")}>Active</button><button className={smartTab === "History" ? styles.ordersTabActive : ""} onClick={() => setSmartTab("History")}>History</button><button>Presets <span className={styles.helpDot}>?</span></button></div>',
    '      <div className={styles.filterHeader}><strong>Filters</strong><div><button onClick={() => { setSmartSearch(""); setSmartPairFilter("All"); }}>⚑ Clear filters</button><button onClick={() => setShowFilters((value) => !value)}>{showFilters ? "⌃" : "⌄"}</button></div></div>',
    '      {showFilters && <div className={styles.filtersGrid}>',
    '        <label><span>Pair</span><select value={smartPairFilter} onChange={(event) => setSmartPairFilter(event.target.value)}><option>All</option>{markets.map((market) => <option key={market.symbol}>{market.symbol}/USDT</option>)}</select></label>',
    '        <label><span>Search</span><input value={smartSearch} onChange={(event) => setSmartSearch(event.target.value)} placeholder="Pair or trade ID"/></label>',
    '        <label><span>Account</span><div className={styles.fakeSelect}>Paper Account 1001863 <i>⌄</i></div></label>',
    '      </div>}',
    '      <div className={styles.smartTableWrap}><table className={styles.smartLedgerTable}><thead><tr><th>Pair ↕</th><th>{smartTab === "History" ? "Closed on ↓" : "Created ↓"}</th><th>uPnL ↕</th><th>Volume ↕</th><th>Status ↕</th><th>Source</th><th>Actions</th></tr></thead><tbody>',
    '        {smartRows.length ? smartRows.map((trade) => {',
    '          const symbol = trade.pair.split("/")[0];',
    '          const current = markets.find((market) => market.symbol === symbol)?.price ?? trade.lastPrice ?? smartTradeAveragePrice(trade);',
    '          const livePnl = trade.status === "Active" ? smartTradePnlAt(trade, current) : (trade.realizedPnl ?? 0);',
    '          const totalVolume = trade.totalInvested ?? trade.amount;',
    '          const totalQty = (trade.fills ?? []).reduce((sum, fill) => sum + (fill.kind === "Base" || fill.kind === "Add Funds" || fill.kind === "Averaging" ? fill.quantity : 0), 0) || smartTradeQuantity(trade);',
    '          return <tr key={trade.id} className={trade.status === "Closed" ? styles.smartLedgerClosedRow : ""}>',
    '            <td><div className={styles.pairCell}><span className={styles.coinMini}>{symbol.slice(0,1)}</span><div><button type="button" className={styles.dcaTradePairLink} onClick={() => setSelectedSmartTradeChartId(trade.id)}>{trade.pair}</button><small>◆ Paper Account 1001863</small><em>▧ Note for SmartTrade</em></div></div></td>',
    '            <td>{new Date((smartTab === "History" ? trade.closedAt : trade.createdAt) ?? trade.createdAt).toLocaleDateString()}<small>{new Date((smartTab === "History" ? trade.closedAt : trade.createdAt) ?? trade.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><small>ID: {trade.id.replace("st-", "")}</small></td>',
    '            <td className={styles.smartLedgerBarCell}>{trade.status === "Active" ? <SmartTradePriceBar trade={trade} current={current}/> : <div className={styles.smartCompletedSummary}><strong className={(trade.realizedPnl ?? 0) >= 0 ? styles.greenText : styles.redText}>{compactMoney(trade.realizedPnl ?? 0)}</strong><small>{trade.closeReason ?? "Completed"}</small><small>Exit {money(trade.exitPrice ?? current)}</small></div>}</td>',
    '            <td><span>{compactMoney(trade.status === "Active" ? trade.amount : totalVolume)}</span><small>{(trade.status === "Active" ? smartTradeQuantity(trade) : totalQty).toFixed(8)} {symbol}</small>{trade.status === "Active" && <small className={livePnl >= 0 ? styles.dealVolumePnlWin : styles.dealVolumePnlLoss}>{compactMoney(livePnl)}</small>}</td>',
    '            <td><strong className={trade.status === "Active" ? styles.blueText : styles.greenText}>{trade.status === "Active" ? "Active" : "Completed"}</strong>{trade.status === "Closed" && <small>{trade.closeReason ?? "Closed"}</small>}</td>',
    '            <td>SmartTrade</td>',
    '            <td>{trade.status === "Active" ? <div className={styles.smartLedgerActions}><button type="button" onClick={() => closeSmartTradeAtMarket(trade.id)}>◉ Close at market price</button><button type="button" onClick={() => openSmartTradeEdit(trade)}>✎ Edit</button><button type="button" onClick={() => openSmartAddFunds(trade)}>＋$ Add funds</button><button type="button" onClick={() => { void refreshSmartTradeNow(trade.id); }}>↻ Refresh</button></div> : <button type="button" className={styles.smartHistoryChartButton} onClick={() => setSelectedSmartTradeChartId(trade.id)}>TV Chart</button>}</td>',
    '          </tr>;',
    '        }) : <tr className={styles.emptyRow}><td colSpan={7}>No {smartTab.toLowerCase()} SmartTrades yet.</td></tr>}',
    '      </tbody></table></div>',
    '    </section>',
    '  );',
    '',
  ].join('\n');
  source = source.slice(0, ordersStart) + orders + source.slice(ordersEnd);
}

const outerReturnToken = '  return <main className={styles.appShell}>';
const outerReturnIndex = source.lastIndexOf(outerReturnToken);
if (outerReturnIndex < 0) throw new Error('Could not locate TradingAgent outer return for SmartTrade parity.');
if (!source.includes('const refreshSmartTradeNow =')) {
  const helpers = [
    '  const refreshSmartTradeNow = async (tradeId: string) => {',
    '    const trade = smartTrades.find((item) => item.id === tradeId);',
    '    if (!trade) return;',
    '    setNotice(`Refreshing ${trade.pair} from Binance...`);',
    '    try {',
    '      const response = await fetch("/api/trader/markets?refresh=" + Date.now(), { cache: "no-store" });',
    '      const data = await response.json() as MarketResponse;',
    '      if (!response.ok || !data.live || !Array.isArray(data.markets)) throw new Error(data.error || "Market refresh failed");',
    '      setMarkets(data.markets);',
    '      setMarketDataLive(true);',
    '      setLastMarketUpdate(data.generatedAt || new Date().toISOString());',
    '      const symbol = trade.pair.split("/")[0];',
    '      const price = data.markets.find((market) => market.symbol === symbol)?.price;',
    '      if (price && price > 0) setSmartTrades((items) => items.map((item) => item.id === tradeId ? markSmartTradeAtPrice(item, price) : item));',
    '      setNotice(`${trade.pair} refreshed from live Binance data.`);',
    '    } catch { setMarketDataLive(false); setNotice("Could not refresh SmartTrade market data."); }',
    '  };',
    '  const closeSmartTradeAtMarket = (tradeId: string) => {',
    '    setSmartTrades((items) => items.map((trade) => {',
    '      if (trade.id !== tradeId || trade.status !== "Active") return trade;',
    '      const symbol = trade.pair.split("/")[0];',
    '      const current = markets.find((market) => market.symbol === symbol)?.price ?? trade.lastPrice ?? smartTradeAveragePrice(trade);',
    '      const realizedPnl = (trade.realizedPnl ?? 0) + smartTradePnlAt(trade, current);',
    '      return { ...trade, status: "Closed", quantity: 0, amount: 0, lastPrice: current, realizedPnl, closedAt: new Date().toISOString(), exitPrice: current, closeReason: "Manual close" };',
    '    }));',
    '    setNotice("SmartTrade closed at live market price.");',
    '  };',
    '  const openSmartTradeEdit = (trade: SmartTrade) => {',
    '    setEditingSmartTradeId(trade.id);',
    '    setSmartEditDraft({ takeProfits: trade.takeProfits.map((target) => ({ ...target })), stopEnabled: trade.stopEnabled, stopPct: trade.stopPct, trailingTp: Boolean(trade.trailingTp), trailingTpDeviation: trade.trailingTpDeviation ?? 0.2 });',
    '  };',
    '  const saveSmartTradeEdit = () => {',
    '    if (!editingSmartTradeId || !smartEditDraft) return;',
    '    setSmartTrades((items) => items.map((trade) => trade.id === editingSmartTradeId ? { ...trade, takeProfits: smartEditDraft.takeProfits, tpHits: smartEditDraft.takeProfits.map((_, index) => trade.tpHits?.[index] ?? false), stopEnabled: smartEditDraft.stopEnabled, stopPct: smartEditDraft.stopPct, trailingTp: smartEditDraft.trailingTp, trailingTpDeviation: smartEditDraft.trailingTpDeviation } : trade));',
    '    setEditingSmartTradeId(null); setSmartEditDraft(null); setNotice("SmartTrade settings updated.");',
    '  };',
    '  const openSmartAddFunds = (trade: SmartTrade) => {',
    '    const symbol = trade.pair.split("/")[0];',
    '    const price = markets.find((market) => market.symbol === symbol)?.price ?? trade.lastPrice ?? smartTradeAveragePrice(trade);',
    '    const amount = Math.max(0, Math.min(freeCapital, freeCapital * 0.1));',
    '    setSmartAddFundsTradeId(trade.id);',
    '    setSmartAddFundsDraft({ amount, percent: 10, orderType: "Market", price });',
    '  };',
    '  const saveSmartAddFunds = () => {',
    '    if (!smartAddFundsTradeId) return;',
    '    const draft = smartAddFundsDraft;',
    '    const amount = Math.max(0, Math.min(freeCapital, draft.amount));',
    '    if (amount <= 0) { setNotice("Enter a valid Add Funds amount."); return; }',
    '    setSmartTrades((items) => items.map((trade) => {',
    '      if (trade.id !== smartAddFundsTradeId || trade.status !== "Active") return trade;',
    '      const symbol = trade.pair.split("/")[0];',
    '      const marketPrice = markets.find((market) => market.symbol === symbol)?.price ?? trade.lastPrice ?? smartTradeAveragePrice(trade);',
    '      const executionPrice = draft.orderType === "Limit" && draft.price > 0 ? draft.price : marketPrice;',
    '      if (!(executionPrice > 0)) return trade;',
    '      const oldQty = smartTradeQuantity(trade);',
    '      const oldAvg = smartTradeAveragePrice(trade);',
    '      const extraQty = amount / executionPrice;',
    '      const newQty = oldQty + extraQty;',
    '      const newCost = oldAvg * oldQty + amount;',
    '      const fillAt = new Date().toISOString();',
    '      return { ...trade, quantity: newQty, amount: newCost, totalInvested: (trade.totalInvested ?? trade.amount) + amount, averagePrice: newCost / newQty, lastPrice: marketPrice, fills: [...(trade.fills ?? [{ kind: "Base" as const, price: trade.entryPrice, amount: trade.amount, quantity: oldQty, at: trade.createdAt }]), { kind: "Add Funds" as const, price: executionPrice, amount, quantity: extraQty, at: fillAt }] };',
    '    }));',
    '    setSmartAddFundsTradeId(null); setNotice("Funds added to SmartTrade position.");',
    '  };',
    '',
    '  useEffect(() => {',
    '    if (!markets.length || !smartTrades.some((trade) => trade.status === "Active")) return;',
    '    let changed = false;',
    '    const next = smartTrades.map((trade) => {',
    '      if (trade.status !== "Active") return trade;',
    '      const symbol = trade.pair.split("/")[0];',
    '      const price = markets.find((market) => market.symbol === symbol)?.price;',
    '      if (!price || price <= 0) return trade;',
    '      const marked = markSmartTradeAtPrice(trade, price);',
    '      if (marked !== trade && (marked.lastPrice !== trade.lastPrice || marked.status !== trade.status || marked.amount !== trade.amount || marked.realizedPnl !== trade.realizedPnl)) changed = true;',
    '      return marked;',
    '    });',
    '    if (changed) setSmartTrades(next);',
    '  }, [markets]);',
    '',
    '  const selectedSmartChartTrade = selectedSmartTradeChartId ? smartTrades.find((trade) => trade.id === selectedSmartTradeChartId) ?? null : null;',
    '  const selectedSmartChartCurrent = selectedSmartChartTrade ? (markets.find((market) => market.symbol === selectedSmartChartTrade.pair.split("/")[0])?.price ?? selectedSmartChartTrade.lastPrice ?? smartTradeAveragePrice(selectedSmartChartTrade)) : null;',
    '  const selectedSmartChartTpPrices = selectedSmartChartTrade ? smartTradeTpPrices(selectedSmartChartTrade) : [];',
    '  const selectedSmartChartSlPrice = selectedSmartChartTrade ? smartTradeStopPrice(selectedSmartChartTrade) : null;',
    '  const editingSmartTrade = editingSmartTradeId ? smartTrades.find((trade) => trade.id === editingSmartTradeId) ?? null : null;',
    '  const smartAddFundsTrade = smartAddFundsTradeId ? smartTrades.find((trade) => trade.id === smartAddFundsTradeId) ?? null : null;',
    '',
  ].join('\n');
  source = source.slice(0, outerReturnIndex) + helpers + source.slice(outerReturnIndex);
}

if (!chart.includes('takeProfitPrices?: number[];')) {
  chart = chart.replace('  takeProfitPrice?: number | null;', '  takeProfitPrice?: number | null;\n  takeProfitPrices?: number[];\n  tradeType?: string;');
  chart = chart.replace('  takeProfitPrice,\n  stopLossPrice,', '  takeProfitPrice,\n  takeProfitPrices,\n  tradeType = "DCA",\n  stopLossPrice,');
  chart = chart.replace('aria-label={`${pair} DCA trade chart`}', 'aria-label={`${pair} ${tradeType} trade chart`}');
  chart = chart.replace('<p>{pair} · BINANCE · {status} DCA trade</p>', '<p>{pair} · BINANCE · {status} {tradeType} trade</p>');
  const singularTp = [
    '    if (takeProfitPrice && takeProfitPrice > 0) candleSeries.createPriceLine({',
    '      price: takeProfitPrice,',
    '      color: "#19c8a8",',
    '      lineWidth: 1,',
    '      lineStyle: LineStyle.Dashed,',
    '      axisLabelVisible: true,',
    '      title: "Take Profit",',
    '    });',
  ].join('\n');
  const multiTp = [
    '    const allTpPrices = takeProfitPrices?.length ? takeProfitPrices.filter((price) => Number.isFinite(price) && price > 0) : (takeProfitPrice && takeProfitPrice > 0 ? [takeProfitPrice] : []);',
    '    allTpPrices.forEach((price, index) => candleSeries.createPriceLine({',
    '      price,',
    '      color: "#19c8a8",',
    '      lineWidth: 1,',
    '      lineStyle: LineStyle.Dashed,',
    '      axisLabelVisible: true,',
    '      title: allTpPrices.length > 1 ? `TP ${index + 1}` : "Take Profit",',
    '    }));',
  ].join('\n');
  chart = chart.replace(singularTp, multiTp);
}

if (!source.includes('tradeType="SmartTrade"')) {
  const closeMain = source.lastIndexOf('    </main>');
  if (closeMain < 0) throw new Error('Could not locate main close for SmartTrade modals.');
  const modals = [
    '      {selectedSmartChartTrade && <DcaTradeChart',
    '        pair={selectedSmartChartTrade.pair}',
    '        status={selectedSmartChartTrade.status}',
    '        entryPrice={selectedSmartChartTrade.entryPrice}',
    '        averagePrice={smartTradeAveragePrice(selectedSmartChartTrade)}',
    '        createdAt={selectedSmartChartTrade.createdAt}',
    '        closedAt={selectedSmartChartTrade.closedAt}',
    '        exitPrice={selectedSmartChartTrade.exitPrice}',
    '        closeReason={selectedSmartChartTrade.closeReason}',
    '        lastPrice={selectedSmartChartCurrent ?? undefined}',
    '        fills={selectedSmartChartTrade.fills}',
    '        takeProfitPrice={selectedSmartChartTpPrices[0] ?? null}',
    '        takeProfitPrices={selectedSmartChartTpPrices}',
    '        stopLossPrice={selectedSmartChartSlPrice}',
    '        nextAveragingPrice={null}',
    '        tradeType="SmartTrade"',
    '        onClose={() => setSelectedSmartTradeChartId(null)}',
    '      />}',
    '      {editingSmartTrade && smartEditDraft && <div className={styles.tradeEditorOverlay} role="dialog" aria-modal="true">',
    '        <div className={styles.smartTradeEditorModal}>',
    '          <div className={styles.smartTradeModalHead}><div><h2>Edit SmartTrade</h2><p>{editingSmartTrade.pair} · active paper trade</p></div><button type="button" onClick={() => { setEditingSmartTradeId(null); setSmartEditDraft(null); }}>×</button></div>',
    '          <section><div className={styles.smartTradeModalSectionHead}><strong>Take profit</strong><button type="button" onClick={() => setSmartEditDraft((draft) => draft ? { ...draft, takeProfits: [...draft.takeProfits, { target: 10, share: 0 }] } : draft)}>＋ Add target</button></div>',
    '            {smartEditDraft.takeProfits.map((target, index) => <div className={styles.smartTradeTargetRow} key={index}><label><span>TP {index + 1}, %</span><NumericInput min={0} value={target.target} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, takeProfits: draft.takeProfits.map((item, itemIndex) => itemIndex === index ? { ...item, target: value } : item) } : draft)}/></label><label><span>Position, %</span><NumericInput min={0} max={100} value={target.share} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, takeProfits: draft.takeProfits.map((item, itemIndex) => itemIndex === index ? { ...item, share: value } : item) } : draft)}/></label>{smartEditDraft.takeProfits.length > 1 && <button type="button" onClick={() => setSmartEditDraft((draft) => draft ? { ...draft, takeProfits: draft.takeProfits.filter((_, itemIndex) => itemIndex !== index) } : draft)}>×</button>}</div>)}',
    '            <div className={styles.smartTradeToggleRow}><span>Trailing Take Profit</span><Toggle checked={smartEditDraft.trailingTp} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value } : draft)}/></div>',
    '            {smartEditDraft.trailingTp && <label><span>Trailing deviation, %</span><NumericInput min={0.01} value={smartEditDraft.trailingTpDeviation} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTpDeviation: value } : draft)}/></label>}',
    '          </section>',
    '          <section><div className={styles.smartTradeToggleRow}><strong>Stop Loss</strong><Toggle checked={smartEditDraft.stopEnabled} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopEnabled: value } : draft)}/></div>{smartEditDraft.stopEnabled && <label><span>Stop loss, %</span><NumericInput min={0} value={smartEditDraft.stopPct} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopPct: value } : draft)}/></label>}</section>',
    '          <div className={styles.smartTradeModalFooter}><button type="button" onClick={() => { setEditingSmartTradeId(null); setSmartEditDraft(null); }}>Cancel</button><button type="button" className={styles.primaryButton} onClick={saveSmartTradeEdit}>Save changes</button></div>',
    '        </div>',
    '      </div>}',
    '      {smartAddFundsTrade && <div className={styles.tradeEditorOverlay} role="dialog" aria-modal="true">',
    '        <div className={styles.smartTradeEditorModal}>',
    '          <div className={styles.smartTradeModalHead}><div><h2>Add funds</h2><p>{smartAddFundsTrade.pair} · Available {compactMoney(freeCapital)}</p></div><button type="button" onClick={() => setSmartAddFundsTradeId(null)}>×</button></div>',
    '          <section><label><span>Volume</span><NumericInput min={0} max={freeCapital} value={smartAddFundsDraft.amount} onValueChange={(value) => { const amount = Math.min(freeCapital, Math.max(0, value)); setSmartAddFundsDraft((draft) => ({ ...draft, amount, percent: freeCapital > 0 ? amount / freeCapital * 100 : 0 })); }}/></label><label><span>Available balance, %</span><NumericInput min={0} max={100} value={smartAddFundsDraft.percent} onValueChange={(value) => { const percent = Math.min(100, Math.max(0, value)); setSmartAddFundsDraft((draft) => ({ ...draft, percent, amount: freeCapital * percent / 100 })); }}/></label><input className={styles.smartFundsRange} type="range" min="0" max="100" step="1" value={smartAddFundsDraft.percent} onChange={(event) => { const percent = Number(event.target.value); setSmartAddFundsDraft((draft) => ({ ...draft, percent, amount: freeCapital * percent / 100 })); }}/>',
    '            <div className={styles.smartTradeOrderTabs}><button type="button" className={smartAddFundsDraft.orderType === "Market" ? styles.smartTradeOrderActive : ""} onClick={() => setSmartAddFundsDraft((draft) => ({ ...draft, orderType: "Market" }))}>Market</button><button type="button" className={smartAddFundsDraft.orderType === "Limit" ? styles.smartTradeOrderActive : ""} onClick={() => setSmartAddFundsDraft((draft) => ({ ...draft, orderType: "Limit" }))}>Limit</button></div>',
    '            <label><span>Price</span><NumericInput min={0} disabled={smartAddFundsDraft.orderType === "Market"} value={smartAddFundsDraft.orderType === "Market" ? (markets.find((market) => market.symbol === smartAddFundsTrade.pair.split("/")[0])?.price ?? smartTradeAveragePrice(smartAddFundsTrade)) : smartAddFundsDraft.price} onValueChange={(value) => setSmartAddFundsDraft((draft) => ({ ...draft, price: value }))}/></label>',
    '            <div className={styles.smartFundsSummary}><div><span>Total quote currency</span><strong>{compactMoney(smartAddFundsDraft.amount)}</strong></div><div><span>Estimated base currency</span><strong>{(smartAddFundsDraft.amount / Math.max(0.00000001, smartAddFundsDraft.orderType === "Market" ? (markets.find((market) => market.symbol === smartAddFundsTrade.pair.split("/")[0])?.price ?? smartTradeAveragePrice(smartAddFundsTrade)) : smartAddFundsDraft.price)).toFixed(8)} {smartAddFundsTrade.pair.split("/")[0]}</strong></div></div>',
    '          </section>',
    '          <div className={styles.smartTradeModalFooter}><button type="button" onClick={() => setSmartAddFundsTradeId(null)}>Discard</button><button type="button" className={styles.primaryButton} onClick={saveSmartAddFunds}>Save</button></div>',
    '        </div>',
    '      </div>}',
    '',
  ].join('\n');
  source = source.slice(0, closeMain) + modals + source.slice(closeMain);
}

if (!css.includes('/* SmartTrade DCA-parity ledger */')) {
  css += `\n/* SmartTrade DCA-parity ledger */\n.smartLedgerTable{table-layout:auto}.smartLedgerTable th:nth-child(3),.smartLedgerTable td:nth-child(3){min-width:440px}.smartLedgerBarCell{padding-top:18px!important;padding-bottom:22px!important}.smartLedgerSnapshot{min-width:420px;padding:18px 0 24px}.smartLedgerPriceBar{height:38px!important}.smartCurrentMarker{position:absolute;z-index:8;top:-14px;display:flex;gap:5px;align-items:center;white-space:nowrap;font-size:10px;transform:translateX(-50%)}.smartCurrentMarker b{font-size:11px}.smartCurrentMarker em{font-style:normal;color:#aebac3}.smartCurrentMarker:after{content:"";position:absolute;left:50%;top:15px;height:17px;width:1px;background:currentColor}.smartLedgerActions{display:flex;align-items:center;gap:0;white-space:nowrap}.smartLedgerActions button,.smartHistoryChartButton{border:1px solid #36505e;background:#1a2b35;color:#afc1cb;padding:8px 10px;cursor:pointer}.smartLedgerActions button:hover,.smartHistoryChartButton:hover{background:#223844;color:#e5eff4}.smartLedgerActions button:nth-child(3){color:#54b4ff}.smartLedgerActions button:last-child{color:#1cc8b0}.smartCompletedSummary{display:flex;flex-direction:column;gap:4px;min-height:52px;justify-content:center}.smartLedgerClosedRow{opacity:.96}.smartTradeEditorModal{width:min(620px,calc(100vw - 32px));max-height:90vh;overflow:auto;background:#17242d;border:1px solid #304653;border-radius:10px;box-shadow:0 30px 90px rgba(0,0,0,.55);padding:0}.smartTradeModalHead{display:flex;justify-content:space-between;align-items:flex-start;padding:20px;border-bottom:1px solid #2a3d48}.smartTradeModalHead h2{margin:0;color:#e5edf1;font-size:24px}.smartTradeModalHead p{margin:4px 0 0;color:#8da3b1;font-size:12px}.smartTradeModalHead>button{border:0;background:transparent;color:#aabac4;font-size:28px;cursor:pointer}.smartTradeEditorModal section{margin:14px 18px;padding:16px;background:#12202a;border:1px solid #2a3f4b;border-radius:7px;display:flex;flex-direction:column;gap:12px}.smartTradeEditorModal label{display:flex;flex-direction:column;gap:6px;color:#9eb0bc;font-size:12px}.smartTradeEditorModal input{height:38px;border:1px solid #34505f;background:#10202a;color:#e2ebef;border-radius:5px;padding:0 10px}.smartTradeModalSectionHead,.smartTradeToggleRow{display:flex;align-items:center;justify-content:space-between;gap:12px}.smartTradeModalSectionHead button{border:0;background:transparent;color:#4eaef5;cursor:pointer}.smartTradeTargetRow{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.smartTradeTargetRow>button{height:38px;border:1px solid #4a3340;background:#35222a;color:#ff7890;border-radius:5px;cursor:pointer}.smartTradeModalFooter{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 18px 20px}.smartTradeModalFooter>button{height:44px;border:1px solid #354b58;background:#223440;color:#d4dfe5;border-radius:6px;cursor:pointer}.smartTradeModalFooter>.primaryButton{background:#18b7aa;color:#fff;border-color:#18b7aa}.smartFundsRange{height:auto!important;padding:0!important;accent-color:#18b7aa}.smartTradeOrderTabs{display:grid;grid-template-columns:1fr 1fr;border:1px solid #344b59;border-radius:6px;overflow:hidden}.smartTradeOrderTabs button{height:38px;border:0;background:#233743;color:#aab9c2;cursor:pointer}.smartTradeOrderTabs .smartTradeOrderActive{background:#152630;color:#fff}.smartFundsSummary{display:flex;flex-direction:column;gap:8px;border-top:1px solid #2b3e49;padding-top:12px}.smartFundsSummary>div{display:flex;justify-content:space-between;gap:12px;color:#8fa4b1}.smartFundsSummary strong{color:#dce7ec}@media(max-width:1000px){.smartLedgerTable th:nth-child(3),.smartLedgerTable td:nth-child(3){min-width:340px}.smartLedgerSnapshot{min-width:330px}.smartLedgerActions{flex-wrap:wrap}}\n`;
}

if (!source.includes('selectedSmartTradeChartId')) throw new Error('SmartTrade parity state was not installed.');
if (!source.includes('markSmartTradeAtPrice')) throw new Error('SmartTrade live TP/SL evaluator was not installed.');
if (!source.includes('tradeType="SmartTrade"')) throw new Error('SmartTrade chart modal was not installed.');
if (!source.includes('openSmartAddFunds(trade)')) throw new Error('SmartTrade Add Funds action was not installed.');
if (!source.includes('openSmartTradeEdit(trade)')) throw new Error('SmartTrade Edit action was not installed.');
if (!source.includes('refreshSmartTradeNow(trade.id)')) throw new Error('SmartTrade Refresh action was not installed.');
if (!source.includes('const smartRealized =')) throw new Error('SmartTrade realized PnL ledger was not installed.');
if (!chart.includes('takeProfitPrices?: number[];')) throw new Error('Trade chart multi-TP support was not installed.');

fs.writeFileSync(traderPath, source);
fs.writeFileSync(chartPath, chart);
fs.writeFileSync(cssPath, css);
console.log('Applied DCA-grade charts, live bars, actions, TP/SL execution, Add Funds, Edit and History behavior to SmartTrade.');
