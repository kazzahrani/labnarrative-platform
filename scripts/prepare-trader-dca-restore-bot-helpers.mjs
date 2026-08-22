import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// The Add Funds transform runs late in the generated trader pipeline. Preserve/restore
// the bot-detail helpers if an older generated add-funds block replacement removed them.
if (!source.includes('  const openDcaBot = (botId: string) => {')) {
  const anchor = '  const handleGlobalSearch = (value: string) => {';
  const helpers = `  const conditionSummary = (condition: NonNullable<DcaBot["conditions"]>[number]) => {
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
    if (!bot || !window.confirm(\`Delete "\${bot.name}"? Active paper trades from this bot will be closed at their latest market mark.\`)) return;
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
  if (!source.includes(anchor)) throw new Error("Could not locate global search anchor for DCA bot helper restoration.");
  source = source.replace(anchor, helpers + anchor);
}

if (!source.includes('const openDcaBot =')) throw new Error('DCA bot helper restoration failed.');
if (!source.includes('const createConfiguredDcaBot =')) throw new Error('Configured DCA bot creator restoration failed.');

fs.writeFileSync(traderPath, source);
console.log("Verified/restored DCA bot detail helpers after Add Funds transform.");
