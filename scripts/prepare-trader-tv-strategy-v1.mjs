import fs from "node:fs";
import path from "node:path";

const shellPath=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
if(!fs.existsSync(shellPath))throw new Error("TradingView Strategy shell target missing");
let source=fs.readFileSync(shellPath,"utf8"),changes=0;
const required=(from,to,label)=>{if(!source.includes(from))throw new Error(`TradingView Strategy could not find ${label}`);source=source.replace(from,to);changes+=1};

const dcaImport='import DcaBotConfigurator from "./DcaBotConfigurator";';
if(!source.includes('import TradingViewStrategyConfigurator from "./TradingViewStrategyConfigurator";')){
  if(!source.includes(dcaImport))throw new Error("TradingView Strategy could not find DCA configurator import");
  source=source.replace(dcaImport,`${dcaImport}\nimport TradingViewStrategyConfigurator from "./TradingViewStrategyConfigurator";`);changes+=1;
}

const botTypeEnd='  updatedAt: string;\n};\ntype Fill = {';
if(!source.includes('automationType?: "dca" | "tradingview_strategy";')){
  required(botTypeEnd,'  updatedAt: string;\n  automationType?: "dca" | "tradingview_strategy";\n};\ntype Fill = {','Bot automation type');
}

const tradeTypeEnd='  fills: Fill[];\n};\ntype WorkspaceResponse = {';
if(!source.includes('  automationType?: "dca" | "tradingview_strategy";\n  fills: Fill[];')){
  required(tradeTypeEnd,'  automationType?: "dca" | "tradingview_strategy";\n  fills: Fill[];\n};\ntype WorkspaceResponse = {','Position automation type');
}

required(
  '  const [automationTypeFilter, setAutomationTypeFilter] = useState<"All" | "DCA">("All");\n  const [automationFilterOpen, setAutomationFilterOpen] = useState(false);\n',
  '  const [automationTypeFilter, setAutomationTypeFilter] = useState<"All" | "DCA" | "TradingView Strategy">("All");\n  const [automationFilterOpen, setAutomationFilterOpen] = useState(false);\n  const [tvStrategyMode, setTvStrategyMode] = useState<"create" | "view" | "edit" | null>(null);\n',
  'Automation filter and strategy modal state',
);

required(
  '  const displayBots = botTab === "Active" ? activeBots : closedBots;\n',
  '  const lifecycleBots = botTab === "Active" ? activeBots : closedBots;\n  const displayBots = lifecycleBots.filter((bot) => automationTypeFilter === "All" || (automationTypeFilter === "DCA" ? bot.automationType !== "tradingview_strategy" : bot.automationType === "tradingview_strategy"));\n',
  'Automation type filtering',
);

required(
  '<button type="button" disabled title="TradingView Strategy is coming soon"><span>TradingView Strategy</span><small>Soon</small></button>',
  '<button type="button" className={automationTypeFilter === "TradingView Strategy" ? dca.automationFilterSelected : ""} onClick={() => { setAutomationTypeFilter("TradingView Strategy"); setAutomationFilterOpen(false); }}><span>TradingView Strategy</span><b>{automationTypeFilter === "TradingView Strategy" ? "✓" : ""}</b></button>',
  'TradingView Strategy filter option',
);

source=source.replace(
  'Choose an automation type. Only DCA is available in this launch version.',
  'Choose an automation type. DCA and TradingView Strategy are available.',
);
source=source.replace(
  '<button className={styles.exchangeChoice} style={{marginTop:8}} disabled><span className={styles.exchangeChoiceLogo}>TV</span><div><strong>TradingView Strategy</strong><small>Execute a tested TradingView strategy through a connected exchange or broker using TradingView alerts and webhooks.</small></div><span>SOON</span></button>',
  '<button className={styles.exchangeChoice} style={{marginTop:8}} onClick={() => { setAutomationPickerOpen(false); setBotModalMode(null); setSelectedBotId(null); setTvStrategyMode("create"); }}><span className={styles.exchangeChoiceLogo}>TV</span><div><strong>TradingView Strategy</strong><small>TradingView supplies symbol, size, entry and exit through one order-fill alert.</small></div><span>CREATE</span></button>',
);
source=source.replace(
  'Coming Soon options are visible for roadmap clarity but cannot be launched yet.',
  'Grid Automation remains on the roadmap and cannot be launched yet.',
);
if(!source.includes('setTvStrategyMode("create")'))throw new Error("TradingView Strategy picker was not enabled");changes+=1;

