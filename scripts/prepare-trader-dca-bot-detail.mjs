import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Add a dedicated DCA bot detail view after all of the earlier trader transforms have run.
source = source.replace(
  'type DcaView = "list" | "create" | "active" | "closed";',
  'type DcaView = "list" | "create" | "active" | "closed" | "detail";'
);

// Persist a little more of the configuration so Edit can faithfully reopen the bot builder.
source = source.replace(
  '  conditions?: Array<{ id: number; kind: string; timeframe: string; length: number; comparator: string; signal: number; aux1: number; aux2: number; aux3: number }>;\n  status: "Running" | "Stopped";',
  '  conditions?: Array<{ id: number; kind: string; timeframe: string; length: number; comparator: string; signal: number; aux1: number; aux2: number; aux3: number }>;\n  direction?: "Long" | "Short";\n  orderType?: "Market" | "Limit";\n  status: "Running" | "Stopped";'
);

source = source.replace(
  '  const [dcaTrades, setDcaTrades] = useState<DcaTrade[]>([]);',
  '  const [dcaTrades, setDcaTrades] = useState<DcaTrade[]>([]);\n  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);\n  const [editingBotId, setEditingBotId] = useState<string | null>(null);'
);

// Deep-link support for a specific bot and browser back/forward behavior.
if (!source.includes("DCA BOT DETAIL ROUTING")) {
  const persistenceAnchor = '  useEffect(() => { localStorage.setItem("labnarrative-dca-trades-v1", JSON.stringify(dcaTrades)); }, [dcaTrades]);';
  source = source.replace(persistenceAnchor, persistenceAnchor + `

  // DCA BOT DETAIL ROUTING
  useEffect(() => {
    const syncFromUrl = () => {
      const botId = new URLSearchParams(window.location.search).get("bot");
      if (botId) {
        setSection("DCA bots");
        setSelectedBotId(botId);
        setDcaView("detail");
      } else if (dcaView === "detail") {
        setDcaView("list");
        setSelectedBotId(null);
      }
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
    // URL state is intentionally initialized once and then driven by pushState/popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);`);
}

