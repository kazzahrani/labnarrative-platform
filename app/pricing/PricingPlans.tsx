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

function DisabledPerformanceCard({ plan }: { plan: "trader" | "pro" }) {
  const definition = fixedPlans.find((item) => item.name.toLowerCase() === plan)!;
  const price = plan === "trader" ? "$9.99" : "$19.99";

  return (
    <article className={`${styles.planCard} ${switchStyles.performanceDisabledCard} ${switchStyles.performanceAlignedCard}`}>
      <div className={switchStyles.performanceTop}>
        <h2>{definition.name}</h2>
        <p>Pay when you profit is available with Max.</p>
      </div>
      <div className={switchStyles.disabledPerformancePrice}>
        <strong>{price}</strong>
        <span>/ month</span>
        <small>Billed {plan === "trader" ? "$119.88/year" : "$239.88/year"}</small>
      </div>
      <span className={`${styles.planCta} ${switchStyles.disabledCta} ${switchStyles.performanceCta}`}>Not available</span>
      <div className={`${switchStyles.planLimits} ${switchStyles.disabledLimits}`}>
        {definition.features.map((feature) => (
          <div key={`${feature.value}-${feature.label}`}><strong>{feature.value}</strong><span>{feature.label}</span></div>
        ))}
      </div>
    </article>
  );
}

function PerformanceMaxCard() {
  return (
    <article className={`${styles.planCard} ${styles.featured} ${switchStyles.performanceCard} ${switchStyles.performanceAlignedCard}`}>
      <span className={`${styles.popular} ${switchStyles.plainBadge}`}>Pay when you profit</span>
      <div className={switchStyles.performanceTop}>
        <h2>Max</h2>
        <p>Same Max power. A smarter way to pay.</p>
      </div>
      <div className={switchStyles.performancePrice}>
        <strong>Pay when you profit</strong>
        <span>No profit, no fee.<br />Profitable months: $0.1-$78.</span>
      </div>
      <a className={`${styles.planCta} ${switchStyles.performanceCta}`} href={PERFORMANCE_URL}>Start →</a>
      <div className={`${switchStyles.planLimits} ${switchStyles.performanceLimits}`}>
        <div><strong>100</strong><span>Strategy bots</span></div>
        <div><strong>100</strong><span>active Single-pair DCA bots</span></div>
        <div><strong>10</strong><span>active Multi-pair DCA bots</span></div>
        <div><strong>Unlimited</strong><span>Manual trades</span></div>
        <div><strong>Full</strong><span>Paper account</span></div>
      </div>
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
            <DisabledPerformanceCard plan="trader" />
            <DisabledPerformanceCard plan="pro" />
            <PerformanceMaxCard />
          </div>
          <p className={styles.limitNote}>
            Pay when you profit charges only when your LabNarrative Live Spot trading makes a realized net profit. No profit, no fee.
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
                ? `Billed ${plan.annualTotal.toFixed(2)}/year`
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
              : "Trader is $14.99/month, Pro is $29.99/month, and Max is $69.99/month."} PayPal and crypto payments are available; cards and wallets are coming soon. Monthly and annual purchases are prepaid and do not renew automatically.
          </p>
        </>
      )}
    </>
  );
}
