import type { Metadata } from "next";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Pricing — LabNarrative",
  description:
    "Simple pricing for LabNarrative crypto trading automation. Start free and scale automation capacity when you need it.",
};

const APP_URL = "https://app.labnarrative.com";
const PRICING_URL = `${APP_URL}/pricing`;

const plans = [
  {
    name: "Free",
    eyebrow: "A real way to test the platform",
    price: "$0",
    suffix: "/mo",
    billing: "No credit card required",
    copy: "Start with the core trading workspace and enough automation capacity to test LabNarrative properly.",
    features: [
      "1 exchange account",
      "2 active DCA bots",
      "1 Strategy Execution",
      "Unlimited manual trades",
      "Paper Account",
      "TradingView execution",
      "Full position controls",
      "Analytics + bot drilldown",
    ],
    cta: "Open LabNarrative →",
    featured: false,
  },
  {
    name: "Trader",
    eyebrow: "For individual traders getting serious",
    oldPrice: "$19",
    price: "$15",
    suffix: "/mo",
    billing: "$180 billed annually · Save 21%",
    copy: "More room for individual traders running several exchange connections, bots, and strategy executions.",
    features: [
      "5 exchange accounts",
      "25 active DCA bots",
      "25 Strategy Executions",
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
    eyebrow: "High-capacity automation and multi-account use",
    oldPrice: "$39",
    price: "$29",
    suffix: "/mo",
    billing: "$348 billed annually · Save 26%",
    copy: "Higher automation capacity for traders running larger bot portfolios across multiple exchange accounts.",
    features: [
      "20 exchange accounts",
      "100 active DCA bots",
      "100 Strategy Executions",
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
    oldPrice: "$89",
    price: "$49",
    suffix: "/mo",
    billing: "$588 billed annually · Save 45%",
    copy: "Maximum launch capacity at the biggest annual discount for high-volume automation and multi-account use.",
    features: [
      "50 exchange accounts",
      "500 active DCA bots",
      "500 Strategy Executions",
      "Unlimited manual trades",
      "Paper Account",
      "TradingView execution",
      "Full position controls",
      "Analytics + bot drilldown",
    ],
    cta: "Choose Max →",
    featured: true,
    badge: "Best launch value",
  },
];

function Brand() {
  return <span className={styles.brand}><img src="/labnarrative-mark.svg" alt="" />LabNarrative</span>;
}

export default function PricingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" aria-label="Home"><Brand /></a>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="/#product">Product</a>
          <a href="/#platform">Platform</a>
          <a href="/#workflow">How it works</a>
          <a className={styles.current} href="/pricing">Pricing</a>
          <a href="/affiliate">Affiliates</a>
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.signIn} href={APP_URL}>Sign in</a>
          <a className={styles.launch} href={APP_URL}>Launch app →</a>
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>LabNarrative Trading</p>
        <h1>Simple pricing.<br /><em>Generous limits.</em></h1>
        <p className={styles.lead}>
          Start free, then upgrade only when you need more scale. Core trading features stay available across plans.
        </p>
        <div className={styles.notePill}><strong>Annual pricing shown</strong><span>Trader $19 · Pro $39 · Max $89 when billed monthly</span></div>
      </section>

      <section className={styles.planSection} aria-label="Pricing plans">
        <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {plans.map((plan) => (
            <article className={`${styles.planCard} ${plan.featured ? styles.featured : ""}`} key={plan.name}>
              {plan.badge && <span className={styles.popular}>{plan.badge}</span>}
              <p className={styles.planEyebrow}>{plan.eyebrow}</p>
              <h2>{plan.name}</h2>
              <div className={styles.priceLine}>
                {plan.oldPrice && <del>{plan.oldPrice}</del>}
                <strong>{plan.price}</strong>
                <span>{plan.suffix}</span>
              </div>
              <p className={styles.billing}>{plan.billing}</p>
              <p className={styles.planCopy}>{plan.copy}</p>
              <a className={styles.planCta} href={plan.name === "Free" ? APP_URL : PRICING_URL}>{plan.cta}</a>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            </article>
          ))}
        </div>
        <p className={styles.limitNote}>Annual prices are shown as their monthly equivalent. Monthly subscriptions remain available at $19 for Trader, $39 for Pro, and $89 for Max.</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>All plans</p>
          <h2>Core trading features are not paywalled.</h2>
          <p>Paid plans increase scale instead of removing the tools needed to test the platform properly.</p>
        </div>
        <div className={styles.principleGrid}>
          <article><span>01</span><h3>Start free</h3><p>The Free plan includes paper trading, live exchange capacity, DCA automation, Strategy Execution, position controls, and analytics.</p></article>
          <article><span>02</span><h3>Upgrade for scale</h3><p>Trader, Pro, and Max increase exchange-account, DCA-bot, and Strategy Execution limits.</p></article>
          <article><span>03</span><h3>No profit tiers</h3><p>No plan claims to unlock more profitable strategies or guaranteed trading outcomes.</p></article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Start free</p>
        <h2>Open LabNarrative and choose the capacity you need.</h2>
        <p>The Free plan starts without a credit card. Upgrade from inside the trading app whenever you need more scale.</p>
        <a className={styles.primary} href={APP_URL}>Open LabNarrative →</a>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div>
        <small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small>
      </footer>
    </main>
  );
}
