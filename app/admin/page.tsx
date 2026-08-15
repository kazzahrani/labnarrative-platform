import type { Metadata } from "next";
import styles from "./control-center.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type Branch = {
  number: string;
  name: string;
  title: string;
  description: string;
  workspaceHref: string;
  publicHref: string;
};

const branches: Branch[] = [
  {
    number: "01",
    name: "LabNarrative Websites",
    title: "Websites",
    description: "Scientific websites for principal investigators and laboratories, from discovery through publication and sales.",
    workspaceHref: "/admin/websites/sites",
    publicHref: "/websites",
  },
  {
    number: "02",
    name: "LabNarrative Intelligence",
    title: "Intelligence",
    description: "Evidence-backed commercial intelligence connecting life-science products with laboratories and decision-makers.",
    workspaceHref: "/admin/intelligence",
    publicHref: "/intelligence",
  },
  {
    number: "03",
    name: "LabNarrative Systems",
    title: "Systems",
    description: "AI-powered business systems that organize operations, automate repetitive work and improve visibility.",
    workspaceHref: "/admin/systems",
    publicHref: "/systems",
  },
];

const sharedTools = [
  { label: "Automation", href: "/admin/automation" },
  { label: "Client Care", href: "/admin/websites/care" },
  { label: "LinkedIn", href: "/admin/websites/linkedin" },
  { label: "Operations Guide", href: "/admin/guide" },
];

export default function LabNarrativeAdminHome() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandLine}>
            <a className={styles.wordmark} href="/" aria-label="LabNarrative home">
              <Wordmark />
            </a>
            <span className={styles.product}>Control Center</span>
          </div>
        </header>

        <section className={styles.hero}>
          <p className={styles.eyebrow}>LabNarrative Admin</p>
          <div className={styles.heroGrid}>
            <h1>
              All LabNarrative,
              <br />
              <em>in one place.</em>
            </h1>
            <div className={styles.heroAside}>
              <p>Choose the business you want to operate. Each branch opens its own dedicated admin workspace.</p>
              <span className={styles.activeMarker}>3 active branches</span>
            </div>
          </div>
        </section>

        <section className={styles.branchSection}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionLabel}>Businesses</p>
            <h2>Choose a branch.</h2>
          </div>

          <div className={styles.branchGrid}>
            {branches.map((branch) => (
              <article className={styles.branchCard} key={branch.name}>
                <div className={styles.cardMeta}>
                  <span>{branch.number} · {branch.name}</span>
                  <span className={styles.status}>Active</span>
                </div>

                <div className={styles.cardBody}>
                  <h3>{branch.title}</h3>
                  <p>{branch.description}</p>
                </div>

                <div className={styles.cardActions}>
                  <a className={styles.primaryButton} href={branch.workspaceHref}>
                    Open admin <span aria-hidden="true">→</span>
                  </a>
                  <a className={styles.publicLink} href={branch.publicHref}>
                    Public page ↗
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.shared}>
          <div className={styles.sharedIntro}>
            <p className={styles.sectionLabel}>Shared operations</p>
            <p>Quick access to tools used across the LabNarrative businesses.</p>
          </div>
          <div className={styles.sharedGrid}>
            {sharedTools.map((tool) => (
              <a className={styles.sharedCard} href={tool.href} key={tool.label}>
                <span>{tool.label}</span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <a className={styles.wordmark} href="/">
            <Wordmark />
          </a>
          <span>Websites · Intelligence · Systems</span>
        </footer>
      </div>
    </main>
  );
}
