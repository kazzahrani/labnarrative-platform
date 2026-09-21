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
    name: "Free",
    eyebrow: "Free forever",
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    annualTotal: 0,
    copy: "For traders learning the platform with Paper Trading.",
    features: [
      { value: "0", label: "Strategy bots" },
      { value: "0", label: "active Single-pair DCA bots" },
      { value: "0", label: "active Multi-pair DCA bots" },
      { value: "0", label: "Manual trades" },
      { value: "Full", label: "Paper account" },
    ],
    cta: "Start free →",
    featured: false,
  },
  {
    name: "Pro",
    eyebrow: "Focused automation",
    monthlyPrice: 14.99,
    annualMonthlyPrice: 9.99,
    annualTotal: 119.88,
    copy: "For active Spot traders running focused automation.",
    features: [
      { value: "10", label: "Strategy bots" },
      { value: "10", label: "active Single-pair DCA bots" },
      { value: "1", label: "active Multi-pair DCA bot" },
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
    monthlyPrice: 39.99,
    annualMonthlyPrice: 19.99,
    annualTotal: 239.88,
    copy: "For traders running larger, multi-strategy automation setups.",
    features: [
      { value: "100", label: "Strategy bots" },
      { value: "100", label: "active Single-pair DCA bots" },
      { value: "10", label: "active Multi-pair DCA bots" },
      { value: "Unlimited", label: "Manual trades" },
      { value: "Full", label: "Paper account" },
    ],
    cta: "Choose Max →",
    featured: false,
  },
] as const;

function DisabledPerformanceCard({ plan }: { plan: "free" | "pro" }) {
  const definition = fixedPlans.find((item) => item.name.toLowerCase() === plan)!;
  const price = plan === "free" ? "$0" : "$14.99";

  return (
    <article className={`${styles.planCard} ${switchStyles.performanceDisabledCard} ${switchStyles.performanceAlignedCard}`}>
      <div className={switchStyles.performanceTop}>
        <h2>{definition.name}</h2>
        <p>Performance billing is available with Max.</p>
      </div>
      <div className={switchStyles.disabledPerformancePrice}>
        <strong>{price}</strong>
        <span>/ month</span>
        <small>{plan === "free" ? "Free forever · Live exchanges included" : "Prepaid monthly access"}</small>
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
      <span className={`${styles.popular} ${switchStyles.plainBadge}`}>Performance</span>
      <div className={switchStyles.performanceTop}>
        <h2>Max</h2>
        <p>Same Max power. A smarter way to pay.</p>
      </div>
      <div className={switchStyles.performancePrice}>
        <strong>Pay when you profit</strong>
        <span>No profit, no fee.<br />Profitable months: $0.1-$78.</span>
      </div>
      <a className={`${styles.planCta} ${switchStyles.performanceCta}`} href={PERFORMANCE_URL}>Start Performance →</a>
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
        <button className={view === "year" ? switchStyles.active : ""} onClick={() => setView("year")} type="button">Yearly <span className={switchStyles.yearlyDiscountBadge}>save 50%</span></button>
        <button className={view === "month" ? switchStyles.active : ""} onClick={() => setView("month")} type="button">Monthly</button>
        <button className={performance ? switchStyles.active : ""} onClick={() => setView("performance")} type="button">Performance</button>
      </div>

      {performance ? (
        <>
          <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", maxWidth: 1180, marginInline: "auto" }}>
            <DisabledPerformanceCard plan="free" />
            <DisabledPerformanceCard plan="pro" />
            <PerformanceMaxCard />
          </div>
          <p className={styles.limitNote}>
            Performance requires at least $2,000 in verified connected Spot balance to start. The monthly charge follows eligible realized net profit from LabNarrative Live Spot trading, never exceeds $78, and is $0 when the month is not profitable.
          </p>
        </>
      ) : (
        <>
          <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", maxWidth: 1180, marginInline: "auto" }}>
            {fixedPlans.map((plan) => {
              const free = plan.name === "Free";
              const yearly = view === "year";
              const popular = yearly ? plan.name === "Max" : plan.name === "Pro";
              const price = free ? 0 : yearly ? plan.annualMonthlyPrice : plan.monthlyPrice;
              const billing = free
                ? "Free forever · Live exchanges included"
                : yearly
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
                      {yearly && !free ? <del>{"$" + plan.monthlyPrice}</del> : null}
                      <strong>{"$" + price}</strong>
                      <span>/mo</span>
                    </div>
                    <p className={styles.billing}>{billing}</p>
                  </div>
                  <a className={`${styles.planCta} ${switchStyles.fixedCta}`} href={free ? APP_URL : PRICING_URL}>{plan.cta}</a>
                  <div className={`${switchStyles.planLimits} ${switchStyles.fixedLimits} ${popular ? switchStyles.darkLimits : ""}`}>{plan.features.map((feature) => <div key={`${feature.value}-${feature.label}`}><strong>{feature.value}</strong><span>{feature.label}</span></div>)}</div>
                </article>
              );
            })}
          </div>
          <p className={styles.limitNote}>
            {view === "year"
              ? "Pro is $9.99/month equivalent ($119.88/year) and Max is $19.99/month equivalent ($239.88/year)."
              : "Pro is $14.99/month and Max is $39.99/month."} PayPal and crypto payments are available; cards and wallets are coming soon. Monthly and annual purchases are prepaid and do not renew automatically.
          </p>
        </>
      )}
    </>
  );
}