const creatorStart = source.indexOf('  const createConfiguredDcaBot = () => {');
const creatorEnd = source.indexOf('  const handleGlobalSearch = (value: string) => {', creatorStart);
if (creatorStart >= 0 && creatorEnd > creatorStart) {
  const helpersAndCreator = `  const conditionSummary = (condition: NonNullable<DcaBot["conditions"]>[number]) => {
    if (condition.kind === "RSI") return \`RSI \${condition.length}, \${condition.timeframe}, \${condition.comparator} \${condition.signal}\`;
    if (condition.kind === "Stochastic") return \`Stochastic K \${condition.aux1}/\${condition.aux2}/\${condition.aux3}, \${condition.timeframe}, \${condition.comparator} \${condition.signal}\`;
    if (condition.kind === "MACD") return \`MACD \${condition.aux1}/\${condition.aux2}/\${condition.aux3}, \${condition.timeframe}, \${condition.comparator}\`;
    if (condition.kind === "Moving Average (MA)") return \`Moving Average \${condition.aux2}/\${condition.aux3}, \${condition.timeframe}, \${condition.comparator}\`;
    if (condition.kind === "Heikin Ashi") return \`Heikin Ashi, \${condition.timeframe}, \${condition.length} candle\${condition.length === 1 ? "" : "s"}\`;
    return \`\${condition.kind}, \${condition.timeframe}\${condition.comparator ? ", " + condition.comparator : ""}\${Number.isFinite(condition.signal) ? " " + condition.signal : ""}\`;
  };

  const openDcaBot = (botId: string) => {
    setSelectedBotId(botId);
    setEditingBotId(null);
    setDcaView("detail");
    window.history.pushState({}, "", "/trader?bot=" + encodeURIComponent(botId));
  };

  const returnToDcaBots = () => {
    setSelectedBotId(null);
    setEditingBotId(null);
    setDcaView("list");
    window.history.pushState({}, "", "/trader");
  };

  const setDcaBotStatus = (botId: string, status: "Running" | "Stopped") => {
    setDcaBots((items) => items.map((bot) => bot.id === botId ? { ...bot, status } : bot));
    setNotice(status === "Running" ? "DCA bot started. It will evaluate its entry conditions against live Binance data." : "DCA bot stopped. Existing active trades continue to be managed in paper mode.");
  };

  const loadDcaBotIntoEditor = (botId: string, asCopy = false) => {
    const bot = dcaBots.find((item) => item.id === botId);
    if (!bot) return;
    setEditingBotId(asCopy ? null : bot.id);
    setBotName(asCopy ? bot.name + " Copy" : bot.name);
    setSelectedSymbol(bot.pair.split("/")[0]);
    setBaseOrder(bot.baseOrder);
    setSafetyOrder(bot.safetyOrder);
    setMaxSafetyOrders(bot.maxSafetyOrders);
    setDeviation(bot.deviation);
    setStepScale(bot.stepScale);
    setVolumeScale(bot.volumeScale);
    setBotTakeProfit(bot.takeProfit);
    setBotStopEnabled(bot.stopEnabled);
    setBotStopPct(bot.stopPct);
    setDcaDirection(bot.direction ?? "Long");
    setDcaOrderType(bot.orderType ?? "Market");
    setDcaConditions((bot.conditions ?? []).map((condition, index) => ({ ...condition, id: Date.now() + index })));
    setDcaView("create");
    window.history.pushState({}, "", "/trader");
  };

  const deleteDcaBot = (botId: string) => {
    const bot = dcaBots.find((item) => item.id === botId);
    if (!bot || !window.confirm(\`Delete \"\${bot.name}\"? Active paper trades from this bot will be closed at their latest market mark.\`)) return;
    const closedAt = new Date().toISOString();
    setDcaTrades((items) => items.map((trade) => {
      if (trade.botId !== botId || trade.status !== "Active") return trade;
      return { ...trade, status: "Closed", closedAt, realizedPnl: dcaTradePnl(trade), closeReason: "Bot deleted" };
    }));
    setDcaBots((items) => items.filter((item) => item.id !== botId));
    returnToDcaBots();
    setNotice(bot.name + " deleted.");
  };

  const exportDcaBotTrades = (botId: string) => {
    const bot = dcaBots.find((item) => item.id === botId);
    const trades = dcaTrades.filter((trade) => trade.botId === botId);
    if (!bot) return;
    const rows = [
      ["trade_id", "pair", "status", "entry_price", "average_price", "invested_usdt", "quantity", "averaging_filled", "realized_pnl", "created_at", "closed_at", "close_reason"],
      ...trades.map((trade) => [trade.id, trade.pair, trade.status, trade.entryPrice, trade.averagePrice, trade.invested, trade.quantity, trade.averagingFilled, trade.realizedPnl ?? "", trade.createdAt, trade.closedAt ?? "", trade.closeReason ?? ""]),
    ];
    const csv = rows.map((row) => row.map((cell) => \`"\${String(cell).replaceAll('"', '""')}"\`).join(",")).join("\\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = bot.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() + "-trades.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const shareDcaBot = async (botId: string) => {
    const url = window.location.origin + "/trader?bot=" + encodeURIComponent(botId);
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Bot link copied to clipboard.");
    } catch {
      setNotice(url);
    }
  };

  const createConfiguredDcaBot = () => {
    if (!botName.trim() || baseOrder <= 0 || safetyOrder <= 0) {
      setNotice("Add a bot name and valid order amounts.");
      return;
    }
    const savedConditions = dcaConditions.map((condition) => ({ ...condition }));
    if (editingBotId) {
      const currentBot = dcaBots.find((item) => item.id === editingBotId);
      if (!currentBot) {
        setEditingBotId(null);
        setNotice("The bot being edited could not be found.");
        return;
      }
      const updated: DcaBot = {
        ...currentBot,
        name: botName.trim(),
        pair: \`\${selectedSymbol}/USDT\`,
        baseOrder,
        safetyOrder,
        maxSafetyOrders,
        deviation,
        stepScale,
        volumeScale,
        takeProfit: botTakeProfit,
        stopEnabled: botStopEnabled,
        stopPct: botStopPct,
        startCondition: savedConditions.length ? savedConditions.map((condition) => condition.kind).join(" + ") : "Immediately",
        conditions: savedConditions,
        direction: dcaDirection,
        orderType: dcaOrderType,
      };
      setDcaBots((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditingBotId(null);
      setSelectedBotId(updated.id);
      setDcaView("detail");
      window.history.pushState({}, "", "/trader?bot=" + encodeURIComponent(updated.id));
      setNotice(updated.name + " updated.");
      return;
    }
    const bot: DcaBot = {
      id: \`bot-\${Date.now()}\`,
      name: botName.trim(),
      pair: \`\${selectedSymbol}/USDT\`,
      baseOrder,
      safetyOrder,
      maxSafetyOrders,
      deviation,
      stepScale,
      volumeScale,
      takeProfit: botTakeProfit,
      stopEnabled: botStopEnabled,
      stopPct: botStopPct,
      startCondition: savedConditions.length ? savedConditions.map((condition) => condition.kind).join(" + ") : "Immediately",
      conditions: savedConditions,
      direction: dcaDirection,
      orderType: dcaOrderType,
      status: "Running",
      createdAt: new Date().toISOString(),
    };
    setDcaBots((current) => [bot, ...current]);
    if (!savedConditions.length && selectedPrice && selectedPrice > 0) {
      const now = new Date().toISOString();
      setDcaTrades((current) => [{
        id: \`deal-\${Date.now()}-\${bot.id}\`, botId: bot.id, botName: bot.name, pair: bot.pair,
        entryPrice: selectedPrice, averagePrice: selectedPrice, quantity: bot.baseOrder / selectedPrice,
        invested: bot.baseOrder, averagingFilled: 0, maxAveraging: bot.maxSafetyOrders,
        status: "Active", createdAt: now, lastPrice: selectedPrice,
      }, ...current]);
    }
    setSelectedBotId(bot.id);
    setDcaView("detail");
    window.history.pushState({}, "", "/trader?bot=" + encodeURIComponent(bot.id));
    setNotice(\`\${bot.name} created and running in paper mode.\`);
  };

`;
  source = source.slice(0, creatorStart) + helpersAndCreator + source.slice(creatorEnd);
}

