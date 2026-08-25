import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (source.includes("TRADER_SERVER_ENGINE_V1")) {
  console.log("Trader server engine V1 already prepared.");
  process.exit(0);
}

// Hooks used by the server cutover.
source = source.replace(
  'import { useEffect, useMemo, useState } from "react";',
  'import { useEffect, useMemo, useRef, useState } from "react";'
);
if (!source.includes("useRef")) throw new Error("Server engine: useRef import is unavailable.");

// A hard switch: browser automation is no longer an execution authority.
const demoAnchor = "const DEMO_BALANCE = 100000;";
if (!source.includes(demoAnchor)) throw new Error("Server engine: demo balance anchor missing.");
source = source.replace(demoAnchor, demoAnchor + '\n// TRADER_SERVER_ENGINE_V1 — the browser is UI only; DCA execution lives in Supabase.\nconst SERVER_DCA_EXECUTION = true;');

// Server state lives beside the existing DCA React state so all later account calculations can use it.
const tradeStateMatch = source.match(/^(\s*const \[dcaTrades, setDcaTrades\][^\n]*\n)/m);
if (!tradeStateMatch) throw new Error("Server engine: dcaTrades state anchor missing.");
const serverState = String.raw`  const [serverEngineReady, setServerEngineReady] = useState(false);
  const [serverOpenOrders, setServerOpenOrders] = useState<Array<{ id: string; tradeId?: string | null; botId?: string | null; pair: string; kind: string; side: string; orderType: string; status: string; sequence?: number | null; price?: number | null; amount: number; quantity: number; reserved: number }>>([]);
  const [serverAccountState, setServerAccountState] = useState<{ startingBalance: number; invested: number; reserved: number; available: number; realizedPnl: number; unrealizedPnl: number; equity: number; lastWorkerAt?: string | null } | null>(null);
  const serverApplyingRef = useRef(false);
  const serverCommandInFlightRef = useRef(false);
  const serverBotSignatureRef = useRef("");
  const serverTradeBaselineRef = useRef<Map<string, DcaTrade>>(new Map());
  const serverDcaBotsRef = useRef<DcaBot[]>([]);
  const serverDcaTradesRef = useRef<DcaTrade[]>([]);
`;
source = source.replace(tradeStateMatch[0], tradeStateMatch[0] + serverState);

// The pending-order ledger must now be the real server order rows. This keeps chart,
// Active averaging, Reserved and executable orders on one source of truth.
const pendingLedger = '  const dcaPaperPendingAveragingOrders = activeDcaTrades.flatMap((trade) => dcaPaperPendingAveragingOrdersForTrade(trade));';
if (!source.includes(pendingLedger)) throw new Error("Server engine: pending DCA ledger anchor missing.");
source = source.replace(pendingLedger, String.raw`  const dcaPaperPendingAveragingOrders = serverEngineReady
    ? serverOpenOrders.filter((order) => order.kind === "averaging" && order.side === "BUY" && (order.status === "OPEN" || order.status === "PENDING")).map((order) => ({
        id: order.id,
        tradeId: order.id.includes(":dca:") ? order.id.split(":dca:")[0] : String(order.tradeId ?? ""),
        botId: String(order.botId ?? "server"),
        pair: order.pair,
        index: Number(order.sequence ?? 0),
        price: Number(order.price ?? 0),
        amount: Number(order.amount ?? order.reserved ?? 0),
        quantity: Number(order.quantity ?? 0),
        status: "Pending" as const,
      }))
    : activeDcaTrades.flatMap((trade) => dcaPaperPendingAveragingOrdersForTrade(trade));`);

const pendingEntryAnchor = '  const dcaPendingEntryReserved = dcaBots.reduce((sum, bot) => {';
if (!source.includes(pendingEntryAnchor)) throw new Error("Server engine: pending entry reserve anchor missing.");
source = source.replace(pendingEntryAnchor, '  const dcaPendingEntryReserved = serverEngineReady ? serverOpenOrders.filter((order) => order.kind === "base" && order.side === "BUY" && (order.status === "OPEN" || order.status === "PENDING")).reduce((sum, order) => sum + Number(order.reserved || 0), 0) : dcaBots.reduce((sum, bot) => {');

