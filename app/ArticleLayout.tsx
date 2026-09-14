import type { ReactNode } from "react";
import styles from "./article-page.module.css";

const APP_URL = "https://app.labnarrative.com";

type TocItem = {
  id: string;
  label: string;
};

type RelatedGuide = {
  href: string;
  title: string;
  category: string;
  excerpt: string;
};

type ArticleLayoutProps = {
  category: string;
  title: string;
  intro: string;
  date: string;
  readTime: string;
  visualKicker: string;
  toc: TocItem[];
  relatedGuides: RelatedGuide[];
  structuredData: Record<string, unknown>;
  children: ReactNode;
};

function Brand() {
  return (
    <span className={styles.brand}>
      <img src="/labnarrative-mark.svg" alt="" />
      LabNarrative
    </span>
  );
}

export default function ArticleLayout({
  category,
  title,
  intro,
  date,
  readTime,
  visualKicker,
  toc,
  relatedGuides,
  structuredData,
  children,
}: ArticleLayoutProps) {
  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className={styles.header}>
        <a href="/" aria-label="LabNarrative home"><Brand /></a>
        <nav className={styles.headerNav} aria-label="Primary navigation">
          <a href="/#product">Product</a>
          <a href="/#platform">Platform</a>
          <a href="/#workflow">How it works</a>
          <a className={styles.active} href="/learn">Learn</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.signIn} href={APP_URL}>Sign in</a>
          <a className={styles.launch} href={APP_URL}>Launch app →</a>
        </div>
      </header>

      <div className={styles.shell}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <a href="/">Resources</a>
          <span>›</span>
          <a href="/learn">Learn</a>
          <span>›</span>
          <strong>{category}</strong>
        </nav>

        <article>
          <header className={styles.articleHeader}>
            <div className={styles.articleMeta}>
              <span>{category}</span>
              <span>{date}</span>
              <span>{readTime}</span>
            </div>
            <h1>{title}</h1>
            <p>{intro}</p>
          </header>

          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroGrid} />
            <div className={styles.heroOrb} />
            <div className={styles.heroTrace} />
            <span>LabNarrative Learn · {category}</span>
            <strong>{visualKicker}</strong>
          </div>

          <div className={styles.mobileToc}>
            <strong>Table of contents</strong>
            <ol>
              {toc.map((item) => (
                <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>
              ))}
            </ol>
          </div>

          <div className={styles.articleGrid}>
            <div className={styles.articleBody}>{children}</div>

            <aside className={styles.sidebar}>
              <nav className={styles.toc} aria-label="Table of contents">
                <strong>Table of contents</strong>
                <ol>
                  {toc.map((item) => (
                    <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>
                  ))}
                </ol>
              </nav>

              <div className={styles.sidebarCta}>
                <span>Test the workflow</span>
                <h2>Use Paper before real capital.</h2>
                <p>Recreate a supported setup with simulated capital and watch how the automation behaves over time.</p>
                <a href={APP_URL}>Open free Paper Trading →</a>
                <small>No live exchange connection required to start.</small>
              </div>
            </aside>
          </div>
        </article>

        <section className={styles.related}>
          <div className={styles.relatedHead}>
            <div>
              <span>Continue learning</span>
              <h2>Related guides</h2>
            </div>
            <a href="/learn">View all Learn guides →</a>
          </div>
          <div className={styles.relatedGrid}>
            {relatedGuides.map((guide) => (
              <a className={styles.relatedCard} href={guide.href} key={guide.href}>
                <span>{guide.category}</span>
                <h3>{guide.title}</h3>
                <p>{guide.excerpt}</p>
                <strong>Read guide →</strong>
              </a>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <span>Learn → test → automate</span>
            <h2>Reading explains the workflow. Paper Trading shows how it behaves.</h2>
            <p>Build the supported setup with simulated capital, review its positions and history, and decide what belongs in your Live workflow only after you have observed it.</p>
          </div>
          <a href={APP_URL}>Start free with Paper →</a>
        </section>
      </div>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}>
          <a href="/learn">Learn</a>
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
