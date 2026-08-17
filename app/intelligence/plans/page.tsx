import type { Metadata } from "next";
import brand from "../../brand.module.css";
import styles from "./plans.module.css";
import PlansClient from "./PlansClient";

export const metadata: Metadata = {
  title: "LabNarrative Intelligence — Plans",
  description: "Choose the LabNarrative Intelligence plan that fits your product portfolio, with discounted annual billing selected by default.",
};

function Wordmark() {
  return <><span>Lab</span>Narrative <span className={brand.product}>Intelligence</span></>;
}

export default function IntelligencePlansPage() {
  return (
    <main className={`${brand.page} ${styles.page}`}>
      <header className={brand.header}>
        <a className={brand.wordmark} href="/" aria-label="LabNarrative home"><Wordmark /></a>
        <nav className={brand.nav} aria-label="Primary navigation">
          <a href="/intelligence">Intelligence</a>
          <a href="/intelligence#how">How it works</a>
          <a href="/intelligence#report">What you receive</a>
          <a href="/intelligence/login">Client sign in</a>
        </nav>
        <a className={brand.cta} href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20Intelligence%20product%20experience">Start free ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={brand.eyebrow}>Plans</p>
        <h1>Start with one product.<br /><em>Scale when it works.</em></h1>
        <p className={styles.heroCopy}>
          Every company can experience the complete LabNarrative Intelligence workflow on one real product for free. Choose a subscription only when you want continuous monitoring across more of your portfolio.
        </p>
      </section>

      <PlansClient />

      <footer className={brand.footer}>
        <a className={brand.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>Scientific revenue intelligence</span>
        <a href="/intelligence/login">Client Portal</a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
