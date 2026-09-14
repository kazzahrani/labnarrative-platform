import type { Metadata } from "next";
import LearnLibrary from "./LearnLibrary";
import { learnGuides } from "./content";
import styles from "./learn.module.css";

const title = "Learn Crypto Trading Automation | LabNarrative";
const description =
  "Practical guides for crypto paper trading, Spot DCA bots, TradingView automation and switching from platforms like 3Commas, Bitsgap, Cryptohopper and Coinrule.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/learn" },
  openGraph: { title, description, url: "/learn" },
  twitter: { title, description },
};

const APP_URL = "https://app.labnarrative.com";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": "https://labnarrative.com/learn#collection",
      name: title,
      description,
      url: "https://labnarrative.com/learn",
      isPartOf: { "@id": "https://labnarrative.com/#website" },
      about: [
        "Crypto paper trading",
        "Spot DCA bots",
        "TradingView automation",
        "Crypto trading automation",
      ],
      mainEntity: {
        "@type": "ItemList",
        itemListElement: learnGuides.map((guide, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `https://labnarrative.com${guide.href}`,
          name: guide.title,
        })),
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://labnarrative.com/" },
        { "@type": "ListItem", position: 2, name: "Learn", item: "https://labnarrative.com/learn" },
      ],
    },
  ],
};

function Brand() {
  return (
    <span className={styles.brand}>
      <img src="/labnarrative-mark.svg" alt="" />
      LabNarrative
    </span>
  );
}

export default function LearnPage() {
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
        <div className={styles.utilityRow}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <a href="/">Resources</a>
            <span>›</span>
            <strong>Learn</strong>
          </nav>
        </div>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p>LabNarrative Learn</p>
            <h1>Trade with rules.<br /><em>Learn the workflow.</em></h1>
            <p>
              Practical guides for Spot DCA bots, TradingView automation, Paper Trading and platform migration. No generic crypto news—just the problems traders are actually trying to build, test and understand.
            </p>
          </div>
          <aside className={styles.heroAside}>
            <strong>Learn → test → automate</strong>
            <p>Every guide is designed to lead naturally from explanation into a supported LabNarrative Paper Trading workflow.</p>
            <a href={APP_URL}>Open free Paper Trading →</a>
          </aside>
        </section>

        <LearnLibrary />

        <section className={styles.cta}>
          <div>
            <h2>Do not stop at reading the guide.</h2>
            <p>Recreate the supported setup in LabNarrative and observe it with Paper capital before deciding whether it belongs in your Live workflow.</p>
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
