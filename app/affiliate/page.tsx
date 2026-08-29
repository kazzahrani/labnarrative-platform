import type { Metadata } from "next";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Affiliate Program — LabNarrative",
  description:
    "Join the LabNarrative Founding Affiliate Program for crypto creators, educators, strategy publishers, and trading communities.",
};

const APP_URL = "https://platform.labnarrative.com/trader";
const APPLY_URL = "mailto:hello@labnarrative.com?subject=LabNarrative%20Founding%20Affiliate%20Program&body=Channel%20or%20community%20URL%3A%0AAudience%20size%3A%0AMain%20platform%3A%0AAnything%20you%27d%20like%20us%20to%20know%3A";

const steps = [
  ["01", "Apply", "Tell us where you publish and who your audience is. We are prioritizing creators with a genuine crypto automation or systematic-trading audience."],
  ["02", "Test it first", "Founding partners get full beta access. Use the product yourself before deciding whether it deserves a place in your content."],
  ["03", "Share honestly", "Create tutorials, comparisons, strategy walkthroughs, reviews, or community content in your own voice. Positive coverage is never required."],
  ["04", "Earn recurring revenue", "Once paid subscriptions open, approved partners receive 30% of eligible referred subscription revenue while those customers remain active."],
];

const audiences = [
  ["YouTube creators", "Crypto automation, DCA bots, exchange-connected trading, TradingView, portfolio strategy, or systematic trading."],
  ["TradingView publishers", "Indicator and strategy authors whose audience already thinks in rules, signals, and repeatable systems."],
  ["Trading communities", "Discord, Telegram, forums, academies, and private groups built around active crypto traders."],
  ["Writers & educators", "Newsletters, blogs, courses, and educational channels explaining disciplined crypto trading workflows."],
];

const terms = [
  "Approved founding partners receive full beta product access at no charge while the program is in beta.",
  "Once paid subscriptions open, the founding program targets a 30% recurring share of eligible net subscription revenue from referred paid customers.",
  "Eligible net revenue excludes taxes, refunds, chargebacks, fraudulent transactions, and amounts otherwise reversed.",
  "Referral tracking details and payout mechanics will be issued to approved partners before paid subscriptions open.",
  "No self-referrals, spam, impersonation, misleading performance claims, or promises of guaranteed trading profits.",
  "Partners must clearly disclose the affiliate relationship wherever required by law or platform rules.",
  "You are free to publish an honest review. Participation never requires positive coverage.",
  "Formal program terms will govern payouts and eligibility when paid subscriptions launch.",
];

function Brand() {
  return <span className={styles.brand}><img src="/labnarrative-mark.svg" alt="" />LabNarrative</span>;
}

export default function AffiliatePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" aria-label="Home"><Brand /></a>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="/#product">Product</a>
          <a href="/#platform">Platform</a>
          <a href="/#workflow">How it works</a>
          <a href="/pricing">Pricing</a>
          <a className={styles.current} href="/affiliate">Affiliates</a>
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.signIn} href={APP_URL}>Sign in</a>
          <a className={styles.launch} href={APP_URL}>Launch app →</a>
        </div>
      </header>

      <section className={styles.affiliateHero}>
        <div className={styles.affiliateHeroInner}>
          <div>
            <p className={styles.eyebrow}>Founding Affiliate Program</p>
            <h1>Build trust.<br /><em>Earn when they stay.</em></h1>
            <p className={styles.affiliateLead}>LabNarrative is opening its first partner group for creators, educators, strategy publishers, and trading communities. Test the platform yourself, share it honestly with your audience, and earn recurring revenue from customers you introduce.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={APPLY_URL}>Apply as a founding partner →</a>
              <a className={styles.secondary} href={APP_URL}>Test LabNarrative first</a>
            </div>
          </div>
          <aside className={styles.commissionPanel}>
            <small>Founding revenue share</small>
            <strong>30%</strong>
            <p>Try it first. Recommend it only if you genuinely like it. Positive coverage is never required.</p>
          </aside>
        </div>
      </section>

      <section className={styles.section} id="program">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>How the program works</p>
          <h2>A partnership designed around long-term users, not one-off clicks.</h2>
        </div>
        <div className={styles.programGrid}>
          {steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.fitSection} id="fit">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Who we want to work with</p>
          <h2>Smaller, trusted audiences can matter more than huge generic reach.</h2>
        </div>
        <div className={styles.partnerGrid}>
          {audiences.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.terms} id="terms">
        <div>
          <div className={styles.sectionIntro}>
            <p className={styles.label}>Founding terms</p>
            <h2>Simple enough to understand before you promote us.</h2>
          </div>
          <ul className={styles.termList}>{terms.map((term) => <li key={term}>{term}</li>)}</ul>
        </div>
        <aside className={styles.applyBox}>
          <h3>Want to test it?</h3>
          <p>Send your channel, community, newsletter, or TradingView profile. We are starting with a small founding group and prioritizing audiences already interested in DCA, crypto automation, exchange-connected trading, and systematic strategies.</p>
          <a className={styles.applyCta} href={APPLY_URL}>Apply to the program →</a>
        </aside>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div>
        <small>Affiliate participation does not permit misleading claims, investment advice, or guaranteed-profit marketing.</small>
      </footer>
    </main>
  );
}
