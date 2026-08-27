import type { Metadata } from "next";
import styles from "../labnarrative.module.css";

export const metadata: Metadata = {
  title: "Affiliate Program — LabNarrative",
  description:
    "Join the LabNarrative Founding Affiliate Program for crypto creators, educators, strategy publishers, and trading communities.",
};

const APP_URL = "https://platform.labnarrative.com/trader";

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

export default function AffiliatePage() {
  return (
    <main className={`${styles.page} ${styles.affiliatePage} crypto-public-page`}>
      <header className={`${styles.header} lnPublicHeader`}>
        <a className={`${styles.wordmark} lnPublicWordmark`} href="/">LabNarrative</a>
        <nav className={`${styles.nav} lnPublicNav`} aria-label="Primary navigation">
          <a href="/">Product</a>
          <a href="#program">Program</a>
          <a href="#fit">Who it is for</a>
          <a href="#terms">Terms</a>
        </nav>
        <a className={styles.headerCta} href={APP_URL}>Launch app →</a>
      </header>

      <section className={styles.affiliateHero}>
        <div>
          <p className={styles.eyebrow}>Founding Affiliate Program</p>
          <h1>Build trust.<br /><em>Earn when they stay.</em></h1>
          <p>
            LabNarrative is opening its first partner group for creators, educators, strategy publishers, and trading communities. Test the platform yourself, share it honestly with your audience, and earn recurring revenue from customers you introduce.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="mailto:hello@labnarrative.com?subject=LabNarrative%20Founding%20Affiliate%20Program&body=Channel%20or%20community%20URL%3A%0AAudience%20size%3A%0AMain%20platform%3A%0AAnything%20you%27d%20like%20us%20to%20know%3A">Apply as a founding partner →</a>
            <a className={styles.secondary} href={APP_URL}>Test LabNarrative first</a>
          </div>
          <div className={`${styles.commissionCard} crypto-dark-children`}>
            <article><small>Founding revenue share</small><strong>30%</strong></article>
            <article><small>How we want partnerships to work</small><strong>Try it first. Recommend it only if you genuinely like it.</strong></article>
          </div>
        </div>
      </section>

      <section className={styles.section} id="program">
        <div className={styles.sectionIntro}>
          <p className={styles.label}>How the program works</p>
          <h2>A partnership designed around long-term users, not one-off clicks.</h2>
        </div>
        <div className={`${styles.affiliateGrid} crypto-dark-children`}>
          {steps.map(([number, title, copy]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className={styles.lightBlock} id="fit">
        <p className={styles.label}>Who we want to work with</p>
        <h2>Smaller, trusted audiences can matter more than huge generic reach.</h2>
        <div className={styles.partnerTypes}>
          {audiences.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={styles.affiliateTerms} id="terms">
        <div>
          <section>
            <p className={styles.label}>Founding terms</p>
            <h2>Simple enough to understand before you promote us.</h2>
          </section>
          <section>
            <ul>
              <li>Approved founding partners receive full beta product access at no charge while the program is in beta.</li>
              <li>Once paid subscriptions open, the founding program targets a 30% recurring share of eligible net subscription revenue from referred paid customers.</li>
              <li>Eligible net revenue excludes taxes, refunds, chargebacks, fraudulent transactions, and amounts otherwise reversed.</li>
              <li>Referral tracking details and payout mechanics will be issued to approved partners before paid subscriptions open.</li>
              <li>No self-referrals, spam, impersonation, misleading performance claims, or promises of guaranteed trading profits.</li>
              <li>Partners must clearly disclose the affiliate relationship wherever required by law or platform rules.</li>
              <li>You are free to publish an honest review. Participation never requires positive coverage.</li>
              <li>Formal program terms will govern payouts and eligibility when paid subscriptions launch.</li>
            </ul>
          </section>
        </div>
        <div className={`${styles.applyBox} crypto-dark-panel`}>
          <h3>Want to test it?</h3>
          <p>Send your channel, community, newsletter, or TradingView profile. We are starting with a small founding group and prioritizing audiences already interested in DCA, crypto automation, exchange-connected trading, and systematic strategies.</p>
          <a href="mailto:hello@labnarrative.com?subject=LabNarrative%20Founding%20Affiliate%20Program&body=Channel%20or%20community%20URL%3A%0AAudience%20size%3A%0AMain%20platform%3A%0AAnything%20you%27d%20like%20us%20to%20know%3A">Apply to the Founding Affiliate Program →</a>
        </div>
      </section>

      <footer className={`${styles.footer} crypto-dark-panel`}>
        <a className={`${styles.wordmark} lnPublicWordmark`} href="/">LabNarrative</a>
        <div><a href="/">Product</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a></div>
        <p>Affiliate participation does not permit misleading claims, investment advice, or guaranteed-profit marketing.</p>
      </footer>
    </main>
  );
}