required(
  '<div className={dca.botRow} key={bot.id} onClick={() => openBot(bot)}>',
  '<div className={dca.botRow} key={bot.id} onClick={() => { if (bot.automationType === "tradingview_strategy") { setBotModalMode(null); setSelectedBotId(bot.id); setTvStrategyMode("view"); } else { setTvStrategyMode(null); openBot(bot); } }}>',
  'Automation row open behavior',
);
required(
  '<small>DCA · {bot.startCondition} · {bot.executionMode}</small>',
  '<small>{bot.automationType === "tradingview_strategy" ? `TradingView Strategy · ${bot.executionMode}` : `DCA · ${bot.startCondition} · ${bot.executionMode}`}</small>',
  'Automation row identity',
);
required(
  '<span className={dca.botCell} style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.pair} size={18}/>{bot.pair}</span>',
  '{bot.automationType === "tradingview_strategy" ? <span className={dca.botCell}>From TradingView</span> : <span className={dca.botCell} style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.pair} size={18}/>{bot.pair}</span>}',
  'Dynamic strategy market display',
);
required(
  '<span className={dca.botCell}>{money(botCapital(bot))}</span>',
  '<span className={dca.botCell}>{bot.automationType === "tradingview_strategy" ? "TradingView sizing" : money(botCapital(bot))}</span>',
  'Automation capital display',
);
required(
  '<button onClick={(event) => { event.stopPropagation(); void closeBot(bot); }}>Close</button>',
  '{bot.automationType === "tradingview_strategy" ? <button disabled={bot.activeTradeCount > 0} title={bot.activeTradeCount > 0 ? "Close the active position before archiving this strategy." : "Archive TradingView Strategy"} onClick={(event) => { event.stopPropagation(); void closeBot(bot); }}>Archive</button> : <button onClick={(event) => { event.stopPropagation(); void closeBot(bot); }}>Close</button>}',
  'Safe strategy archive action',
);

const exchangeMarker='    {exchangeModal && <div className={styles.backdrop}';
if(!source.includes('TRADINGVIEW STRATEGY</small><h2>')){
  if(!source.includes(exchangeMarker))throw new Error("TradingView Strategy could not find modal insertion point");
  const modal=`    {tvStrategyMode && currentAccount && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setTvStrategyMode(null); }}><section className={styles.modal}><div className={styles.modalHead}><div><small>TRADINGVIEW STRATEGY</small><h2>{tvStrategyMode === "create" ? "New TradingView Strategy" : selectedBot?.name ?? "TradingView Strategy"}</h2><p>TradingView supplies the market and trade instructions. LabNarrative handles account-scoped execution.</p></div><div className={dca.rowActions}>{tvStrategyMode === "view" && selectedBot?.lifecycle !== "closed" && <button type="button" onClick={() => setTvStrategyMode("edit")}>Edit</button>}<button type="button" onClick={() => setTvStrategyMode(null)}>×</button></div></div><TradingViewStrategyConfigurator mode={tvStrategyMode} accountId={currentAccount.id} accountKind={currentAccount.kind} botId={tvStrategyMode === "create" ? null : selectedBotId} onCancel={() => tvStrategyMode === "edit" && selectedBotId ? setTvStrategyMode("view") : setTvStrategyMode(null)} onSaved={(savedBotId, action) => { if (savedBotId) setSelectedBotId(savedBotId); setTvStrategyMode("view"); setBotTab("Active"); setAutomationTypeFilter("TradingView Strategy"); setNotice(action === "create" ? "TradingView Strategy created. Connect TradingView and copy the single order-fill alert message." : "TradingView Strategy settings saved."); void loadWorkspace(true); }} onError={(message) => setError(message)}/></section></div>}\n\n`;
  source=source.replace(exchangeMarker,modal+exchangeMarker);changes+=1;
}

source=source.replace(
  '<small>{trade.botName} · {trade.executionMode}</small>',
  '<small>{trade.automationType === "tradingview_strategy" ? `TradingView Strategy · ${trade.botName} · ${trade.executionMode}` : `${trade.botName} · ${trade.executionMode}`}</small>',
);
source=source.replace(
  '<span>Base <b>{money(trade.entryPrice)}</b></span><span>TP <b>{trade.takeProfitPrice ? money(trade.takeProfitPrice) : "—"}</b></span><span>Next DCA <b>{trade.nextAveragingPrice ? money(trade.nextAveragingPrice) : "—"}</b></span><span>DCA filled <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span>',
  '<span>Entry <b>{money(trade.entryPrice)}</b></span>{trade.automationType !== "tradingview_strategy" && <><span>TP <b>{trade.takeProfitPrice ? money(trade.takeProfitPrice) : "—"}</b></span><span>Next DCA <b>{trade.nextAveragingPrice ? money(trade.nextAveragingPrice) : "—"}</b></span><span>DCA filled <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span></>}',
);

for(const marker of[
  'TradingViewStrategyConfigurator',
  'automationType?: "dca" | "tradingview_strategy"',
  'setTvStrategyMode("create")',
  'setAutomationTypeFilter("TradingView Strategy")',
  'Close the active position before archiving this strategy.',
  'From TradingView',
])if(!source.includes(marker))throw new Error(`TradingView Strategy output missing: ${marker}`);

fs.writeFileSync(shellPath,source);
console.log(`Prepared TradingView Strategy V2 (${changes} shell changes; dynamic symbol, strategy sizing, one BUY/SELL order-fill alert, DCA engine isolated).`);
