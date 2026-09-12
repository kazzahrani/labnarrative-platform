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
    monthlyPrice: 9.99,
    annualMonthlyPrice: 7.99,
    annualTotal: 95.88,
    copy: "For individual traders who want a focused Live Spot automation setup at a simple price.",
    features: [
      "Free for the first 7 days on new accounts",
      "1 Live exchange connection",
      "10 active DCA bots",
      "10 Strategy bots",
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
    eyebrow: "More connections and capacity",
    monthlyPrice: 19.99,
    annualMonthlyPrice: 15.99,
    annualTotal: 191.88,
    copy: "For traders running a larger automation setup across several Live exchange connections.",
    features: [
      "5 Live exchange connections",
      "50 active DCA bots",
      "50 Strategy bots",
      "Binance, Bybit, KuCoin, OKX + Kraken",
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
  const [interval, setInterval] = useState<BillingInterval>("month");

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
      </div>
      <p className={styles.limitNote}>
        {interval === "year"
          ? "Pro is $7.99/month equivalent ($95.88/year) and Max is $15.99/month equivalent ($191.88/year)."
          : "Pro is $9.99/month and Max is $19.99/month."} Crypto payment is currently available. Monthly and annual purchases are prepaid and do not renew automatically.
      </p>
    </>
  );
}
