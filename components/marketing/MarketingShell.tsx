import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./marketing.module.css";

type MarketingShellProps = {
  children: ReactNode;
};

export function MarketingHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.wordmark} aria-label="LabNarrative home">
        LabNarrative
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link href="/work">Work</Link>
        <Link href="/#process">Process</Link>
        <Link href="/packages">Packages</Link>
        <Link href="/about">About</Link>
      </nav>
      <Link href="/start" className={styles.headerCta}>
        Request a concept
      </Link>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div>
        <Link href="/" className={styles.wordmark}>
          LabNarrative
        </Link>
        <p>Research websites shaped by scientific understanding.</p>
      </div>
      <div className={styles.footerLinks}>
        <Link href="/work">Work</Link>
        <Link href="/packages">Packages</Link>
        <Link href="/start">Start a project</Link>
        <Link href="/about">About</Link>
      </div>
      <div className={styles.footerLinks}>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/admin">Administrator</Link>
      </div>
      <p className={styles.copyright}>© 2026 LabNarrative. Riyadh, Saudi Arabia.</p>
    </footer>
  );
}

export default function MarketingShell({ children }: MarketingShellProps) {
  return (
    <div className={styles.shell}>
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
