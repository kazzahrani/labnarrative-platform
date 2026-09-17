import type { Metadata } from "next";
import AffiliateCalculator from "./AffiliateCalculator";
import affiliateStyles from "./affiliate.module.css";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Referral & Affiliate Program — LabNarrative",
  description:
    "Earn 40% affiliate commission with LabNarrative plus free Max access. Every 10 new paying customers you refer earns one full year of Max.",
};

const APP_URL = "https://app.labnarrative.com";
const AFFILIATE_URL = "https://app.labnarrative.com/affiliate";
const APPLY_URL = "mailto:hello@labnarrative.com?subject=LabNarrative%20Affiliate%20Partnership&body=Channel%20or%20community%20URL%3A%0AAudience%20size%3A%0AMain%20platform%3A%0AAnything%20you%27d%20like%20us%20to%20know%3A";

const steps = [
  ["01", "Get your affiliate link", "Sign in to the Affiliate Program dashboard and copy your tracked referral link."],
  ["02", "Share LabNarrative", "Send traders to free Paper Trading, a useful guide, a bot setup, or the platform itself."],
  ["03", "They become a paying customer", "A referred trader becomes a paid referral after their first qualifying subscription payment clears."],
  ["04", "Earn cash + Max", "You earn 40% cash commission and free Max access. Each customer adds 1 Max month, and every 10th customer adds a 2-month bonus — so 10 customers = 1 full year."],
];

const audiences = [
  ["Every LabNarrative user", "Recommend a trading platform you genuinely use and understand."],
  ["YouTube & social creators", "YouTube, TikTok, Instagram, X, Facebook, Snapchat, and other trading-focused channels."],
  ["Trading communities", "Discord, Telegram, Reddit, forums, academies, and private groups built around crypto traders."],
  ["Writers & educators", "Newsletters, blogs, courses, and educational channels explaining systematic trading workflows."],
];

const terms = [
  "Affiliates earn 40% of qualifying subscription revenue.",
  "Every new paying customer you refer adds 1 free month of LabNarrative Max after their first qualifying payment clears.",
  "Every 10th valid paying customer adds a 2-month milestone bonus: 10 customers = 12 Max months (1 year), 20 customers = 24 months, and 100 customers = 120 months.",
  "Each referred customer can create the Max reward once. Later eligible subscription payments still earn 40% cash commission but do not create another referral reward.",
  "Referral attribution lasts 30 days. If a visitor uses more than one LabNarrative affiliate link, the most recent valid referral receives attribution.",
  "Refunded, disputed, charged-back, fraudulent, or reversed payments reverse the related commission and recalculate the related Max reward entitlement.",
  "No self-referrals, circular referral activity, spam, impersonation, misleading performance claims, or promises of guaranteed trading profits.",
  "Partners must clearly disclose the affiliate relationship wherever required by law or platform rules.",
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
            <h1>Earn 40% commission.<br /><em>Use Max for free.</em></h1>
            <p className={styles.affiliateLead}>Earn <strong>40% cash commission</strong> from qualifying subscription payments, plus free LabNarrative Max access. <strong>10 new paying customers = 1 full year of Max free.</strong></p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={AFFILIATE_URL}>Get your affiliate link →</a>
              <a className={styles.secondary} href="#affiliate-calculator-title">Estimate earnings</a>
            </div>
          </div>
          <aside className={styles.commissionPanel}>
            <small>Simple affiliate offer</small>
            <strong>40%</strong>
            <p>Cash commission on qualifying subscription revenue, plus free Max access that stacks as you refer paying customers.</p>
            <div className={affiliateStyles.commissionStats}>
              <div><span>1 customer</span><b>1 month</b><small>of Max free</small></div>
              <div><span>10 customers</span><b>1 year</b><small>of Max free</small></div>
            </div>
          </aside>
        </div>
      </section>

      <AffiliateCalculator />

      <section className={styles.section} id="program">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>How it works</p>
          <h2>Each customer adds Max time. Every 10 customers completes a full free year.</h2>
        </div>
        <div className={styles.programGrid}>
          {steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.fitSection} id="fit">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>Who can participate</p>
          <h2>Users, creators, educators, and trading communities.</h2>
        </div>
        <div className={styles.partnerGrid}>
          {audiences.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.terms} id="terms">
        <div>
          <div className={styles.sectionIntro}>
            <p className={styles.label}>Program rules</p>
            <h2>Simple and transparent.</h2>
          </div>
          <ul className={styles.termList}>{terms.map((term) => <li key={term}>{term}</li>)}</ul>
        </div>
        <aside className={styles.applyBox}>
          <h3>Ready to refer traders?</h3>
          <p>Open the Affiliate Program inside LabNarrative to get your link and track clicks, paying customers, cash commission, and free Max months.</p>
          <a className={styles.applyCta} href={AFFILIATE_URL}>Open Affiliate Program →</a>
          <a className={affiliateStyles.creatorContact} href={APPLY_URL}>Contact us about a creator partnership</a>
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
