import type { Metadata } from "next";
import styles from "../trading-public-pages.module.css";

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

const coreGuides = [
  {
    href: "/crypto-paper-trading",
    title: "Crypto Paper Trading",
    copy: "Learn how to test DCA bots and TradingView-driven Spot automation with simulated capital before deciding whether to trade Live.",
  },
  {
    href: "/dca-bot",
    title: "Crypto DCA Bots",
    copy: "Understand rule-based Spot DCA automation, entries, safety orders, averaging, exits and how to validate a setup before funding it.",
  },
  {
    href: "/tradingview-automation",
    title: "TradingView Automation",
    copy: "Learn how TradingView strategy signals can trigger controlled crypto Spot execution while keeping signals and outcomes visible.",
  },
];

const migrationGuides = [
  {
    href: "/3commas-alternative",
    title: "3Commas Alternative",
    copy: "Compare a focused Spot DCA and TradingView workflow with 3Commas and see what a compatible migration can look like.",
  },
  {
    href: "/bitsgap-alternative",
    title: "Bitsgap Alternative",
    copy: "Explore LabNarrative as a simpler option for traders whose core workflow is Spot automation, paper testing and visibility.",
  },
  {
    href: "/cryptohopper-alternative",
    title: "Cryptohopper Alternative",
    copy: "See how a focused DCA and TradingView automation workflow compares when you do not need a broader bot marketplace.",
  },
  {
    href: "/coinrule-alternative",
    title: "Coinrule Alternative",
    copy: "Compare rule-driven crypto automation approaches and learn where LabNarrative fits for Spot traders who want to test before going Live.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
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
    itemListElement: [...coreGuides, ...migrationGuides].map((guide, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://labnarrative.com${guide.href}`,
      name: guide.title,
    })),
  },
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
        <nav className={styles.nav} aria-label="Primary navigation">
          <a className={styles.current} href="/learn">Learn</a>
          <a href="/dca-bot">DCA Bots</a>
          <a href="/crypto-paper-trading">Paper Trading</a>
          <a href="/tradingview-automation">TradingView</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.signIn} href={APP_URL}>Sign in</a>
          <a className={styles.launch} href={APP_URL}>Launch app →</a>
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>LabNarrative Learn</p>
        <h1>Learn crypto automation.<br /><em>Then test it for yourself.</em></h1>
        <p className={styles.lead}>
          Practical guides for Spot DCA bots, TradingView automation, Paper Trading and migration from other bot platforms. Start with the problem you are trying to solve, understand the workflow, then test it with simulated capital.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.primary} href={APP_URL}>Start free with Paper →</a>
          <a className={styles.secondary} href="/crypto-paper-trading">Start with Paper Trading</a>
        </div>
        <div className={styles.notePill}>
          <strong>Problem-first guides</strong>
          <span>No generic crypto news. Focused on workflows traders are actually trying to build, test or migrate.</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Start here</p>
          <h2>Build the core automation workflow.</h2>
          <p>
            These guides cover the three workflows at the center of LabNarrative: designing Spot DCA automation, validating it in Paper and connecting TradingView strategy signals to execution.
          </p>
        </div>
        <div className={styles.partnerGrid}>
          {coreGuides.map((guide) => (
            <article key={guide.href}>
              <h3><a href={guide.href}>{guide.title} →</a></h3>
              <p>{guide.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.fitSection}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Switching platforms</p>
          <h2>Start from the setup you already know.</h2>
          <p>
            If you already use another crypto bot platform, these comparison guides focus on the workflows LabNarrative can genuinely support: Spot DCA, TradingView automation, Paper testing, position visibility and analytics.
          </p>
        </div>
        <div className={styles.partnerGrid}>
          {migrationGuides.map((guide) => (
            <article key={guide.href}>
              <h3><a href={guide.href}>{guide.title} →</a></h3>
              <p>{guide.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.label}>What comes next</p>
          <h2>Answer the exact questions traders search for.</h2>
          <p>
            LabNarrative Learn is built around practical problems rather than broad crypto commentary. New guides will go deeper into DCA settings, TradingView webhooks, Paper validation, execution troubleshooting and supported migration workflows.
          </p>
        </div>
        <div className={styles.principleGrid}>
          <article>
            <span>01</span>
            <h3>Understand</h3>
            <p>Get a direct answer to the trading-automation problem before diving into implementation details.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Recreate</h3>
            <p>Turn supported strategy rules and bot settings into a concrete LabNarrative workflow instead of stopping at theory.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Validate</h3>
            <p>Use Paper Trading to observe the workflow with simulated capital before considering Live execution.</p>
          </article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Learn → Test → Automate</p>
        <h2>Do not stop at reading the guide.</h2>
        <p>Open LabNarrative, recreate the supported setup and test it with Paper capital before you decide what to do next.</p>
        <a className={styles.primary} href={APP_URL}>Open Paper Trading →</a>
      </section>

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
