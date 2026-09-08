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
    copy: "Keep one DCA bot and one TradingView Strategy Execution running in Paper for as long as you need.",
    features: [
      "0 Live exchange accounts",
      "1 active Paper DCA bot",
      "1 Paper Strategy Execution",
      "Unlimited manual Paper trades",
      "Paper Account",
      "TradingView execution",
      "Full position controls",
      "Analytics + bot drilldown",
    ],
    cta: "Start Paper trial →",
    featured: false,
  },
  {
    name: "Trader",
    eyebrow: "Take proven strategies Live",
    monthlyPrice: 20,
    annualMonthlyPrice: 15,
    annualTotal: 180,
    copy: "For individual traders ready to connect one Live exchange account and run a focused automation setup.",
    features: [
      "1 Live exchange account",
      "10 active DCA bots",
      "10 Strategy Executions",
      "Unlimited manual trades",
      "Paper Account",
      "TradingView execution",
      "Full position controls",
      "Analytics + bot drilldown",
    ],
    cta: "Choose Trader →",
    featured: false,
  },
  {
    name: "Pro",
    eyebrow: "More accounts and automation capacity",
    monthlyPrice: 50,
    annualMonthlyPrice: 29,
    annualTotal: 348,
    copy: "For serious traders running a larger strategy portfolio across several exchange accounts.",
    features: [
      "5 Live exchange accounts",
      "50 active DCA bots",
      "50 Strategy Executions",
      "Unlimited manual trades",
      "Paper Account",
      "TradingView execution",
      "Full position controls",
      "Analytics + bot drilldown",
    ],
    cta: "Choose Pro →",
    featured: false,
  },
  {
    name: "Max",
    eyebrow: "Maximum launch capacity",
    monthlyPrice: 90,
    annualMonthlyPrice: 49,
    annualTotal: 588,
    copy: "For advanced multi-account setups that need substantially more automation capacity.",
    features: [
      "10 Live exchange accounts",
      "200 active DCA bots",
      "200 Strategy Executions",
      "Unlimited manual trades",
      "Paper Account",
      "TradingView execution",
      "Full position controls",
      "Analytics + bot drilldown",
    ],
    cta: "Choose Max →",
    featured: true,
    badge: "Maximum capacity",
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

      <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {plans.map((plan) => {
          const free = plan.name === "Free";
          const price = free ? 0 : interval === "year" ? plan.annualMonthlyPrice : plan.monthlyPrice;
          const billing = free
            ? "After the 30-day trial · Paper only"
            : interval === "year"
              ? `$${plan.annualTotal}/year prepaid`
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
          ? "Yearly prices are shown as the monthly equivalent and billed upfront: $180 for Trader, $348 for Pro and $588 for Max."
          : "Monthly access is $20 for Trader, $50 for Pro and $90 for Max."} Paid checkout is handled with cryptocurrency through NOWPayments.
      </p>
    </>
  );
}
