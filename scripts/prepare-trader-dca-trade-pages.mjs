import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

source = source.replace('type DcaView = "list" | "create";', 'type DcaView = "list" | "create" | "active" | "closed";');

if (!source.includes("type DcaTrade = {")) {
  const start = source.indexOf("type DcaBot = {");
  const end = source.indexOf("\n};", start) + 3;
  const typeBlock = [
    "",
    "type DcaTrade = {",
    "  id: string;",
    "  botId: string;",
    "  botName: string;",
    "  pair: string;",
    "  entryPrice: number;",
    "  averagePrice: number;",
    "  quantity: number;",
    "  invested: number;",
    "  averagingFilled: number;",
    "  maxAveraging: number;",
    "  status: \"Active\" | \"Closed\";",
    "  createdAt: string;",
    "  closedAt?: string;",
    "  realizedPnl?: number;",
    "};",
    "",
  ].join("\n");
  if (start >= 0 && end > start) source = source.slice(0, end) + typeBlock + source.slice(end);
}

source = source.replace(
  '  const [dcaBots, setDcaBots] = useState<DcaBot[]>([]);',
  '  const [dcaBots, setDcaBots] = useState<DcaBot[]>([]);\n  const [dcaTrades, setDcaTrades] = useState<DcaTrade[]>([]);'
);
source = source.replace(
  '      const savedBots = localStorage.getItem("labnarrative-dca-bots-v1");',
  '      const savedBots = localStorage.getItem("labnarrative-dca-bots-v1");\n      const savedDcaTrades = localStorage.getItem("labnarrative-dca-trades-v1");'
);
source = source.replace(
  '      if (savedBots) setDcaBots(JSON.parse(savedBots));',
  '      if (savedBots) setDcaBots(JSON.parse(savedBots));\n      if (savedDcaTrades) setDcaTrades(JSON.parse(savedDcaTrades));'
);
source = source.replace(
  '  useEffect(() => { localStorage.setItem("labnarrative-dca-bots-v1", JSON.stringify(dcaBots)); }, [dcaBots]);',
  '  useEffect(() => { localStorage.setItem("labnarrative-dca-bots-v1", JSON.stringify(dcaBots)); }, [dcaBots]);\n  useEffect(() => { localStorage.setItem("labnarrative-dca-trades-v1", JSON.stringify(dcaTrades)); }, [dcaTrades]);'
);

const runningAnchor = '  const runningBots = dcaBots.filter((bot) => bot.status === "Running");';
if (!source.includes("const activeDcaTrades =")) {
  source = source.replace(runningAnchor, [
    runningAnchor,
    '  const activeDcaTrades = dcaTrades.filter((trade) => trade.status === "Active");',
    '  const closedDcaTrades = dcaTrades.filter((trade) => trade.status === "Closed");',
    '  const dcaTradePrice = (trade: DcaTrade) => markets.find((market) => market.symbol === trade.pair.split("/")[0])?.price ?? trade.averagePrice;',
    '  const dcaTradePnl = (trade: DcaTrade) => (dcaTradePrice(trade) - trade.averagePrice) * trade.quantity;',
    '  const activeDcaUnrealized = activeDcaTrades.reduce((sum, trade) => sum + dcaTradePnl(trade), 0);',
    '  const dcaRealized = closedDcaTrades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);',
    '  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0);',
  ].join("\n"));
}

source = source.replace(
  '    setDcaBots((current) => [bot, ...current]);\n    setDcaView("list");',
  [
    '    setDcaBots((current) => [bot, ...current]);',
    '    if ((bot.startCondition === "Immediately" || !bot.startCondition) && selectedPrice && selectedPrice > 0) {',
    '      const now = new Date().toISOString();',
    '      setDcaTrades((current) => [{',
    '        id: "deal-" + Date.now(), botId: bot.id, botName: bot.name, pair: bot.pair,',
    '        entryPrice: selectedPrice, averagePrice: selectedPrice, quantity: bot.baseOrder / selectedPrice, invested: bot.baseOrder,',
    '        averagingFilled: 0, maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: now,',
    '      }, ...current]);',
    '    }',
    '    setDcaView("list");',
  ].join("\n")
);

