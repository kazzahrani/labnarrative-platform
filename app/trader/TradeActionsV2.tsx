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

async function invokeTrade(body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke("trader-trade-control", { body });
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

function errorText(message: string) {
  if (message.includes("insufficient_available_balance")) return "Not enough available account balance for that amount.";
  if (message.includes("manual_live_trade_action_unavailable")) return "Manual trade actions are not enabled for true Live execution yet.";
  if (message.includes("trade_not_active")) return "This trade is no longer active.";
  if (message.includes("trade_price_unavailable")) return "A current trade price is not available yet.";
  return message;
}

export default function TradeActionsV2({ accountId, accountMode, trade, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(25);
  const [maxAveraging, setMaxAveraging] = useState(trade.maxAveraging);
  const [activeOrdersLimit, setActiveOrdersLimit] = useState(trade.activeOrdersLimit);
  const [takeProfitPct, setTakeProfitPct] = useState(trade.takeProfitPct);
  const [stopEnabled, setStopEnabled] = useState(trade.stopEnabled);
  const [stopPct, setStopPct] = useState(trade.stopPct || 8);

  if (trade.status !== "Active") return null;

  const openEdit = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMaxAveraging(trade.maxAveraging);
    setActiveOrdersLimit(trade.activeOrdersLimit);
    setTakeProfitPct(trade.takeProfitPct);
    setStopEnabled(trade.stopEnabled);
    setStopPct(trade.stopPct || 8);
    setError("");
    setMode("edit");
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!(amount > 0) || busy) return;
    setBusy(true); setError("");
    try {
      await invokeTrade({ action: "add_funds", accountId, tradeId: trade.id, amount });
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
      await invokeTrade({ action: "update_trade", accountId, tradeId: trade.id, maxAveraging, activeOrdersLimit, takeProfitPct, stopEnabled, stopPct });
      setMode(null);
      await onChanged();
    } catch (caught) { setError(errorText(caught instanceof Error ? caught.message : "Unable to edit trade.")); }
    finally { setBusy(false); }
  };

  const close = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (busy || !window.confirm(`Close ${trade.pair} at the current worker price?`)) return;
    setBusy(true); setError("");
    try {
      await invokeTrade({ action: "close_trade", accountId, tradeId: trade.id });
      await onChanged();
    } catch (caught) { window.alert(errorText(caught instanceof Error ? caught.message : "Unable to close trade.")); }
    finally { setBusy(false); }
  };

  return <>
    <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
      <button disabled={busy || accountMode === "live"} onClick={(event) => { event.stopPropagation(); setError(""); setMode("add"); }}>Add funds</button>
      <button disabled={busy || accountMode === "live"} onClick={openEdit}>Edit trade</button>
      <button className={styles.closeTrade} disabled={busy || accountMode === "live"} onClick={close}>Close trade</button>
    </div>
    {mode && <div className={styles.backdrop} onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !busy) setMode(null); }}>
      <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.head}><div><small>{mode === "add" ? "ADD FUNDS" : "EDIT TRADE"}</small><h3>{trade.pair}</h3></div><button disabled={busy} onClick={() => setMode(null)}>×</button></div>
        {mode === "add" ? <form onSubmit={submitAdd} className={styles.form}>
          <label><span>Amount</span><div className={styles.unit}><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))}/><b>USDT</b></div></label>
          <p>The paper/shadow engine will add this amount at the latest worker price and recalculate the average entry.</p>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.footer}><button type="button" onClick={() => setMode(null)}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Adding…" : "Add funds"}</button></div>
        </form> : <form onSubmit={submitEdit} className={styles.form}>
          <div className={styles.grid}>
            <label><span>Max DCA orders</span><input type="number" min={trade.averagingFilled} max="100" value={maxAveraging} onChange={(event) => setMaxAveraging(Math.max(trade.averagingFilled, Number(event.target.value)))}/></label>
            <label><span>Active DCA orders</span><input type="number" min="0" max={Math.max(0,maxAveraging-trade.averagingFilled)} value={activeOrdersLimit} onChange={(event) => setActiveOrdersLimit(Math.max(0, Number(event.target.value)))}/></label>
            <label><span>Take profit</span><div className={styles.unit}><input type="number" min="0" step="0.1" value={takeProfitPct} onChange={(event) => setTakeProfitPct(Math.max(0,Number(event.target.value)))}/><b>%</b></div></label>
            <label><span>Stop loss</span><select value={stopEnabled ? "On" : "Off"} onChange={(event) => setStopEnabled(event.target.value === "On")}><option>Off</option><option>On</option></select></label>
            {stopEnabled && <label><span>Stop loss distance</span><div className={styles.unit}><input type="number" min="0.1" step="0.1" value={stopPct} onChange={(event) => setStopPct(Math.max(.1,Number(event.target.value)))}/><b>%</b></div></label>}
          </div>
          <p>Saving replaces the active shadow/paper DCA and exit orders using the new trade-level settings. Completed DCA fills are preserved.</p>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.footer}><button type="button" onClick={() => setMode(null)}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Save trade"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
