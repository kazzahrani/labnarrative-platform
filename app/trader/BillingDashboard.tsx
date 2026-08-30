"use client";

import { useEffect, useMemo, useState } from "react";
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
  status: string;
  billing_interval: "monthly" | "annual";
  subscription_price_cents: number;
  currency: string;
  next_billing_at: string | null;
  referral_discount_applied: boolean;
  trader_subscription_plans?: { slug?: string; name?: string } | null;
};
type PricingData = {
  ok?: boolean;
  checkoutEnabled: boolean;
  provider: string;
  currency: string;
  referralDiscountBps: number;
  referralAttached: boolean;
  plans: Plan[];
  subscription: Subscription | null;
  error?: string;
};

type Interval = "monthly" | "annual";

const money = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
const percent = (bps: number) => `${Math.round(bps / 100)}%`;
const annualBadge = (slug: string, monthly: number, annual: number) => {
  if (slug === "starter") return "SAVE 20%";
  if (slug === "growth") return "SAVE ~40%";
  if (slug === "pro") return "SAVE ~50%";
  const discount = monthly > 0 ? Math.round((1 - annual / (monthly * 12)) * 100) : 0;
  return `SAVE ${Math.max(0, discount)}%`;
};

async function invokePricing() {
  const { data, error } = await browserSupabase.functions.invoke("trader-pricing-control", { body: {} });
  if (error) throw new Error(error.message || "pricing_request_failed");
  const payload = (data ?? {}) as PricingData;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "pricing_request_failed");
  return payload;
}

async function createSubscription(plan: string, interval: Interval) {
  const { data, error } = await browserSupabase.functions.invoke("trader-billing-control", { body: { action: "create_subscription", plan, interval } });
  if (error) {
    let message = error.message || "checkout_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as { ok?: boolean; approvalUrl?: string; error?: string };
  if (!payload.ok || !payload.approvalUrl) throw new Error(payload.error || "checkout_failed");
  window.location.assign(payload.approvalUrl);
}

export default function BillingDashboard() {
  const [data, setData] = useState<PricingData | null>(null);
  const [interval, setInterval] = useState<Interval>("annual");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void (async () => {
      try { setData(await invokePricing()); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load plans."); }
      finally { setLoading(false); }
    })();
  }, []);

  const plans = useMemo(() => data?.plans ?? [], [data]);
  const currentSlug = data?.subscription?.trader_subscription_plans?.slug || "";

  const choose = async (slug: string) => {
    if (!data?.checkoutEnabled || busy || data.subscription) return;
    setBusy(slug); setError("");
    try { await createSubscription(slug, interval); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to start checkout."); setBusy(""); }
  };

  if (loading) return <div className={styles.loading}>Loading plans & billing…</div>;
  if (error && !data) return <div className={styles.loading}><strong>Plans & billing unavailable</strong><span>{error}</span></div>;

  return <div className={styles.page}>
    <div className={styles.heading}>
      <div><small>PLANS & BILLING</small><h1>Choose the automation scale that fits you.</h1><p>Start with single-pair automation, then unlock multi-pair scale and more active exchanges as your setup grows.</p></div>
      <div className={styles.toggle} aria-label="Billing interval"><button className={interval === "monthly" ? styles.active : ""} onClick={() => setInterval("monthly")}>Monthly</button><button className={interval === "annual" ? styles.active : ""} onClick={() => setInterval("annual")}>Annual <span>Best value</span></button></div>
    </div>

    {data?.referralAttached && <div className={styles.referralNote}>Your referral is attached. An additional <b>{percent(data.referralDiscountBps)}</b> customer discount will be applied by the billing engine when checkout opens.</div>}

    {data?.subscription && <section className={styles.current}><div><small>CURRENT SUBSCRIPTION</small><strong>{data.subscription.trader_subscription_plans?.name || "LabNarrative Trading"} · {data.subscription.billing_interval}</strong></div><span>{data.subscription.status}</span></section>}

    <div className={styles.cards}>
      <article className={styles.card}>
        <div className={styles.cardHead}><div><small>FREE</small><h2>Free</h2></div><strong>$0</strong></div>
        <p>Learn the platform and test automation safely with Paper Trading.</p>
        <div className={styles.features}><span><b>1</b> single-pair Paper bot</span><span><b>0</b> multi-pair bots</span><span>Paper Trading only</span></div>
        <button className={styles.secondary} disabled>Included</button>
      </article>

      {plans.map((plan) => {
        const monthly = Number(plan.monthly_price_cents || 0);
        const annual = Number(plan.annual_price_cents || 0);
        const shown = interval === "annual" ? annual : monthly;
        const effective = interval === "annual" ? annual / 12 : monthly;
        const current = currentSlug === plan.slug;
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
          <button disabled={current || !data?.checkoutEnabled || Boolean(data?.subscription) || busy === plan.slug} onClick={() => void choose(plan.slug)}>{current ? "Current plan" : busy === plan.slug ? "Opening checkout…" : data?.checkoutEnabled && !data?.subscription ? `Choose ${plan.name}` : "Checkout opening soon"}</button>
        </article>;
      })}
    </div>

    <section className={styles.footerNote}><strong>Why annual?</strong><span>Annual pricing intentionally becomes more aggressive as the plan scales: about 20% off Starter, 40% off Growth and 50% off Pro. Referral customers receive their separate 10% discount on the eligible checkout price.</span></section>
    {error && <div className={styles.error}>{error}</div>}
  </div>;
}
