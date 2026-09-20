import type { Metadata } from "next";
import PricingPlans from "./PricingPlans";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Crypto Trading Bot Pricing — Free, Pro, Max & Performance | LabNarrative",
  description:
    "Connect supported exchanges free. Pro is $14.99/month, Max is $39.99/month, or choose Max Performance and pay only in profitable months, capped at $78/month.",
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
          <p>Every plan can connect all supported Live exchanges. Free keeps the manual and Paper workspace available; Pro and Max add automation capacity; Max Performance gives you Max capacity with profit-based monthly billing.</p>
        </div>
        <div className={styles.principleGrid}>
          <article><span>01</span><h3>Free stays free</h3><p>Connect all supported Live exchanges, use the Paper Account and make unlimited manual trades. Free includes 0 active DCA bots and 0 Strategy bots after the trial.</p></article>
          <article><span>02</span><h3>Pro or Max — fixed price</h3><p>Pro is $14.99/month or $119.88/year ($9.99/month equivalent) with 10 DCA bots + 10 Strategy bots. Max is $39.99/month or $239.88/year ($19.99/month equivalent) with 100 + 100.</p></article>
          <article><span>03</span><h3>Max Performance — pay when you profit</h3><p>Get the same 100 DCA bots, 100 Strategy bots and all supported exchanges. A non-profitable month costs $0; the monthly charge is capped at $78. A verified $2,000 Spot balance is required to start.</p></article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Start free</p>
        <h2>Start with full Pro access for 7 days. Then choose how you want to pay.</h2>
        <p>No payment is required to start. After the trial, stay on Free for exchange connections, Paper and manual trading, choose Pro or Max for fixed pricing, or use Max Performance and pay only in profitable months.</p>
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