if (!source.includes("const closeDcaTrade =")) {
  const handlers = [
    '  const closeDcaTrade = (tradeId: string) => {',
    '    setDcaTrades((items) => items.map((trade) => {',
    '      if (trade.id !== tradeId || trade.status !== "Active") return trade;',
    '      return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade) };',
    '    }));',
    '    setNotice("DCA paper trade closed at the current Binance market price.");',
    '  };',
    '  const addFundsToDcaTrade = (tradeId: string) => {',
    '    setDcaTrades((items) => items.map((trade) => {',
    '      if (trade.id !== tradeId || trade.status !== "Active") return trade;',
    '      const current = dcaTradePrice(trade);',
    '      const bot = dcaBots.find((item) => item.id === trade.botId);',
    '      const addition = bot?.safetyOrder ?? Math.max(10, trade.invested * 0.1);',
    '      if (!current || current <= 0) return trade;',
    '      const extraQty = addition / current;',
    '      const newQty = trade.quantity + extraQty;',
    '      const newInvested = trade.invested + addition;',
    '      return { ...trade, quantity: newQty, invested: newInvested, averagePrice: newInvested / newQty, averagingFilled: Math.min(trade.maxAveraging, trade.averagingFilled + 1) };',
    '    }));',
    '    setNotice("Funds added to the DCA paper trade at the current Binance price.");',
    '  };',
    '',
  ].join("\n");
  source = source.replace('  const handleGlobalSearch = (value: string) => {', handlers + '  const handleGlobalSearch = (value: string) => {');
}

source = source.replace(
  '<section><span>Closed trades</span><strong>{closedSmart.length}</strong><small>Active bots: {runningBots.length}</small></section>',
  '<section><span>Closed trades</span><strong>{closedDcaTrades.length}</strong><small>Active trades: {activeDcaTrades.length}</small></section>'
);

const dcaNav = '<button className={section === "DCA bots" ? styles.navActive : ""} onClick={() => openSection("DCA bots")}><span>{navGlyph("DCA bots")}</span>DCA Bot<small>⌄</small></button>';
const dcaNavExpanded = dcaNav + '{section === "DCA bots" && <div className={styles.dcaSubnav}><button className={dcaView === "list" || dcaView === "create" ? styles.dcaSubnavActive : ""} onClick={() => setDcaView("list")}>My Bots</button><button className={dcaView === "active" ? styles.dcaSubnavActive : ""} onClick={() => setDcaView("active")}>Active trades <span>{activeDcaTrades.length}</span></button><button className={dcaView === "closed" ? styles.dcaSubnavActive : ""} onClick={() => setDcaView("closed")}>Closed trades <span>{closedDcaTrades.length}</span></button></div>}';
source = source.replace(dcaNav, dcaNavExpanded);

