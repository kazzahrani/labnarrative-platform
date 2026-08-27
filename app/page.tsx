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
  ["03", "Connect when ready", "Move from simulation to your Binance Spot connection only after you understand the strategy and the workflow."],
  ["04", "Review and iterate", "Keep bots, positions and trade history together so each change starts from evidence rather than memory or guesswork."],
];

const features = [
  ["DCA automation", "Build long-only crypto DCA bots with configurable averaging, scaling and take-profit logic."],
  ["Paper-first workflow", "Test the complete bot experience with simulated capital before deciding whether to connect an exchange."],
  ["Trading workspace", "See your portfolio, bots, active trades and closed trades without jumping between disconnected tools."],
  ["Binance Spot", "Connect the exchange you already use and keep execution focused on Spot automation."],
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="LabNarrative home">
          LabNarrative
        </a>
        <nav className={styles.nav} aria-label="Primary navigation">
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
            LabNarrative is a focused crypto trading workspace for DCA automation. Start with paper money, understand how your bot behaves, then connect Binance Spot when you are ready.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href={APP_URL}>Start with Paper Trading →</a>
            <a className={styles.secondary} href="#workflow">See how it works</a>
          </div>
          <div className={styles.heroTags}>
            <span>Paper first</span><span>Binance Spot</span><span>Long only</span><span>DCA focused</span>
          </div>
        </div>

        <div className={styles.productMock} aria-label="Illustration of the LabNarrative trading workspace">
          <div className={styles.mockTop}><span /><span /><span /><b>LabNarrative</b><small>Paper Account</small></div>
          <div className={styles.mockBody}>
            <aside className={styles.mockSide}>
              <b>Dashboard</b><b>Portfolio</b><b className={styles.mockActive}>DCA Bots</b><b>Active Trades</b><b>Closed Trades</b>
            </aside>
            <div className={styles.mockMain}>
              <div className={styles.mockHeading}><div><small>DCA BOTS</small><strong>Strategy workspace</strong></div><button>+ New bot</button></div>
              <div className={styles.mockStats}>
                <article><small>Portfolio value</small><strong>$10,284.42</strong><span>Paper</span></article>
                <article><small>Active bots</small><strong>4</strong><span>Running</span></article>
                <article><small>Closed trades</small><strong>27</strong><span>History</span></article>
              </div>
              <div className={styles.mockTable}>
                <div className={styles.mockRowHead}><span>Bot</span><span>Pair</span><span>Orders</span><span>Status</span></div>
                <div className={styles.mockRow}><b>BTC Accumulation</b><span>BTC / USDT</span><span>5 averaging</span><i>Running</i></div>
                <div className={styles.mockRow}><b>ETH Core DCA</b><span>ETH / USDT</span><span>6 averaging</span><i>Running</i></div>
                <div className={styles.mockRow}><b>SOL DCA</b><span>SOL / USDT</span><span>4 averaging</span><i>Running</i></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.trustBar}>
        <span>Automate rules, not emotions.</span>
        <span>Test before real capital.</span>
        <span>Keep the workflow fast and clear.</span>
      </section>

      <section className={styles.section} id="product">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>The product</p>
          <h2>Everything needed to run a disciplined DCA workflow. Nothing pretending to predict the market.</h2>
        </div>
        <div className={styles.featureGrid}>
          {features.map(([title, copy], index) => (
            <article className={styles.featureCard} key={title}>
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

      <section className={styles.story} id="why">
        <div className={styles.storyMain}>
          <p className={styles.label}>Why LabNarrative</p>
          <h2>Built after years of actually using crypto automation.</h2>
          <p>
            LabNarrative was started from the user side of the screen: years of building DCA bots, changing strategies, testing ideas and learning what makes an automation platform worth opening every day. The goal is not to copy another platform. It is to keep what serious traders need, remove what they do not, and make strategy iteration clearer over time.
          </p>
        </div>
        <aside className={styles.storyCard}>
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

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/">LabNarrative</a>
        <div><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a></div>
        <p>Software for trading automation. Not financial advice. Trading digital assets involves risk.</p>
      </footer>
    </main>
  );
}