// Account totals displayed and used for UI validation must agree with the server ledger.
source = source.replace(
  '  const paperCapital = activeSmart.reduce((sum, trade) => sum + trade.amount, 0) + dcaFundsLocked;',
  '  const paperCapital = serverEngineReady && serverAccountState ? serverAccountState.invested + serverAccountState.reserved : activeSmart.reduce((sum, trade) => sum + trade.amount, 0) + dcaFundsLocked;'
);
source = source.replace(
  '  const paperRealizedPnl = dcaRealized;\n  const paperUnrealizedPnl = smartUnrealized + activeDcaUnrealized;\n  const accountValue = DEMO_BALANCE + paperRealizedPnl + paperUnrealizedPnl;\n  const dayChangePct = DEMO_BALANCE > 0 ? (paperRealizedPnl + paperUnrealizedPnl) / DEMO_BALANCE * 100 : 0;\n  const freeCapital = Math.max(0, DEMO_BALANCE + paperRealizedPnl - paperCapital);',
  '  const paperRealizedPnl = serverEngineReady && serverAccountState ? serverAccountState.realizedPnl : dcaRealized;\n  const paperUnrealizedPnl = serverEngineReady && serverAccountState ? serverAccountState.unrealizedPnl : smartUnrealized + activeDcaUnrealized;\n  const accountValue = serverEngineReady && serverAccountState ? serverAccountState.equity : DEMO_BALANCE + paperRealizedPnl + paperUnrealizedPnl;\n  const dayChangePct = DEMO_BALANCE > 0 ? (paperRealizedPnl + paperUnrealizedPnl) / DEMO_BALANCE * 100 : 0;\n  const freeCapital = serverEngineReady && serverAccountState ? serverAccountState.available : Math.max(0, DEMO_BALANCE + paperRealizedPnl - paperCapital);'
);
if (!source.includes("serverAccountState ? serverAccountState.equity")) throw new Error("Server engine: account ledger was not cut over.");

// Disable every browser execution path while retaining live market data for display.
const scannerStart = source.indexOf('    const evaluateBots = async () => {');
if (scannerStart < 0) throw new Error("Server engine: browser scanner missing.");
const scannerGuard = source.indexOf('if (busy || cancelled) return;', scannerStart);
if (scannerGuard < 0 || scannerGuard > scannerStart + 400) throw new Error("Server engine: scanner guard missing.");
source = source.slice(0, scannerGuard) + source.slice(scannerGuard).replace('if (busy || cancelled) return;', 'if (SERVER_DCA_EXECUTION || busy || cancelled) return;');

const managerStart = source.indexOf('    const manageTrades = async () => {');
if (managerStart >= 0) {
  const managerGuard = source.indexOf('if (busy || cancelled) return;', managerStart);
  if (managerGuard < 0 || managerGuard > managerStart + 400) throw new Error("Server engine: manager guard missing.");
  source = source.slice(0, managerGuard) + source.slice(managerGuard).replace('if (busy || cancelled) return;', 'if (SERVER_DCA_EXECUTION || busy || cancelled) return;');
}

source = source.replace(
  '  useEffect(() => {\n    if (!markets.length) return;\n    const prices = new Map(markets.filter((market) => market.price != null',
  '  useEffect(() => {\n    if (SERVER_DCA_EXECUTION || !markets.length) return;\n    const prices = new Map(markets.filter((market) => market.price != null'
);
source = source.replace(
  'if (rawExitPrice && Number.isFinite(rawExitPrice) && rawExitPrice > 0) {',
  'if (!SERVER_DCA_EXECUTION && rawExitPrice && Number.isFinite(rawExitPrice) && rawExitPrice > 0) {'
);
source = source.replace(
  'return refreshedPrice ? enforceDcaExitAtPrice(trade, dcaBots.find((candidate) => candidate.id === trade.botId), refreshedPrice) : trade;',
  'return refreshedPrice ? { ...trade, lastPrice: refreshedPrice } : trade;'
);

