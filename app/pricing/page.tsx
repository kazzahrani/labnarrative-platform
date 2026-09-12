import type { Metadata } from "next";
import PricingPlans from "./PricingPlans";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Crypto Trading Bot Pricing — Pro $9.99, Max $19.99 | LabNarrative",
  description:
    "Free crypto Paper trading, Pro at $9.99/month with 1 Live exchange and 10 bots, or Max at $19.99/month with 5 Live exchanges and 50 bots.",
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
        <h1>Free in Paper.<br /><em>Pro $9.99. Max $19.99.</em></h1>
        <p className={styles.lead}>
          Start with Paper for free. Choose Pro for a focused Live setup, or Max when you need more exchange connections and automation capacity.
        </p>
        <div className={styles.notePill}><strong>Pro $9.99 · Max $19.99</strong><span>DCA bots · TradingView automation · Positions · Signal Monitor · Analytics · 5 supported exchanges</span></div>
      </section>

      <section className={styles.planSection} aria-label="Pricing plans">
        <PricingPlans />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Two focused Live plans</p>
          <h2>Start small. Scale only when you need to.</h2>
          <p>Both paid plans include the same core crypto Spot automation workflow. The difference is simply how many Live exchange connections, DCA bots and Strategy bots you can run.</p>
        </div>
        <div className={styles.principleGrid}>
          <article><span>01</span><h3>Paper stays free</h3><p>New accounts begin with 7 days of Pro capacity: 1 Live exchange connection, 10 DCA bots and 10 Strategy bots. After that, keep one Paper DCA bot and one Paper Strategy bot free.</p></article>
          <article><span>02</span><h3>Pro — $9.99</h3><p>1 Live exchange connection, 10 active DCA bots and 10 Strategy bots.</p></article>
          <article><span>03</span><h3>Max — $19.99</h3><p>5 Live exchange connections, 50 active DCA bots and 50 Strategy bots.</p></article>
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
        <h2>Test in Paper. Upgrade only when you go Live.</h2>
        <p>No payment is required to start. New accounts include a 7-day Pro trial, then you can stay on Free Paper or choose Pro at $9.99/month or Max at $19.99/month inside the app.</p>
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
