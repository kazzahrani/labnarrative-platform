import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "LabNarrative Systems — AI-powered business systems",
  description:
    "Custom AI-powered systems for sales, operations, workflows, follow-up and reporting — designed around the way your business actually works.",
};

const outcomes = [
  {
    number: "01",
    title: "Capture every opportunity",
    copy: "Bring website enquiries, referrals and inbound leads into one structured pipeline instead of scattered inboxes and spreadsheets.",
  },
  {
    number: "02",
    title: "Automate the repetitive work",
    copy: "Qualify leads, prepare messages, trigger follow-ups and move work forward automatically while your team keeps control.",
  },
  {
    number: "03",
    title: "See the business clearly",
    copy: "Turn activity into a useful operating view: pipeline, priorities, response status, conversion and the next action for every account.",
  },
];

const systemModules = [
  "Lead capture",
  "CRM & pipeline",
  "AI qualification",
  "Email automation",
  "Follow-up sequences",
  "Internal workflows",
  "Dashboards",
  "Reports",
];

const useCases = [
  {
    tag: "Sales",
    title: "From enquiry to qualified opportunity.",
    copy: "Capture inbound leads, enrich the record, score fit, prepare outreach, schedule follow-ups and keep the pipeline current.",
  },
  {
    tag: "Operations",
    title: "Replace repetitive admin with a workflow.",
    copy: "Turn forms, emails, approvals and recurring manual steps into one guided system with clear ownership and status.",
  },
  {
    tag: "Reporting",
    title: "Generate useful outputs without rebuilding them each time.",
    copy: "Collect structured inputs, apply your business logic and produce consistent dashboards, summaries and client-ready reports.",
  },
];

