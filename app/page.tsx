import type { Metadata } from "next";
import styles from "./trading-home.module.css";

const title = "Affordable Crypto Trading Bots & TradingView Automation | LabNarrative";
const description = "Run Spot DCA bots and TradingView strategy automation across Binance, Bybit, KuCoin, OKX and Kraken. Paper-test free, then go Live for $9.99/month.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/" },
  twitter: { title, description },
};

const APP_URL = "https://app.labnarrative.com";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://labnarrative.com/#organization",
      name: "LabNarrative",
      url: "https://labnarrative.com",
    },
    {
      "@type": "WebSite",
      "@id": "https://labnarrative.com/#website",
      name: "LabNarrative",
      url: "https://labnarrative.com",
      publisher: { "@id": "https://labnarrative.com/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://labnarrative.com/#trading-app",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com",
      description,
      publisher: { "@id": "https://labnarrative.com/#organization" },
      offers: { "@type": "Offer", price: "9.99", priceCurrency: "USD" },
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

const capabilities = [
  ["01", "Automate", "Build crypto Spot DCA bots or connect TradingView strategy signals with explicit entry, averaging and exit logic."],
  ["02", "Monitor", "Use Signal Monitor to see what each automation received, what executed and why a signal did not execute."],
  ["03", "Manage", "Keep Paper and Live Spot positions, capital deployment and trade controls in the same workspace."],
  ["04", "Understand", "Use portfolio and bot analytics to see what is actually driving performance over time."],
];

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

function PortfolioPreview() {
  return <div className={styles.screenInner}>
    <div className={styles.screenTop}><strong>Portfolio</strong><small>ACCOUNT INTELLIGENCE</small></div>
    <div className={styles.portfolioHero}>
      <div className={styles.portfolioValue}><span>Total portfolio value</span><strong>$128,227.05</strong><small>Portfolio performance and deployed capital in one view</small></div>
      <div className={styles.portfolioPie}><div className={styles.donut}/></div>
    </div>
    <div className={styles.assetList}>
      {["BTC", "ETH", "SOL", "USDT"].map((asset, index) => <div className={styles.asset} key={asset}><strong>{asset}</strong><span>{["42.8%", "27.4%", "12.1%", "17.7%"][index]}</span><b>{index === 3 ? "Cash" : "+ active"}</b></div>)}
    </div>
  </div>;
}

function AnalyticsPreview() {
  return <div className={styles.screenInner}>
    <div className={styles.screenTop}><strong>Analytics</strong><small>PERFORMANCE INTELLIGENCE</small></div>
    <div className={styles.analyticsGrid}>
      <div className={styles.analyticsCard}><small>PnL & activity</small><div className={styles.chart}>{[34,58,42,74,63,49,81,67,88].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div></div>
      <div className={styles.analyticsCard}><small>Equity curve</small><div className={styles.curve}/></div>
    </div>
    <div className={styles.analyticsFoot}><div><span>Win rate</span><strong>68.4%</strong></div><div><span>Max drawdown</span><strong>−4.8%</strong></div><div><span>Executions</span><strong>324</strong></div></div>
  </div>;
}

function SignalPreview() {
  const signals = [
    ["BTC / USDT", "RSI · 5m", 3],
    ["ETH / USDT", "Stochastic RSI · 1h", 2],
    ["SOL / USDT", "Parabolic SAR · 15m", 3],
    ["LINK / USDT", "Heikin Ashi · 1d", 1],
  ] as const;
  return <div className={styles.screenInner}>
    <div className={styles.screenTop}><strong>Signal Monitor</strong><small>MARKET CONDITIONS</small></div>
    <div className={styles.signalFilters}><span className={styles.on}>All signals</span><span>Ready</span><span>Waiting</span></div>
    <div className={styles.signalList}>{signals.map(([pair,rule,count])=><div className={styles.signalCard} key={pair}><div><strong>{pair}</strong><small>{rule}</small></div><div className={styles.signalDots}>{[0,1,2].map((dot)=><i className={dot < count ? styles.ok : ""} key={dot}/>)}</div><span className={styles.signalState}>{count === 3 ? "READY" : "WATCHING"}</span></div>)}</div>
  </div>;
}

export default function HomePage() {
  return <main className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

    <header className={styles.header}>
      <a href="/" aria-label="Home"><Brand /></a>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a href="#product">Product</a><a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a>
      </nav>
      <div className={styles.headerActions}><a className={styles.signIn} href={APP_URL}>Sign in</a><a className={styles.launch} href={APP_URL}>Launch app →</a></div>
    </header>

    <section className={styles.hero}>
      <p className={styles.eyebrow}>Spot crypto automation · $9.99/month</p>
      <h1>Powerful crypto automation.<br/><em>Without the expensive subscription.</em></h1>
      <p className={styles.lead}>Run Spot DCA bots and TradingView strategy automation on Binance, Bybit, KuCoin, OKX and Kraken. Paper-test for free, then move Live for $9.99/month.</p>
      <div className={styles.heroActions}><a className={styles.primary} href={APP_URL}>Start free with Paper →</a><a className={styles.secondary} href="/pricing">See $9.99 pricing</a></div>
      <p className={styles.heroNote}>$9.99 monthly · $7.99/month billed annually · focused on the Spot automation most traders actually use.</p>

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

    <section className={styles.section} id="product">
      <div className={styles.sectionHead}><p className={styles.label}>What you actually need</p><h2>DCA. TradingView. Paper. Live. Positions. Signals. Analytics.</h2></div>
      <div className={styles.capabilities}>{capabilities.map(([number,title,copy])=><article className={styles.capability} key={title}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><p className={styles.label}>Explore workflows</p><h2>Start with the automation workflow you need.</h2></div>
      <div className={styles.capabilities}>
        <article className={styles.capability}><span>01</span><div><h3><a href="/dca-bot">Crypto DCA bots →</a></h3><p>Build rule-based Spot DCA automation with visible entry, averaging and exit controls, then forward-test it in Paper.</p></div></article>
        <article className={styles.capability}><span>02</span><div><h3><a href="/crypto-paper-trading">Crypto paper trading →</a></h3><p>Test DCA bots and TradingView Strategy Executions with simulated capital before deciding whether to go Live.</p></div></article>
        <article className={styles.capability}><span>03</span><div><h3><a href="/tradingview-automation">TradingView automation →</a></h3><p>Connect TradingView strategy signals to controlled crypto Spot execution and keep every signal visible.</p></div></article>
      </div>
    </section>

    <section className={styles.showcase} id="platform">
      <div className={styles.showcaseRow}>
        <div className={styles.showcaseCopy}><p className={styles.label}>Portfolio</p><h3>Know where your capital is.</h3><p>See balances, allocation, deployment and portfolio performance in one place instead of reconstructing the account from separate bot and exchange screens.</p></div>
        <div className={styles.screen}><PortfolioPreview /></div>
      </div>
      <div className={styles.showcaseRow}>
        <div className={styles.showcaseCopy}><p className={styles.label}>Analytics</p><h3>Go beyond a single PnL number.</h3><p>Compare strategy outcomes, activity, drawdown, execution history and time-based performance so each bot change starts from evidence.</p></div>
        <div className={styles.screen}><AnalyticsPreview /></div>
      </div>
      <div className={styles.showcaseRow}>
        <div className={styles.showcaseCopy}><p className={styles.label}>Positions</p><h3>See the trade, not just the order.</h3><p>Follow capital, average entry, DCA progression, targets, stop levels and live PnL in a compact position-first view designed for fast scanning.</p></div>
        <div className={styles.screen}><div className={styles.screenInner}><div className={styles.screenTop}><strong>Positions</strong><small>TRADE MANAGEMENT</small></div><PositionsPreview compact /></div></div>
      </div>
      <div className={styles.showcaseRow}>
        <div className={styles.showcaseCopy}><p className={styles.label}>Signal Monitor</p><h3>Know what happened to every signal.</h3><p>See what each automation received, what executed and why a signal was ignored or failed. Execution stays visible instead of disappearing behind the bot.</p></div>
        <div className={styles.screen}><SignalPreview /></div>
      </div>
    </section>

    <section className={styles.workflow} id="workflow">
      <p className={styles.label}>Paper → Live</p><h2>Build. Simulate. Connect. Automate. Analyse.</h2>
      <div className={styles.steps}>{steps.map(([number,title,copy])=><article className={styles.step} key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className={styles.story}>
      <div><p className={styles.label}>Why LabNarrative</p><h2>Why pay $50–$70+ for the automation you actually use?</h2><p>LabNarrative was built from the trader side of the screen after years of paying for broader crypto-bot platforms. The goal is deliberately focused: give Spot traders the DCA, TradingView automation, Paper testing, position management, signal visibility and analytics they need at a much lower subscription price.</p></div>
      <div className={styles.principles}><div className={styles.principle}><strong>One simple Live plan</strong><span>$9.99 monthly or $7.99/month billed annually.</span></div><div className={styles.principle}><strong>Five major exchanges</strong><span>Binance, Bybit, KuCoin, OKX and Kraken.</span></div><div className={styles.principle}><strong>Focused on Spot</strong><span>No need to pay for a larger feature set when your workflow is DCA or TradingView Spot automation.</span></div></div>
    </section>

    <section className={styles.affiliate}><div><p className={styles.label}>Switching from another bot platform?</p><h2>Bring the setup you already use.</h2><p>Already using 3Commas, Bitsgap, Coinrule or Cryptohopper? If your workflow is Spot DCA or TradingView automation, send us your current setup. We’ll help recreate the compatible configuration in LabNarrative so you can compare before switching.</p></div><a href="mailto:hello@labnarrative.com?subject=Help%20me%20switch%20to%20LabNarrative">Get migration help →</a></section>

    <section className={styles.affiliate}><div><p className={styles.label}>Creators & communities</p><h2>Share a more affordable automation workflow.</h2><p>The Founding Affiliate Program is open for crypto educators, TradingView strategy publishers and trading communities.</p></div><a href="/affiliate">Explore affiliates →</a></section>

    <section className={styles.final}><p className={styles.label}>Free Paper · $9.99 Live</p><h2>Test first. Pay less when you go Live.</h2><p>Start with Paper trading for free. When you are ready for real Spot automation, one Live plan gives you the core platform for $9.99/month.</p><div className={styles.heroActions}><a className={styles.primary} href={APP_URL}>Open LabNarrative →</a><a className={styles.secondary} href="/pricing">View pricing</a></div></section>

    <footer className={styles.footer}><a href="/"><Brand /></a><div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div><small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small></footer>
  </main>;
}