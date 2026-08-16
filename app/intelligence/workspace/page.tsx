import type { Metadata } from "next";
import brand from "../brand.module.css";
import styles from "./workspace.module.css";
import IntelligenceWorkspace from "./IntelligenceWorkspace";

export const metadata: Metadata = {
  title: "Client Workspace — LabNarrative Intelligence",
  description: "Private LabNarrative Intelligence client workspace for product onboarding, research progress and report delivery.",
  robots: { index: false, follow: false },
};

function Wordmark() {
  return <><span>Lab</span>Narrative <span className={brand.product}>Intelligence</span></>;
}

export default function IntelligenceWorkspacePage() {
  return (
    <main className={`${brand.page} ${styles.workspacePage}`}>
      <header className={brand.header}>
        <a className={brand.wordmark} href="/" aria-label="LabNarrative home"><Wordmark /></a>
        <nav className={brand.nav} aria-label="Workspace navigation">
          <a href="#portfolio">Portfolio</a>
          <a href="#details">Company details</a>
          <a href="#process">Process</a>
        </nav>
        <span className={styles.privateLabel}>Private client workspace</span>
      </header>

      <IntelligenceWorkspace />

      <footer className={brand.footer}>
        <a className={brand.wordmark} href="/"><span>Lab</span>Narrative</a>
        <span>AI-powered · Scientist-validated</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