const packages = [
  {
    name: "Launch System",
    price: "$2,500",
    subtitle: "For one high-value workflow",
    features: [
      "Lead or workflow capture",
      "Custom CRM / operating dashboard",
      "AI-assisted qualification or processing",
      "Email automation",
      "Follow-up sequence",
      "Core analytics",
    ],
  },
  {
    name: "Pro System",
    price: "$4,500",
    subtitle: "For an end-to-end business process",
    recommended: true,
    features: [
      "Everything in Launch",
      "Multiple workflows and team roles",
      "Advanced dashboard and reporting",
      "Custom business logic",
      "External integrations",
      "Deployment and handover",
    ],
  },
  {
    name: "Custom Platform",
    price: "From $7,500",
    subtitle: "For broader internal software",
    features: [
      "Multi-module internal platform",
      "Custom data model",
      "Advanced automation",
      "Role-based access",
      "AI-enabled workflows",
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
    <div className={styles.demoShell} aria-label="Example LabNarrative Systems dashboard">
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
            <span className={styles.demoEyebrow}>Sales system</span>
            <strong>Pipeline overview</strong>
          </div>
          <div className={styles.liveBadge}><span /> Live</div>
        </div>

        <div className={styles.metricGrid}>
          <article>
            <span>Open opportunities</span>
            <strong>34</strong>
            <small>+8 this month</small>
          </article>
          <article>
            <span>Qualified</span>
            <strong>18</strong>
            <small>53% of pipeline</small>
          </article>
          <article>
            <span>Follow-ups due</span>
            <strong>07</strong>
            <small>3 high priority</small>
          </article>
        </div>

        <div className={styles.demoWorkspace}>
          <div className={styles.pipelineCard}>
            <div className={styles.cardHead}>
              <strong>Opportunity pipeline</strong>
              <span>Today</span>
            </div>
            <div className={styles.pipelineRow}>
              <span>01</span>
              <div><strong>Northstar Bio</strong><small>Research services</small></div>
              <b className={styles.scoreHigh}>92</b>
              <em>Qualified</em>
            </div>
            <div className={styles.pipelineRow}>
              <span>02</span>
              <div><strong>Atlas Consulting</strong><small>Advisory</small></div>
              <b>81</b>
              <em>Follow-up</em>
            </div>
            <div className={styles.pipelineRow}>
              <span>03</span>
              <div><strong>Nexa Health</strong><small>Healthcare</small></div>
              <b>74</b>
              <em>Review</em>
            </div>
          </div>

          <div className={styles.automationCard}>
            <div className={styles.cardHead}>
              <strong>Automation</strong>
              <span>Active</span>
            </div>
            <div className={styles.flowStep}>
              <span>Lead captured</span><i>✓</i>
            </div>
            <div className={styles.flowLine} />
            <div className={styles.flowStep}>
              <span>AI qualification</span><i>✓</i>
            </div>
            <div className={styles.flowLine} />
            <div className={styles.flowStep}>
              <span>Personalised follow-up</span><i>→</i>
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
          <a href="#pricing">Pricing</a>
        </nav>
        <a className={styles.headerCta} href="mailto:hello@labnarrative.com?subject=LabNarrative%20Systems%20project">
          Build my system <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>LabNarrative Systems</p>
        <div className={styles.heroGrid}>
          <div>
            <h1>
              Build the system
              <br />
              your business
              <br />
              actually <em>needs.</em>
            </h1>
          </div>
          <div className={styles.heroAside}>
            <p>
              Custom AI-powered platforms that automate leads, follow-ups, workflows,
              reporting and repetitive operations — designed around the way your business already works.
            </p>
            <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20Systems%20project">
              Discuss your workflow <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div className={styles.heroDemo}>
          <DemoPanel />
        </div>

        <div className={styles.heroFooter}>
          <span>Custom software</span>
          <span>AI automation</span>
          <span>Human control</span>
          <span>Built around your workflow</span>
        </div>
      </section>

      <section className={styles.problemSection}>
        <p className={styles.sectionLabel}>The opportunity</p>
        <div className={styles.problemGrid}>
          <h2>Your business should not run on scattered spreadsheets, inboxes and memory.</h2>
          <div>
            <p>
              Most teams already know where time is being lost. Leads are followed up manually.
              Customer information lives in different places. Reports are rebuilt repeatedly.
              Small admin tasks interrupt the work that actually creates value.
            </p>
            <p>
              We turn that friction into one focused system — without forcing your company into
              generic enterprise software that was never designed for your process.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.outcomeSection} id="what-we-build">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>What the system changes</p>
          <span>One workflow. One source of truth.</span>
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
          <p>Typical modules</p>
          <div>
            {systemModules.map((module) => <span key={module}>{module}</span>)}
          </div>
        </div>
      </section>

      <section className={styles.useCaseSection} id="examples">
        <div className={styles.sectionToplineDark}>
          <p className={styles.sectionLabel}>Three useful starting points</p>
          <span>Start with the bottleneck that costs you most.</span>
        </div>
        <div className={styles.useCaseIntro}>
          <h2>Not “AI for AI’s sake.” A practical system tied to a measurable business process.</h2>
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
        <p className={styles.sectionLabel}>How we build</p>
        <div className={styles.buildGrid}>
          <h2>Start small enough to launch. Design well enough to expand.</h2>
          <ol>
            <li><span>01</span><div><strong>Map</strong><p>We identify the workflow, users, hand-offs and decisions that matter.</p></div></li>
            <li><span>02</span><div><strong>Build</strong><p>We create the focused system, database, automation and interface around that process.</p></div></li>
            <li><span>03</span><div><strong>Operate</strong><p>Your team uses it in the real workflow while we refine the high-value details.</p></div></li>
            <li><span>04</span><div><strong>Expand</strong><p>Once the first process works, additional modules can be added without rebuilding everything.</p></div></li>
          </ol>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>Starting engagements</p>
          <span>Clear first scope. Expand only when useful.</span>
        </div>
        <div className={styles.pricingIntro}>
          <h2>Begin with one system that removes a real bottleneck.</h2>
          <p>
            Exact scope depends on the workflow, integrations and number of users. These packages
            are designed to make the first engagement easy to understand.
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
        <p className={styles.sectionLabel}>Bring us the messy part</p>
        <h2>
          Show us the workflow
          <br />
          you wish worked <em>better.</em>
        </h2>
        <p>
          We’ll map the opportunity and recommend the smallest useful system worth building first.
        </p>
        <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20Systems%20workflow">
          Start with your workflow <span aria-hidden="true">↗</span>
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
