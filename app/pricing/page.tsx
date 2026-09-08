import type { Metadata } from "next";
import PricingPlans from "./PricingPlans";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Pricing — LabNarrative",
  description:
    "Simple pricing for LabNarrative crypto trading automation. Start with a 30-day Paper trial, keep a free Paper plan, and upgrade when you are ready for Live crypto Spot.",
};

const APP_URL = "https://app.labnarrative.com";

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
        <PricingPlans />
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
