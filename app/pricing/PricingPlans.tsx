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
    eyebrow: "Paper testing that stays free",
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    annualTotal: 0,
    copy: "Paper-test a DCA bot and TradingView Strategy Execution without connecting real capital.",
    features: [
      "0 Live exchange accounts",
      "1 active Paper DCA bot after the trial",
      "1 Paper Strategy Execution after the trial",
      "30-day expanded Paper trial",
      "Unlimited manual Paper trades",
      "Positions + Signal Monitor",
      "Analytics + bot drilldown",
    ],
    cta: "Start free with Paper →",
    featured: false,
  },
  {
    name: "Live",
    eyebrow: "Everything needed for Spot automation",
    monthlyPrice: 9.99,
    annualMonthlyPrice: 7.99,
    annualTotal: 95.88,
    copy: "A single affordable plan for traders who want DCA bots, TradingView automation and Live crypto Spot execution without a $50–$70+ subscription.",
    features: [
      "5 Live exchange connections",
      "50 active DCA bots",
      "50 TradingView Strategy Executions",
      "Binance, Bybit, KuCoin, OKX + Kraken",
      "Paper trading included",
      "Positions + Signal Monitor",
      "Analytics + bot drilldown",
      "Unlimited manual trades",
    ],
    cta: "Go Live for $9.99 →",
    featured: true,
    badge: "Simple pricing",
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

      <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", maxWidth: 900, marginInline: "auto" }}>
        {plans.map((plan) => {
          const free = plan.name === "Free";
          const price = free ? 0 : interval === "year" ? plan.annualMonthlyPrice : plan.monthlyPrice;
          const billing = free
            ? "Paper only · free after the 30-day trial"
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
          ? "Live is $7.99/month equivalent, billed $95.88 upfront for one year."
          : "Live is $9.99 for one month of access."} Card / Apple Pay is the primary checkout through NOWPayments fiat on-ramp, with crypto payment also available. Availability depends on provider coverage and verification.
      </p>
    </>
  );
}
