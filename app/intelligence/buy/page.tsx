import type { Metadata } from "next";
import brand from "../../brand.module.css";
import styles from "./buy.module.css";
import IntelligenceCheckout from "./IntelligenceCheckout";

export const metadata: Metadata = {
  title: "LabNarrative Intelligence — Portfolio Pilot",
  description: "Expand from the complimentary one-product Intelligence experience into a paid multi-product Portfolio Pilot.",
};

function Wordmark() {
  return <><span>Lab</span>Narrative <span className={brand.product}>Intelligence</span></>;
}

export default function IntelligenceBuyPage() {
  return (
    <main className={`${brand.page} ${styles.buyPage}`}>
      <header className={brand.header}>
        <a className={brand.wordmark} href="/" aria-label="LabNarrative home"><Wordmark /></a>
        <nav className={brand.nav} aria-label="Primary navigation">
          <a href="/intelligence">Intelligence</a>
          <a href="/intelligence#report">What you receive</a>
          <a href="/intelligence#pricing">Pricing</a>
        </nav>
        <a className={brand.cta} href="/intelligence">Back to Intelligence ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={brand.eyebrow}>Portfolio Pilot · introductory pricing</p>
        <div className={styles.heroGrid}>
          <h1>You have seen one product.<br /><em>Now scale the system.</em></h1>
          <div className={styles.heroAside}>
            <p>
              Your complimentary product already demonstrated the complete LabNarrative Intelligence workflow. The paid step does not unlock missing features — it expands the same workflow across more of your portfolio.
            </p>
            <strong>Portfolio Pilot from $689 · One-time payment · Secure Client Portal</strong>
          </div>
        </div>
      </section>

      <div className={styles.checkoutWrap}>
        <IntelligenceCheckout />
      </div>

      <section className={styles.below}>
        <div className={styles.belowGrid}>
          <div><span>Same complete workflow</span><p>Every paid product receives the same opportunity, evidence, account, contact, outreach and reporting standard used in the free product experience.</p></div>
          <div><span>Your free product stays yours</span><p>The complimentary product remains the reference case and is not deducted from the paid product count.</p></div>
          <div><span>Secure handoff</span><p>After PayPal confirms payment, the Client Portal opens immediately for product submission and fulfillment tracking.</p></div>
        </div>
      </section>

      <footer className={brand.footer}>
        <a className={brand.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>Scientific revenue intelligence</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
