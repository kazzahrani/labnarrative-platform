import type { Metadata } from "next";
import styles from "../brand.module.css";

export const metadata: Metadata = {
  title: "LabNarrative — Scientific Websites & Intelligence",
  description:
    "LabNarrative turns scientific information into clear digital presence and commercial intelligence.",
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
        </nav>
        <a className={styles.cta} href="mailto:hello@labnarrative.com">Contact ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Built around the science</p>
        <div className={styles.heroGrid}>
          <h1>Science,<br />made more<br /><em>useful.</em></h1>
          <div className={styles.heroAside}>
            <p>
              LabNarrative turns scientific information into things people can use—clear digital
              presence for research groups and evidence-backed commercial intelligence for life-science suppliers.
            </p>
            <a href="#products">Explore LabNarrative <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </section>

      <section className={styles.strip} aria-label="LabNarrative capabilities">
        <div><span>Scientific understanding</span></div>
        <div><span>Digital communication</span></div>
        <div><span>Commercial intelligence</span></div>
      </section>

      <section className={styles.products} id="products">
        <div className={styles.sectionHead}>
          <p className={styles.label}>Two ways we work</p>
          <h2>One scientific foundation. Two focused businesses.</h2>
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
        </div>
      </section>

      <section className={styles.dark}>
        <div className={styles.darkGrid}>
          <div>
            <p className={styles.label}>The common thread</p>
            <h2>We begin by understanding the science.</h2>
          </div>
          <p>
            Whether we are building a laboratory website or identifying a commercial opportunity,
            the work starts the same way: read the evidence, understand the research context and
            turn complexity into something clear enough to act on.
          </p>
        </div>
      </section>

      <section className={styles.final}>
        <p className={styles.label}>LabNarrative</p>
        <h2>Scientific work deserves better tools around it.</h2>
        <p>
          For laboratories, we build the digital home. For life-science suppliers, we identify where their products fit next.
        </p>
        <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20enquiry">Start a conversation ↗</a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/"><Wordmark /></a>
        <span>Websites · Intelligence</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
