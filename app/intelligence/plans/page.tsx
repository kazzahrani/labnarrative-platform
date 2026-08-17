import type { Metadata } from "next";
import brand from "../../brand.module.css";
import styles from "./plans.module.css";
import PlansClient from "./PlansClient";

export const metadata: Metadata = {
  title: "LabNarrative — Plans",
  description: "Choose the LabNarrative plan that fits your product portfolio, with discounted annual billing selected by default.",
};

function Wordmark() {
  return <><span>Lab</span>Narrative</>;
}

export default function LabNarrativePlansPage() {
  return (
    <main className={`${brand.page} ${styles.page}`}>
      <header className={brand.header}>
        <a className={brand.wordmark} href="/intelligence" aria-label="LabNarrative home"><Wordmark /></a>
        <nav className={brand.nav} aria-label="Primary navigation">
          <a href="/intelligence">Platform</a>
          <a href="/intelligence#how">How it works</a>
          <a href="/intelligence#report">Free Product Proof</a>
          <a href="/intelligence/plans">Plans</a>
          <a href="/intelligence/login">Client sign in</a>
        </nav>
        <a className={brand.cta} href="mailto:hello@labnarrative.com?subject=Free%20LabNarrative%20product%20proof">Start free ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={brand.eyebrow}>Plans</p>
        <h1>Start with one product.<br /><em>Scale when it works.</em></h1>
        <p className={styles.heroCopy}>
          Experience the complete LabNarrative workflow on one real product for free. Subscribe only when you want continuous intelligence across more of your portfolio.
        </p>
      </section>

      <PlansClient />

      <footer className={brand.footer}>
        <a className={brand.wordmark} href="/intelligence"><span>Lab</span>Narrative</a>
        <span>Scientific revenue intelligence</span>
        <a href="/intelligence/login">Client Portal</a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