if (!source.includes("const renderDcaTrades =")) {
  const tradeViews = [
    '  const renderDcaTrades = (mode: "Active" | "Closed") => {',
    '    const rows = mode === "Active" ? activeDcaTrades : closedDcaTrades;',
    '    const available = Math.max(0, DEMO_BALANCE - paperCapital);',
    '    return <div className={styles.dcaTradesPage}>',
    '      <div className={styles.dcaTradesTop}><button className={styles.myBotsButton} onClick={() => setDcaView("list")}>▣ My Bots</button>{mode === "Active" && <button className={styles.primaryButton} onClick={() => setDcaView("create")}>＋ Create DCA Bot</button>}</div>',
    '      <section className={styles.dcaDealsFilters}><strong>Filters</strong><div><button>⚑ Clear</button><button>⌄</button></div></section>',
    '      <div className={styles.dcaDealsStats}>',
    '        <section><h3>Overall stats</h3>{mode === "Active" ? <div className={styles.dealStatLines}><p><span>Today PnL</span><b>{compactMoney(activeDcaUnrealized)}</b></p><p><span>PnL</span><b className={dcaRealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(dcaRealized)}</b></p><p><span>Active trades</span><b>{activeDcaTrades.length}</b></p><p><span>Funds locked in DCA bot trades</span><b>{compactMoney(dcaFundsLocked)}</b></p><p><span>uPnL of active Bot trades</span><b className={activeDcaUnrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(activeDcaUnrealized)}</b></p></div> : <div className={styles.dealStatLines}><p><span>Completed</span><b>{closedDcaTrades.length}</b></p><p><span>PnL</span><b className={dcaRealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(dcaRealized)}</b></p></div>}<div className={styles.dealStatIcon}>↗</div></section>',
    '        <section><h3>Completed trades profit</h3><div className={styles.completedProfit}><b className={dcaRealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(dcaRealized)}</b><span>USDT</span><i>▣</i></div></section>',
    '        {mode === "Active" && <section><div className={styles.dealStatTitleRow}><h3>Balances</h3><button>↻ Refresh</button></div><table className={styles.balanceMiniTable}><thead><tr><th></th><th>Reserved</th><th>Available</th></tr></thead><tbody><tr><td>USDT</td><td>{compactMoney(dcaFundsLocked)}</td><td>{compactMoney(available)}</td></tr></tbody></table></section>}',
    '      </div>',
    '      <section className={styles.dcaDealsTableCard}><table><thead><tr><th>Bot ↕</th><th>Pair ↕</th><th>{mode === "Active" ? "uPnL ↕" : "PnL ↕"}</th><th>Volume ↕</th><th>Status ↕</th><th>Averaging O</th><th>{mode === "Active" ? "Created ↓" : "Closed on ↓"}</th></tr></thead><tbody>',
    '        {rows.length ? rows.map((trade) => {',
    '          const current = dcaTradePrice(trade);',
    '          const pnl = trade.status === "Active" ? dcaTradePnl(trade) : (trade.realizedPnl ?? 0);',
    '          const pnlPct = trade.invested > 0 ? pnl / trade.invested * 100 : 0;',
    '          const symbol = trade.pair.split("/")[0];',
    '          const created = new Date(trade.createdAt);',
    '          const closed = trade.closedAt ? new Date(trade.closedAt) : null;',
    '          const durationHours = closed ? Math.floor(Math.max(0, closed.getTime() - created.getTime()) / 3600000) : 0;',
    '          const progressWidth = String(Math.min(100, Math.max(2, 50 + pnlPct))) + "%";',
    '          return <tr key={trade.id} className={styles.dcaDealRow}>',
    '            <td><strong className={styles.dealBotName}>{trade.botName}</strong><small>BO: {compactMoney(dcaBots.find((bot) => bot.id === trade.botId)?.baseOrder ?? trade.invested)}, Averaging O: {compactMoney(dcaBots.find((bot) => bot.id === trade.botId)?.safetyOrder ?? 0)}</small><small>OS: {dcaBots.find((bot) => bot.id === trade.botId)?.volumeScale ?? 1}, SS: {dcaBots.find((bot) => bot.id === trade.botId)?.stepScale ?? 1}</small></td>',
    '            <td><strong>{symbol}/USDT</strong><small>Paper Account 1001863</small></td>',
    '            <td><strong className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</strong><small className={pnl >= 0 ? styles.greenText : styles.redText}>{pct(pnlPct)}</small>{mode === "Active" && <div className={styles.dealProgress}><i style={{ width: progressWidth }}/><span>Buy {money(trade.averagePrice)}</span><em>MP {money(current)}</em></div>}</td>',
    '            <td><span>{compactMoney(trade.invested)}</span><small>{trade.quantity.toFixed(8)} {symbol}</small></td>',
    '            <td>{trade.status}</td>',
    '            <td><span>Completed: {trade.averagingFilled}</span><small>{mode === "Active" ? "Active: " + Math.max(0, trade.maxAveraging - trade.averagingFilled) : "Filled: " + trade.averagingFilled}</small><small>Max: {trade.maxAveraging}</small></td>',
    '            <td><span>ID: {trade.id.replace("deal-", "")}</span><small>{mode === "Active" ? "Start: " + created.toLocaleString() : "Start: " + created.toLocaleString()}</small>{closed && <><small>End: {closed.toLocaleString()}</small><small>Duration: {durationHours < 24 ? durationHours + " hours" : Math.floor(durationHours / 24) + " days"}</small></>}</td>',
    '          </tr>;',
    '        }) : <tr className={styles.emptyRow}><td colSpan={7}>{mode === "Active" ? "No active DCA trades yet. Running bots will appear here after their entry conditions execute." : "No closed DCA trades yet."}</td></tr>}',
    '      </tbody></table>',
    '      {mode === "Active" && rows.length > 0 && <div className={styles.dcaDealActionsList}>{rows.map((trade) => <div key={"actions-" + trade.id}><button className={styles.dealCancelButton} onClick={() => closeDcaTrade(trade.id)}>⊘ Cancel</button><button onClick={() => closeDcaTrade(trade.id)}>◉ Close at market price</button><button>✎ Edit</button><button className={styles.dealBlueButton} onClick={() => addFundsToDcaTrade(trade.id)}>＋$ Add funds</button><button className={styles.dealRefreshButton} onClick={() => setNotice("DCA trade refreshed from live Binance market data.")}>↻ Refresh</button></div>)}</div>}',
    '      </section>',
    '    </div>;',
    '  };',
    '',
  ].join("\n");
  source = source.replace('  const dcaCreate = (', tradeViews + '  const dcaCreate = (');
}

source = source.replace(
  '{section === "DCA bots" && (dcaView === "list" ? dcaList : dcaCreate)}',
  '{section === "DCA bots" && (dcaView === "list" ? dcaList : dcaView === "create" ? dcaCreate : dcaView === "active" ? renderDcaTrades("Active") : renderDcaTrades("Closed"))}'
);

