import type { Metadata } from "next";
import styles from "../brand.module.css";

export const metadata: Metadata = {
  title: "LabNarrative Intelligence — Scientific Revenue Intelligence",
  description:
    "Experience the complete LabNarrative Intelligence workflow on one real product for free, then continue with a subscription or an optional managed commercial pilot.",
};

const steps = [
  ["01", "Understand the product", "We model the target, applications, experimental context and scientific use cases that define a credible commercial opportunity."],
  ["02", "Discover and verify opportunities", "We identify relevant laboratories, verify current scientific evidence and score product fit without presenting scientific relevance as confirmed purchase intent."],
  ["03", "Map the account and contacts", "The system turns each laboratory into a commercial account and identifies source-backed scientific or operational contact routes where available."],
  ["04", "Prepare the revenue workflow", "Opportunity intelligence, evidence, outreach preparation, follow-ups, pipeline tracking and reporting live in one connected workspace."],
];

const deliverables = [
  "Complete one-product platform experience — not a feature-limited demo",
  "Verified laboratory opportunities with conservative fit scoring",
  "Recent publications, methods, activity signals and source links",
  "Account intelligence and multiple verified contact routes where available",
  "Evidence-specific email / LinkedIn preparation with a human send gate",
  "Commercial pipeline, activity history and full web + PDF reporting",
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
          <a href="/intelligence/plans">Plans</a>
          <a href="/intelligence/login">Client sign in</a>
        </nav>
        <a className={styles.cta} href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20Intelligence%20product%20experience">Request a free product experience ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Scientific revenue intelligence for life-science suppliers</p>
        <div className={styles.heroGrid}>
          <h1>One real product.<br />The complete system.<br /><em>Free.</em></h1>
          <div className={styles.heroAside}>
            <p>
              LabNarrative Intelligence identifies scientifically credible product opportunities, explains why they matter, maps relevant contacts and turns the evidence into a commercial workflow. Your first product receives the complete experience — not a shortened teaser.
            </p>
            <a href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20Intelligence%20product%20experience">Experience Intelligence on one product ↗</a>
          </div>
        </div>
      </section>

      <section className={styles.strip} aria-label="Intelligence principles">
        <div><span>Product → opportunities</span></div>
        <div><span>Evidence → contacts</span></div>
        <div><span>Outreach → pipeline</span></div>
      </section>

      <section className={styles.dark} id="how">
        <div className={styles.darkGrid}>
          <div>
            <p className={styles.label}>How it works</p>
            <h2>From scientific product fit to commercial action.</h2>
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
            <p className={styles.label}>Free Product Proof</p>
            <h2>Not a teaser. The actual platform.</h2>
          </div>
          <ul className={styles.list}>
            {deliverables.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className={styles.products}>
        <div className={styles.sectionHead}>
          <p className={styles.label}>Plans</p>
          <div>
            <h2>Start free. Scale only when the system proves useful.</h2>
            <p style={{maxWidth:760, marginTop:28, color:"var(--muted)", lineHeight:1.75}}>
              Your first product is free. When you want continuous coverage, choose the product capacity that fits your commercial team — or ask LabNarrative to run a Managed Commercial Pilot for you.
            </p>
            <a href="/intelligence/plans" style={{display:"inline-block", marginTop:28, paddingBottom:5, borderBottom:"1px solid var(--green)", color:"var(--green)", fontSize:".75rem", fontWeight:800}}>VIEW PLANS →</a>
          </div>
        </div>
      </section>

      <section className={styles.products}>
        <div className={styles.sectionHead}>
          <p className={styles.label}>The recurring value</p>
          <h2>What changed since the last scan?</h2>
        </div>
        <p style={{maxWidth:760, marginTop:32, color:"var(--muted)", lineHeight:1.75}}>
          Subscriptions keep selected products under continuous surveillance for newly relevant labs, stronger scientific signals, contact changes and new evidence. Monitoring findings remain behind scientific review until validated.
        </p>
      </section>

      <section className={styles.final}>
        <p className={styles.label}>Start free</p>
        <h2>See the complete system on one real product.</h2>
        <p>No feature-limited trial. We demonstrate the full LabNarrative Intelligence workflow first, then you decide whether to subscribe or ask us to run a managed pilot.</p>
        <a href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20Intelligence%20product%20experience">REQUEST THE FREE PRODUCT PROOF →</a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>Scientific revenue intelligence</span>
        <a href="/intelligence/login">Client Portal</a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