// Install the server hydration/poll/sync bridge just before the component return.
const returnAnchor = '  return <main className={styles.appShell}>';
const returnIndex = source.lastIndexOf(returnAnchor);
if (returnIndex < 0) throw new Error("Server engine: TradingAgent return anchor missing.");
const bridge = String.raw`
  // TRADER_SERVER_ENGINE_V1_BRIDGE
  useEffect(() => { serverDcaBotsRef.current = dcaBots; }, [dcaBots]);
  useEffect(() => { serverDcaTradesRef.current = dcaTrades; }, [dcaTrades]);

  const applyTraderServerSnapshot = (snapshot: { serverEngine?: boolean; bots?: DcaBot[]; trades?: DcaTrade[]; orders?: Array<{ id: string; tradeId?: string | null; botId?: string | null; pair: string; kind: string; side: string; orderType: string; status: string; sequence?: number | null; price?: number | null; amount: number; quantity: number; reserved: number }>; account?: { startingBalance: number; invested: number; reserved: number; available: number; realizedPnl: number; unrealizedPnl: number; equity: number; lastWorkerAt?: string | null } }) => {
    if (!snapshot?.serverEngine) return;
    const bots = Array.isArray(snapshot.bots) ? snapshot.bots : [];
    const trades = Array.isArray(snapshot.trades) ? snapshot.trades : [];
    serverApplyingRef.current = true;
    serverBotSignatureRef.current = JSON.stringify(bots);
    serverTradeBaselineRef.current = new Map(trades.map((trade) => [trade.id, trade]));
    serverDcaBotsRef.current = bots;
    serverDcaTradesRef.current = trades;
    setServerOpenOrders(Array.isArray(snapshot.orders) ? snapshot.orders : []);
    setServerAccountState(snapshot.account ?? null);
    setDcaBots(bots);
    setDcaTrades(trades);
    setServerEngineReady(true);
    window.setTimeout(() => { serverApplyingRef.current = false; }, 0);
  };

  const runTraderServerCommand = async (payload: Record<string, unknown>) => {
    if (serverCommandInFlightRef.current) return false;
    serverCommandInFlightRef.current = true;
    try {
      const response = await fetch("/api/trader/server/command", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(payload) });
      const snapshot = await response.json();
      if (!response.ok) { setNotice(snapshot?.error ?? "Server trading command failed."); return false; }
      applyTraderServerSnapshot(snapshot);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Server trading command failed.");
      return false;
    } finally {
      serverCommandInFlightRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/trader/server/state", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ bots: serverDcaBotsRef.current, trades: serverDcaTradesRef.current }) });
        const snapshot = await response.json();
        if (!cancelled && response.ok) applyTraderServerSnapshot(snapshot);
        else if (!cancelled) setNotice(snapshot?.error ?? "Unable to initialize durable trading engine.");
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Unable to initialize durable trading engine.");
      }
    }, 900);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!serverEngineReady) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/trader/server/state", { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = await response.json();
        if (!cancelled) applyTraderServerSnapshot(snapshot);
      } catch { /* next poll retries */ }
    };
    const timer = window.setInterval(() => { void poll(); }, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [serverEngineReady]);

  useEffect(() => {
    if (!serverEngineReady || serverApplyingRef.current) return;
    const signature = JSON.stringify(dcaBots);
    if (signature === serverBotSignatureRef.current) return;
    const timer = window.setTimeout(() => {
      if (serverApplyingRef.current) return;
      void runTraderServerCommand({ action: "sync_bots", bots: serverDcaBotsRef.current });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [dcaBots, serverEngineReady]);

  useEffect(() => {
    if (!serverEngineReady || serverApplyingRef.current || serverCommandInFlightRef.current) return;
    for (const trade of dcaTrades) {
      const baseline = serverTradeBaselineRef.current.get(trade.id);
      if (!baseline || baseline.status !== "Active") continue;
      if (trade.status === "Closed") {
        void runTraderServerCommand({ action: "manual_close", tradeId: trade.id });
        return;
      }
      if (trade.status !== "Active") continue;
      const added = Number(trade.invested) - Number(baseline.invested);
      if (added > 0.000001 && Number(trade.quantity) > Number(baseline.quantity)) {
        void runTraderServerCommand({ action: "add_funds", tradeId: trade.id, amount: added });
        return;
      }
      const patch = {
        maxAveraging: trade.maxAveraging,
        activeOrdersLimit: trade.activeOrdersLimit,
        takeProfitPct: trade.takeProfitPct,
        trailingEnabled: trade.trailingEnabled,
        trailingDeviationPct: trade.trailingDeviationPct,
        stopEnabled: trade.stopEnabledOverride,
        stopPct: trade.stopPctOverride,
        maxHoldEnabled: trade.maxHoldEnabled,
        maxHoldHours: trade.maxHoldHours,
      };
      const previous = {
        maxAveraging: baseline.maxAveraging,
        activeOrdersLimit: baseline.activeOrdersLimit,
        takeProfitPct: baseline.takeProfitPct,
        trailingEnabled: baseline.trailingEnabled,
        trailingDeviationPct: baseline.trailingDeviationPct,
        stopEnabled: baseline.stopEnabledOverride,
        stopPct: baseline.stopPctOverride,
        maxHoldEnabled: baseline.maxHoldEnabled,
        maxHoldHours: baseline.maxHoldHours,
      };
      if (JSON.stringify(patch) !== JSON.stringify(previous)) {
        void runTraderServerCommand({ action: "edit_trade", tradeId: trade.id, patch });
        return;
      }
    }
  }, [dcaTrades, serverEngineReady]);

`;
source = source.slice(0, returnIndex) + bridge + source.slice(returnIndex);

for (const token of [
  "TRADER_SERVER_ENGINE_V1",
  "SERVER_DCA_EXECUTION = true",
  "TRADER_SERVER_ENGINE_V1_BRIDGE",
  'fetch("/api/trader/server/state"',
  'action: "sync_bots"',
  'action: "manual_close"',
  'action: "add_funds"',
  'action: "edit_trade"',
  "serverAccountState ? serverAccountState.equity",
  'order.kind === "averaging"',
]) {
  if (!source.includes(token)) throw new Error(`Server engine guard missing: ${token}`);
}
if (!source.includes("if (SERVER_DCA_EXECUTION || busy || cancelled) return;")) throw new Error("Server engine did not disable browser scanner/manager.");
if (source.includes('if (rawExitPrice && Number.isFinite(rawExitPrice)')) throw new Error("Server engine left raw browser exit execution enabled.");

fs.writeFileSync(traderPath, source);
console.log("Cut DCA state/execution over to durable Supabase server engine; browser is now UI-only.");
