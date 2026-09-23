"use client";

import { useState } from "react";
import styles from "../trading-public-pages.module.css";
import switchStyles from "./PricingPlans.module.css";

const APP_URL = "https://app.labnarrative.com";
const PRICING_URL = `${APP_URL}/pricing`;
const PERFORMANCE_URL = `${APP_URL}/pricing?performance=1`;

type PricingView = "month" | "year" | "performance";

const fixedPlans = [
  {
    name: "Trader",
    eyebrow: "Start automating",
    monthlyPrice: 14.99,
    annualMonthlyPrice: 9.99,
    annualTotal: 119.88,
    copy: "For traders starting with focused Spot automation.",
    features: [
      { value: "2", label: "Strategy bots" },
      { value: "2", label: "active Single-pair DCA bots" },
      { value: "1", label: "Grid bot (soon)" },
      { value: "1", label: "active Multi-pair DCA bot" },
      { value: "Unlimited", label: "Manual trades" },
      { value: "Full", label: "Paper account" },
    ],
    cta: "Choose Trader →",
    featured: false,
  },
  {
    name: "Pro",
    eyebrow: "Focused automation",
    monthlyPrice: 29.99,
    annualMonthlyPrice: 19.99,
    annualTotal: 239.88,
    copy: "For active Spot traders running more automation.",
    features: [
      { value: "20", label: "Strategy bots" },
      { value: "20", label: "active Single-pair DCA bots" },
      { value: "10", label: "Grid bots (soon)" },
      { value: "10", label: "active Multi-pair DCA bots" },
      { value: "Unlimited", label: "Manual trades" },
      { value: "Full", label: "Paper account" },
    ],
    cta: "Choose Pro →",
    featured: true,
    badge: "Most popular",
  },
  {
    name: "Max",
    eyebrow: "Maximum automation capacity",
    monthlyPrice: 69.99,
    annualMonthlyPrice: 49.99,
    annualTotal: 599.88,
    copy: "For traders running larger, multi-strategy automation setups.",
    features: [
      { value: "250", label: "Strategy bots" },
      { value: "250", label: "active Single-pair DCA bots" },
      { value: "100", label: "Grid bots (soon)" },
      { value: "100", label: "active Multi-pair DCA bots" },
      { value: "Unlimited", label: "Manual trades" },
      { value: "Full", label: "Paper account" },
    ],
    cta: "Choose Max →",
    featured: false,
  },
] as const;

function PerformanceTierCard({ tier }: { tier: "trader" | "pro" | "max" }) {
  const definition = fixedPlans.find((item) => item.name.toLowerCase() === tier)!;
  const cap = tier === "trader" ? 19 : tier === "pro" ? 39 : 69;

  return (
    <article className={`${styles.planCard} ${styles.featured} ${switchStyles.performanceCard} ${switchStyles.performanceAlignedCard}`}>
      <span className={`${styles.popular} ${switchStyles.plainBadge}`}>Pay when you profit</span>
      <div className={switchStyles.performanceTop}>
        <h2>{definition.name}</h2>
        <p>Same {definition.name} power. A smarter way to pay.</p>
      </div>
      <div className={switchStyles.performancePrice}>
        <strong>Make profit first. Pay us second.</strong>
        <span>No upfront subscription fee.<br />$0–${cap} / month.</span>
      </div>
      <a className={`${styles.planCta} ${switchStyles.performanceCta}`} href={PERFORMANCE_URL}>Start →</a>
      <div className={`${switchStyles.planLimits} ${switchStyles.performanceLimits}`}>
        {definition.features.map((feature) => (
          <div key={`${feature.value}-${feature.label}`}><strong>{feature.value}</strong><span>{feature.label}</span></div>
        ))}
      </div>
      <p className={switchStyles.performanceReserveCopy}>
        No card or reserve is required to start. If realized net PnL reaches the ${cap} cap, that fee becomes due then; otherwise any positive fee is settled at month-end.
      </p>
    </article>
  );
}

export default function PricingPlans() {
  const [view, setView] = useState<PricingView>("year");
  const performance = view === "performance";

  return (
    <>
      <div className={switchStyles.toggle} aria-label="Pricing view">
        <button className={view === "year" ? switchStyles.active : ""} onClick={() => setView("year")} type="button">Yearly <span className={switchStyles.yearlyDiscountBadge}>save up to 33%</span></button>
        <button className={view === "month" ? switchStyles.active : ""} onClick={() => setView("month")} type="button">Monthly</button>
        <button className={performance ? switchStyles.active : ""} onClick={() => setView("performance")} type="button">Pay when you profit</button>
      </div>

      {performance ? (
        <>
          <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", maxWidth: 1180, marginInline: "auto" }}>
            <PerformanceTierCard tier="trader" />
            <PerformanceTierCard tier="pro" />
            <PerformanceTierCard tier="max" />
          </div>
          <p className={styles.limitNote}>
            No subscription fee upfront. Pay when you profit follows positive net realized PnL from LabNarrative Live Spot trading: Trader is capped at $19, Pro at $39, and Max at $69 per billing month. Reach the cap and it becomes due; otherwise any positive amount owed is settled at month-end.
          </p>
        </>
      ) : (
        <>
          <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", maxWidth: 1180, marginInline: "auto" }}>
            {fixedPlans.map((plan) => {
              const yearly = view === "year";
              const popular = yearly ? plan.name === "Max" : plan.name === "Pro";
              const price = yearly ? plan.annualMonthlyPrice : plan.monthlyPrice;
              const billing = yearly
                ? "Billed $" + plan.annualTotal.toFixed(2) + "/year"
                : "Prepaid monthly access";

              return (
                <article className={`${styles.planCard} ${switchStyles.fixedAlignedCard} ${popular ? styles.featured : ""}`} key={plan.name}>
                  {popular ? <span className={`${styles.popular} ${switchStyles.plainBadge}`}>Most popular</span> : null}
                  <div className={switchStyles.fixedTop}>
                    <h2>{plan.name}</h2>
                    <p className={`${styles.planCopy} ${switchStyles.planPositioning}`}>{plan.copy}</p>
                  </div>
                  <div className={switchStyles.fixedPriceBlock}>
                    <div className={styles.priceLine}>
                      {yearly ? <del>{"$" + plan.monthlyPrice}</del> : null}
                      <strong>{"$" + price}</strong>
                      <span>/mo</span>
                    </div>
                    <p className={styles.billing}>{billing}</p>
                  </div>
                  <a className={`${styles.planCta} ${switchStyles.fixedCta}`} href={PRICING_URL}>{plan.cta}</a>
                  <div className={`${switchStyles.planLimits} ${switchStyles.fixedLimits} ${popular ? switchStyles.darkLimits : ""}`}>{plan.features.map((feature) => <div key={`${feature.value}-${feature.label}`}><strong>{feature.value}</strong><span>{feature.label}</span></div>)}</div>
                </article>
              );
            })}
          </div>
          <p className={styles.limitNote}>
            {view === "year"
              ? "Trader is $9.99/month equivalent ($119.88/year), Pro is $19.99/month equivalent ($239.88/year), and Max is $49.99/month equivalent ($599.88/year)."
              : "Trader is $14.99/month, Pro is $29.99/month, and Max is $69.99/month."} PayPal and crypto are available. Card payments are temporarily unavailable. Monthly and annual purchases are prepaid and do not renew automatically.
          </p>
        </>
      )}
    </>
  );
}