// New-bot buttons must not accidentally retain edit mode.
source = source.replaceAll(
  'onClick={() => setDcaView("create")}',
  'onClick={() => { setEditingBotId(null); setDcaView("create"); window.history.pushState({}, "", "/trader"); }}'
);

// Make the complete row clickable, while keeping the status switch independently usable.
source = source.replace(
  'dcaBots.map((bot) => <tr key={bot.id}><td><strong>{bot.name}</strong>',
  'dcaBots.map((bot) => <tr key={bot.id} className={styles.clickableBotRow} onClick={() => openDcaBot(bot.id)}><td><button className={styles.dcaBotLink} onClick={(event) => { event.stopPropagation(); openDcaBot(bot.id); }}>{bot.name}</button>'
);
source = source.replace(
  'onClick={() => setDcaBots((items) => items.map((item) => item.id === bot.id ? { ...item, status: item.status === "Running" ? "Stopped" : "Running" } : item))}',
  'onClick={(event) => { event.stopPropagation(); setDcaBotStatus(bot.id, bot.status === "Running" ? "Stopped" : "Running"); }}'
);

// Keep My Bots selected in the sidebar while a detail page is open.
source = source.replace(
  'dcaView === "list" || dcaView === "create" ? styles.dcaSubnavActive : ""',
  'dcaView === "list" || dcaView === "create" || dcaView === "detail" ? styles.dcaSubnavActive : ""'
);

// Make the builder clearly distinguish create vs edit.
source = source.replace(
  '<div className={styles.dcaBuilderTop}><h1>Create DCA Bot</h1>',
  '<div className={styles.dcaBuilderTop}><h1>{editingBotId ? "Edit DCA Bot" : "Create DCA Bot"}</h1>'
);
source = source.replace(
  '<button className={styles.dcaStartButton} onClick={createConfiguredDcaBot}>Start bot</button>',
  '<button className={styles.dcaStartButton} onClick={createConfiguredDcaBot}>{editingBotId ? "Save changes" : "Start bot"}</button>'
);

