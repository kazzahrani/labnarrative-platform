"use client";

import { useState } from "react";
import styles from "../trading-public-pages.module.css";
import switchStyles from "./PricingPlans.module.css";

const APP_URL = "https://app.labnarrative.com";
const PRICING_URL = `${APP_URL}/pricing`;

type BillingInterval = "month" | "year";

const plans = [
  {
    name: "Free",
    eyebrow: "Paper trading that stays free",
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    annualTotal: 0,
    copy: "Run Paper DCA and TradingView Strategy Execution permanently without connecting real capital.",
    features: [
      "0 Live exchange connections",
      "10 active Paper DCA bots",
      "10 Paper Strategy bots",
      "Unlimited manual Paper trades",
      "Positions + Signal Monitor",
      "Analytics + bot drilldown",
      "Free forever",
    ],
    cta: "Start free with Paper →",
    featured: false,
  },
  {
    name: "Pro",
    eyebrow: "Focused Live automation",
    monthlyPrice: 14.99,
    annualMonthlyPrice: 9.99,
    annualTotal: 119.88,
    copy: "For individual traders who want a focused Live Spot automation setup at a simple price.",
    features: [
      "Full Pro plan free for the first 7 days on new accounts",
      "5 Live exchange connections",
      "20 active DCA bots",
      "20 Strategy bots",
      "Binance, Bybit, KuCoin, OKX + Kraken",
      "Paper trading included",
      "Positions + Signal Monitor",
      "Analytics + bot drilldown",
      "Unlimited manual trades",
    ],
    cta: "Choose Pro →",
    featured: true,
    badge: "Most popular",
  },
  {
    name: "Max",
    eyebrow: "Maximum exchange and automation capacity",
    monthlyPrice: 29.99,
    annualMonthlyPrice: 19.99,
    annualTotal: 239.88,
    copy: "For traders running a larger automation setup across every exchange supported by LabNarrative.",
    features: [
      "All supported exchanges",
      "100 active DCA bots",
      "100 Strategy bots",
      "Currently: Binance, Bybit, KuCoin, OKX + Kraken",
      "Paper trading included",
      "Positions + Signal Monitor",
      "Analytics + bot drilldown",
      "Unlimited manual trades",
    ],
    cta: "Choose Max →",
    featured: false,
  },
] as const;

export default function PricingPlans() {
  const [interval, setInterval] = useState<BillingInterval>("year");

  return (
    <>
      <div className={switchStyles.toggle} aria-label="Billing interval">
        <button className={interval === "month" ? switchStyles.active : ""} onClick={() => setInterval("month")} type="button">Monthly</button>
        <button className={interval === "year" ? switchStyles.active : ""} onClick={() => setInterval("year")} type="button">Yearly</button>
      </div>

      <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", maxWidth: 1180, marginInline: "auto" }}>
        {plans.map((plan) => {
          const free = plan.name === "Free";
          const price = free ? 0 : interval === "year" ? plan.annualMonthlyPrice : plan.monthlyPrice;
          const billing = free
            ? "Paper only · free forever"
            : interval === "year"
              ? `$${plan.annualTotal.toFixed(2)}/year prepaid`
              : "Prepaid monthly access";

          return (
            <article className={`${styles.planCard} ${plan.featured ? styles.featured : ""}`} key={plan.name}>
              {"badge" in plan && plan.badge && <span className={styles.popular}>{plan.badge}</span>}
              <p className={styles.planEyebrow}>{plan.eyebrow}</p>
              <h2>{plan.name}</h2>
              <div className={styles.priceLine}>
                <strong>${price}</strong>
                <span>/mo</span>
              </div>
              <p className={styles.billing}>{billing}</p>
              <p className={styles.planCopy}>{plan.copy}</p>
              <a className={styles.planCta} href={free ? APP_URL : PRICING_URL}>{plan.cta}</a>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            </article>
          );
        })}
        <article className={styles.planCard}>
          <p className={styles.planEyebrow}>Pay only from eligible LabNarrative trading profits</p>
          <h2>Performance</h2>
          <div className={styles.priceLine}>
            <strong>$0–99</strong>
            <span>/mo</span>
          </div>
          <p className={styles.billing}>No eligible monthly profit · $0 due</p>
          <p className={styles.planCopy}>We get paid after your bots do. The first eligible LabNarrative trading profits each month pay the subscription, up to $99.</p>
          <a className={styles.planCta} href={PRICING_URL}>Choose Performance →</a>
          <ul>
            <li>Requires ≥ $2,500 combined connected Spot balance at the start of each monthly period</li>
            <li>Bots + LabNarrative Manual Trades included in Performance P&amp;L</li>
            <li>Realized + unrealized eligible P&amp;L, net across LabNarrative activity</li>
            <li>Maximum $99 per month</li>
            <li>No eligible profit · $0</li>
            <li>No debt or carry-forward from losing months</li>
            <li>Pay settlement through PayPal or crypto via NOWPayments</li>
          </ul>
        </article>
      </div>
      <p className={styles.limitNote}>
        {interval === "year"
          ? "Pro is $9.99/month equivalent ($119.88/year) and Max is $19.99/month equivalent ($239.88/year)."
          : "Pro is $14.99/month and Max is $29.99/month."} Performance is separate: $0–$99/month, paid only from eligible LabNarrative trading profits. Fixed Pro/Max purchases are prepaid; Performance settlements can be paid through PayPal or crypto via NOWPayments.
      </p>
    </>
  );
}
