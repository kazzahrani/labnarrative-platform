import type { Metadata } from "next";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Referral & Affiliate Program — LabNarrative",
  description:
    "Earn on annual LabNarrative Trading subscriptions, monthly referrals, and a three-level referral network.",
};

const APP_URL = "https://platform.labnarrative.com/trader";
const APPLY_URL = "mailto:hello@labnarrative.com?subject=LabNarrative%20Founding%20Affiliate%20Program&body=Channel%20or%20community%20URL%3A%0AAudience%20size%3A%0AMain%20platform%3A%0AAnything%20you%27d%20like%20us%20to%20know%3A";

const steps = [
  ["01", "Use LabNarrative", "Test the trading platform yourself first. We want referrals from people who understand the product, not one-off promotional traffic."],
  ["02", "Share your referral", "Your referral code and tracked link connect new customers to you. Strategy and bot sharing will become additional attribution paths as those sharing tools launch."],
  ["03", "Build a network", "Monthly subscriptions pay 25% to the direct referrer, 15% to the next level, and 10% to the third level while eligible payments continue."],
  ["04", "Earn more on annual sales", "Annual prepaid subscriptions pay 30% direct, 15% at level two, and 10% at level three from the eligible annual payment, subject to the safety hold."],
];

const audiences = [
  ["Every LabNarrative user", "The standard referral structure is designed for users who simply want to recommend a product they already use."],
  ["YouTube creators", "Crypto automation, DCA bots, exchange-connected trading, TradingView, portfolio strategy, or systematic trading."],
  ["Trading communities", "Discord, Telegram, forums, academies, and private groups built around active crypto traders."],
  ["Writers & educators", "Newsletters, blogs, courses, and educational channels explaining disciplined crypto trading workflows."],
];

const terms = [
  "Monthly subscriptions: 25% direct commission, 15% level-two commission, and 10% level-three commission on eligible subscription revenue as payments are received.",
  "Annual prepaid subscriptions: 30% direct commission, 15% level-two commission, and 10% level-three commission on the eligible annual payment.",
  "The referred-customer benefit is set at 10% and will activate with the paid checkout flow.",
  "New commissions remain pending for 30 days to protect against refunds, chargebacks, fraud, and payment reversals.",
  "The payout threshold is $25. Payout methods and exact payout schedule will be published before paid subscriptions open.",
  "Eligible subscription revenue excludes taxes, refunds, chargebacks, fraudulent transactions, and amounts otherwise reversed.",
  "No self-referrals, circular referral chains, spam, impersonation, misleading performance claims, or promises of guaranteed trading profits.",
  "Partners must clearly disclose the affiliate relationship wherever required by law or platform rules.",
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
            <p className={styles.eyebrow}>Referral & Affiliate Program</p>
            <h1>Earn big on annual sales.<br /><em>Build recurring income monthly.</em></h1>
            <p className={styles.affiliateLead}>Recommend LabNarrative Trading to people who will actually use it. Annual prepaid customers earn you a larger direct commission, while monthly customers can build recurring income across a three-level referral network.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={APP_URL}>Test LabNarrative first →</a>
              <a className={styles.secondary} href={APPLY_URL}>Founding creator access</a>
            </div>
          </div>
          <aside className={styles.commissionPanel}>
            <small>Direct annual commission</small>
            <strong>30%</strong>
            <p>Calculated from the eligible annual prepaid subscription. Annual network levels pay 15% and 10%; monthly referrals pay 25% direct with 15% and 10% network levels.</p>
          </aside>
        </div>
      </section>

      <section className={styles.section} id="program">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>How the program works</p>
          <h2>Higher annual upside. Recurring monthly upside. Network effects underneath both.</h2>
        </div>
        <div className={styles.programGrid}>
          {steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.fitSection} id="fit">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Who can participate</p>
          <h2>Built for normal users first, with stronger tools coming for serious creators.</h2>
        </div>
        <div className={styles.partnerGrid}>
          {audiences.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.terms} id="terms">
        <div>
          <div className={styles.sectionIntro}>
            <p className={styles.label}>Program rules</p>
            <h2>The economics are simple enough to understand before you share a link.</h2>
          </div>
          <ul className={styles.termList}>{terms.map((term) => <li key={term}>{term}</li>)}</ul>
        </div>
        <aside className={styles.applyBox}>
          <h3>Creating for traders?</h3>
          <p>Founding creators can contact us now for beta access and partnership onboarding. Referral attribution is being built directly into LabNarrative Trading; paid commissions and payouts activate with paid subscriptions.</p>
          <a className={styles.applyCta} href={APPLY_URL}>Apply as a founding creator →</a>
        </aside>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div>
        <small>Referral participation does not permit misleading claims, investment advice, or guaranteed-profit marketing.</small>
      </footer>
    </main>
  );
}
