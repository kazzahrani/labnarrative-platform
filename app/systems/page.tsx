import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "LabNarrative Systems — Custom operational systems",
  description:
    "Fast, modern operational systems built around the way your company actually works — from tender and quotation to supply, collection and management visibility.",
};

const outcomes = [
  {
    number: "01",
    title: "Keep the workflow complete",
    copy: "Connect tenders, quotations, orders, warehouse readiness, supply, invoices and collection so work does not disappear between departments.",
  },
  {
    number: "02",
    title: "Catch what needs attention",
    copy: "Surface missing line items, approaching deadlines, stock shortages, incomplete deliveries and overdue invoices before they become bigger problems.",
  },
  {
    number: "03",
    title: "Give management one clear view",
    copy: "See what is active, delayed, at risk, outstanding and collectible without asking several teams to rebuild the picture manually.",
  },
];

const systemModules = [
  "Tenders / enquiries",
  "Quotations",
  "Orders",
  "Warehouse",
  "Supply",
  "Invoices",
  "Collection",
  "Management overview",
];

const useCases = [
  {
    tag: "Distributor operations",
    title: "From tender to collection — without losing a line item.",
    copy: "Track commercial and operational work as one connected journey, with item-level readiness, ownership, deadlines and management visibility.",
  },
  {
    tag: "Management",
    title: "See the important problems before they reach your desk.",
    copy: "A focused Overview shows active work, delivery risks, outstanding invoices, collection priorities and the issues that need intervention now.",
  },
  {
    tag: "Existing systems",
    title: "Add the missing workflow without replacing everything.",
    copy: "LabNarrative Systems can sit alongside tools such as Odoo, Zoho and existing ERP or accounting software, then connect the workflows your team still manages manually.",
  },
];

const packages = [
  {
    name: "Operational Pilot",
    price: "SAR 7,500",
    subtitle: "Start with one high-value workflow",
    recommended: true,
    features: [
      "Discovery and workflow mapping",
      "Working company-specific pilot",
      "Management overview",
      "Core operational modules",
      "Targeted automation and AI assistance",
      "Real-team testing before expansion",
    ],
  },
  {
    name: "Full Operational System",
    price: "Scoped after pilot",
    subtitle: "Expand the validated workflow across the business",
    features: [
      "End-to-end operating process",
      "Team roles and permissions",
      "Advanced workflow logic",
      "Odoo / Zoho / ERP integrations",
      "Reporting and management controls",
      "Training, rollout and expansion plan",
    ],
  },
  {
    name: "Group Platform",
    price: "Custom scope",
    subtitle: "For multiple companies, branches or business units",
    features: [
      "Separate company workspaces",
      "Group-level management overview",
      "Shared or isolated permissions",
      "Cross-company reporting",
      "Advanced integrations and automation",
      "Ongoing expansion options",
    ],
  },
];

function Wordmark() {
  return (
    <>
      <span className={styles.logoLab}>Lab</span>
      <span className={styles.logoNarrative}>Narrative</span>
    </>
  );
}

