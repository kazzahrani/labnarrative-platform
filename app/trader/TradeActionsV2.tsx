"use client";

import { FormEvent, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trade-actions-v2.module.css";

type Trade = {
  id: string;
  pair: string;
  status: "Active" | "Closed";
  averagingFilled: number;
  maxAveraging: number;
  activeOrdersLimit: number;
  takeProfitPct: number;
  stopEnabled: boolean;
  stopPct: number;
  lastPrice: number | null;
};

type Props = {
  accountId: string;
  accountMode: "paper" | "shadow" | "live";
  trade: Trade;
  onChanged: () => Promise<void> | void;
};

type Mode = "add" | "edit" | null;
type TpTarget = { profitPct: number; allocationPct: number };
type ExactTrade = {
  takeProfitPct?: number;
  takeProfitTargets?: TpTarget[];
  stopEnabled?: boolean;
  stopPct?: number;
  stopLossTimeoutSeconds?: number;
};
type CoreV2Position = {
  trade_id?: string;
  client_id?: string | null;
};
type CoreV2PositionsResponse = {
  ok?: boolean;
  ready?: boolean;
  positions?: CoreV2Position[];
  error?: string;
};

async function invokeFunction(functionName: string, body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke(functionName, { body });
  if (error) {
    let message = error.message || "trader_trade_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (result.error || result.ok !== true) throw new Error(result.error || "trader_trade_control_failed");
}

async function invokeTrade(accountMode: Props["accountMode"], body: Record<string, unknown>) {
  return invokeFunction(accountMode === "live" ? "trader-live-trade-control" : "trader-trade-control", body);
}

async function loadExactTrade(accountId: string, tradeId: string) {
  const { data, error } = await browserSupabase.functions.invoke("trader-chart-control", { body: { accountId, tradeId } });
  if (error) throw error;
  const result = (data ?? {}) as { ok?: boolean; trade?: ExactTrade; error?: string };
  if (result.error || result.ok !== true || !result.trade) throw new Error(result.error || "trade_snapshot_failed");
  return result.trade;
}

async function resolveCoreV2TradeId(legacyTradeId: string) {
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-positions-read", { body: {} });
  if (error) {
    let message = error.message || "core_v2_position_lookup_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as CoreV2PositionsResponse;
  if (result.error || result.ok !== true || result.ready !== true || !Array.isArray(result.positions)) {
    throw new Error(result.error || "core_v2_positions_not_ready");
  }
  const match = result.positions.find((position) =>
    String(position.client_id || "") === legacyTradeId || String(position.trade_id || "") === legacyTradeId
  );
  const canonicalTradeId = String(match?.trade_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(canonicalTradeId)) {
    throw new Error("core_v2_position_id_unavailable");
  }
  return canonicalTradeId;
}

function errorText(message: string) {
  if (message.includes("core_v2_position_id_unavailable")) return "This live position could not be matched to its Core V2 position ID. No change was made.";
  if (message.includes("core_v2_positions_not_ready")) return "Core V2 positions are not ready yet. No change was made.";
  if (message.includes("insufficient_available_balance")) return "Not enough available account balance for that amount.";
  if (message.includes("insufficient_usdt:")) return "Not enough free USDT on Binance for that amount.";
  if (message.includes("live_order_limit_exceeded:")) return `This exceeds the Real Account per-order live limit ($${message.split(":")[1]}).`;
  if (message.includes("live_capital_limit_exceeded:")) return `This exceeds the Real Account total live-capital limit ($${message.split(":")[1]}).`;
  if (message.includes("live_trading_not_enabled")) return "Real live execution is currently locked.";
  if (message.includes("trade_not_active")) return "This trade is no longer active.";
  if (message.includes("trade_price_unavailable")) return "A current trade price is not available yet.";
  if (message.includes("live_exit_below_exchange_minimum")) return "The remaining Binance position is below the exchange minimum order size.";
  if (message.includes("invalid_take_profit_targets")) return "Each TP needs a profit % above 0 and a sell allocation above 0.";
  if (message.includes("take_profit_allocation_must_equal_100")) return "TP sell allocations must total exactly 100%.";
  if (message.includes("too_many_take_profit_targets")) return "A trade can have up to 8 TP targets.";
  if (message.includes("binance_")) return `Binance rejected the action: ${message}`;
  return message;
}

function cleanTargets(targets: TpTarget[]) {
  return targets.map((target) => ({
    profitPct: Math.round(Math.max(0, Number(target.profitPct) || 0) * 10000) / 10000,
    allocationPct: Math.round(Math.max(0, Number(target.allocationPct) || 0) * 10000) / 10000,
  }));
}

function targetSignature(targets: TpTarget[]) {
  return JSON.stringify(cleanTargets(targets));
}

function equalAllocations(targets: TpTarget[]) {
  if (!targets.length) return targets;
  const base = Math.floor((100 / targets.length) * 100) / 100;
  let used = 0;
  return targets.map((target, index) => {
    const allocationPct = index === targets.length - 1 ? Math.round((100 - used) * 100) / 100 : base;
    used += allocationPct;
    return { ...target, allocationPct };
  });
}

export default function TradeActionsV2({ accountId, accountMode, trade, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(accountMode === "live" ? 10 : 25);
  const [maxAveraging, setMaxAveraging] = useState(trade.maxAveraging);
  const [activeOrdersLimit, setActiveOrdersLimit] = useState(trade.activeOrdersLimit);
  const [takeProfitPct, setTakeProfitPct] = useState(trade.takeProfitPct);
  const [tpTargets, setTpTargets] = useState<TpTarget[]>([]);
  const [originalTpTargets, setOriginalTpTargets] = useState<TpTarget[]>([]);
  const [stopEnabled, setStopEnabled] = useState(trade.stopEnabled);
  const [stopPct, setStopPct] = useState(trade.stopPct || 8);
  const [stopLossTimeoutSeconds, setStopLossTimeoutSeconds] = useState(0);

  if (trade.status !== "Active") return null;

  const completedDca = Math.max(0, Math.round(Number(trade.averagingFilled) || 0));
  const remainingDcaSlots = Math.max(0, maxAveraging - completedDca);
  const tpAllocation = tpTargets.reduce((sum, target) => sum + (Number(target.allocationPct) || 0), 0);
  const tpRowsValid = tpTargets.every((target) => Number(target.profitPct) > 0 && Number(target.allocationPct) > 0);
  const tpAllocationValid = tpTargets.length === 0 || Math.abs(tpAllocation - 100) <= 0.011;
  const tpValid = accountMode !== "live" || (tpRowsValid && tpAllocationValid && tpTargets.length <= 8);
  const tpChanged = accountMode === "live" && targetSignature(tpTargets) !== targetSignature(originalTpTargets);

  const changeMaxAveraging = (raw: number) => {
    const next = Math.max(completedDca, Math.min(100, Math.round(Number(raw) || 0)));
    setMaxAveraging(next);
    setActiveOrdersLimit((current) => Math.min(Math.max(0, current), Math.max(0, next - completedDca)));
  };

  const changeActiveOrders = (raw: number) => {
    const next = Math.max(0, Math.min(100 - completedDca, Math.round(Number(raw) || 0)));
    setActiveOrdersLimit(next);
    setMaxAveraging((current) => Math.max(current, completedDca + next));
  };

  const updateTp = (index: number, key: keyof TpTarget, value: number) => {
    setTpTargets((current) => current.map((target, targetIndex) => targetIndex === index
      ? { ...target, [key]: Math.max(0, Number(value) || 0) }
      : target));
  };

  const addTp = () => {
    setTpTargets((current) => {
      if (current.length >= 8) return current;
      const lastProfit = current.length ? Number(current[current.length - 1].profitPct) || 0 : 0;
      return [...current, { profitPct: Math.round((lastProfit + 0.5) * 100) / 100, allocationPct: 0 }];
    });
  };

  const removeTp = (index: number) => setTpTargets((current) => current.filter((_, targetIndex) => targetIndex !== index));

  const openEdit = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setError("");
    if (accountMode === "live") {
      if (busy) return;
      setBusy(true);
      try {
        const canonicalTradeId = await resolveCoreV2TradeId(trade.id);
        window.dispatchEvent(new CustomEvent("labnarrative:edit-exit-plan", { detail: { tradeId: canonicalTradeId } }));
      } catch (caught) {
        window.alert(errorText(caught instanceof Error ? caught.message : "Unable to open Core V2 exit plan."));
      } finally {
        setBusy(false);
      }
      return;
    }

    setMaxAveraging(trade.maxAveraging);
    setActiveOrdersLimit(Math.min(trade.activeOrdersLimit, Math.max(0, trade.maxAveraging - completedDca)));
    setTakeProfitPct(trade.takeProfitPct);
    setTpTargets([]);
    setOriginalTpTargets([]);
    setStopEnabled(trade.stopEnabled);
    setStopPct(trade.stopPct || 8);
    setStopLossTimeoutSeconds(0);
    setMode("edit");
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!(amount > 0) || busy) return;
    setBusy(true); setError("");
    try {
      await invokeTrade(accountMode, { action: "add_funds", accountId, tradeId: trade.id, amount });
      setMode(null);
      await onChanged();
    } catch (caught) { setError(errorText(caught instanceof Error ? caught.message : "Unable to add funds.")); }
    finally { setBusy(false); }
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (accountMode === "live") {
      setError("Live TP/SL edits are handled by Core V2. Close this dialog and use Edit trade again.");
      return;
    }
    if (busy || !tpValid) return;
    setBusy(true); setError("");
    try {
      await invokeTrade(accountMode, {
        action: "update_trade",
        accountId,
        tradeId: trade.id,
        maxAveraging,
        activeOrdersLimit,
        takeProfitPct,
        stopEnabled,
        stopPct,
      });
      setMode(null);
      await onChanged();
    } catch (caught) {
      setError(errorText(caught instanceof Error ? caught.message : "Unable to edit trade."));
      await onChanged();
    } finally { setBusy(false); }
  };

  const close = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const question = accountMode === "live"
      ? `Close ${trade.pair} now? This sends a real MARKET SELL to Binance for the remaining position.`
      : `Close ${trade.pair} at the current worker price?`;
    if (busy || !window.confirm(question)) return;
    setBusy(true); setError("");
    try {
      await invokeTrade(accountMode, { action: "close_trade", accountId, tradeId: trade.id });
      await onChanged();
    } catch (caught) { window.alert(errorText(caught instanceof Error ? caught.message : "Unable to close trade.")); }
    finally { setBusy(false); }
  };

  return <>
    <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
      <button disabled={busy} onClick={(event) => { event.stopPropagation(); setError(""); setAmount(accountMode === "live" ? 10 : 25); setMode("add"); }}>Add funds</button>
      <button disabled={busy} onClick={openEdit}>Edit trade</button>
      <button className={styles.closeTrade} disabled={busy} onClick={close}>Close trade</button>
    </div>
    {mode && <div className={styles.backdrop} onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !busy) setMode(null); }}>
      <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.head}><div><small>{mode === "add" ? "ADD FUNDS" : "EDIT TRADE"}</small><h3>{trade.pair}</h3></div><button disabled={busy} onClick={() => setMode(null)}>×</button></div>
        {mode === "add" ? <form onSubmit={submitAdd} className={styles.form}>
          <label><span>Amount</span><div className={styles.unit}><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))}/><b>USDT</b></div></label>
          <p>{accountMode === "live" ? "This sends a real Binance Spot MARKET buy and recalculates the trade average from the actual fill." : "The paper/shadow engine will add this amount at the latest worker price and recalculate the average entry."}</p>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.footer}><button type="button" onClick={() => setMode(null)}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Adding…" : accountMode === "live" ? "Buy on Binance" : "Add funds"}</button></div>
        </form> : <form onSubmit={submitEdit} className={styles.form}>
          <div className={styles.grid}>
            <label><span>Max DCA orders</span><input type="number" min={completedDca} max="100" value={maxAveraging} onChange={(event) => changeMaxAveraging(Number(event.target.value))}/></label>
            <label><span>Active DCA orders</span><input type="number" min="0" max={100 - completedDca} value={activeOrdersLimit} onChange={(event) => changeActiveOrders(Number(event.target.value))}/></label>
            {accountMode !== "live" && <label><span>Take profit</span><div className={styles.unit}><input type="number" min="0" step="0.1" value={takeProfitPct} onChange={(event) => setTakeProfitPct(Math.max(0,Number(event.target.value)))}/><b>%</b></div></label>}
            <label><span>Stop loss</span><select value={stopEnabled ? "On" : "Off"} onChange={(event) => setStopEnabled(event.target.value === "On")}><option>Off</option><option>On</option></select></label>
            {stopEnabled && <label><span>Stop loss distance</span><div className={styles.unit}><input type="number" min="0.1" step="0.1" value={stopPct} onChange={(event) => setStopPct(Math.max(.1,Number(event.target.value)))}/><b>%</b></div></label>}
          </div>
          <p className={styles.dcaHint}>Completed DCA: <b>{completedDca}</b> · Remaining slots: <b>{remainingDcaSlots}</b> · Active now: <b>{activeOrdersLimit}</b>. Increasing Active DCA automatically increases Max DCA when needed.</p>

          {accountMode === "live" && <div className={styles.tpSection}>
            <div className={styles.tpHeader}>
              <div><strong>Take profits</strong><small>Profit is measured from the trade's current average. Sell % applies to the remaining position.</small></div>
              <div className={styles.tpHeaderActions}><button type="button" disabled={busy || tpTargets.length === 0} onClick={() => setTpTargets((current) => equalAllocations(current))}>Equal split</button><button type="button" disabled={busy || tpTargets.length >= 8} onClick={addTp}>+ Add TP</button></div>
            </div>
            {tpTargets.length === 0 ? <div className={styles.tpEmpty}>No TP targets — take profit is disabled for this trade.</div> : <div className={styles.tpList}>
              {tpTargets.map((target, index) => <div className={styles.tpRow} key={index}>
                <b>T{index + 1}</b>
                <label><span>Profit %</span><div className={styles.unit}><input type="number" min="0.01" step="0.01" value={target.profitPct} onChange={(event) => updateTp(index,"profitPct",Number(event.target.value))}/><b>%</b></div></label>
                <label><span>Sell %</span><div className={styles.unit}><input type="number" min="0.01" max="100" step="0.01" value={target.allocationPct} onChange={(event) => updateTp(index,"allocationPct",Number(event.target.value))}/><b>%</b></div></label>
                <button type="button" className={styles.removeTp} disabled={busy} onClick={() => removeTp(index)}>Remove</button>
              </div>)}
            </div>}
            <div className={`${styles.tpTotal} ${tpAllocationValid && tpRowsValid ? styles.tpOk : styles.tpBad}`}><span>Total sell allocation</span><b>{tpAllocation.toFixed(2)}%</b></div>
            {tpChanged && <small className={styles.tpNote}>Saving a changed TP plan replaces future targets for the remaining position. Any TP fills already executed remain in the permanent trade ledger and will not be repeated.</small>}
          </div>}

          {accountMode === "live" && stopLossTimeoutSeconds > 0 && <p>Stop-loss timeout remains {stopLossTimeoutSeconds}s.</p>}
          <p>{accountMode === "live" ? "Live TP/SL changes are submitted through the Core V2 guarded exit-plan control." : "Saving reconciles the active paper/shadow DCA and exit settings. Completed DCA fills are preserved."}</p>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.footer}><button type="button" onClick={() => setMode(null)}>Cancel</button><button className={styles.primary} disabled={busy || !tpValid}>{busy ? "Saving…" : "Save trade"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
