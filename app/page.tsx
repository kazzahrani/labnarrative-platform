import type { Metadata } from "next";
import styles from "./trading-home.module.css";

const title = "LabNarrative: Crypto Trading Bots & Automation Platform";
const description = "Build, paper-test and run Spot DCA bots and TradingView automations across Binance, Bybit, OKX, KuCoin and Kraken. Start free with Paper Trading.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/" },
  twitter: { title, description },
};

const APP_URL = "https://app.labnarrative.com";
const APP_LAUNCH_URL = `${APP_URL}/auth/complete`;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://labnarrative.com/#organization",
      name: "LabNarrative",
      alternateName: "LabNarrative Trading",
      url: "https://labnarrative.com",
    },
    {
      "@type": "WebSite",
      "@id": "https://labnarrative.com/#website",
      name: "LabNarrative",
      alternateName: "LabNarrative Trading",
      url: "https://labnarrative.com",
      publisher: { "@id": "https://labnarrative.com/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://labnarrative.com/#trading-app",
      name: "LabNarrative Trading",
      alternateName: "LabNarrative",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com",
      description,
      publisher: { "@id": "https://labnarrative.com/#organization" },
      offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "0", highPrice: "29.99", offerCount: "3" },
      featureList: [
        "Crypto Spot DCA bots",
        "Crypto paper trading",
        "TradingView strategy execution",
        "Crypto Spot position management",
        "Signal monitoring",
        "Trading performance analytics",
        "Binance, Bybit, KuCoin, OKX and Kraken connections",
      ],
    },
  ],
};

const steps = [
  ["01", "Build", "Define the automation and its risk controls."],
  ["02", "Simulate", "Run the complete workflow with Paper capital."],
  ["03", "Connect", "Link Binance, Bybit, KuCoin, OKX or Kraken when you are ready."],
  ["04", "Automate", "Let the strategy manage Spot entries, DCA and exits."],
  ["05", "Analyse", "Review positions, signals and bot performance."],
];

function Brand() {
  return <span className={styles.brand}><img src="/labnarrative-mark.svg" alt="" />LabNarrative</span>;
}

function PositionsPreview({ compact = false }: { compact?: boolean }) {
  const rows = compact ? ["BTC/USDT", "ETH/USDT", "SOL/USDT"] : ["PROM/USDT", "BNSOL/USDT", "SOL/USDT"];
  return <div className={styles.positionRows}>
    {rows.map((pair, index) => <div className={styles.positionRow} key={pair}>
      <div className={styles.coin}><i /><div><strong>{pair}</strong><small>{compact ? "DCA automation · paper" : "3RSI 5m TP1 SL1 · live"}</small></div></div>
      <div className={`${styles.levelMap} ${index === 0 ? styles.loss : ""}`}><span className={styles.avg}/><span className={styles.move}/><span className={styles.now}/><span className={styles.target}/></div>
      <div className={styles.miniMetric}><small>Invested</small><strong>{index === 0 ? "$19.96" : "$9.92"}</strong></div>
      <div className={`${styles.miniMetric} ${styles.pnl} ${index === 0 ? styles.loss : ""}`}><small>PnL</small><strong>{index === 0 ? "−1.16%" : "+0.15%"}</strong></div>
    </div>)}
  </div>;
}

