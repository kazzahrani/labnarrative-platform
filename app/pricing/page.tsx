import type { Metadata } from "next";
import PricingPlans from "./PricingPlans";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Crypto Trading Bot Pricing — $9.99/Month | LabNarrative",
  description:
    "Free crypto Paper trading plus one simple Live Spot automation plan at $9.99/month or $7.99/month billed annually. DCA bots, TradingView automation, Signal Monitor and analytics included.",
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
        <p className={styles.eyebrow}>Simple pricing</p>
        <h1>Free in Paper.<br /><em>$9.99 when you go Live.</em></h1>
        <p className={styles.lead}>
          No $30, $50 or $70 plan ladder. Paper-test for free, then use the full focused Spot automation workflow for $9.99/month — or $7.99/month when billed annually.
        </p>
        <div className={styles.notePill}><strong>$9.99 monthly · $7.99 annual equivalent</strong><span>DCA bots · TradingView automation · Positions · Signal Monitor · Analytics · 5 supported exchanges</span></div>
      </section>

      <section className={styles.planSection} aria-label="Pricing plans">
        <PricingPlans />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>One focused paid plan</p>
          <h2>Pay for the automation you use, not a giant feature bundle.</h2>
          <p>LabNarrative focuses on crypto Spot automation: DCA bots and TradingView Strategy Executions, with Paper testing, positions, signal visibility and analytics in the same workspace.</p>
        </div>
        <div className={styles.principleGrid}>
          <article><span>01</span><h3>Paper stays free</h3><p>New accounts begin with 30 days of expanded Paper capacity. After that, keep one Paper DCA bot and one Paper Strategy Execution free.</p></article>
          <article><span>02</span><h3>Five major exchanges</h3><p>Connect Binance, Bybit, KuCoin, OKX and Kraken for supported Live Spot automation.</p></article>
          <article><span>03</span><h3>One Live price</h3><p>$9.99 monthly, or $95.88 prepaid for one year — equivalent to $7.99/month.</p></article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Already paying another platform?</p>
          <h2>Compare your current setup before you switch.</h2>
          <p>If you use 3Commas, Bitsgap, Coinrule or Cryptohopper mainly for compatible Spot DCA or TradingView automation, send us your setup. We’ll help recreate the supported configuration in LabNarrative so you can compare it first.</p>
        </div>
        <a className={styles.primary} href="mailto:hello@labnarrative.com?subject=Help%20me%20switch%20to%20LabNarrative">Get migration help →</a>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Start free</p>
        <h2>Test in Paper. Go Live for $9.99.</h2>
        <p>No payment is required to start. When you are ready for Live Spot automation, upgrade inside the app.</p>
        <a className={styles.primary} href={APP_URL}>Start with Paper →</a>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div>
        <small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small>
      </footer>
    </main>
  );
}
