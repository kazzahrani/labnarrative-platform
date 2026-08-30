"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./billing-dashboard.module.css";

type Plan = {
  id: string;
  slug: "starter" | "growth" | "pro" | string;
  name: string;
  description: string | null;
  monthly_price_cents: number | null;
  annual_price_cents: number | null;
  currency: string;
  max_single_pair_bots: number;
  max_multi_pair_bots: number;
  max_active_exchanges: number | null;
};
type Subscription = {
  id: string;
  plan_id?: string;
  status: string;
  billing_interval: "monthly" | "annual";
  list_price_cents: number;
  subscription_price_cents: number;
  currency: string;
  started_at?: string | null;
  next_billing_at: string | null;
  referral_discount_applied: boolean;
  cancel_at_period_end?: boolean;
  cancellation_requested_at?: string | null;
  access_ends_at?: string | null;
  pending_plan_id?: string | null;
  pending_billing_interval?: "monthly" | "annual" | null;
  plan_change_requested_at?: string | null;
  plan_change_effective_at?: string | null;
  provider_synced_at?: string | null;
  trader_subscription_plans?: { slug?: string; name?: string } | null;
};
type PricingData = {
  ok?: boolean;
  checkoutEnabled: boolean;
  checkoutMode?: "disabled" | "founder_canary" | "public" | string;
  checkoutCanary?: boolean;
  entitlementsEnforced?: boolean;
  provider: string;
  currency: string;
  referralDiscountBps: number;
  paymentGraceDays?: number;
  referralAttached: boolean;
  accessOverride?: { reason?: string; expiresAt?: string | null } | null;
  entitlements?: { plan: string; isPaid: boolean; singlePairBots: number; multiPairBots: number; activeExchanges: number | null } | null;
  plans: Plan[];
  subscription: Subscription | null;
  pendingSubscription?: Subscription | null;
  error?: string;
};
type Interval = "monthly" | "annual";

type BillingResult = { ok?: boolean; approvalUrl?: string | null; accessEndsAt?: string | null; error?: string };

const money = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
const percent = (bps: number) => `${Math.round(bps / 100)}%`;
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";
const annualBadge = (slug: string, monthly: number, annual: number) => {
  if (slug === "starter") return "SAVE 20%";
  if (slug === "growth") return "SAVE ~40%";
  if (slug === "pro") return "SAVE ~50%";
  const discount = monthly > 0 ? Math.round((1 - annual / (monthly * 12)) * 100) : 0;
  return `SAVE ${Math.max(0, discount)}%`;
};
const friendlyError = (message: string) => ({
  checkout_not_enabled: "Checkout is not open yet.",
  founder_canary_required: "This checkout canary is limited to the protected founder/tester account.",
  founder_canary_not_enabled: "The founder checkout canary is not enabled.",
  billing_provider_not_launch_ready: "The billing provider is not launch-ready.",
  subscription_already_active: "You already have an active subscription.",
  subscription_access_still_active: "Your cancelled subscription is still active through its paid period.",
  active_subscription_required: "An active paid subscription is required for this action.",
  subscription_checkout_already_exists: "A subscription checkout is already in progress.",
  pending_subscription_requires_sync: "The pending PayPal checkout needs to be synchronized before it can continue.",
}[message] || message.replaceAll("_", " "));

async function invokePricing() {
  const { data, error } = await browserSupabase.functions.invoke("trader-pricing-control", { body: {} });
  if (error) throw new Error(error.message || "pricing_request_failed");
  const payload = (data ?? {}) as PricingData;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "pricing_request_failed");
  return payload;
}

