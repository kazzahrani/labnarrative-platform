import type { Metadata } from "next";
import styles from "./labnarrative.module.css";

export const metadata: Metadata = {
  title: "LabNarrative — Crypto Trading Automation",
  description:
    "Build, paper-test, and automate crypto DCA strategies with a focused trading workspace built for disciplined iteration.",
};

const APP_URL = "https://platform.labnarrative.com/trader";

const workflow = [
  ["01", "Build the bot", "Set the pair, base order, averaging orders, deviation, scaling, take profit and risk controls in one focused DCA workflow."],
  ["02", "Test with paper money", "Run the strategy without putting real capital at risk. Watch fills, active trades and closed trades behave as the bot runs."],
  ["03", "Connect when ready", "Move from simulation to a supported exchange connection only after you understand the strategy and the workflow."],
  ["04", "Review and iterate", "Keep bots, positions and trade history together so each change starts from evidence rather than memory or guesswork."],
];

const features = [
  ["DCA automation", "Build long-only crypto DCA bots with configurable averaging, scaling and take-profit logic."],
  ["Paper-first workflow", "Test the complete bot experience with simulated capital before deciding whether to connect an exchange."],
  ["Trading workspace", "See your portfolio, bots, active trades and closed trades without jumping between disconnected tools."],
  ["Exchange connections", "Use the same automation workflow as additional supported crypto-exchange integrations become available."],
];

export default function HomePage() {
  return (
    <main className={`${styles.page} crypto-public-page`}>
      <header className={`${styles.header} lnPublicHeader`}>
        <a className={`${styles.wordmark} lnPublicWordmark`} href="/" aria-label="LabNarrative home">
          LabNarrative
        </a>
        <nav className={`${styles.nav} lnPublicNav`} aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#workflow">How it works</a>
          <a href="#why">Why LabNarrative</a>
          <a href="/affiliate">Affiliates</a>
        </nav>
        <a className={styles.headerCta} href={APP_URL}>Launch app →</a>
      </header>

      <section className={styles.hero}>
        <div className={styles.gridGlow} />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Crypto automation for disciplined traders</p>
          <h1>Build the strategy.<br /><em>Test the logic.</em><br />Automate the execution.</h1>
          <p className={styles.heroLead}>
            LabNarrative is a focused crypto trading workspace for DCA automation. Start with paper money, understand how your bot behaves, then connect a supported exchange when you are ready.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href={APP_URL}>Start with Paper Trading →</a>
            <a className={styles.secondary} href="#workflow">See how it works</a>
          </div>
          <div className={styles.heroTags}>
            <span>Paper first</span><span>Exchange-ready</span><span>Long only</span><span>DCA focused</span>
          </div>
        </div>

        <div className={`${styles.productMock} crypto-dark-panel lnTraderDemo`} aria-label="Preview of the LabNarrative trading workspace">
          <aside className="lnDemoSidebar">
            <div className="lnDemoBrand">
              <span>LN</span>
              <div><strong>LabNarrative</strong><small>Trading</small></div>
            </div>
            <div className="lnDemoNav">
              <b>Dashboard</b>
              <b>Portfolio</b>
              <b className="is-active">DCA Bots</b>
              <b>Active Trades</b>
              <b>Closed Trades</b>
            </div>
            <div className="lnDemoAccountStatus">
              <i />
              <div><strong>Paper Account</strong><small>Simulation</small></div>
            </div>
          </aside>

          <div className="lnDemoWorkspace">
            <div className="lnDemoTopbar">
              <div><small>TRADING WORKSPACE</small><strong>DCA Bots</strong></div>
              <div className="lnDemoAccountButton">
                <span>P</span><div><strong>Paper Account</strong><small>Paper trading</small></div><i>⌄</i>
              </div>
            </div>
            <div className="lnDemoContent">
              <div className="lnDemoHeading">
                <div><small>DCA AUTOMATION</small><h3>Bots</h3></div>
                <button>+ New bot</button>
              </div>
              <div className="lnDemoTabs"><b className="is-active">Active <span>3</span></b><b>Closed <span>27</span></b></div>
              <div className="lnDemoPanel">
                <div className="lnDemoTableHead"><span>BOT</span><span>PAIR</span><span>ORDERS</span><span>PNL</span><span>STATUS</span></div>
                <div className="lnDemoRow"><strong>BTC Accumulation</strong><span>BTC / USDT</span><span>5 / 8</span><span className="positive">+3.82%</span><i>Running</i></div>
                <div className="lnDemoRow"><strong>ETH Core DCA</strong><span>ETH / USDT</span><span>3 / 6</span><span className="positive">+1.44%</span><i>Running</i></div>
                <div className="lnDemoRow"><strong>SOL DCA</strong><span>SOL / USDT</span><span>2 / 5</span><span>-0.63%</span><i>Running</i></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="product">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>The product</p>
          <h2>Everything needed to run a disciplined DCA workflow. Nothing pretending to predict the market.</h2>
        </div>
        <div className={styles.featureGrid}>
          {features.map(([title, copy], index) => (
            <article className={`${styles.featureCard} crypto-dark-panel`} key={title}>
              <span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workflowSection} id="workflow">
        <div className={styles.workflowIntro}>
          <p className={styles.label}>How it works</p>
          <h2>From an idea to a running strategy, without skipping the test.</h2>
        </div>
        <div className={styles.workflowGrid}>
          {workflow.map(([number, title, copy]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className={`${styles.story} crypto-dark-panel`} id="why">
        <div className={styles.storyMain}>
          <p className={styles.label}>Why LabNarrative</p>
          <h2>Built after years of actually using crypto automation.</h2>
          <p>
            LabNarrative was started from the user side of the screen: years of building DCA bots, changing strategies, testing ideas and learning what makes an automation platform worth opening every day. The goal is not to copy another platform. It is to keep what serious traders need, remove what they do not, and make strategy iteration clearer over time.
          </p>
        </div>
        <aside className={`${styles.storyCard} crypto-dark-panel`}>
          <small>The operating principle</small>
          <strong>Automation should make your strategy more consistent — not make you more confident than the evidence deserves.</strong>
          <span>LabNarrative does not promise profits. Crypto trading involves substantial risk.</span>
        </aside>
      </section>

      <section className={styles.partnerStrip}>
        <div>
          <p className={styles.label}>For creators & communities</p>
          <h2>Help traders discover a better workflow. Earn when they stay.</h2>
          <p>We are opening the Founding Affiliate Program for crypto educators, YouTube creators, TradingView strategy publishers and trading communities.</p>
        </div>
        <a href="/affiliate">Explore the affiliate program →</a>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.label}>Start with simulation</p>
        <h2>Build your first DCA bot with paper money.</h2>
        <p>No performance promises. No need to risk real capital just to understand the product.</p>
        <a className={styles.primary} href={APP_URL}>Open LabNarrative →</a>
      </section>

      <footer className={`${styles.footer} crypto-dark-panel`}>
        <a className={`${styles.wordmark} lnPublicWordmark`} href="/">LabNarrative</a>
        <div><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a></div>
        <p>Software for trading automation. Not financial advice. Trading digital assets involves risk.</p>
      </footer>
    </main>
  );
}