if (!css.includes(".dcaSubnav{")) {
  css += '\n/* DCA Active / Closed trade ledger */\n.dcaSubnav{display:flex;flex-direction:column;padding:0 0 7px 42px;border-bottom:1px solid rgba(91,117,132,.18)}\n.dcaSubnav button{height:32px;border:0;background:transparent;color:#8397a6;text-align:left;font-size:12px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-radius:3px}.dcaSubnav button:hover,.dcaSubnavActive{color:#dbe5ea!important;background:#223744!important}.dcaSubnav button span{font-size:10px;color:#6f8796}\n.dcaTradesPage{padding:14px 22px 60px;min-width:0}.dcaTradesTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.myBotsButton{height:34px;padding:0 13px;border:0;border-radius:4px;background:#aebdca;color:#17232b;font-weight:800;cursor:pointer}.dcaDealsFilters{min-height:66px;border-radius:4px;background:#15242d;padding:0 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.dcaDealsFilters strong{font-size:17px}.dcaDealsFilters div{display:flex;gap:8px}.dcaDealsFilters button{height:34px;border:1px solid #2b414e;background:#1c2e39;color:#9db0bc;border-radius:4px;padding:0 13px}.dcaDealsStats{display:grid;grid-template-columns:1.15fr 1.15fr .95fr;gap:15px;margin-bottom:18px}.dcaDealsStats>section{position:relative;min-height:164px;background:#17262f;border-radius:4px;overflow:hidden}.dcaDealsStats h3{margin:0;padding:14px;border-bottom:1px solid #2a3f4b;color:#cbd6dd;font-size:17px}.dealStatLines{padding:7px 14px}.dealStatLines p{margin:0;min-height:28px;display:flex;align-items:center;gap:8px}.dealStatLines span{color:#91a8b7;text-decoration:underline dotted}.dealStatLines b{margin-left:auto;color:#b8c7d0}.dealStatIcon{position:absolute;right:22px;bottom:22px;font-size:56px;color:#dce5e9;opacity:.9}.completedProfit{padding:14px;display:flex;flex-direction:column;gap:7px}.completedProfit>b{font-size:16px}.completedProfit span{color:#7c95a5}.completedProfit i{position:absolute;right:26px;bottom:28px;font-size:52px;color:#dce5e9;font-style:normal}.dealStatTitleRow{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2a3f4b}.dealStatTitleRow h3{border:0}.dealStatTitleRow button{margin-right:12px;height:32px;border:1px solid #2b414e;background:#213440;color:#aebec8;border-radius:4px}.balanceMiniTable{width:calc(100% - 24px);margin:10px 12px;border-collapse:collapse}.balanceMiniTable th,.balanceMiniTable td{padding:8px;border-bottom:1px solid #263b47;text-align:right;font-size:12px;color:#8fa6b5}.balanceMiniTable th:first-child,.balanceMiniTable td:first-child{text-align:left;color:#8eabc0;font-weight:700}.dcaDealsTableCard{background:#14232c;border-radius:4px;overflow-x:auto}.dcaDealsTableCard table{width:100%;min-width:1080px;border-collapse:collapse}.dcaDealsTableCard th{height:58px;border-bottom:1px solid #2d424d;color:#aebdc7;font-size:12px;text-align:left;padding:0 12px}.dcaDealsTableCard td{padding:14px 12px;border-bottom:1px solid #263a45;vertical-align:top;color:#92aabe;font-size:12px}.dcaDealsTableCard td strong{display:block;color:#50a9ee;margin-bottom:5px}.dcaDealsTableCard td small{display:block;line-height:1.45;color:#7f9aac}.dealBotName{font-size:12px}.dealProgress{position:relative;width:250px;max-width:100%;height:28px;margin-top:7px;border-top:4px solid #d9e2e5}.dealProgress i{position:absolute;left:0;top:-4px;height:4px;background:#f15f75}.dealProgress span,.dealProgress em{position:absolute;top:5px;font-size:10px;font-style:normal}.dealProgress span{right:38%}.dealProgress em{right:0;color:#3ed0b8}.dcaDealActionsList{padding:0 12px 14px}.dcaDealActionsList>div{display:flex;justify-content:center;gap:0;margin:10px 0 22px}.dcaDealActionsList button{height:35px;border:1px solid #344955;background:#20313b;color:#becbd2;padding:0 12px;cursor:pointer}.dealCancelButton{color:#f2798c!important;background:#3a2830!important}.dealBlueButton{color:#54aef1!important}.dealRefreshButton{color:#22c3ad!important}.dcaDealRow td:nth-child(3){min-width:280px}@media(max-width:1100px){.dcaDealsStats{grid-template-columns:1fr}.dcaDealsStats>section{min-height:135px}.dcaTradesPage{padding:12px}.dcaSubnav{padding-left:28px}}\n';
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared DCA Active trades and Closed trades ledger pages.");
