import type { Metadata } from "next";
import styles from "../brand.module.css";

export const metadata: Metadata = {
  title: "LabNarrative Intelligence — Product Opportunity Intelligence",
  description:
    "Comprehensive, evidence-backed product opportunity intelligence for life-science suppliers. Start with one complimentary product analysis.",
};

const steps = [
  ["01", "Choose the right product", "We scan the portfolio and prioritize products with strong research activity, clear experimental use and the potential for a large credible laboratory opportunity pool."],
  ["02", "Research the full landscape", "We search recent scientific activity broadly instead of stopping after an arbitrary number of laboratories."],
  ["03", "Verify every opportunity", "Each included laboratory must have source-backed scientific evidence, a defensible product fit and an active research lead."],
  ["04", "Turn it into commercial intelligence", "We rank the verified laboratories, explain the experimental fit and deliver a polished web + PDF opportunity map for your commercial team."],
];

const deliverables = [
  "No artificial cap on verified laboratory opportunities",
  "Principal investigator, institution and country",
  "Recent relevant publications and source links",
  "Experimental methods and product-fit rationale",
  "Conservative fit scoring and evidence audit",
  "Commercial interpretation without claiming purchase intent",
];

const foundingPackages = [
  ["Starter", "5 products", "$399"],
  ["Portfolio", "10 products", "$699"],
  ["Portfolio Plus", "20 products", "$1,190"],
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
          <a href="#pricing">Founding 5</a>
        </nav>
        <a className={styles.cta} href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20Intelligence%20analysis">Request a free analysis ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Product opportunity intelligence for life-science suppliers</p>
        <div className={styles.heroGrid}>
          <h1>One product.<br />The strongest labs<br /><em>we can verify.</em></h1>
          <div className={styles.heroAside}>
            <p>
              LabNarrative Intelligence maps a scientific product against current research and builds a comprehensive verified opportunity report. We do not stop at 5, 20 or 40 laboratories simply because a package has reached a quota.
            </p>
            <a href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20Intelligence%20analysis">Get one complete report free ↗</a>
          </div>
        </div>
      </section>

      <section className={styles.strip} aria-label="Intelligence principles">
        <div><span>Comprehensive search</span></div>
        <div><span>Evidence-backed</span></div>
        <div><span>No artificial lab cap</span></div>
      </section>

      <section className={styles.dark} id="how">
        <div className={styles.darkGrid}>
          <div>
            <p className={styles.label}>How it works</p>
            <h2>Start with the product that can reveal the biggest credible opportunity.</h2>
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
            <p className={styles.label}>The complete product report</p>
            <h2>Not a teaser. A useful opportunity map.</h2>
          </div>
          <ul className={styles.list}>
            {deliverables.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className={styles.products} id="pricing">
        <div className={styles.sectionHead}>
          <p className={styles.label}>Founding 5 pricing</p>
          <h2>See the complete work first. Then expand across your portfolio.</h2>
        </div>
        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Complimentary demonstration</small>
            <h3>1 product</h3>
            <p>We select a high-opportunity product and prepare a complete evidence-backed report with no artificial laboratory cap.</p>
            <strong>Free</strong>
          </div>
          {foundingPackages.map(([name, scope, price]) => (
            <div className={styles.card} key={name}>
              <small>{name}</small>
              <h3>{scope}</h3>
              <p>Complete product opportunity analyses using the same research, verification and evidence standard as the demonstration report.</p>
              <strong>{price}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.dark}>
        <div className={styles.darkGrid}>
          <div>
            <p className={styles.label}>What “comprehensive” means</p>
            <h2>No invented completeness. No arbitrary quota.</h2>
          </div>
          <div>
            <p>
              We research until the defined search space is reasonably exhausted and weak or unverifiable matches are removed. A report may contain 28, 67 or 140+ verified opportunities depending on the product and available scientific literature. Scientific relevance is not buyer intent, budget or a confirmed product need.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.final}>
        <p className={styles.label}>First five paying customers</p>
        <h2>Start with a complete report at no cost.</h2>
        <p>Founding 5 pricing is reserved for the first five LabNarrative Intelligence customers. Paid packages start with 5 complete product analyses for $399. No subscription is required during the launch phase.</p>
        <a href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20Intelligence%20analysis">REQUEST A COMPLIMENTARY ANALYSIS →</a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>Product opportunity intelligence</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