function DemoPanel() {
  return (
    <div className={styles.demoShell} aria-label="Example LabNarrative Systems management overview">
      <div className={styles.demoRail}>
        <div className={styles.demoMark}>LN</div>
        <span className={styles.railActive}>01</span>
        <span>02</span>
        <span>03</span>
        <span>04</span>
      </div>

      <div className={styles.demoMain}>
        <div className={styles.demoTopbar}>
          <div>
            <span className={styles.demoEyebrow}>Operations system</span>
            <strong>Management overview</strong>
          </div>
          <div className={styles.liveBadge}><span /> Live</div>
        </div>

        <div className={styles.metricGrid}>
          <article>
            <span>Active tenders</span>
            <strong>12</strong>
            <small>3 due this week</small>
          </article>
          <article>
            <span>Orders at risk</span>
            <strong>04</strong>
            <small>Missing items or stock</small>
          </article>
          <article>
            <span>Collection due</span>
            <strong>186K</strong>
            <small>SAR outstanding</small>
          </article>
        </div>

        <div className={styles.demoWorkspace}>
          <div className={styles.pipelineCard}>
            <div className={styles.cardHead}>
              <strong>Needs attention now</strong>
              <span>Today</span>
            </div>
            <div className={styles.pipelineRow}>
              <span>01</span>
              <div><strong>Tender deadline</strong><small>Technical document still missing</small></div>
              <b className={styles.scoreHigh}>31h</b>
              <em>Urgent</em>
            </div>
            <div className={styles.pipelineRow}>
              <span>02</span>
              <div><strong>Supply readiness</strong><small>21 of 24 line items ready</small></div>
              <b>3</b>
              <em>Blocked</em>
            </div>
            <div className={styles.pipelineRow}>
              <span>03</span>
              <div><strong>Invoice collection</strong><small>SAR 186,000 outstanding</small></div>
              <b>18d</b>
              <em>Overdue</em>
            </div>
          </div>

          <div className={styles.automationCard}>
            <div className={styles.cardHead}>
              <strong>Connected workflow</strong>
              <span>Active</span>
            </div>
            <div className={styles.flowStep}>
              <span>Tender → quotation</span><i>✓</i>
            </div>
            <div className={styles.flowLine} />
            <div className={styles.flowStep}>
              <span>Order → warehouse</span><i>✓</i>
            </div>
            <div className={styles.flowLine} />
            <div className={styles.flowStep}>
              <span>Supply → collection</span><i>→</i>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SystemsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="LabNarrative home">
          <Wordmark />
        </a>
        <nav className={styles.nav} aria-label="Systems navigation">
          <a href="#what-we-build">What we build</a>
          <a href="#examples">Examples</a>
          <a href="/systems/demo">Live demo</a>
          <a href="#pricing">Pilot</a>
        </nav>
        <a className={styles.headerCta} href="mailto:hello@labnarrative.com?subject=LabNarrative%20Systems%20workflow">
          Discuss your workflow <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>LabNarrative Systems</p>
        <div className={styles.heroGrid}>
          <div>
            <h1>
              Your workflow.
              <br />
              One modern
              <br />
              <em>operating system.</em>
            </h1>
          </div>
          <div className={styles.heroAside}>
            <p>
              Fast, modern operational systems built around the way your company already works — connecting the steps your team still follows across spreadsheets, messages and separate software.
            </p>
            <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20Systems%20workflow">
              Show us the bottleneck <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div className={styles.heroDemo}>
          <a href="/systems/demo" aria-label="Open the interactive LabNarrative Systems demo" style={{ display: "block" }}>
            <DemoPanel />
          </a>
        </div>

        <div className={styles.heroFooter}>
          <span>Fast & easy to use</span>
          <span>Built around your workflow</span>
          <span>Works alongside existing systems</span>
          <span>AI where it is useful</span>
        </div>
      </section>

      <section className={styles.problemSection}>
        <p className={styles.sectionLabel}>Built around the real work</p>
        <div className={styles.problemGrid}>
          <h2>The problem is rarely “we need another CRM.” It is the work that still falls between systems.</h2>
          <div>
            <p>
              A quotation is prepared in one place, tender deadlines are tracked somewhere else, warehouse readiness is checked manually, supply is followed through messages, and management has to ask several people for the full picture.
            </p>
            <p>
              We map that real workflow and build a focused operating layer around it — without forcing the company to abandon software that already works.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.outcomeSection} id="what-we-build">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>What the system changes</p>
          <span>From tender to collection. One connected view.</span>
        </div>
        <div className={styles.outcomeGrid}>
          {outcomes.map((item) => (
            <article key={item.number}>
              <span className={styles.number}>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>

        <div className={styles.moduleBand}>
          <p>Typical distributor workflow</p>
          <div>
            {systemModules.map((module) => <span key={module}>{module}</span>)}
          </div>
        </div>
      </section>

      <section className={styles.useCaseSection} id="examples">
        <div className={styles.sectionToplineDark}>
          <p className={styles.sectionLabel}>Where we start</p>
          <span>Scientific · medical · laboratory · technical operations</span>
        </div>
        <div className={styles.useCaseIntro}>
          <h2>Not generic AI software. A practical operating system shaped around the process that matters.</h2>
        </div>
        <div className={styles.useCaseGrid}>
          {useCases.map((item) => (
            <article key={item.tag}>
              <span>{item.tag}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.buildSection}>
        <p className={styles.sectionLabel}>Discovery-led implementation</p>
        <div className={styles.buildGrid}>
          <h2>We do not guess your whole company before speaking to your team.</h2>
          <ol>
            <li><span>01</span><div><strong>Discover</strong><p>We identify the 2–3 areas taking the most time, causing errors or requiring the most manual follow-up.</p></div></li>
            <li><span>02</span><div><strong>Pilot</strong><p>We build one real, usable workflow around the highest-value bottleneck and let the team test it.</p></div></li>
            <li><span>03</span><div><strong>Prove</strong><p>We refine the system using real operational feedback and measure whether it improves visibility, speed or execution.</p></div></li>
            <li><span>04</span><div><strong>Expand</strong><p>Only after the pilot works do we add integrations, departments, branches or additional companies.</p></div></li>
          </ol>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>Start with a paid pilot</p>
          <span>Small enough to test. Designed to expand.</span>
        </div>
        <div className={styles.pricingIntro}>
          <h2>Validate one important workflow before committing to a full company-wide system.</h2>
          <p>
            The pilot is intentionally focused. A full implementation is scoped separately after we understand the real workflow, integrations, users, branches and management requirements.
          </p>
        </div>
        <div className={styles.pricingGrid}>
          {packages.map((item) => (
            <article className={item.recommended ? styles.recommended : undefined} key={item.name}>
              {item.recommended ? <span className={styles.badge}>Best starting point</span> : null}
              <h3>{item.name}</h3>
              <strong>{item.price}</strong>
              <p>{item.subtitle}</p>
              <ul>
                {item.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionLabel}>Start with the pain, not the software</p>
        <h2>
          What are the 2–3 things
          <br />
          your team follows up <em>manually?</em>
        </h2>
        <p>
          Show us how the work happens today. We will identify the smallest useful pilot worth building first.
        </p>
        <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20Systems%20workflow">
          Discuss your workflow <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/"><Wordmark /></a>
        <span>Systems</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
        <span>© 2026 LabNarrative</span>
      </footer>
    </main>
  );
}
