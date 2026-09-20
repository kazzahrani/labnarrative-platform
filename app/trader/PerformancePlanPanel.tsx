"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./performance-plan-panel.module.css";

type Eligibility = {
  totalUsd: number;
  eligible: boolean;
  minimumSpotBalanceUsd: number;
  connectedSpotExchanges: number;
  incomplete?: boolean;
};

type AccountingStatus = {
  ok?: boolean;
  canary?: boolean;
  effectiveMinimumSpotBalanceUsd?: number;
  configuredMinimumSpotBalanceUsd?: number;
  config?: {
    enabled?: boolean;
    minimumSpotBalanceUsd?: number;
    monthlyChargeCapUsd?: number;
  };
  period?: {
    id?: string;
    periodStart?: string;
    periodEnd?: string;
    status?: string;
    eligibilitySpotBalanceUsd?: number;
    netPnlQuote?: number | null;
    chargeUsd?: number | null;
    paidAt?: string | null;
  } | null;
};

type Estimate = {
  ok?: boolean;
  active?: boolean;
  netPnl?: number;
  estimatedFee?: number;
  cap?: number;
  period?: AccountingStatus["period"];
};

type SettlementStatus = {
  ok?: boolean;
  enabled?: boolean;
  canary?: boolean;
  providers?: { paypal?: boolean; nowpayments?: boolean };
  paypalClientId?: string;
  subscription?: {
    plan_key?: string;
    status?: string;
    billing_interval?: string;
    current_period_start?: string | null;
    current_period_end?: string | null;
  } | null;
  period?: AccountingStatus["period"];
  settlement?: {
    id?: string;
    amountUsd?: number;
    currency?: string;
    status?: string;
    paidProvider?: string | null;
    paidAt?: string | null;
  } | null;
  attempts?: Array<{
    id?: string;
    provider?: "paypal" | "nowpayments" | string;
    status?: string;
    externalId?: string | null;
    checkoutUrl?: string | null;
    createdAt?: string | null;
  }>;
};

declare global {
  interface Window { paypal?: any; }
}

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

const compactMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));

const date = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";

async function invoke(name: string, body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message || "request_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string; message?: string };
        message = payload.error || payload.message || message;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data || {}) as Record<string, any>;
  if (payload.ok !== true) throw new Error(String(payload.error || payload.message || "request_failed"));
  return payload;
}

function loadPayPal(clientId: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.paypal?.Buttons) return resolve();
    const id = "ln-performance-paypal-sdk";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("paypal_sdk_failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("paypal_sdk_failed"));
    document.head.appendChild(script);
  });
}

