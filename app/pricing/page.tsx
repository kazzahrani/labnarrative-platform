import type { Metadata } from "next";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Pricing — LabNarrative",
  description:
    "Simple pricing for LabNarrative crypto trading automation. Start with a 30-day Paper trial, keep a free Paper plan, and upgrade when you are ready for Live crypto Spot.",
};

const APP_URL = "https://app.labnarrative.com";
const PRICING_URL = `${APP_URL}/pricing`;

const plans = [
  {
    name: "Free",
    eyebrow: "Paper testing that stays free",
    price: "$0",
    suffix: "/mo",
    billing: "After the 30-day trial · Paper only",
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
    price: "$15",
    suffix: "/mo",
    billing: "$180/year prepaid option",
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
    price: "$29",
    suffix: "/mo",
    billing: "$348/year prepaid option",
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
    price: "$49",
    suffix: "/mo",
    billing: "$588/year prepaid option",
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
        <h1>Start in Paper.<br /><em>Pay when you go Live.</em></h1>
        <p className={styles.lead}>
          Every new account starts with 30 days of expanded Paper capacity. Forward-test first, then upgrade only when you need Live exchange connections or more scale.
        </p>
        <div className={styles.notePill}><strong>30-day Paper trial</strong><span>10 DCA bots · 10 Strategy Executions · 0 Live exchange connections · no payment required</span></div>
      </section>

      <section className={styles.planSection} aria-label="Pricing plans">
        <div className={styles.planGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {plans.map((plan) => (
            <article className={`${styles.planCard} ${plan.featured ? styles.featured : ""}`} key={plan.name}>
              {plan.badge && <span className={styles.popular}>{plan.badge}</span>}
              <p className={styles.planEyebrow}>{plan.eyebrow}</p>
              <h2>{plan.name}</h2>
              <div className={styles.priceLine}>
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
        <p className={styles.limitNote}>Monthly prices shown. Annual prepaid access is also available at $180 for Trader, $348 for Pro and $588 for Max. Paid checkout is handled with cryptocurrency through NOWPayments.</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Paper first</p>
          <h2>Test generously before risking real capital.</h2>
          <p>The trial is intentionally large enough to compare strategies. After 30 days, your account automatically continues on the Free Paper plan unless you choose to upgrade.</p>
        </div>
        <div className={styles.principleGrid}>
          <article><span>01</span><h3>30 days expanded</h3><p>New accounts can run up to 10 Paper DCA bots and 10 Paper Strategy Executions with no Live exchange connection.</p></article>
          <article><span>02</span><h3>Free stays useful</h3><p>After the trial, keep 1 Paper DCA bot and 1 Paper Strategy Execution free for ongoing forward testing.</p></article>
          <article><span>03</span><h3>Upgrade for Live</h3><p>Trader, Pro and Max unlock Live crypto Spot exchange connections and progressively more automation capacity.</p></article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Start with Paper</p>
        <h2>Give your strategy 30 days to prove itself.</h2>
        <p>No payment is required to start. If you later upgrade, paid access is prepaid through NOWPayments in cryptocurrency.</p>
        <a className={styles.primary} href={APP_URL}>Start Paper trial →</a>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div>
        <small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small>
      </footer>
    </main>
  );
}
