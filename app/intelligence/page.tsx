import type { Metadata } from "next";
import styles from "../brand.module.css";

export const metadata: Metadata = {
  title: "LabNarrative Intelligence — Scientific Sales Intelligence",
  description:
    "Product-specific scientific sales intelligence for life-science suppliers. Find laboratories whose current research makes them relevant prospects.",
};

const steps = [
  ["01", "Start with the product", "We study what the reagent, assay or tool does and where it is scientifically useful."],
  ["02", "Find the research", "We identify laboratories doing current work where that product may be relevant."],
  ["03", "Verify the evidence", "Each opportunity is supported by research evidence and conservatively qualified."],
  ["04", "Make it sales-ready", "We rank the strongest opportunities and identify the people and angle needed for human outreach."],
];

const deliverables = [
  "Product-specific target laboratories",
  "Principal investigator and institution",
  "Relevant publications and scientific evidence",
  "Why the product may fit the laboratory’s work",
  "Conservative opportunity scoring",
  "Commercial contact and outreach angle where available",
];

function Wordmark() {
  return <><span>Lab</span>Narrative <span className={styles.product}>Intelligence</span></>;
}

export default function IntelligencePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="LabNarrative home"><Wordmark /></a>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#how">How it works</a>
          <a href="#report">What you receive</a>
          <a href="/websites">Websites</a>
        </nav>
        <a className={styles.cta} href="mailto:hello@labnarrative.com?subject=LabNarrative%20Intelligence%20pilot">Request a pilot ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Scientific sales intelligence for life-science suppliers</p>
        <div className={styles.heroGrid}>
          <h1>Find the labs<br />most likely to need<br /><em>your product.</em></h1>
          <div className={styles.heroAside}>
            <p>
              LabNarrative Intelligence starts with a scientific product, finds laboratories whose
              active research makes it relevant, verifies the evidence and turns the strongest matches into sales-ready opportunities.
            </p>
            <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20Intelligence%20pilot">Start with one product ↗</a>
          </div>
        </div>
      </section>

      <section className={styles.strip} aria-label="Intelligence principles">
        <div><span>Product-specific</span></div>
        <div><span>Evidence-backed</span></div>
        <div><span>Human-ready</span></div>
      </section>

      <section className={styles.dark} id="how">
        <div className={styles.darkGrid}>
          <div>
            <p className={styles.label}>How it works</p>
            <h2>From one product to a ranked scientific opportunity list.</h2>
          </div>
          <div className={styles.steps}>
            {steps.map(([number, title, copy]) => (
              <div className={styles.step} key={number}>
                <span>{number}</span>
                <div><h3>{title}</h3><p>{copy}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.deliver} id="report">
        <div className={styles.deliverGrid}>
          <div>
            <p className={styles.label}>The intelligence report</p>
            <h2>Not a contact list. A reason to contact.</h2>
          </div>
          <ul className={styles.list}>
            {deliverables.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className={styles.products}>
        <div className={styles.sectionHead}>
          <p className={styles.label}>Built for suppliers</p>
          <h2>Especially useful where product relevance depends on the experiment.</h2>
        </div>
        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Specialized reagents</small>
            <h3>Antibodies, assays & molecular tools</h3>
            <p>Find laboratories working on the targets, pathways, models and methods that create a credible product fit.</p>
            <strong>Scientific relevance before volume</strong>
          </div>
          <div className={styles.card}>
            <small>Commercial teams</small>
            <h3>Product managers & sales teams</h3>
            <p>Give commercial teams a smaller set of better prospects with evidence they can understand before outreach begins.</p>
            <strong>Built to support human selling</strong>
          </div>
        </div>
      </section>

      <section className={styles.final}>
        <p className={styles.label}>Founding pilots</p>
        <h2>Give us one product.</h2>
        <p>We’ll identify and qualify the laboratories where the science suggests a real commercial opportunity.</p>
        <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20Intelligence%20pilot">Request a pilot ↗</a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>Scientific sales intelligence</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
