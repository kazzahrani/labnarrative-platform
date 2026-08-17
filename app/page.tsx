import type { Metadata } from "next";
import styles from "./labnarrative.module.css";

export const metadata: Metadata = {
  title: "LabNarrative — Scientific Revenue Intelligence",
  description:
    "LabNarrative identifies scientifically credible buying opportunities for life-science suppliers and turns them into commercial action.",
};

const workflow = [
  ["01", "Understand the product", "Model the target, applications, experimental context and scientific use cases that define a credible commercial opportunity."],
  ["02", "Find the right laboratories", "Discover active research groups, verify the scientific evidence and rank product fit conservatively."],
  ["03", "Map the account", "Identify the people, roles and source-backed contact routes that make each opportunity commercially actionable."],
  ["04", "Move it into pipeline", "Prepare evidence-specific outreach, follow-ups, replies and opportunity tracking in one connected workflow."],
];

const features = [
  ["Opportunity intelligence", "Which laboratories are most relevant to this product — and why?"],
  ["Buying signals", "What recent scientific activity makes an account worth approaching now?"],
  ["Account intelligence", "Who are the relevant scientific and operational people around the opportunity?"],
  ["Revenue execution", "What should the commercial team do next, and what happened after outreach?"],
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="LabNarrative home"><span>Lab</span>Narrative</a>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="/plans">Plans</a>
          <a href="/websites">Websites</a>
          <a href="/systems">Systems</a>
          <a href="/login">Client sign in</a>
        </nav>
        <a className={styles.headerCta} href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20product%20experience">Start free ↗</a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <p className={styles.eyebrow}>Scientific revenue intelligence for life-science suppliers</p>
        <div className={styles.heroGrid}>
          <h1>Turn scientific activity into <em>commercial opportunity.</em></h1>
          <div className={styles.heroAside}>
            <p>
              LabNarrative identifies the laboratories most likely to be relevant to your products, explains the scientific evidence, maps the right contacts and turns the opportunity into a commercial workflow.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20product%20experience">Experience one product free →</a>
              <a className={styles.secondary} href="/plans">See plans</a>
            </div>
          </div>
        </div>
        <div className={styles.heroMetrics}>
          <article className={styles.metric}><span>Free product proof</span><strong>1 product</strong><p>The complete platform experience, not a limited demo.</p></article>
          <article className={styles.metric}><span>Scientific logic</span><strong>Evidence → fit</strong><p>Every opportunity is supported by research context and source-backed reasoning.</p></article>
          <article className={styles.metric}><span>Commercial workflow</span><strong>Fit → pipeline</strong><p>Contacts, outreach, follow-up and opportunity tracking stay connected.</p></article>
        </div>
      </section>

      <section className={styles.section} id="how">
        <div className={styles.sectionTop}>
          <p className={styles.label}>How LabNarrative works</p>
          <h2>From a product page to a prioritized commercial opportunity map.</h2>
        </div>
        <div className={styles.workflow}>
          {workflow.map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.dark} id="product">
        <div className={styles.darkGrid}>
          <div>
            <p className={styles.label}>The platform</p>
            <h2>Scientific intelligence designed around revenue action.</h2>
            <p className={styles.darkLead}>LabNarrative does not stop at a list of researchers. It connects product understanding, scientific evidence, account intelligence and commercial execution in one place.</p>
          </div>
          <div className={styles.featureGrid}>
            {features.map(([title,copy],i) => <article className={styles.featureCard} key={title}><span>0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
        </div>
      </section>

      <section className={styles.proof}>
        <div className={styles.proofGrid}>
          <div><p className={styles.label}>Start with proof, not promises</p><h2>One real product. The complete system. Free.</h2></div>
          <aside className={styles.proofAside}><strong>$0 to experience it.</strong><p>We run LabNarrative on one real product so you can inspect the opportunities, evidence, contacts, outreach workflow and reporting before choosing a paid plan.</p><a href="mailto:hello@labnarrative.com?subject=Complimentary%20LabNarrative%20product%20experience">Request free product proof →</a></aside>
        </div>
      </section>

      <section className={styles.branches}>
        <div className={styles.branchHead}>
          <div><p className={styles.label}>LabNarrative branches</p><h2>One brand. Three ways to grow.</h2></div>
          <p>The flagship LabNarrative platform focuses on scientific revenue intelligence. Websites and Systems remain specialized branches under the same brand.</p>
        </div>
        <div className={styles.branchGrid}>
          <a className={styles.branchCard} href="/websites"><span>LabNarrative Websites</span><h3>Scientific websites.</h3><p>Research-led websites for laboratories and scientific groups — written, designed and launched around the science.</p><b>Explore Websites →</b></a>
          <a className={styles.branchCard} href="/systems"><span>LabNarrative Systems</span><h3>Operational systems.</h3><p>Modern AI-enabled workflow systems built around the way scientific, medical and technical companies actually operate.</p><b>Explore Systems →</b></a>
        </div>
      </section>

      <section className={styles.plans}>
        <div className={styles.plansBox}><div><span>Plans</span><h2>Start free. Scale only when LabNarrative proves useful.</h2><p>Annual subscriptions are discounted and selected by default. Managed Commercial Pilots remain available as a separate done-for-you option.</p></div><a href="/plans">VIEW PLANS →</a></div>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/"><span>Lab</span>Narrative</a>
        <a href="/websites">Websites</a><a href="/systems">Systems</a><a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
