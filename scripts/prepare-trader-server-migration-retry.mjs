import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (source.includes("TRADER_SERVER_MIGRATION_RETRY_V1")) {
  console.log("Trader server migration retry already prepared.");
  process.exit(0);
}
if (!source.includes("TRADER_SUPABASE_EDGE_API_V3")) throw new Error("Migration retry requires Supabase Edge API V3.");
if (!source.includes("traderBrowserBootstrapSnapshot")) throw new Error("Migration retry recovery helper missing.");

const snapshotAnchor = [
  '    const bots = Array.isArray(snapshot.bots) ? snapshot.bots : [];',
  '    const trades = Array.isArray(snapshot.trades) ? snapshot.trades : [];',
  '    serverApplyingRef.current = true;',
].join("\n");
if (!source.includes(snapshotAnchor)) throw new Error("Migration retry snapshot anchor missing.");
source = source.replace(snapshotAnchor, [
  '    const bots = Array.isArray(snapshot.bots) ? snapshot.bots : [];',
  '    const trades = Array.isArray(snapshot.trades) ? snapshot.trades : [];',
  '    // TRADER_SERVER_MIGRATION_RETRY_V1 — never let an empty durable snapshot erase a verified browser backup.',
  '    const migrationRecovery = traderBrowserBootstrapSnapshot();',
  '    if (!bots.length && !trades.length && (migrationRecovery.bots.length > 0 || migrationRecovery.trades.length > 0 || migrationRecovery.hasPersistenceHistory)) {',
  '      setServerOpenOrders(Array.isArray(snapshot.orders) ? snapshot.orders : []);',
  '      setServerAccountState(snapshot.account ?? null);',
  '      setServerEngineReady(true);',
  '      return;',
  '    }',
  '    serverApplyingRef.current = true;',
].join("\n"));

const returnAnchor = '  return <main className={styles.appShell}>';
const returnIndex = source.lastIndexOf(returnAnchor);
if (returnIndex < 0) throw new Error("Migration retry component return anchor missing.");
const retryEffect = String.raw`
  const traderMigrationRecoveryBusyRef = useRef(false);
  useEffect(() => {
    if (!serverEngineReady) return;
    let cancelled = false;
    let attempts = 0;
    const recoverDurableMigration = async () => {
      if (cancelled || traderMigrationRecoveryBusyRef.current) return;
      const migration = traderBrowserBootstrapSnapshot();
      if (!migration.bots.length && !migration.trades.length) return;
      traderMigrationRecoveryBusyRef.current = true;
      attempts += 1;
      try {
        const stateResponse = await traderEdgeRequest({ action: "state" });
        const stateSnapshot = await stateResponse.json().catch(() => ({}));
        const durableBots = Array.isArray(stateSnapshot?.bots) ? stateSnapshot.bots : [];
        const durableTrades = Array.isArray(stateSnapshot?.trades) ? stateSnapshot.trades : [];
        const durableBotIds = new Set(durableBots.map((bot: DcaBot) => bot.id));
        const durableTradeIds = new Set(durableTrades.map((trade: DcaTrade) => trade.id));
        const missingBot = migration.bots.some((bot) => !durableBotIds.has(bot.id));
        const missingTrade = migration.trades.some((trade) => !durableTradeIds.has(trade.id));
        if (!missingBot && !missingTrade) {
          if (!cancelled && stateResponse.ok) applyTraderServerSnapshot(stateSnapshot);
          return;
        }
        void fetch("/api/trader/audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ event: "durable_migration_retry", at: new Date().toISOString(), attempt: attempts, botCount: migration.bots.length, tradeCount: migration.trades.length, botSource: migration.botSource, tradeSource: migration.tradeSource, durableBotCount: durableBots.length, durableTradeCount: durableTrades.length }),
        }).catch(() => undefined);
        const response = await traderEdgeRequest({ action: "bootstrap", bots: migration.bots, trades: migration.trades, confirmedEmpty: false });
        const snapshot = await response.json().catch(() => ({}));
        if (!response.ok) {
          setNotice(snapshot?.error ?? "Durable DCA recovery import failed; retrying automatically.");
          return;
        }
        const importedBots = Array.isArray(snapshot?.bots) ? snapshot.bots : [];
        const importedTrades = Array.isArray(snapshot?.trades) ? snapshot.trades : [];
        const importedBotIds = new Set(importedBots.map((bot: DcaBot) => bot.id));
        const importedTradeIds = new Set(importedTrades.map((trade: DcaTrade) => trade.id));
        const verified = migration.bots.every((bot) => importedBotIds.has(bot.id)) && migration.trades.every((trade) => importedTradeIds.has(trade.id));
        if (!verified) {
          setNotice("Durable DCA recovery is incomplete; local backup remains protected and retry will continue.");
          return;
        }
        if (!cancelled) {
          applyTraderServerSnapshot(snapshot);
          setNotice("Durable DCA migration verified. Supabase is now the trading source of truth.");
          void fetch("/api/trader/audit", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ event: "durable_migration_verified", at: new Date().toISOString(), botCount: importedBots.length, tradeCount: importedTrades.length }) }).catch(() => undefined);
        }
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Durable DCA recovery retry failed.");
      } finally {
        traderMigrationRecoveryBusyRef.current = false;
      }
    };
    void recoverDurableMigration();
    const timer = window.setInterval(() => { if (attempts < 20) void recoverDurableMigration(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [serverEngineReady]);

`;
source = source.slice(0, returnIndex) + retryEffect + source.slice(returnIndex);

for (const token of [
  "TRADER_SERVER_MIGRATION_RETRY_V1",
  "migrationRecovery.hasPersistenceHistory",
  "durable_migration_retry",
  "durable_migration_verified",
  "Durable DCA migration verified",
  "traderMigrationRecoveryBusyRef",
]) {
  if (!source.includes(token)) throw new Error(`Migration retry guard missing: ${token}`);
}

fs.writeFileSync(traderPath, source);
console.log("Prepared automatic durable DCA recovery retry with empty-snapshot protection.");