export default function PerformancePlanPanel() {
  const [accounting, setAccounting] = useState<AccountingStatus | null>(null);
  const [settlement, setSettlement] = useState<SettlementStatus | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const paypalRef = useRef<HTMLDivElement | null>(null);
  const paypalAttemptRef = useRef("");

  const refresh = useCallback(async () => {
    const [a, s] = await Promise.all([
      invoke("performance-accounting", { action: "status" }),
      invoke("performance-settlement", { action: "status" }),
    ]);
    setAccounting(a as AccountingStatus);
    setSettlement(s as SettlementStatus);

    const performanceSub = s.subscription?.plan_key === "performance";
    const periodOpen = s.period?.status === "open" || a.period?.status === "open";
    if (performanceSub && periodOpen) {
      try { setEstimate(await invoke("performance-accounting", { action: "estimate" }) as Estimate); }
      catch { setEstimate(null); }
    } else {
      setEstimate(null);
    }
  }, []);

  const checkEligibility = useCallback(async () => {
    setBusy("eligibility"); setError(""); setNotice("");
    try {
      const result = await invoke("performance-accounting", { action: "preview_eligibility" });
      setEligibility(result.eligibility as Eligibility);
      return result.eligibility as Eligibility;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Unable to check eligibility.");
      return null;
    } finally { setBusy(""); }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") setPreview(new URLSearchParams(window.location.search).get("performancePreview") === "1");
    void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Performance status unavailable."));
  }, [refresh]);

  useEffect(() => {
    const performanceSub = settlement?.subscription?.plan_key === "performance";
    const canary = Boolean(accounting?.canary || settlement?.canary);
    if (!performanceSub && !canary) return;
    const timer = window.setInterval(() => { void refresh(); }, settlement?.settlement?.status === "pending" ? 10000 : 30000);
    return () => window.clearInterval(timer);
  }, [refresh, accounting?.canary, settlement?.canary, settlement?.subscription?.plan_key, settlement?.settlement?.status]);

  const enabled = Boolean(accounting?.config?.enabled && settlement?.enabled);
  const canary = Boolean(accounting?.canary || settlement?.canary);
  const performanceSub = settlement?.subscription?.plan_key === "performance";
  const subscriptionStatus = settlement?.subscription?.status || "";
  const period = settlement?.period || accounting?.period || null;
  const performanceContext = performanceSub || Boolean(canary && period);
  const due = settlement?.settlement && ["due", "pending"].includes(String(settlement.settlement.status));
  const pendingAttempt = settlement?.attempts?.find((attempt) => ["created", "pending"].includes(String(attempt.status)));
  const pendingProvider = pendingAttempt?.provider || "";
  const paidWaitingResume = performanceContext && period?.status === "paid" && (canary || subscriptionStatus === "paused");
  const pausedForEligibility = performanceContext && !due && period?.status === "paid" && (canary || subscriptionStatus === "paused");
  const minimum = Number(accounting?.effectiveMinimumSpotBalanceUsd || accounting?.config?.minimumSpotBalanceUsd || 2500);
  const cap = Number(accounting?.config?.monthlyChargeCapUsd || 99);

  const enroll = async () => {
    setBusy("enroll"); setError(""); setNotice("");
    try {
      const result = await invoke("performance-accounting", { action: "enroll" });
      setEligibility(result.eligibility as Eligibility);
      setNotice("Performance started. This month's billing is now tied to eligible LabNarrative trading P&L.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Unable to start Performance."); }
    finally { setBusy(""); }
  };

  const resume = async () => {
    setBusy("resume"); setError(""); setNotice("");
    try {
      const result = await invoke("performance-accounting", { action: "resume" });
      setEligibility(result.eligibility as Eligibility);
      setNotice("Performance resumed for a new monthly period.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Unable to resume Performance."); }
    finally { setBusy(""); }
  };

  const cryptoPay = async () => {
    setBusy("crypto"); setError(""); setNotice("");
    try {
      const result = await invoke("performance-settlement", { action: "create_crypto_invoice" });
      const url = String(result.invoiceUrl || "");
      if (!url) throw new Error("crypto_invoice_unavailable");
      window.open(url, "_blank", "noopener,noreferrer");
      setNotice("Crypto checkout opened in a new tab. This page will update automatically after NOWPayments confirms the payment.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Unable to open crypto checkout."); }
    finally { setBusy(""); }
  };

  useEffect(() => {
    const clientId = settlement?.paypalClientId || "";
    const shouldRender = Boolean(due && (!pendingProvider || pendingProvider === "paypal") && settlement?.providers?.paypal && clientId && paypalRef.current);
    if (!shouldRender) {
      if (paypalRef.current) paypalRef.current.innerHTML = "";
      return;
    }

    let cancelled = false;
    let buttons: any;
    void (async () => {
      try {
        await loadPayPal(clientId);
        if (cancelled || !paypalRef.current || !window.paypal?.Buttons) return;
        paypalRef.current.innerHTML = "";
        buttons = window.paypal.Buttons({
          createOrder: async () => {
            setError(""); setNotice("");
            const result = await invoke("performance-settlement", { action: "create_paypal_order" });
            paypalAttemptRef.current = String(result.attemptId || "");
            const orderId = String(result.orderId || "");
            if (!orderId) throw new Error("paypal_order_unavailable");
            return orderId;
          },
          onApprove: async (data: { orderID?: string }) => {
            const orderId = String(data.orderID || "");
            const attemptId = paypalAttemptRef.current;
            if (!orderId || !attemptId) throw new Error("paypal_approval_missing");
            await invoke("performance-settlement", { action: "capture_paypal", orderId, attemptId });
            setNotice("Payment confirmed. Rechecking your Spot balance before the next Performance month.");
            await refresh();
          },
          onCancel: () => setNotice("PayPal checkout cancelled. No payment was recorded."),
          onError: (caught: unknown) => setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "PayPal payment failed."),
          style: { layout: "vertical", shape: "rect", height: 44, label: "pay" },
        });
        if (buttons?.isEligible?.()) await buttons.render(paypalRef.current);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "PayPal checkout unavailable.");
      }
    })();

    return () => {
      cancelled = true;
      try { buttons?.close?.(); } catch {}
      if (paypalRef.current) paypalRef.current.innerHTML = "";
    };
  }, [due, pendingProvider, settlement?.paypalClientId, settlement?.providers?.paypal, refresh]);

  const livePnl = estimate?.active ? Number(estimate.netPnl || 0) : Number(period?.netPnlQuote || 0);
  const liveFee = estimate?.active ? Number(estimate.estimatedFee || 0) : Number(period?.chargeUsd || settlement?.settlement?.amountUsd || 0);
  const balanceText = eligibility ? compactMoney(eligibility.totalUsd) : "Check balance";

  const stateText = useMemo(() => {
    if (!performanceContext) return enabled ? (canary ? "Founder canary" : "Available") : "Preview only";
    if (due) return "Payment due";
    if (subscriptionStatus === "paused") return "Paused";
    if (period?.status === "open") return "Active";
    if (period?.status === "paid") return "Settled";
    return subscriptionStatus || "Performance";
  }, [due, enabled, canary, performanceContext, period?.status, subscriptionStatus]);

  if (!enabled && !preview) return null;

  return <section className={styles.wrap}>
    <div className={styles.hero}>
      <div>
        <div className={styles.kicker}><span>PERFORMANCE</span><b>{stateText}</b>{canary && <b>Founder only</b>}</div>
        <h2>We get paid after your bots do.</h2>
        <p>The first eligible LabNarrative trading profits each month pay your subscription, up to <strong>$99</strong>. No eligible profit means <strong>$0</strong>.</p>
      </div>
      <div className={styles.ruleGrid}>
        <div><span>Start-of-month eligibility</span><strong>{canary ? `Canary ≥ ${compactMoney(minimum)}` : "≥ $2,500 Spot"}</strong></div>
        <div><span>Maximum monthly fee</span><strong>$99</strong></div>
        <div><span>Eligible trading</span><strong>Bots + LN Manual</strong></div>
        <div><span>Loss / no profit</span><strong>$0</strong></div>
      </div>
    </div>

    {!performanceContext && <div className={styles.join}>}
      <div>
        <small>ELIGIBILITY CHECK</small>
        <strong>{eligibility ? `${balanceText} connected Spot balance` : `Minimum ${compactMoney(minimum)} combined Spot balance`}</strong>
        {eligibility && <span className={eligibility.eligible ? styles.good : styles.bad}>{eligibility.eligible ? "Eligible for Performance" : "Below the Performance minimum"}</span>}
      </div>
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={() => void checkEligibility()} disabled={Boolean(busy)}>{busy === "eligibility" ? "Checking…" : "Check eligibility"}</button>
        <button onClick={() => void enroll()} disabled={!enabled || !eligibility?.eligible || Boolean(busy)}>{busy === "enroll" ? "Starting…" : enabled ? "Start Performance" : "Not launched yet"}</button>
      </div>
    </div>}

    {performanceContext && <div className={styles.metrics}>}
      <div><span>Monthly LN P&L</span><strong className={livePnl >= 0 ? styles.good : styles.bad}>{money(livePnl)}</strong><small>Realized + unrealized, net across eligible LN activity</small></div>
      <div><span>Current Performance fee</span><strong>{money(liveFee)} <i>/ $99</i></strong><small>{livePnl > 0 ? "Based on current eligible monthly P&L" : "Nothing due while net eligible P&L is ≤ $0"}</small></div>
      <div><span>Period</span><strong className={styles.period}>{date(period?.periodStart)} → {date(period?.periodEnd)}</strong><small>Subscription-anniversary cycle</small></div>
    </div>}

    {due && <div className={styles.settlement}>
      <div>
        <small>MONTHLY SETTLEMENT</small>
        <h3>{money(settlement?.settlement?.amountUsd)} due</h3>
        <p>This month's Performance fee has been finalized. New Performance activity stays paused until this settlement is confirmed.</p>
      </div>
      <div className={styles.payments}>
        {pendingProvider && <div className={styles.pending}><span>PAYMENT IN PROGRESS</span><strong>{pendingProvider === "nowpayments" ? "NOWPayments crypto checkout pending" : "PayPal checkout pending"}</strong><small>The other payment method is locked until this attempt completes or expires.</small></div>}
        {(!pendingProvider || pendingProvider === "paypal") && settlement?.providers?.paypal && <div><span>PayPal</span><div ref={paypalRef} className={styles.paypal}/></div>}
        {(!pendingProvider || pendingProvider === "nowpayments") && settlement?.providers?.nowpayments && <button className={styles.crypto} onClick={() => void cryptoPay()} disabled={Boolean(busy)}>{busy === "crypto" ? "Opening…" : pendingProvider === "nowpayments" ? "Reopen crypto checkout" : "Pay with crypto via NOWPayments"}</button>}
      </div>
    </div>}

    {(paidWaitingResume || pausedForEligibility) && !due && <div className={styles.resume}>
      <div><small>READY FOR NEXT MONTH</small><strong>Previous Performance month is settled.</strong><span>We will recheck the combined connected Spot balance before starting the next monthly period.</span></div>
      <button onClick={() => void resume()} disabled={Boolean(busy)}>{busy === "resume" ? "Checking…" : "Check $2,500 & resume"}</button>
    </div>}

    {notice && <div className={styles.notice}>{notice}</div>}
    {error && <div className={styles.error}>{error}</div>}

    <p className={styles.foot}>Performance counts live trading managed through LabNarrative. Gains and losses are netted together. Cancelling LabNarrative management crystallizes that position's current P&L for the month. Payments are made separately through PayPal or NOWPayments; LabNarrative never withdraws funds from your exchange.</p>
  </section>;
}