async function billingAction(action: string, body: Record<string, unknown> = {}, functionName = "trader-billing-control") {
  const { data, error } = await browserSupabase.functions.invoke(functionName, { body: { action, ...body } });
  if (error) {
    let message = error.message || "billing_action_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as BillingResult;
  if (!payload.ok) throw new Error(payload.error || "billing_action_failed");
  return payload;
}

export default function BillingDashboard() {
  const [data, setData] = useState<PricingData | null>(null);
  const [interval, setInterval] = useState<Interval>("annual");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const refresh = useCallback(async () => {
    try { setData(await invokePricing()); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load plans."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onReturn = () => { setLoading(true); void refresh(); };
    window.addEventListener("trader:billing-return", onReturn);
    return () => window.removeEventListener("trader:billing-return", onReturn);
  }, [refresh]);

  const plans = useMemo(() => data?.plans ?? [], [data]);
  const sub = data?.subscription ?? null;
  const currentSlug = sub?.trader_subscription_plans?.slug || "";
  const activePaid = sub?.status === "active";
  const pendingApproval = sub?.status === "approval_pending";
  const paidThrough = sub?.status === "cancelled" && Boolean(sub.access_ends_at && Date.parse(sub.access_ends_at) > Date.now());
  const canStartCheckout = Boolean(data?.checkoutEnabled && (!sub || pendingApproval));
  const canChangePlan = Boolean(data?.checkoutEnabled && !data?.checkoutCanary && activePaid && !sub?.cancel_at_period_end && !sub?.pending_plan_id);

  const choose = async (slug: string) => {
    if (!data?.checkoutEnabled || busy) return;
    setBusy(slug); setError("");
    try {
      const creating = !sub || pendingApproval;
      const functionName = creating && data.checkoutCanary ? "trader-billing-canary-control" : "trader-billing-control";
      const result = creating
        ? await billingAction("create_subscription", { plan: slug, interval }, functionName)
        : await billingAction("change_subscription", { plan: slug, interval });
      if (result.approvalUrl) { window.location.assign(result.approvalUrl); return; }
      await refresh();
    } catch (caught) {
      setError(friendlyError(caught instanceof Error ? caught.message : "Unable to update subscription."));
    } finally { setBusy(""); }
  };

  const cancelRenewal = async () => {
    if (!sub || busy) return;
    setBusy("cancel"); setError("");
    try { await billingAction("cancel_subscription"); setConfirmCancel(false); await refresh(); }
    catch (caught) { setError(friendlyError(caught instanceof Error ? caught.message : "Unable to cancel renewal.")); }
    finally { setBusy(""); }
  };

  if (loading) return <div className={styles.loading}>Loading plans & billing…</div>;
  if (error && !data) return <div className={styles.loading}><strong>Plans & billing unavailable</strong><span>{friendlyError(error)}</span></div>;

  return <div className={styles.page}>
    <div className={styles.heading}>
      <div><small>PLANS & BILLING</small><h1>Choose the automation scale that fits you.</h1><p>Start with single-pair automation, then unlock multi-pair scale and more active exchanges as your setup grows.</p></div>
      <div className={styles.toggle} aria-label="Billing interval"><button className={interval === "monthly" ? styles.active : ""} onClick={() => setInterval("monthly")}>Monthly</button><button className={interval === "annual" ? styles.active : ""} onClick={() => setInterval("annual")}>Annual <span>Best value</span></button></div>
    </div>

    {data?.accessOverride && <div className={styles.overrideNote}><div><small>FOUNDER / TESTER ACCESS</small><strong>{data.entitlements?.plan === "pro" ? "Pro entitlements are protected" : "Protected test access"}</strong></div><span>This access is independent of billing and will remain available when paid limits are activated.</span></div>}

    {data?.checkoutCanary && <div className={styles.referralNote}><b>Live checkout canary:</b> PayPal checkout is enabled only for this protected founder/tester account. Public checkout and plan-limit enforcement remain off.</div>}

    {data?.referralAttached && <div className={styles.referralNote}>Your referral is attached. An additional <b>{percent(data.referralDiscountBps)}</b> customer discount will be applied by the billing engine when checkout opens.</div>}

    {sub && <section className={styles.current}>
      <div className={styles.currentInfo}>
        <small>CURRENT SUBSCRIPTION</small>
        <strong>{sub.trader_subscription_plans?.name || "LabNarrative Trading"} · {sub.billing_interval}</strong>
        <div className={styles.meta}>
          {activePaid && !sub.cancel_at_period_end && <span>Next billing: {date(sub.next_billing_at)}</span>}
          {pendingApproval && <span>PayPal approval pending</span>}
          {paidThrough && <span>Paid access through: {date(sub.access_ends_at)}</span>}
          {sub.status === "payment_failed" && <span>Payment grace through: {date(sub.access_ends_at)}</span>}
          {sub.pending_plan_id && <span>Plan change pending buyer approval / provider confirmation</span>}
        </div>
      </div>
      <div className={styles.currentActions}>
        <span className={styles.status}>{sub.status === "cancelled" && paidThrough ? "cancelled · active until period end" : sub.status}</span>
        {activePaid && !confirmCancel && <button className={styles.cancelButton} onClick={() => setConfirmCancel(true)} disabled={busy === "cancel"}>Cancel renewal</button>}
        {activePaid && confirmCancel && <div className={styles.cancelConfirm}><button onClick={() => setConfirmCancel(false)} disabled={busy === "cancel"}>Keep plan</button><button className={styles.danger} onClick={() => void cancelRenewal()} disabled={busy === "cancel"}>{busy === "cancel" ? "Cancelling…" : "Confirm cancellation"}</button></div>}
      </div>
    </section>}

    <div className={styles.cards}>
      <article className={styles.card}>
        <div className={styles.cardHead}><div><small>FREE</small><h2>Free</h2></div><strong>$0</strong></div>
        <p>Learn the platform and test automation safely with Paper Trading.</p>
        <div className={styles.features}><span><b>1</b> single-pair Paper bot</span><span><b>0</b> multi-pair bots</span><span>Paper Trading only</span></div>
        <button className={styles.secondary} disabled>{sub ? "Paid access active" : "Included"}</button>
      </article>

      {plans.map((plan) => {
        const monthly = Number(plan.monthly_price_cents || 0);
        const annual = Number(plan.annual_price_cents || 0);
        const shown = interval === "annual" ? annual : monthly;
        const effective = interval === "annual" ? annual / 12 : monthly;
        const currentPlanAndInterval = currentSlug === plan.slug && sub?.billing_interval === interval && activePaid;
        const currentPlanOtherInterval = currentSlug === plan.slug && sub?.billing_interval !== interval && activePaid;
        const pendingThisPlan = pendingApproval && currentSlug === plan.slug && sub?.billing_interval === interval;
        const canChoose = !busy && !currentPlanAndInterval && (canChangePlan || (!sub && canStartCheckout) || (pendingThisPlan && canStartCheckout));
        let buttonLabel = "Checkout opening soon";
        if (currentPlanAndInterval) buttonLabel = "Current plan";
        else if (busy === plan.slug) buttonLabel = sub && !pendingApproval ? "Preparing change…" : "Opening checkout…";
        else if (pendingApproval) buttonLabel = pendingThisPlan ? "Resume PayPal approval" : "Checkout pending";
        else if (paidThrough) buttonLabel = `Access active until ${date(sub?.access_ends_at)}`;
        else if (sub?.status === "payment_failed") buttonLabel = "Resolve current subscription first";
        else if (sub?.pending_plan_id) buttonLabel = "Plan change pending";
        else if (data?.checkoutEnabled && !sub) buttonLabel = `Choose ${plan.name}`;
        else if (canChangePlan) buttonLabel = currentPlanOtherInterval ? `Switch to ${interval}` : `Change to ${plan.name}`;
        return <article key={plan.id} className={`${styles.card} ${plan.slug === "growth" ? styles.featured : ""}`}>
          {plan.slug === "growth" && <span className={styles.popular}>MOST POPULAR</span>}
          <div className={styles.cardHead}><div><small>{plan.slug.toUpperCase()}</small><h2>{plan.name}</h2></div>{interval === "annual" && <span className={styles.saving}>{annualBadge(plan.slug, monthly, annual)}</span>}</div>
          <div className={styles.price}><strong>{money(shown, plan.currency)}</strong><span>/{interval === "annual" ? "year" : "month"}</span></div>
          {interval === "annual" && <div className={styles.effective}>{money(Math.round(effective), plan.currency)}/month effective · billed annually</div>}
          <p>{plan.description}</p>
          <div className={styles.features}>
            <span><b>{plan.max_single_pair_bots.toLocaleString()}</b> single-pair bots</span>
            <span><b>{plan.max_multi_pair_bots.toLocaleString()}</b> multi-pair {plan.max_multi_pair_bots === 1 ? "bot" : "bots"}</span>
            <span><b>{plan.max_active_exchanges == null ? "All" : plan.max_active_exchanges}</b> {plan.max_active_exchanges == null ? "supported exchanges" : `active ${plan.max_active_exchanges === 1 ? "exchange" : "exchanges"}`}</span>
          </div>
          <button disabled={!canChoose} onClick={() => void choose(plan.slug)}>{buttonLabel}</button>
        </article>;
      })}
    </div>

    <section className={styles.footerNote}><strong>Plan changes & cancellation</strong><span>PayPal plan changes require buyer approval and take effect on the provider’s billing cycle without automatic proration. Cancelling stops renewal while LabNarrative preserves access through the already-paid period. Failed renewals receive a {data?.paymentGraceDays ?? 3}-day access grace period.</span></section>
    {error && <div className={styles.error}>{friendlyError(error)}</div>}
  </div>;
}
