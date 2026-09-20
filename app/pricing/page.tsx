import type { Metadata } from "next";
import PricingPlans from "./PricingPlans";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Crypto Trading Bot Pricing — Free, Pro, Max & Performance | LabNarrative",
  description:
    "Free crypto Paper trading. Fixed-price Pro and Max plans, plus Performance billing from eligible LabNarrative trading profits up to $99/month.",
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
          <p className={styles.label}>Three ways to go Live</p>
          <h2>Choose fixed pricing or pay after eligible profits.</h2>
          <p>Pro and Max use fixed prepaid pricing. Performance uses the same Live Spot workflow with a different billing model: the first eligible LabNarrative trading profits each month pay the subscription, up to $99.</p>
        </div>
        <div className={styles.principleGrid}>
          <article><span>01</span><h3>Free stays free</h3><p>Run up to 10 Paper DCA bots and 10 Paper Strategy bots permanently, with 0 Live exchange connections.</p></article>
          <article><span>02</span><h3>Pro — $14.99 monthly</h3><p>Or $9.99/month billed yearly ($119.88/year). New accounts get the full Pro plan free for 7 days. Pro includes 5 Live exchange connections, 20 active DCA bots and 20 Strategy bots.</p></article>
          <article><span>03</span><h3>Max — $29.99 monthly</h3><p>Or $19.99/month billed yearly ($239.88/year). Use all supported exchanges in the platform, with up to 100 active DCA bots and 100 Strategy bots.</p></article>
          <article><span>04</span><h3>Performance — $0–99 monthly</h3><p>Requires at least $2,500 combined connected Spot balance at the start of the month. No eligible LabNarrative profit means $0 due; the monthly fee never exceeds $99.</p></article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Start free</p>
        <h2>Start with Pro for 7 days. Keep Paper free forever.</h2>
        <p>No payment is required to start. After the 7-day Pro trial, keep up to 10 Paper DCA bots and 10 Paper Strategy bots free, or continue Live with Pro or Max.</p>
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
