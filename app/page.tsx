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
      offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "0", highPrice: "69", offerCount: "4" },
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
  ["01", "Build", "Define the automation and its risk controls.", "/workflow/build.svg"],
  ["02", "Simulate", "Run the complete workflow with Paper capital.", "/workflow/simulate.svg"],
  ["03", "Connect", "Link Binance, Bybit, KuCoin, OKX or Kraken when you are ready.", "/workflow/connect.svg"],
  ["04", "Automate", "Let the strategy manage Spot entries, DCA and exits.", "/workflow/automate.svg"],
  ["05", "Analyse", "Review positions, signals and bot performance.", "/workflow/analyse.svg"],
] as const;

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
      <h1><span>Powerful crypto automation.</span><em>Make profit first. Pay us second.</em></h1>
      <p className={styles.lead}>Build, test and run Spot automation with fixed-price plans or Pay when you profit on Pro and Max. No subscription fee upfront; performance fees follow realized profit and are capped monthly.</p>
      <div className={styles.heroActions}><a className={styles.primary} href={APP_URL}>Start free with Paper →</a><a className={styles.secondary} href="/pricing">Pay when you profit</a></div>

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

    <section className={styles.productOverview}>
      <div className={styles.productOverviewHead}>
        <h2>One workspace for the complete Spot automation workflow.</h2>
      </div>
      <div className={styles.productOverviewGrid}>
        <article className={styles.productFeature}><h3>DCA Bots</h3><p>Rule-based entries, averaging, take profit, stop loss and multi-pair automation.</p></article>
        <article className={styles.productFeature}><h3>TradingView Strategy Execution</h3><p>Route strategy signals into controlled Spot execution with clear action rules.</p></article>
        <article className={styles.productFeature}><h3>Paper Trading</h3><p>Run the same workflows with simulated capital before putting real funds at risk.</p></article>
        <article className={styles.productFeature}><h3>Live Spot Trading</h3><p>Move tested automations live while keeping execution and position controls visible.</p></article>
        <article className={styles.productFeature}><h3>Multi-exchange Connections</h3><p>Connect supported exchanges from one workspace instead of managing separate tools.</p></article>
        <article className={styles.productFeature}><h3>Signal Monitor</h3><p>See what each automation received, what executed and why a signal did not run.</p></article>
        <article className={styles.productFeature}><h3>Positions & Trade Controls</h3><p>Track entries, DCA progress, exits, live PnL and manual Spot position controls.</p></article>
        <article className={styles.productFeature}><h3>Portfolio & Analytics</h3><p>Review capital, allocation, bot performance, drawdown and execution history together.</p></article>
      </div>
    </section>

    <section className={styles.workflow} id="workflow">
      <h2>Build. Simulate. Connect. Automate. Analyse.</h2>
      <div className={styles.steps}>{steps.map(([number,title,copy,illustration])=><article className={styles.step} key={title}><span>{number}</span><img className={styles.stepIllustration} src={illustration} alt="" /><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className={styles.story}>
      <div><h2>Why pay $50–$70+ for features you don’t need?</h2><p>LabNarrative keeps the workflow focused: build and run DCA bots, execute TradingView strategies, test with Paper, manage positions and understand performance — without paying for a bloated platform full of features you do not need.</p></div>
      <div className={styles.principles}><div className={styles.principle}><strong>Simple, affordable plans</strong><span>Start free, then upgrade only when you need more live automation capacity.</span></div><div className={styles.principle}><strong>Multi-exchange</strong><span>Connect supported exchanges from one workspace and manage automation in one place.</span></div><div className={styles.principle}><strong>Built around Spot automation</strong><span>DCA, TradingView execution, Paper testing, positions, signals and analytics — all in one focused workflow.</span></div></div>
    </section>


    <section className={styles.final}><h2>Test first. Pay less when you go Live.</h2><div className={styles.heroActions}><a className={styles.primary} href={APP_URL}>Open LabNarrative →</a></div></section>

    <footer className={styles.footer}><a href="/"><Brand /></a><div className={styles.footerLinks}><a href="/learn">Learn</a><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_LAUNCH_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div><small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small></footer>
  </main>;
}
