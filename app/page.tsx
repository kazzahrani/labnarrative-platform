import type { Metadata } from "next";
import styles from "./trading-home.module.css";

export const metadata: Metadata = {
  title: "LabNarrative — Crypto Trading Automation",
  description:
    "Build, simulate, automate and analyse crypto strategies in one focused trading workspace.",
};

const APP_URL = "https://platform.labnarrative.com/trader";

const capabilities = [
  ["01", "Automate", "Build DCA strategies and strategy-execution automations with explicit entry, averaging and exit logic."],
  ["02", "Monitor", "Follow market conditions and strategy signals without losing sight of why a setup is or is not ready."],
  ["03", "Manage", "Keep paper and live positions, capital deployment and trade controls in the same workspace."],
  ["04", "Understand", "Use portfolio and bot analytics to see what is actually driving performance over time."],
];

const steps = [
  ["01", "Build", "Define the automation and its risk controls."],
  ["02", "Simulate", "Run the complete workflow with paper capital."],
  ["03", "Connect", "Link a supported exchange when you are ready."],
  ["04", "Automate", "Let the strategy manage entries, DCA and exits."],
  ["05", "Analyse", "Review positions, portfolio and bot performance."],
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
    <header className={styles.header}>
      <a href="/" aria-label="LabNarrative home"><Brand /></a>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a href="#product">Product</a><a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a>
      </nav>
      <div className={styles.headerActions}><a className={styles.signIn} href={APP_URL}>Sign in</a><a className={styles.launch} href={APP_URL}>Launch app →</a></div>
    </header>

    <section className={styles.hero}>
      <p className={styles.eyebrow}>Crypto trading automation</p>
      <h1>Automate your strategy.<br/><em>Understand every trade.</em></h1>
      <p className={styles.lead}>LabNarrative brings automation, signal monitoring, positions, portfolio intelligence and performance analytics into one focused crypto trading workspace.</p>
      <div className={styles.heroActions}><a className={styles.primary} href={APP_URL}>Start with Paper Trading →</a><a className={styles.secondary} href="#platform">Explore the platform</a></div>
      <p className={styles.heroNote}>Start in simulation. Connect real capital when you are ready.</p>

      <div className={styles.heroFrame}>
        <div className={styles.window}>
          <div className={styles.windowBar}><i/><i/><i/><span>platform.labnarrative.com/trader</span></div>
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
      <div className={styles.sectionHead}><p className={styles.label}>One workspace</p><h2>The whole trading process, without losing sight of the strategy.</h2></div>
      <div className={styles.capabilities}>{capabilities.map(([number,title,copy])=><article className={styles.capability} key={title}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div>
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
        <div className={styles.showcaseCopy}><p className={styles.label}>Signal Monitor</p><h3>Understand why a setup is ready.</h3><p>Track strategy conditions across markets and timeframes before they become executions. The signal layer stays visible instead of disappearing behind the automation.</p></div>
        <div className={styles.screen}><SignalPreview /></div>
      </div>
    </section>

    <section className={styles.workflow} id="workflow">
      <p className={styles.label}>Paper → live</p><h2>Build. Simulate. Connect. Automate. Analyse.</h2>
      <div className={styles.steps}>{steps.map(([number,title,copy])=><article className={styles.step} key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className={styles.story}>
      <div><p className={styles.label}>Why LabNarrative</p><h2>Built from the trader side of the screen.</h2><p>LabNarrative grew out of years of using crypto automation tools, building DCA strategies and learning which parts of a trading platform actually matter day after day. The aim is not prediction. It is clearer execution, better visibility and better evidence for the next decision.</p></div>
      <div className={styles.principles}><div className={styles.principle}><strong>Strategy first</strong><span>Automation follows explicit rules rather than replacing them.</span></div><div className={styles.principle}><strong>Data over guesswork</strong><span>Positions and analytics stay connected to the strategy that created them.</span></div><div className={styles.principle}><strong>Automation without blindness</strong><span>Signals, execution and outcomes remain visible throughout the trade.</span></div></div>
    </section>

    <section className={styles.affiliate}><div><p className={styles.label}>Creators & communities</p><h2>Share a better automation workflow.</h2><p>The Founding Affiliate Program is being opened for crypto educators, TradingView strategy publishers and trading communities.</p></div><a href="/affiliate">Explore affiliates →</a></section>

    <section className={styles.final}><p className={styles.label}>Start with simulation</p><h2>Build the strategy before you risk the capital.</h2><p>Open the LabNarrative workspace, create a DCA automation and test the complete trading flow with paper money first.</p><a className={styles.primary} href={APP_URL}>Open LabNarrative →</a></section>

    <footer className={styles.footer}><a href="/"><Brand /></a><div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div><small>Software for trading automation. Not financial advice. Trading digital assets involves risk.</small></footer>
  </main>;
}
