"use client";

import { FormEvent, MouseEvent, useState } from "react";
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
  return data;
}

async function invokeTrade(accountMode: Props["accountMode"], body: Record<string, unknown>) {
  return invokeFunction(accountMode === "live" ? "trader-live-trade-control" : "trader-trade-control", body);
}

async function invokeLivePositionEdit(body: Record<string, unknown>) {
  const { data: sessionData, error: sessionError } = await browserSupabase.auth.getSession();
  const token = sessionData.session?.access_token || "";
  if (sessionError || !token) throw new Error("unauthorized");

  let response: Response;
  try {
    response = await fetch("/api/trader/position-edit", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("position_edit_transport_failed");
  }

  const text = await response.text();
  let payload: { ok?: boolean; error?: string } = {};
  try { payload = text ? JSON.parse(text) as { ok?: boolean; error?: string } : {}; }
  catch { throw new Error("position_edit_invalid_response"); }

  if (!response.ok || payload.ok !== true) throw new Error(payload.error || `position_edit_http_${response.status}`);
  return payload;
}

function errorText(message: string) {
  if (message.includes("core_v2_position_id_unavailable")) return "This live position could not be matched to Core V2. No change was made.";
  if (message.includes("core_v2_positions_not_ready")) return "Core V2 positions are not ready yet. No change was made.";
  if (message.includes("core_v2_execute_disabled")) return "Core V2 position editing is temporarily locked.";
  if (message.includes("position_edit_timeout")) return "The exchange did not finish the edit in time. Refresh the position before trying again.";
  if (message.includes("position_edit_transport_failed") || message.includes("position_edit_invalid_response")) return "The edit could not be confirmed. Refresh the position before trying again.";
  if (message.includes("unauthorized")) return "Your session expired. Sign in again and retry.";
  if (message.includes("insufficient_available_balance")) return "Not enough available account balance for that amount.";
  if (message.includes("insufficient_usdt:")) return "Not enough free USDT on the connected exchange for that amount.";
  if (message.includes("live_order_limit_exceeded:")) return `This exceeds the Real Account per-order live limit ($${message.split(":")[1]}).`;
  if (message.includes("live_capital_limit_exceeded:")) return `This exceeds the Real Account total live-capital limit ($${message.split(":")[1]}).`;
  if (message.includes("live_trading_not_enabled")) return "Real live execution is currently locked.";
  if (message.includes("position_not_active") || message.includes("trade_not_active")) return "This position is no longer active.";
  if (message.includes("dca_order_below_exchange_minimum")) return "One of the requested DCA orders is below the exchange minimum.";
  if (message.includes("dca_cancel_pending")) return "A DCA cancellation is still pending at the exchange. Try again in a moment.";
  if (message.includes("dca_reconciliation_unavailable")) return "The current DCA orders could not be reconciled safely. No position settings were changed.";
  if (message.includes("account_busy")) return "The trading account is busy with another execution. Try again in a moment.";
  if (message.includes("invalid_stop_loss")) return "Stop-loss distance must be above 0 when Stop loss is On.";
  if (message.includes("exchange_connection_required")) return "The position's exchange connection is not ready for live trading.";
  if (message.includes("exchange_trade_permission_required")) return "Trading permission is required on the connected exchange.";
  if (message.includes("binance_") || message.includes("bybit_") || message.includes("okx_") || message.includes("kucoin_")) return `The exchange rejected the action: ${message}`;
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
  const [stopEnabled, setStopEnabled] = useState(trade.stopEnabled);
  const [stopPct, setStopPct] = useState(trade.stopPct || 8);

  if (trade.status !== "Active") return null;

  const completedDca = Math.max(0, Math.round(Number(trade.averagingFilled) || 0));
  const remainingDcaSlots = Math.max(0, maxAveraging - completedDca);

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

  const openEdit = (event: MouseEvent) => {
    event.stopPropagation();
    if (busy) return;
    setError("");
    setMaxAveraging(trade.maxAveraging);
    setActiveOrdersLimit(Math.min(trade.activeOrdersLimit, Math.max(0, trade.maxAveraging - completedDca)));
    setTakeProfitPct(trade.takeProfitPct);
    setStopEnabled(trade.stopEnabled);
    setStopPct(trade.stopPct || 8);
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
    if (busy || (stopEnabled && !(stopPct > 0))) return;
    setBusy(true); setError("");
    try {
      if (accountMode === "live") {
        await invokeLivePositionEdit({
          tradeId: trade.id,
          maxAveraging,
          activeOrdersLimit,
          takeProfitPct: Math.max(0, Number(takeProfitPct) || 0),
          stopEnabled,
          stopPct: Math.max(0, Number(stopPct) || 0),
        });
      } else {
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
      }
      await onChanged();
      setMode(null);
    } catch (caught) {
      setError(errorText(caught instanceof Error ? caught.message : "Unable to edit trade."));
      await onChanged();
    } finally { setBusy(false); }
  };

  const close = async (event: MouseEvent) => {
    event.stopPropagation();
    const question = accountMode === "live"
      ? `Close ${trade.pair} now? This sends a real MARKET SELL on the position's connected exchange for the remaining position.`
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
          <p>{accountMode === "live" ? "This sends a real Spot MARKET buy on the position's connected exchange and recalculates the trade average from the actual fill." : "The paper/shadow engine will add this amount at the latest worker price and recalculate the average entry."}</p>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.footer}><button type="button" onClick={() => setMode(null)}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Adding…" : "Add funds"}</button></div>
        </form> : <form onSubmit={submitEdit} className={styles.form}>
          <div className={styles.grid}>
            <label><span>Max DCA orders</span><input type="number" min={completedDca} max="100" value={maxAveraging} onChange={(event) => changeMaxAveraging(Number(event.target.value))}/></label>
            <label><span>Active DCA orders</span><input type="number" min="0" max={100 - completedDca} value={activeOrdersLimit} onChange={(event) => changeActiveOrders(Number(event.target.value))}/></label>
            <label><span>Take profit</span><div className={styles.unit}><input type="number" min="0" step="0.1" value={takeProfitPct} onChange={(event) => setTakeProfitPct(Math.max(0, Number(event.target.value)))}/><b>%</b></div></label>
            <label><span>Stop loss</span><select value={stopEnabled ? "On" : "Off"} onChange={(event) => setStopEnabled(event.target.value === "On")}><option>Off</option><option>On</option></select></label>
            {stopEnabled && <label><span>Stop loss distance</span><div className={styles.unit}><input type="number" min="0.1" step="0.1" value={stopPct} onChange={(event) => setStopPct(Math.max(.1, Number(event.target.value)))}/><b>%</b></div></label>}
          </div>
          <p className={styles.dcaHint}>Completed DCA: <b>{completedDca}</b> · Remaining slots: <b>{remainingDcaSlots}</b> · Active now: <b>{activeOrdersLimit}</b>. Increasing Active DCA automatically increases Max DCA when needed.</p>
          <p>{accountMode === "live" ? "Saving applies these settings through Core V2. Completed DCA fills are preserved." : "Saving reconciles the active paper/shadow DCA and exit settings. Completed DCA fills are preserved."}</p>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.footer}><button type="button" onClick={() => setMode(null)}>Cancel</button><button className={styles.primary} disabled={busy || (stopEnabled && !(stopPct > 0))}>{busy ? "Saving…" : "Save trade"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
