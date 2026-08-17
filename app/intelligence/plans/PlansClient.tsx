"use client";

import { useState } from "react";
import styles from "./plans.module.css";

type Billing = "annual" | "monthly";

type Plan = {
  key: string;
  name: string;
  products: string;
  monthly: number;
  annualMonthly: number;
  annualTotal: number;
  description: string;
  features: string[];
  featured?: boolean;
};

const plans: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    products: "5 active products",
    monthly: 249,
    annualMonthly: 199,
    annualTotal: 2388,
    description: "For a focused commercial team starting with a small group of priority products.",
    features: ["Continuous opportunity discovery", "Scientific evidence + buying signals", "Account and contact intelligence", "Outreach + follow-up workflow", "Full web + PDF reports"],
  },
  {
    key: "growth",
    name: "Growth",
    products: "15 active products",
    monthly: 489,
    annualMonthly: 389,
    annualTotal: 4668,
    description: "For suppliers using LabNarrative as an active part of their commercial process.",
    features: ["Everything in Starter", "Larger continuous opportunity coverage", "Multiple active campaigns", "Expanded contact intelligence", "Commercial pipeline tracking"],
    featured: true,
  },
  {
    key: "pro",
    name: "Pro",
    products: "40 active products",
    monthly: 889,
    annualMonthly: 709,
    annualTotal: 8508,
    description: "For larger portfolios, multiple campaigns and broader commercial teams.",
    features: ["Everything in Growth", "40 continuously monitored products", "Broader campaign capacity", "Portfolio-level intelligence", "Priority commercial workflows"],
  },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function PlansClient() {
  const [billing, setBilling] = useState<Billing>("annual");
  const annual = billing === "annual";

  return (
    <>
      <section className={styles.pricingSection}>
        <div className={styles.pricingTopline}>
          <div>
            <span className={styles.kicker}>Subscription plans</span>
            <h2>Choose your coverage.</h2>
          </div>
          <div className={styles.toggleShell} role="group" aria-label="Billing period">
            <button type="button" className={!annual ? styles.toggleActive : ""} onClick={() => setBilling("monthly")}>Monthly</button>
            <button type="button" className={annual ? styles.toggleActive : ""} onClick={() => setBilling("annual")}>Annual <span>Save ~20%</span></button>
          </div>
        </div>

        <div className={styles.freeBanner}>
          <div>
            <span className={styles.freeBadge}>Free Product Proof</span>
            <h3>1 complete product. $0.</h3>
            <p>Experience the full platform — opportunities, evidence, contacts, outreach preparation, follow-ups, pipeline and reporting — before paying anything.</p>
          </div>
          <a href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20product%20experience">START FREE →</a>
        </div>

        <div className={styles.planGrid}>
          {plans.map((plan) => {
            const price = annual ? plan.annualMonthly : plan.monthly;
            return (
              <article className={`${styles.planCard} ${plan.featured ? styles.featured : ""}`} key={plan.key}>
                {plan.featured ? <div className={styles.popular}>Most popular</div> : null}
                <div className={styles.planHead}>
                  <span>{plan.name}</span>
                  <strong>{plan.products}</strong>
                </div>
                <p className={styles.description}>{plan.description}</p>
                <div className={styles.priceRow}>
                  <b>{money(price)}</b>
                  <span>/month</span>
                </div>
                <div className={styles.billingNote}>
                  {annual ? <>Billed annually · {money(plan.annualTotal)} once per year</> : <>Billed month-to-month</>}
                </div>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <a className={styles.planButton} href={`mailto:hello@labnarrative.com?subject=LabNarrative%20${encodeURIComponent(plan.name)}%20subscription`}>Choose {plan.name} →</a>
              </article>
            );
          })}

          <article className={`${styles.planCard} ${styles.enterprise}`}>
            <div className={styles.planHead}>
              <span>Enterprise</span>
              <strong>Custom portfolio</strong>
            </div>
            <p className={styles.description}>For larger suppliers, multiple commercial teams, territories, broader catalogues and integration requirements.</p>
            <div className={styles.priceRow}><b>Custom</b></div>
            <div className={styles.billingNote}>Tailored around portfolio size and operating model</div>
            <ul>
              <li>Custom product capacity</li>
              <li>Multiple teams and territories</li>
              <li>Advanced commercial workflows</li>
              <li>CRM / integration support</li>
              <li>Priority support</li>
            </ul>
            <a className={styles.planButton} href="mailto:hello@labnarrative.com?subject=LabNarrative%20Enterprise">Talk to us →</a>
          </article>
        </div>
      </section>

      <section className={styles.pilotSection}>
        <div className={styles.pilotIntro}>
          <span className={styles.kicker}>Prefer us to run it for you?</span>
          <h2>Managed Commercial Pilot</h2>
          <p>A separate one-time, done-for-you service for companies that want LabNarrative to run the commercial experiment before committing to ongoing platform use.</p>
        </div>
        <div className={styles.pilotGrid}>
          <a className={styles.pilotCard} href="/buy?package=portfolio">
            <span>Managed Pilot</span>
            <h3>10 products</h3>
            <p>LabNarrative prioritizes the products, runs the complete intelligence workflow and organizes the resulting commercial pipeline.</p>
            <strong>$489 once</strong>
            <b>Start pilot →</b>
          </a>
          <a className={styles.pilotCard} href="/buy?package=portfolio_plus">
            <span>Managed Pilot Plus</span>
            <h3>20 products</h3>
            <p>A broader portfolio proof with the same done-for-you intelligence, opportunity and commercial workflow.</p>
            <strong>$789 once</strong>
            <b>Start pilot →</b>
          </a>
        </div>
      </section>
    </>
  );
}