if (!source.includes("const renderDcaBotDetail =")) {
  const anchor = '  const dcaCreate = (';
  const detail = `  const renderDcaBotDetail = () => {
    const bot = dcaBots.find((item) => item.id === selectedBotId);
    if (!bot) return <div className={styles.dcaBotDetailPage}><button className={styles.myBotsButton} onClick={returnToDcaBots}>← My Bots</button><section className={styles.dcaBotMissing}><h2>Bot not found</h2><p>This bot may have been deleted from this paper account.</p></section></div>;

    const trades = dcaTrades.filter((trade) => trade.botId === bot.id);
    const activeTrades = trades.filter((trade) => trade.status === "Active");
    const closedTrades = trades.filter((trade) => trade.status === "Closed");
    const realized = closedTrades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
    const unrealized = activeTrades.reduce((sum, trade) => sum + dcaTradePnl(trade), 0);
    const fundsLocked = activeTrades.reduce((sum, trade) => sum + trade.invested, 0);
    const totalProfit = realized + unrealized;
    const conditions = bot.conditions ?? [];
    const events = [
      { at: bot.createdAt, text: "Bot created", tone: "neutral" },
      ...trades.map((trade) => ({ at: trade.createdAt, text: "Trade opened · " + trade.pair + " at " + money(trade.entryPrice), tone: "open" })),
      ...closedTrades.filter((trade) => trade.closedAt).map((trade) => ({ at: trade.closedAt as string, text: "Trade closed · " + (trade.closeReason ?? "Completed") + " · " + compactMoney(trade.realizedPnl ?? 0), tone: (trade.realizedPnl ?? 0) >= 0 ? "positive" : "negative" })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12);

    return <div className={styles.dcaBotDetailPage}>
      <div className={styles.dcaBotDetailTop}>
        <button className={styles.myBotsButton} onClick={returnToDcaBots}>← My Bots</button>
        <div className={styles.dcaBotTitleBlock}><span className={styles.eyebrow}>DCA BOT</span><div><h1>{bot.name}</h1><span className={bot.status === "Running" ? styles.botRunningBadge : styles.botStoppedBadge}>{bot.status}</span></div><p>{bot.pair} · Paper Account 1001863</p></div>
      </div>

      <div className={styles.dcaBotDetailGrid}>
        <section className={styles.dcaBotInfoCard}>
          <div className={styles.cardHeader}><h2>Information</h2></div>
          <div className={styles.dcaBotActions}>
            <button className={bot.status === "Running" ? styles.botStopButton : styles.botStartButton} onClick={() => setDcaBotStatus(bot.id, bot.status === "Running" ? "Stopped" : "Running")}>{bot.status === "Running" ? "■ Stop" : "▶ Start"}</button>
            <button onClick={() => loadDcaBotIntoEditor(bot.id)}>✎ Edit</button>
            <button onClick={() => loadDcaBotIntoEditor(bot.id, true)}>▣ Copy</button>
            <button className={styles.botDeleteButton} onClick={() => deleteDcaBot(bot.id)}>▣ Delete</button>
            <button className={styles.botExportButton} onClick={() => exportDcaBotTrades(bot.id)}>↥ Trades export to CSV</button>
            <button onClick={() => void shareDcaBot(bot.id)}>◆ Share</button>
          </div>
          <div className={styles.botInfoRows}>
            <div><span>Name</span><strong>{bot.name}</strong></div>
            <div><span>Exchange</span><strong>Paper Account 1001863 · Binance Spot</strong></div>
            <div><span>Pairs</span><strong>{bot.pair}</strong></div>
            <div><span>Direction</span><strong>{bot.direction ?? "Long"}</strong></div>
            <div><span>Target profit (%)</span><strong>{bot.takeProfit}% · Percentage from average price</strong></div>
            <div><span>Stop Loss</span><strong>{bot.stopEnabled ? bot.stopPct + "%" : "Off"}</strong></div>
            <div className={styles.botInfoConditions}><span>Trade start condition</span><strong>{conditions.length ? conditions.map((condition) => <em key={condition.id}>{conditionSummary(condition)}</em>) : <em>Immediately</em>}</strong></div>
            <div><span>Base order size</span><strong>{compactMoney(bot.baseOrder)} USDT</strong></div>
            <div><span>Averaging order size</span><strong>{compactMoney(bot.safetyOrder)} USDT</strong></div>
            <div><span>Max averaging orders per trade</span><strong>{bot.maxSafetyOrders}</strong></div>
            <div><span>Price deviation to open averaging orders</span><strong>{bot.deviation}%</strong></div>
            <div><span>Averaging order size multiplier</span><strong>{bot.volumeScale}</strong></div>
            <div><span>Averaging order step multiplier</span><strong>{bot.stepScale}</strong></div>
            <div><span>Start order type</span><strong>{bot.orderType ?? "Market"}</strong></div>
            <div><span>Created</span><strong>{new Date(bot.createdAt).toLocaleString()}</strong></div>
          </div>
        </section>

        <aside className={styles.dcaBotSideColumn}>
          <section className={styles.dcaBotStatsCard}>
            <div className={styles.cardHeader}><h2>Bot Stats</h2><span>⌁</span></div>
            <div className={styles.botStatsHero}><span>Summary PnL</span><strong className={totalProfit >= 0 ? styles.greenText : styles.redText}>{compactMoney(totalProfit)}</strong><small>{trades.length} total trade{trades.length === 1 ? "" : "s"}</small></div>
            <div className={styles.botStatsMini}><div><span>Completed</span><b>{closedTrades.length}</b></div><div><span>Active</span><b>{activeTrades.length}</b></div><div><span>Realized</span><b className={realized >= 0 ? styles.greenText : styles.redText}>{compactMoney(realized)}</b></div><div><span>uPnL</span><b className={unrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(unrealized)}</b></div></div>
            <div className={styles.botStatsChart}><span>PnL by day</span><svg viewBox="0 0 360 100"><line x1="8" y1="78" x2="352" y2="78"/><path d="M8 78 C55 76 82 67 110 70 S160 62 190 55 S236 62 270 42 S320 45 352 28"/></svg></div>
          </section>
          <section className={styles.dcaBotEventsCard}>
            <div className={styles.cardHeader}><h2>Last events</h2><span>↻</span></div>
            <div className={styles.botEventsList}>{events.length ? events.map((event, index) => <div key={event.at + index}><i className={event.tone === "positive" ? styles.eventPositive : event.tone === "negative" ? styles.eventNegative : styles.eventNeutral}/><span><strong>{event.text}</strong><small>{new Date(event.at).toLocaleString()}</small></span></div>) : <p>No bot events yet.</p>}</div>
          </section>
        </aside>
      </div>

      <section className={styles.dcaBotStatsTableCard}>
        <div className={styles.cardHeader}><h2>Stats</h2><div><button onClick={() => setDcaView("active")}>Active trades</button><button onClick={() => setDcaView("closed")}>Closed trades</button></div></div>
        <div className={styles.botInfoRows}>
          <div><span>Completed trades</span><strong>{closedTrades.length}</strong></div>
          <div><span>Active trades</span><strong>{activeTrades.length}</strong></div>
          <div><span>Max active trades</span><strong>1</strong></div>
          <div><span>Total profit</span><strong className={totalProfit >= 0 ? styles.greenText : styles.redText}>{compactMoney(totalProfit)}</strong></div>
          <div><span>PnL (completed Bot trades)</span><strong className={realized >= 0 ? styles.greenText : styles.redText}>{compactMoney(realized)}</strong></div>
          <div><span>uPnL (active Bot trades)</span><strong className={unrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(unrealized)}</strong></div>
          <div><span>Funds locked in DCA trades</span><strong>{compactMoney(fundsLocked)}</strong></div>
        </div>
      </section>
    </div>;
  };

`;
  source = source.replace(anchor, detail + anchor);
}

