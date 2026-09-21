import type { Metadata } from "next";
import PricingPlans from "./PricingPlans";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Crypto Trading Bot Pricing — Trader, Pro, Max & Performance | LabNarrative",
  description:
    "Trader is $14.99/month, Pro is $29.99/month, Max is $69.99/month, with discounted annual billing or Pay when you profit capped at $78/month.",
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

      <section className={styles.planSection} aria-label="Pricing plans">
        <PricingPlans />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Fixed + Performance pricing</p>
          <h2>Connect freely. Pay for automation — or only when you profit.</h2>
          <p>Every paid plan can connect and Live-enable all supported exchanges. Trader includes 2 Strategy bots, 2 Single-pair DCA bots, 1 Grid bot (soon) and 1 Multi-pair DCA bot. Pro includes 20 + 20 + 10 + 10. Max includes 250 + 250 + 100 + 100.</p>
        </div>
        <div className={styles.principleGrid}>
          <article><span>01</span><h3>Trader</h3><p>$14.99/month, or $119.88/year ($9.99/month equivalent), with 2 Strategy bots, 2 active Single-pair DCA bots, 1 Grid bot (soon), 1 active Multi-pair DCA bot, Unlimited Manual trades and the Full Paper account.</p></article>
          <article><span>02</span><h3>Pro or Max — fixed price</h3><p>Pro is $29.99/month or $239.88/year ($19.99/month equivalent) with 20 Strategy bots, 20 active Single-pair DCA bots, 10 Grid bots (soon) and 10 active Multi-pair DCA bots. Max is $69.99/month or $599.88/year ($49.99/month equivalent) with 250, 250, 100 and 100.</p></article>
          <article><span>03</span><h3>Max Performance — pay when you profit</h3><p>Pay when you profit remains unchanged: 100 Strategy bots, 100 active Single-pair DCA bots, 10 active Multi-pair DCA bots and Unlimited Manual trades. A non-profitable month costs $0 and the monthly charge is capped at $78.</p></article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Start free</p>
        <h2>Start with full Max access for 7 days. Then choose how you want to pay.</h2>
        <p>No payment is required to start. The first 7 days include the new Max limits: 250 Strategy bots, 250 active Single-pair DCA bots, 100 Grid bots (soon), 100 active Multi-pair DCA bots and Unlimited Manual trades. After the trial, choose Trader, Pro, Max or Pay when you profit.</p>
        <a className={styles.primary} href={APP_URL}>Start free →</a>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div>
        <small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small>
      </footer>
    </main>
  );
}
