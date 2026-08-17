import type { Metadata } from "next";
import brand from "../../brand.module.css";
import styles from "./buy.module.css";
import IntelligenceCheckout from "./IntelligenceCheckout";

export const metadata: Metadata = {
  title: "LabNarrative — Managed Commercial Pilot",
  description: "Choose a one-time done-for-you LabNarrative Managed Commercial Pilot across 10 or 20 products.",
};

function Wordmark() { return <><span>Lab</span>Narrative</>; }

export default function LabNarrativeBuyPage() {
  return (
    <main className={`${brand.page} ${styles.buyPage}`}>
      <header className={brand.header}>
        <a className={brand.wordmark} href="/" aria-label="LabNarrative home"><Wordmark /></a>
        <nav className={brand.nav} aria-label="Primary navigation">
          <a href="/">Platform</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/plans">Plans</a>
          <a href="/login">Client sign in</a>
        </nav>
        <a className={brand.cta} href="/plans">Back to Plans ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={brand.eyebrow}>Managed Commercial Pilot · optional done-for-you service</p>
        <div className={styles.heroGrid}>
          <h1>You have seen LabNarrative.<br /><em>Now let us run it for you.</em></h1>
          <div className={styles.heroAside}>
            <p>A Managed Commercial Pilot is separate from the recurring Starter, Growth and Pro subscriptions. LabNarrative prioritizes the selected products, runs the complete scientific revenue workflow and organizes the resulting commercial pipeline for you.</p>
            <strong>10 products $489 · 20 products $789 · One-time payment</strong>
          </div>
        </div>
      </section>

      <div className={styles.checkoutWrap}><IntelligenceCheckout /></div>

      <section className={styles.below}>
        <div className={styles.belowGrid}>
          <div><span>Done for you</span><p>LabNarrative runs product intelligence, opportunity discovery, evidence review, account/contact intelligence and campaign preparation across the selected pilot scope.</p></div>
          <div><span>Your free product stays yours</span><p>The free one-product proof remains your reference case and is not deducted from the 10- or 20-product managed pilot.</p></div>
          <div><span>Subscriptions remain separate</span><p>After the pilot, choose Starter, Growth, Pro or Enterprise if you want continuous monitoring and ongoing platform use.</p></div>
        </div>
      </section>

      <footer className={brand.footer}>
        <a className={brand.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>Scientific revenue intelligence</span>
        <a href="/login">Client Portal</a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
