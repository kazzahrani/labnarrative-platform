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
    copy: "Connect and Live-enable all supported exchanges. Upgrade only when you need automation capacity.",
    features: [
      "0 Strategy bots",
      "0 active Single-pair DCA bots",
      "0 active Multi-pair DCA bots",
      "0 Manual trades",
      "Full Paper account",
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
    copy: "For individual traders running focused Spot automation.",
    features: [
      "10 Strategy bots",
      "10 active Single-pair DCA bots",
      "1 active Multi-pair DCA bot",
      "Unlimited Manual trades",
      "Full Paper account",
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
    copy: "For traders running a larger automation setup.",
    features: [
      "100 Strategy bots",
      "100 active Single-pair DCA bots",
      "10 active Multi-pair DCA bots",
      "Unlimited Manual trades",
      "Full Paper account",
    ],
    cta: "Choose Max →",
    featured: false,
  },
] as const;

function DisabledPerformanceCard({ name, price, copy }: { name: string; price: string; copy: string }) {
  return (
    <article className={`${styles.planCard} ${switchStyles.performanceDisabledCard}`}>
      <p className={styles.planEyebrow}>FIXED-PRICE PLAN</p>
      <h2>{name}</h2>
      <div className={styles.priceLine}>
        <strong>{price}</strong>
        <span>/mo</span>
      </div>
      <p className={styles.billing}>Performance billing is available with Max.</p>
      <p className={styles.planCopy}>{copy}</p>
      <span className={`${styles.planCta} ${switchStyles.disabledCta}`}>Not available</span>
      <ul>
        <li>Switch back to Monthly or Yearly for this plan</li>
      </ul>
    </article>
  );
}

function PerformanceMaxCard() {
  return (
    <article className={`${styles.planCard} ${styles.featured} ${switchStyles.performanceCard}`}>
      <span className={styles.popular}>Performance</span>
      <p className={styles.planEyebrow}>PAY WHEN YOU PROFIT</p>
      <h2>Max</h2>
      <div className={switchStyles.performancePrice}>
        <strong>Pay when you profit</strong>
        <span>No profitable month? You pay $0.</span>
      </div>
      <p className={styles.planCopy}>Same Max power. A smarter way to pay.</p>
      <div className={switchStyles.performanceLimits}>
        <div><strong>100</strong><span>Strategy bots</span></div>
        <div><strong>100</strong><span>active Single-pair DCA bots</span></div>
        <div><strong>10</strong><span>active Multi-pair DCA bots</span></div>
        <div><strong>Unlimited</strong><span>Manual trades</span></div>
        <div><strong>Full</strong><span>Paper account</span></div>
      </div>
      <div className={switchStyles.performanceNote}>We get paid after you do. Up to $78/month.</div>
      <a className={styles.planCta} href={PERFORMANCE_URL}>Start Performance →</a>
      <p className={styles.planCopy}>All supported exchanges can be connected and Live-enabled.</p>
    </article>
  );
}

export default function PricingPlans() {
  const [view, setView] = useState<PricingView>("year");
  const performance = view === "performance";

  return (
    <>
      <div className={switchStyles.toggle} aria-label="Pricing view">
        <button className={view === "year" ? switchStyles.active : ""} onClick={() => setView("year")} type="button">Yearly</button>
        <button className={view === "month" ? switchStyles.active : ""} onClick={() => setView("month")} type="button">Monthly</button>
        <button className={performance ? switchStyles.active : ""} onClick={() => setView("performance")} type="button">Performance</button>
      </div>

      {performance ? (
        <>
          <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", maxWidth: 1180, marginInline: "auto" }}>
            <DisabledPerformanceCard name="Free" price="$0" copy="Free access stays available, but profit-based billing is reserved for Max." />
            <DisabledPerformanceCard name="Pro" price="$9.99" copy="Pro remains available on the fixed monthly and yearly pricing views." />
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
              const price = free ? 0 : yearly ? plan.annualMonthlyPrice : plan.monthlyPrice;
              const billing = free
                ? "Free forever · Live exchanges included"
                : yearly
                  ? `Billed $${plan.annualTotal.toFixed(2)}/year`
                  : "Prepaid monthly access";

              return (
                <article className={`${styles.planCard} ${plan.featured ? styles.featured : ""}`} key={plan.name}>
                  {"badge" in plan && plan.badge && <span className={styles.popular}>{plan.badge}</span>}
                  <p className={styles.planEyebrow}>{plan.eyebrow}</p>
                  <h2>{plan.name}</h2>
                  <div className={styles.priceLine}>
                    <strong>{"$" + price}</strong>
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
            {view === "year"
              ? "Pro is $9.99/month equivalent ($119.88/year) and Max is $19.99/month equivalent ($239.88/year)."
              : "Pro is $14.99/month and Max is $39.99/month."} PayPal and crypto payments are available; cards and wallets are coming soon. Monthly and annual purchases are prepaid and do not renew automatically.
          </p>
        </>
      )}
    </>
  );
}
