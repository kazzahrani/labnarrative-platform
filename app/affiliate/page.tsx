import type { Metadata } from "next";
import AffiliateCalculator from "./AffiliateCalculator";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Referral & Affiliate Program — LabNarrative",
  description:
    "Earn 40% on qualifying LabNarrative Trading subscription revenue, with about $140 illustrative average commission per paid customer and up to $235.20 on a Max annual referral.",
};

const APP_URL = "https://app.labnarrative.com";
const AFFILIATE_URL = "https://app.labnarrative.com/affiliate";
const APPLY_URL = "mailto:hello@labnarrative.com?subject=LabNarrative%20Affiliate%20Partnership&body=Channel%20or%20community%20URL%3A%0AAudience%20size%3A%0AMain%20platform%3A%0AAnything%20you%27d%20like%20us%20to%20know%3A";

const steps = [
  ["01", "Use LabNarrative", "Test the trading platform yourself first. The strongest referrals come from people who understand the product and can explain where it genuinely fits."],
  ["02", "Get your affiliate link", "Sign in to the Affiliate Program dashboard to create your tracked referral link and follow clicks, sign-ups, conversions, commissions, and payouts."],
  ["03", "Share honestly", "Publish tutorials, comparisons, strategy walkthroughs, reviews, or community content in your own voice. Positive coverage is never required."],
  ["04", "Earn 40%", "Receive 40% of qualifying subscription revenue. Annual plans credit 40% of the full annual payment when it clears; monthly plans credit 40% of each successful monthly payment."],
];

const audiences = [
  ["Every LabNarrative user", "The affiliate structure is open to users who want to recommend a trading platform they genuinely use."],
  ["YouTube creators", "Crypto automation, DCA bots, exchange-connected trading, TradingView, portfolio strategy, or systematic trading."],
  ["Trading communities", "Discord, Telegram, forums, academies, and private groups built around active crypto traders."],
  ["Writers & educators", "Newsletters, blogs, courses, and educational channels explaining disciplined crypto trading workflows."],
];

const terms = [
  "Launch affiliates earn 40% of qualifying subscription revenue.",
  "Annual subscriptions: 40% of the full eligible annual payment is credited when the payment successfully clears.",
  "Monthly subscriptions: 40% is credited on each successful eligible monthly subscription payment while the customer remains subscribed.",
  "Referral attribution lasts 30 days from a valid affiliate visit. If a visitor uses more than one LabNarrative affiliate link, the most recent valid referral receives attribution.",
  "Refunded, disputed, charged-back, fraudulent, or otherwise reversed subscription payments reverse the related affiliate commission.",
  "No self-referrals, circular referral activity, spam, impersonation, misleading performance claims, or promises of guaranteed trading profits.",
  "Partners must clearly disclose the affiliate relationship wherever required by law or platform rules.",
  "LabNarrative may pause or reverse commissions tied to fraud, abuse, refunds, or material violations of the program rules.",
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
            <h1>Earn 40% from every customer you refer.<br /><em>Keep earning while they stay subscribed.</em></h1>
            <p className={styles.affiliateLead}>Recommend LabNarrative Trading to traders who will actually use it. Earn 40% of qualifying subscription revenue on both monthly and annual plans, with an illustrative average of about $140 per paid customer and up to $235.20 from a Max annual referral.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={AFFILIATE_URL}>Get your affiliate link →</a>
              <a className={styles.secondary} href={APP_URL}>Test LabNarrative first</a>
            </div>
          </div>
          <aside className={styles.commissionPanel}>
            <small>Launch affiliate commission</small>
            <strong>40%</strong>
            <p>Earn 40% of qualifying subscription revenue. Annual subscriptions credit your commission from the full annual payment when it clears; monthly subscriptions pay commission as successful monthly payments are received.</p>
            <div className={styles.commissionStats}>
              <div><span>Illustrative average</span><b>≈ $140</b><small>per paid customer</small></div>
              <div><span>Up to</span><b>$235.20</b><small>Max annual referral</small></div>
            </div>
          </aside>
        </div>
      </section>

      <AffiliateCalculator />

      <section className={styles.section} id="program">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>How the program works</p>
          <h2>A simple 40% model that is easy to explain and easy to track.</h2>
        </div>
        <div className={styles.programGrid}>
          {steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.fitSection} id="fit">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Who can participate</p>
          <h2>Built for users, creators, educators, and communities with relevant trading audiences.</h2>
        </div>
        <div className={styles.partnerGrid}>
          {audiences.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.terms} id="terms">
        <div>
          <div className={styles.sectionIntro}>
            <p className={styles.label}>Program rules</p>
            <h2>The economics are clear before you share a link.</h2>
          </div>
          <ul className={styles.termList}>{terms.map((term) => <li key={term}>{term}</li>)}</ul>
        </div>
        <aside className={styles.applyBox}>
          <h3>Creating for traders?</h3>
          <p>Open the Affiliate Program inside LabNarrative to generate your referral link and track performance. Creators who want a closer launch partnership can also contact us directly.</p>
          <a className={styles.applyCta} href={AFFILIATE_URL}>Open Affiliate Program →</a>
          <a className={styles.creatorContact} href={APPLY_URL}>Contact us about a creator partnership</a>
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