source = source.replace(
  '{section === "DCA bots" && (dcaView === "list" ? dcaList : dcaView === "create" ? dcaCreate : dcaView === "active" ? renderDcaTrades("Active") : renderDcaTrades("Closed"))}',
  '{section === "DCA bots" && (dcaView === "list" ? dcaList : dcaView === "create" ? dcaCreate : dcaView === "detail" ? renderDcaBotDetail() : dcaView === "active" ? renderDcaTrades("Active") : renderDcaTrades("Closed"))}'
);

if (!css.includes("/* DCA BOT DETAIL PAGE */")) {
  css += `

/* DCA BOT DETAIL PAGE */
.clickableBotRow{cursor:pointer;transition:background .15s ease}.clickableBotRow:hover{background:#152833}.dcaBotLink{appearance:none;background:none;border:0;padding:0;color:#54a9ec;font:inherit;font-weight:700;cursor:pointer;text-align:left}.dcaBotLink:hover{text-decoration:underline}
.dcaBotDetailPage{padding:22px 24px 70px;min-width:0}.dcaBotDetailTop{display:flex;align-items:flex-start;gap:18px;margin-bottom:18px}.dcaBotTitleBlock{min-width:0}.dcaBotTitleBlock>div{display:flex;align-items:center;gap:10px}.dcaBotTitleBlock h1{margin:2px 0 4px;font-size:25px;color:#d8e4eb}.dcaBotTitleBlock p{margin:0;color:#7f9bae;font-size:13px}.botRunningBadge,.botStoppedBadge{display:inline-flex;align-items:center;border-radius:4px;padding:4px 8px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.botRunningBadge{background:#0c4d48;color:#2dd4bf}.botStoppedBadge{background:#3c2b31;color:#ff8291}
.dcaBotDetailGrid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,.85fr);gap:18px;align-items:start}.dcaBotInfoCard,.dcaBotStatsCard,.dcaBotEventsCard,.dcaBotStatsTableCard,.dcaBotMissing{background:#14232c;border:1px solid #1d3542;border-radius:6px;overflow:hidden}.dcaBotInfoCard>.cardHeader,.dcaBotStatsCard>.cardHeader,.dcaBotEventsCard>.cardHeader,.dcaBotStatsTableCard>.cardHeader{padding:16px 18px;border-bottom:1px solid #29404d}.dcaBotInfoCard h2,.dcaBotStatsCard h2,.dcaBotEventsCard h2,.dcaBotStatsTableCard h2{font-size:17px;margin:0}.dcaBotActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:13px 14px;border-bottom:1px solid #29404d}.dcaBotActions button{background:#203441;border:1px solid #36505f;color:#c9d6de;border-radius:4px;padding:8px 11px;font-weight:700;cursor:pointer}.dcaBotActions button:hover{filter:brightness(1.12)}.dcaBotActions .botStartButton{background:#0c4947;border-color:#14766f;color:#29d3c4}.dcaBotActions .botStopButton{background:#3a2b31;border-color:#64404b;color:#ff8494}.dcaBotActions .botDeleteButton{background:#3a2930;border-color:#623d48;color:#ff788b}.dcaBotActions .botExportButton{background:#0f8f8b;border-color:#16aaa4;color:white}
.botInfoRows{display:flex;flex-direction:column}.botInfoRows>div{display:grid;grid-template-columns:minmax(190px,.9fr) minmax(0,1.45fr);gap:18px;padding:11px 14px;border-bottom:1px solid #29404d;color:#8eabbc;font-size:13px}.botInfoRows>div:last-child{border-bottom:0}.botInfoRows strong{color:#a9c1d0;font-weight:600;min-width:0;overflow-wrap:anywhere}.botInfoConditions strong{display:flex;flex-direction:column;gap:4px}.botInfoConditions em{font-style:normal;color:#8fb4c9}.dcaBotSideColumn{display:flex;flex-direction:column;gap:18px;position:sticky;top:16px}.botStatsHero{min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:1px solid #29404d}.botStatsHero span{color:#7f9aac}.botStatsHero strong{font-size:28px;margin:9px 0}.botStatsHero small{color:#6e8999}.botStatsMini{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #29404d}.botStatsMini>div{padding:12px 14px;border-right:1px solid #29404d;border-bottom:1px solid #29404d}.botStatsMini>div:nth-child(2n){border-right:0}.botStatsMini span{display:block;font-size:11px;color:#7894a5;margin-bottom:5px}.botStatsMini b{font-size:14px;color:#c2d3dc}.botStatsChart{padding:14px}.botStatsChart>span{display:block;text-align:center;color:#7894a5;margin-bottom:8px}.botStatsChart svg{width:100%;height:100px}.botStatsChart line{stroke:#29404d}.botStatsChart path{fill:none;stroke:#18b8ad;stroke-width:2}.botEventsList{max-height:340px;overflow:auto}.botEventsList>div{display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid #29404d}.botEventsList i{width:8px;height:8px;border-radius:50%;margin-top:5px;flex:0 0 auto}.eventPositive{background:#26c7b4}.eventNegative{background:#ff6b7d}.eventNeutral{background:#6a8da1}.botEventsList span{display:flex;flex-direction:column;gap:3px}.botEventsList strong{color:#afc4cf;font-size:12px}.botEventsList small{color:#6f8d9e;font-size:10px}.botEventsList p{padding:24px;text-align:center;color:#748f9f}.dcaBotStatsTableCard{margin-top:18px}.dcaBotStatsTableCard>.cardHeader{display:flex;justify-content:space-between;align-items:center}.dcaBotStatsTableCard>.cardHeader>div{display:flex;gap:8px}.dcaBotStatsTableCard>.cardHeader button{background:#203441;border:1px solid #36505f;color:#9fb5c1;border-radius:4px;padding:6px 9px;cursor:pointer}.dcaBotMissing{padding:40px;text-align:center;color:#8ba4b2}
@media(max-width:1050px){.dcaBotDetailGrid{grid-template-columns:1fr}.dcaBotSideColumn{position:static}.botInfoRows>div{grid-template-columns:1fr}.dcaBotDetailPage{padding:16px}.dcaBotActions{gap:6px}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Added clickable DCA bot detail pages with Start/Stop/Edit/Delete/Copy, stats, events, export and deep-link routing.");
