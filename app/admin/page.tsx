import type { Metadata } from "next";
import styles from "./control-center.module.css";

export const metadata: Metadata = {
  title: "LabNarrative Control Center",
  description: "Central access point for LabNarrative Websites, Intelligence and Systems.",
  robots: { index: false, follow: false },
};

function Wordmark() {
  return (
    <>
      <span>Lab</span>Narrative
    </>
  );
}

type ToolLink = {
  label: string;
  hint: string;
  href: string;
};

type Branch = {
  number: string;
  name: string;
  title: string;
  description: string;
  publicHref: string;
  workspaceHref: string;
  workspaceLabel: string;
  tools: ToolLink[];
};

const branches: Branch[] = [
  {
    number: "01",
    name: "LabNarrative Websites",
    title: "Websites",
    description:
      "Scientific websites for principal investigators and laboratories, supported by the full discovery, production, review and sales workflow.",
    publicHref: "/websites",
    workspaceHref: "/admin/websites/sites",
    workspaceLabel: "Open Websites admin",
    tools: [
      { label: "Sites", hint: "Website portfolio + production", href: "/admin/websites/sites" },
      { label: "Discovery", hint: "Find strong PIs", href: "/admin/websites/discovery" },
      { label: "Final Review", hint: "Human publication gate", href: "/admin/websites/review" },
      { label: "Sales", hint: "Clients + conversion", href: "/admin/websites/sales" },
      { label: "Outreach", hint: "Email + follow-ups", href: "/admin/websites/outreach" },
    ],
  },
  {
    number: "02",
    name: "LabNarrative Intelligence",
    title: "Intelligence",
    description:
      "Evidence-backed commercial intelligence for life-science suppliers, connecting products with relevant laboratories and decision-makers.",
    publicHref: "/intelligence",
    workspaceHref: "/admin/intelligence",
    workspaceLabel: "Open Intelligence admin",
    tools: [
      {
        label: "Intelligence Platform",
        hint: "Dashboard + pipeline",
        href: "/admin/intelligence",
      },
      {
        label: "Public Intelligence Page",
        hint: "Service overview",
        href: "/intelligence",
      },
    ],
  },
  {
    number: "03",
    name: "LabNarrative Systems",
    title: "Systems",
    description:
      "Custom AI-powered business systems that organize workflows, automate repetitive work and turn operations into focused digital platforms.",
    publicHref: "/systems",
    workspaceHref: "/admin/systems",
    workspaceLabel: "Open Systems admin",
    tools: [
      {
        label: "Acquisition",
        hint: "Prospects + outreach",
        href: "/admin/systems-outreach",
      },
      {
        label: "Master Demo",
        hint: "Systems showcase",
        href: "/systems/demo",
      },
      {
        label: "Medical Masar Demo",
        hint: "Laboratory supplier flow",
        href: "/systems/demos/medical-masar",
      },
    ],
  },
];

const sharedTools = [
  {
    label: "Automation",
    description: "Scheduled and operational workers",
    href: "/admin/automation",
  },
  {
    label: "Client Care",
    description: "Annual care and active website clients",
    href: "/admin/websites/care",
  },
  {
    label: "LinkedIn",
    description: "Website outreach tracking",
    href: "/admin/websites/linkedin",
  },
  {
    label: "Operations Guide",
    description: "Internal platform guidance",
    href: "/admin/guide",
  },
];

export default function LabNarrativeAdminHome() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brandLine}>
          <a className={styles.wordmark} href="/" aria-label="LabNarrative home">
            <Wordmark />
          </a>
          <span className={styles.product}>Control Center</span>
        </div>
        <div className={styles.headerActions}>
          <a href="/">Public site ↗</a>
          <a href="/admin/websites/sites">Websites admin ↗</a>
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>LabNarrative Admin</p>
        <div className={styles.heroGrid}>
          <h1>
            All LabNarrative,
            <br />
            in <em>one place.</em>
          </h1>
          <div className={styles.heroAside}>
            <p>
              One starting point for the three LabNarrative businesses and the internal tools that run them.
            </p>
            <span className={styles.activeMarker}>3 active branches</span>
          </div>
        </div>
      </section>

      <section className={styles.branchSection}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>Businesses</p>
          <h2>Choose the branch you want to operate.</h2>
        </div>

        <div className={styles.branchGrid}>
          {branches.map((branch) => (
            <article className={styles.branchCard} key={branch.name}>
              <div className={styles.cardMeta}>
                <span>{branch.number} · {branch.name}</span>
                <span className={styles.status}>Active</span>
              </div>

              <h3>{branch.title}</h3>
              <p>{branch.description}</p>

              <div className={styles.cardActions}>
                <a className={styles.primaryButton} href={branch.workspaceHref}>
                  {branch.workspaceLabel} <span aria-hidden="true">↗</span>
                </a>
                <a className={styles.secondaryButton} href={branch.publicHref}>
                  View public site <span aria-hidden="true">↗</span>
                </a>
              </div>

              <div className={styles.tools}>
                <p className={styles.toolsLabel}>Key workspaces</p>
                {branch.tools.map((tool) => (
                  <a className={styles.toolLink} href={tool.href} key={`${branch.name}-${tool.label}`}>
                    <span>{tool.label}</span>
                    <small>{tool.hint} ↗</small>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.shared}>
        <div className={styles.sharedTop}>
          <p className={styles.sectionLabel}>Shared operations</p>
          <h2>Tools that support LabNarrative across branches.</h2>
        </div>

        <div className={styles.sharedGrid}>
          {sharedTools.map((tool) => (
            <a className={styles.sharedCard} href={tool.href} key={tool.label}>
              <small>Internal</small>
              <strong>{tool.label}</strong>
              <span>{tool.description} ↗</span>
            </a>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/">
          <Wordmark />
        </a>
        <span>Websites · Intelligence · Systems</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
