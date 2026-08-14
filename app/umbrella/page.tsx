import type { Metadata } from "next";
import styles from "../brand.module.css";

export const metadata: Metadata = {
  title: "LabNarrative — Websites, Intelligence & AI Business Systems",
  description:
    "LabNarrative turns complex information into useful digital products: scientific websites, commercial intelligence and custom AI-powered business systems.",
};

function Wordmark() {
  return <><span>Lab</span>Narrative</>;
}

export default function UmbrellaHomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="LabNarrative home"><Wordmark /></a>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="/websites">Websites</a>
          <a href="/intelligence">Intelligence</a>
          <a href="/systems">Systems</a>
        </nav>
        <a className={styles.cta} href="mailto:hello@labnarrative.com">Contact ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Built around complex work</p>
        <div className={styles.heroGrid}>
          <h1>Complex work,<br />made more<br /><em>useful.</em></h1>
          <div className={styles.heroAside}>
            <p>
              LabNarrative turns complex information and workflows into things people can use—
              clear scientific websites, evidence-backed commercial intelligence and custom AI-powered business systems.
            </p>
            <a href="#products">Explore LabNarrative <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </section>

      <section className={styles.strip} aria-label="LabNarrative capabilities">
        <div><span>Digital presence</span></div>
        <div><span>Commercial intelligence</span></div>
        <div><span>Business systems</span></div>
      </section>

      <section className={styles.products} id="products">
        <div className={styles.sectionHead}>
          <p className={styles.label}>Three ways we work</p>
          <h2>One standard of thinking. Three focused businesses.</h2>
        </div>

        <div className={styles.cards}>
          <a className={styles.card} href="/websites">
            <small>01 · LabNarrative Websites</small>
            <h3>Scientific websites</h3>
            <p>
              We research, write and design modern websites for principal investigators and
              laboratories—so the science is clear, credible and easy to explore.
            </p>
            <strong>Explore Websites ↗</strong>
          </a>

          <a className={styles.card} href="/intelligence">
            <small>02 · LabNarrative Intelligence</small>
            <h3>Scientific sales intelligence</h3>
            <p>
              We connect life-science products with laboratories whose current research makes
              them relevant prospects, with scientific evidence behind every opportunity.
            </p>
            <strong>Explore Intelligence ↗</strong>
          </a>

          <a className={styles.card} href="/systems">
            <small>03 · LabNarrative Systems</small>
            <h3>AI business systems</h3>
            <p>
              We build custom systems that automate leads, follow-ups, workflows and reporting—
              replacing repetitive manual work with one focused operational platform.
            </p>
            <strong>Explore Systems ↗</strong>
          </a>
        </div>
      </section>

      <section className={styles.dark}>
        <div className={styles.darkGrid}>
          <div>
            <p className={styles.label}>The common thread</p>
            <h2>Understand first. Then build what is actually useful.</h2>
          </div>
          <p>
            Whether we are communicating research, identifying a commercial opportunity or automating
            a business process, the work starts the same way: understand the context, identify what matters
            and turn complexity into something clear enough to act on.
          </p>
        </div>
      </section>

      <section className={styles.final}>
        <p className={styles.label}>LabNarrative</p>
        <h2>Better tools around important work.</h2>
        <p>
          Websites for scientific groups. Intelligence for life-science suppliers. Custom AI systems for businesses ready to operate more intelligently.
        </p>
        <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20enquiry">Start a conversation ↗</a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/"><Wordmark /></a>
        <span>Websites · Intelligence · Systems</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
