import type { Metadata } from "next";
import styles from "../labnarrative.module.css";
import pricing from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing — LabNarrative",
  description:
    "Simple pricing for LabNarrative crypto trading automation. Start with paper trading for free and move to live automation when ready.",
};

const APP_URL = "https://platform.labnarrative.com/trader";

const plans = [
  {
    name: "Paper",
    eyebrow: "Start here",
    price: "$0",
    suffix: "forever",
    billing: "No card required",
    copy: "Build and understand your strategy before putting real capital behind it.",
    features: [
      "Paper trading workspace",
      "DCA bot building in simulation",
      "Portfolio, active trades, and closed-trade history",
      "No exchange connection required",
    ],
    cta: "Open Paper Trading →",
    featured: false,
  },
  {
    name: "Trader",
    eyebrow: "For serious individual traders",
    oldPrice: "$25",
    price: "$19",
    suffix: "/mo",
    billing: "$228 billed annually",
    copy: "The core live-automation plan for traders running a focused set of strategies.",
    features: [
      "Everything in Paper",
      "Live exchange automation when paid plans open",
      "Standard live-bot and exchange limits",
      "Full trade history and strategy analytics",
      "New automation types as they become available",
    ],
    cta: "Test free first →",
    featured: true,
  },
  {
    name: "Pro",
    eyebrow: "For heavier automation",
    oldPrice: "$49",
    price: "$39",
    suffix: "/mo",
    billing: "$468 billed annually",
    copy: "Higher limits and deeper tooling for traders running more bots, exchanges, and strategies.",
    features: [
      "Everything in Trader",
      "Higher live-bot and exchange limits",
      "Multiple exchange connections as integrations are supported",
      "Advanced analytics and backtesting as released",
      "Priority support",
    ],
    cta: "Test free first →",
    featured: false,
  },
];

export default function PricingPage() {
  return (
    <main className={`${styles.page} ${pricing.pricingPage} crypto-public-page`}>
      <header className={`${styles.header} lnPublicHeader`}>
        <a className={`${styles.wordmark} lnPublicWordmark`} href="/">LabNarrative</a>
        <nav className={`${styles.nav} lnPublicNav`} aria-label="Primary navigation">
          <a href="/#product">Product</a>
          <a href="/#workflow">How it works</a>
          <a href="/#why">Why LabNarrative</a>
          <a href="/pricing">Pricing</a>
          <a href="/affiliate">Affiliates</a>
        </nav>
        <a className={styles.headerCta} href={APP_URL}>Launch app →</a>
      </header>

      <section className={pricing.hero}>
        <p className={pricing.eyebrow}>Simple pricing</p>
        <h1>Paper trading stays free.<br /><em>Pay when automation becomes real.</em></h1>
        <p className={pricing.lead}>
          Start with simulation, understand how your bot behaves, and only move to a paid live-automation plan when you are ready. Paid subscriptions are not open yet.
        </p>
        <div className={pricing.billingNote}>
          <strong>Annual pricing shown</strong>
          <span>Save about 20% versus monthly billing</span>
        </div>
      </section>

      <section className={pricing.planSection} aria-label="Pricing plans">
        <div className={pricing.planGrid}>
          {plans.map((plan) => (
            <article className={`${pricing.planCard} ${plan.featured ? pricing.featured : ""}`} key={plan.name}>
              {plan.featured && <span className={pricing.popular}>Most popular</span>}
              <p className={pricing.planEyebrow}>{plan.eyebrow}</p>
              <h2>{plan.name}</h2>
              <div className={pricing.priceLine}>
                {plan.oldPrice && <del>{plan.oldPrice}</del>}
                <strong>{plan.price}</strong>
                <span>{plan.suffix}</span>
              </div>
              <p className={pricing.billing}>{plan.billing}</p>
              <p className={pricing.planCopy}>{plan.copy}</p>
              <a className={pricing.planCta} href={APP_URL}>{plan.cta}</a>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </article>
          ))}
        </div>
        <p className={pricing.limitNote}>
          Paid-plan usage limits are intentionally not finalized during beta. We will set them from real usage rather than arbitrary restrictions.
        </p>
      </section>

      <section className={pricing.founding}>
        <div>
          <p className={pricing.eyebrow}>Founding 100</p>
          <h2>Early users should get something meaningful for being early.</h2>
          <p>
            When paid subscriptions open, we plan to offer the first 100 paying customers a <strong>$199/year Founding Trader price</strong> while they remain continuously subscribed.
          </p>
        </div>
        <aside>
          <span>Planned founding price</span>
          <strong>$199</strong>
          <small>per year</small>
          <p>Billing is not open yet.</p>
        </aside>
      </section>

      <section className={pricing.principles}>
        <p className={pricing.eyebrow}>Pricing principles</p>
        <h2>Pay for software capability, not promises of better returns.</h2>
        <div className={pricing.principleGrid}>
          <article><span>01</span><h3>Paper first</h3><p>Simulation remains the low-friction way to learn the product and test strategies.</p></article>
          <article><span>02</span><h3>Clear upgrade value</h3><p>Paid plans increase automation capacity, exchange connectivity, analytics, and support.</p></article>
          <article><span>03</span><h3>No profit tiers</h3><p>No plan claims to unlock more profitable strategies or guaranteed trading outcomes.</p></article>
        </div>
      </section>

      <section className={pricing.finalCta}>
        <p className={pricing.eyebrow}>Start free</p>
        <h2>Build the bot before you buy the plan.</h2>
        <p>Use LabNarrative with paper money now. Paid subscriptions will open later.</p>
        <a href={APP_URL}>Open Paper Trading →</a>
      </section>

      <footer className={`${styles.footer} crypto-dark-panel`}>
        <a className={`${styles.wordmark} lnPublicWordmark`} href="/">LabNarrative</a>
        <div><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a></div>
        <p>Software for trading automation. Not financial advice. Trading digital assets involves risk.</p>
      </footer>
    </main>
  );
}