export default function HomePage() {
  return <main className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

    <header className={styles.header}>
      <a href="/" aria-label="Home"><Brand /></a>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a href="#workflow">How it works</a><a href="/learn">Learn</a><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a>
      </nav>
      <div className={styles.headerActions}><a className={styles.signIn} href={APP_URL}>Sign in</a><a className={styles.launch} href={APP_LAUNCH_URL}>Launch app →</a></div>
    </header>

    <section className={styles.hero}>
      <h1><span>Powerful crypto automation.</span><em>Without the expensive subscription.</em></h1>
      <p className={styles.lead}>LabNarrative is a crypto trading automation platform for Spot DCA bots, TradingView automation, Paper Trading and Live execution.</p>
      <div className={styles.heroActions}><a className={styles.primary} href={APP_URL}>Start free with Paper →</a></div>

      <div className={styles.heroFrame}>
        <div className={styles.window}>
          <div className={styles.windowBar}><i/><i/><i/><span>app.labnarrative.com</span></div>
          <div className={styles.productShell}>
            <aside className={styles.previewSidebar}>
              <div className={styles.previewBrand}><img src="/labnarrative-mark.svg" alt=""/><div><strong>LabNarrative</strong><small>Trading</small></div></div>
              <div className={styles.previewNav}><span>Overview</span><span>Portfolio</span><span>Automations</span><span>Signal Monitor</span><span className={styles.active}>Positions</span><span>Analytics</span></div>
            </aside>
            <div className={styles.previewWorkspace}>
              <div className={styles.previewHead}><div><small>POSITIONS</small><h3>Open positions</h3></div><div className={styles.previewPill}>Real workspace</div></div>
              <div className={styles.insightGrid}>
                <div className={styles.insight}><div className={styles.insightTop}><strong>Capital Deployment</strong><span>39% used</span></div><div className={styles.donutWrap}><div className={`${styles.donut} ${styles.gold}`}/><div className={styles.legend}><span>Available <b>$62.58</b></span><span>Deployed <b>$39.77</b></span><span>Reserved <b>$0.00</b></span></div></div></div>
                <div className={styles.insight}><div className={styles.insightTop}><strong>Market Concentration</strong><span>3 markets</span></div><div className={styles.donutWrap}><div className={styles.donut}/><div className={styles.legend}><span>PROM <b>50.2%</b></span><span>SOL <b>24.9%</b></span><span>BNSOL <b>24.9%</b></span></div></div></div>
                <div className={styles.insight}><div className={styles.insightTop}><strong>Live Outcome Mix</strong><span>−$0.20</span></div><div className={styles.donutWrap}><div className={`${styles.donut} ${styles.red}`}/><div className={styles.legend}><span>In profit <b>2</b></span><span>In loss <b>1</b></span><span>Flat <b>0</b></span></div></div></div>
              </div>
              <PositionsPreview />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><p className={styles.label}>Explore workflows</p><h2>Start with the automation workflow you need.</h2></div>
      <div className={styles.capabilities}>
        <article className={styles.capability}><span>01</span><div><h3><a href="/dca-bot">Crypto DCA bots →</a></h3><p>Build rule-based Spot DCA automation with visible entry, averaging and exit controls, then forward-test it in Paper.</p></div></article>
        <article className={styles.capability}><span>02</span><div><h3><a href="/crypto-paper-trading">Crypto paper trading →</a></h3><p>Test DCA bots and TradingView Strategy Executions with simulated capital before deciding whether to go Live.</p></div></article>
        <article className={styles.capability}><span>03</span><div><h3><a href="/tradingview-automation">TradingView automation →</a></h3><p>Connect TradingView strategy signals to controlled crypto Spot execution and keep every signal visible.</p></div></article>
      </div>
    </section>

    <section className={styles.workflow} id="workflow">
      <p className={styles.label}>Paper → Live</p><h2>Build. Simulate. Connect. Automate. Analyse.</h2>
      <div className={styles.steps}>{steps.map(([number,title,copy])=><article className={styles.step} key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className={styles.story}>
      <div><p className={styles.label}>Why LabNarrative</p><h2>Why pay $50–$70+ for the automation you actually use?</h2><p>LabNarrative was built from the trader side of the screen after years of paying for broader crypto-bot platforms. The goal is deliberately focused: give Spot traders the DCA, TradingView automation, Paper testing, position management, signal visibility and analytics they need at a much lower subscription price.</p></div>
      <div className={styles.principles}><div className={styles.principle}><strong>Two focused Live plans</strong><span>Pro is $14.99 monthly or $9.99/month billed yearly; Max is $29.99 monthly or $19.99/month billed yearly.</span></div><div className={styles.principle}><strong>Five major exchanges</strong><span>Binance, Bybit, KuCoin, OKX and Kraken.</span></div><div className={styles.principle}><strong>Focused on Spot</strong><span>No need to pay for a larger feature set when your workflow is DCA or TradingView Spot automation.</span></div></div>
    </section>


    <section className={styles.final}><p className={styles.label}>Free Paper · Pro & Max Live</p><h2>Test first. Pay less when you go Live.</h2><p>Start with Paper trading for free. Pro is $14.99 monthly or $9.99/month billed yearly; Max is $29.99 monthly or $19.99/month billed yearly.</p><div className={styles.heroActions}><a className={styles.primary} href={APP_URL}>Open LabNarrative →</a><a className={styles.secondary} href="/pricing">View pricing</a></div></section>

    <footer className={styles.footer}><a href="/"><Brand /></a><div className={styles.footerLinks}><a href="/learn">Learn</a><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_LAUNCH_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div><small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small></footer>
  </main>;
}
