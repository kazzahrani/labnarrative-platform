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

async function invokeTrade(accountMode: Props["accountMode"], body: Record<string, unknown>) {
  const functionName = accountMode === "live" ? "trader-live-trade-control" : "trader-trade-control";
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

async function loadExactTrade(accountId: string, tradeId: string) {
  const { data, error } = await browserSupabase.functions.invoke("trader-chart-control", { body: { accountId, tradeId } });
  if (error) throw error;
  const result = (data ?? {}) as { ok?: boolean; trade?: ExactTrade; error?: string };
  if (result.error || result.ok !== true || !result.trade) throw new Error(result.error || "trade_snapshot_failed");
  return result.trade;
}

function errorText(message: string) {
  if (message.includes("insufficient_available_balance")) return "Not enough available account balance for that amount.";
  if (message.includes("insufficient_usdt:")) return "Not enough free USDT on Binance for that amount.";
  if (message.includes("live_order_limit_exceeded:")) return `This exceeds the Real Account per-order live limit ($${message.split(":")[1]}).`;
  if (message.includes("live_capital_limit_exceeded:")) return `This exceeds the Real Account total live-capital limit ($${message.split(":")[1]}).`;
  if (message.includes("live_trading_not_enabled")) return "Real live execution is currently locked.";
  if (message.includes("trade_not_active")) return "This trade is no longer active.";
  if (message.includes("trade_price_unavailable")) return "A current trade price is not available yet.";
  if (message.includes("live_exit_below_exchange_minimum")) return "The remaining Binance position is below the exchange minimum order size.";
  if (message.includes("binance_")) return `Binance rejected the action: ${message}`;
  return message;
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
  const [stopEnabled, setStopEnabled] = useState(trade.stopEnabled);
  const [stopPct, setStopPct] = useState(trade.stopPct || 8);
  const [stopLossTimeoutSeconds, setStopLossTimeoutSeconds] = useState(0);

  if (trade.status !== "Active") return null;

  const openEdit = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setMaxAveraging(trade.maxAveraging);
    setActiveOrdersLimit(trade.activeOrdersLimit);
    setTakeProfitPct(trade.takeProfitPct);
    setTpTargets([]);
    setStopEnabled(trade.stopEnabled);
    setStopPct(trade.stopPct || 8);
    setStopLossTimeoutSeconds(0);
    setError("");
    setMode("edit");
    if (accountMode !== "live") return;
    setBusy(true);
    try {
      const exact = await loadExactTrade(accountId, trade.id);
      setTakeProfitPct(Number(exact.takeProfitPct ?? trade.takeProfitPct));
      setTpTargets(Array.isArray(exact.takeProfitTargets) ? exact.takeProfitTargets : []);
      setStopEnabled(Boolean(exact.stopEnabled));
      setStopPct(Number(exact.stopPct ?? trade.stopPct ?? 8));
      setStopLossTimeoutSeconds(Number(exact.stopLossTimeoutSeconds ?? 0));
    } catch (caught) {
      setError(errorText(caught instanceof Error ? caught.message : "Unable to load live trade settings."));
    } finally { setBusy(false); }
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
    if (busy) return;
    setBusy(true); setError("");
    try {
      await invokeTrade(accountMode, { action: "update_trade", accountId, tradeId: trade.id, maxAveraging, activeOrdersLimit, takeProfitPct, stopEnabled, stopPct });
      setMode(null);
      await onChanged();
    } catch (caught) { setError(errorText(caught instanceof Error ? caught.message : "Unable to edit trade.")); }
    finally { setBusy(false); }
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
            <label><span>Max DCA orders</span><input type="number" min={trade.averagingFilled} max="100" value={maxAveraging} onChange={(event) => setMaxAveraging(Math.max(trade.averagingFilled, Number(event.target.value)))}/></label>
            <label><span>Active DCA orders</span><input type="number" min="0" max={Math.max(0,maxAveraging-trade.averagingFilled)} value={activeOrdersLimit} onChange={(event) => setActiveOrdersLimit(Math.max(0, Number(event.target.value)))}/></label>
            {tpTargets.length <= 1 && <label><span>Take profit</span><div className={styles.unit}><input type="number" min="0" step="0.1" value={takeProfitPct} onChange={(event) => setTakeProfitPct(Math.max(0,Number(event.target.value)))}/><b>%</b></div></label>}
            <label><span>Stop loss</span><select value={stopEnabled ? "On" : "Off"} onChange={(event) => setStopEnabled(event.target.value === "On")}><option>Off</option><option>On</option></select></label>
            {stopEnabled && <label><span>Stop loss distance</span><div className={styles.unit}><input type="number" min="0.1" step="0.1" value={stopPct} onChange={(event) => setStopPct(Math.max(.1,Number(event.target.value)))}/><b>%</b></div></label>}
          </div>
          {accountMode === "live" && tpTargets.length > 1 && <p>Multi-TP is preserved: {tpTargets.map((target, index) => `T${index + 1} ${target.profitPct}% (${target.allocationPct}%)`).join(" · ")}</p>}
          {accountMode === "live" && stopLossTimeoutSeconds > 0 && <p>Stop-loss timeout remains {stopLossTimeoutSeconds}s.</p>}
          <p>{accountMode === "live" ? "Saving reconciles the active DCA orders on Binance and updates this trade's stop settings. Existing multi-TP targets and completed fills are preserved." : "Saving reconciles the active paper/shadow DCA and exit settings. Completed DCA fills are preserved."}</p>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.footer}><button type="button" onClick={() => setMode(null)}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Save trade"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
