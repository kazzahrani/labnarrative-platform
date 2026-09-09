import styles from "./trading-public-pages.module.css";

const APP_URL = "https://app.labnarrative.com";

type Card = {
  number: string;
  title: string;
  copy: string;
};

type RelatedLink = {
  href: string;
  title: string;
  copy: string;
};

type SeoLandingPageProps = {
  currentPath: string;
  eyebrow: string;
  title: string;
  emphasis: string;
  lead: string;
  noteStrong: string;
  note: string;
  introLabel: string;
  introTitle: string;
  introCopy: string;
  featureCards: Card[];
  workflowLabel: string;
  workflowTitle: string;
  workflowCopy: string;
  workflowCards: Card[];
  relatedLinks: RelatedLink[];
  finalEyebrow: string;
  finalTitle: string;
  finalCopy: string;
  structuredData: Record<string, unknown>;
};

function Brand() {
  return (
    <span className={styles.brand}>
      <img src="/labnarrative-mark.svg" alt="" />
      LabNarrative
    </span>
  );
}

export default function SeoLandingPage({
  currentPath,
  eyebrow,
  title,
  emphasis,
  lead,
  noteStrong,
  note,
  introLabel,
  introTitle,
  introCopy,
  featureCards,
  workflowLabel,
  workflowTitle,
  workflowCopy,
  workflowCards,
  relatedLinks,
  finalEyebrow,
  finalTitle,
  finalCopy,
  structuredData,
}: SeoLandingPageProps) {
  const nav = [
    ["/dca-bot", "DCA Bots"],
    ["/crypto-paper-trading", "Paper Trading"],
    ["/tradingview-automation", "TradingView"],
    ["/pricing", "Pricing"],
  ] as const;

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className={styles.header}>
        <a href="/" aria-label="LabNarrative home"><Brand /></a>
        <nav className={styles.nav} aria-label="Primary navigation">
          {nav.map(([href, label]) => (
            <a className={currentPath === href ? styles.current : ""} href={href} key={href}>{label}</a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.signIn} href={APP_URL}>Sign in</a>
          <a className={styles.launch} href={APP_URL}>Launch app →</a>
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}<br /><em>{emphasis}</em></h1>
        <p className={styles.lead}>{lead}</p>
        <div className={styles.heroActions}>
          <a className={styles.primary} href={APP_URL}>Start with Paper Trading →</a>
          <a className={styles.secondary} href="/pricing">See pricing</a>
        </div>
        <div className={styles.notePill}><strong>{noteStrong}</strong><span>{note}</span></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>{introLabel}</p>
          <h2>{introTitle}</h2>
          <p>{introCopy}</p>
        </div>
        <div className={styles.principleGrid}>
          {featureCards.map((card) => (
            <article key={card.number}>
              <span>{card.number}</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>{workflowLabel}</p>
          <h2>{workflowTitle}</h2>
          <p>{workflowCopy}</p>
        </div>
        <div className={styles.principleGrid}>
          {workflowCards.map((card) => (
            <article key={card.number}>
              <span>{card.number}</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.fitSection}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Related workflows</p>
          <h2>Explore the rest of the automation stack.</h2>
          <p>LabNarrative keeps DCA automation, paper testing, TradingView execution, position management and analytics connected in one trading workflow.</p>
        </div>
        <div className={styles.partnerGrid}>
          {relatedLinks.map((link) => (
            <article key={link.href}>
              <h3><a href={link.href}>{link.title} →</a></h3>
              <p>{link.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>{finalEyebrow}</p>
        <h2>{finalTitle}</h2>
        <p>{finalCopy}</p>
        <a className={styles.primary} href={APP_URL}>Open LabNarrative →</a>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}>
          <a href="/dca-bot">DCA Bots</a>
          <a href="/crypto-paper-trading">Paper Trading</a>
          <a href="/tradingview-automation">TradingView</a>
          <a href="/pricing">Pricing</a>
        </div>
        <small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small>
      </footer>
    </main>
  );
}
