import type { Metadata } from "next";
import brand from "../../brand.module.css";
import styles from "./buy.module.css";
import IntelligenceCheckout from "./IntelligenceCheckout";

export const metadata: Metadata = {
  title: "Buy LabNarrative Intelligence — Launch Packages",
  description: "Choose a LabNarrative Intelligence portfolio package and pay securely through the connected PayPal checkout.",
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
        <p className={brand.eyebrow}>Launch discount checkout</p>
        <div className={styles.heroGrid}>
          <h1>Choose your portfolio <em>package.</em></h1>
          <div className={styles.heroAside}>
            <p>
              You have already seen the evidence standard in the complimentary report. Choose how many additional products you want LabNarrative Intelligence to analyze with the same comprehensive, source-backed workflow.
            </p>
            <strong>Launch discount · One-time payment · No subscription</strong>
          </div>
        </div>
      </section>

      <div className={styles.checkoutWrap}>
        <IntelligenceCheckout />
      </div>

      <section className={styles.below}>
        <div className={styles.belowGrid}>
          <div><span>Complete analyses</span><p>Each purchased product receives the same full opportunity analysis standard shown in the complimentary report.</p></div>
          <div><span>No artificial lab cap</span><p>The scientific search is not stopped because a report has reached an arbitrary row quota.</p></div>
          <div><span>Secure capture</span><p>PayPal creates and captures the transaction against the server-locked package amount. No shipping information is required.</p></div>
        </div>
      </section>

      <footer className={brand.footer}>
        <a className={brand.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>Product opportunity intelligence</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
