import type { Metadata } from "next";
import AffiliateCalculator from "./AffiliateCalculator";
import affiliateStyles from "./affiliate.module.css";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Affiliate Program — Earn 40% Commission | LabNarrative",
  description:
    "Refer traders to LabNarrative and earn 40% cash commission on qualifying Pro, Max and paid Performance payments, plus creator and Max rewards.",
};

const APP_URL = "https://app.labnarrative.com";
const AFFILIATE_URL = "https://app.labnarrative.com/affiliate";

const audiences = [
  ["YouTube", "Trading tutorials, bot reviews and strategy walkthroughs"],
  ["Reddit / X", "Useful trading automation posts, threads and discussions"],
  ["Telegram / Discord", "Trading communities, education groups and bot channels"],
  ["Blogs / Newsletters", "Long-form education, comparisons and automation guides"],
];

const creatorBonuses = [
  {
    eyebrow: "Content package",
    value: "+1 Max month",
    title: "Publish useful LabNarrative content",
    copy: "Approved qualifying creator packages earn one month of Max. Packages are available across YouTube, Shorts, TikTok, Instagram, Reddit, X, LinkedIn, blogs and trading communities.",
  },
  {
    eyebrow: "Verified reach",
    value: "Up to +12 months",
    title: "Grow the content",
    copy: "Eligible content can unlock additional Max months when verified view or impression milestones are reached.",
  },
  {
    eyebrow: "Referral milestone",
    value: "10 = 1 Max year",
    title: "Turn referrals into Max access",
    copy: "Each new paying customer creates one Max month. Every 10th valid customer adds the two-month milestone bonus, so 10 customers equal 12 Max months.",
  },
];

const faqs = [
  {
    title: "How does the affiliate program work?",
    body: (
      <>
        <p>Open the affiliate dashboard, copy your personal referral link and share it with your audience. Attribution lasts 30 days and the most recent valid LabNarrative affiliate link receives the referral.</p>
        <p>When an attributed user makes a qualifying payment, you earn 40% cash commission. Creator rewards and referral Max rewards can stack on top.</p>
      </>
    ),
  },
  {
    title: "Affiliate program details",
    body: (
      <>
        <p><strong>Pro and Max:</strong> you earn 40% of each successful qualifying payment. For annual plans, the full commission is credited when the annual payment clears.</p>
        <p><strong>Performance:</strong> you earn 40% of each non-zero Performance settlement actually paid. A $50 settlement pays $20 commission; the $78 monthly cap pays $31.20. A $0 month earns $0 commission.</p>
        <p><strong>Referral Max:</strong> the customer&apos;s first qualifying paid transaction creates one Max month for you. Later payments continue generating cash commission but do not create another customer reward.</p>
      </>
    ),
  },
  {
    title: "How do Performance referrals count as paying customers?",
    body: (
      <>
        <p>Joining the Performance plan alone does not count. The referral becomes a paying customer when their first non-zero Performance settlement is actually paid.</p>
        <p>That first payment creates the normal one-time +1 Max month referral reward and also earns the regular 40% cash commission.</p>
      </>
    ),
  },
  {
    title: "What creator rewards can I earn?",
    body: (
      <>
        <p>Approved qualifying content packages earn one Max month. Eligible creator content can also earn additional Max months from verified view or impression milestones.</p>
        <p>Current creator formats include YouTube, YouTube Shorts, TikTok, Instagram Reels, Reddit, X / Twitter, LinkedIn, Medium / Substack / blogs, and Telegram / Discord / Facebook community content. Exact package requirements are shown inside the Creator & Affiliate dashboard.</p>
      </>
    ),
  },
  {
    title: "What is not allowed?",
    body: (
      <>
        <p>Self-referrals, spam, impersonation, misleading performance claims, guaranteed-profit promises, stolen payment methods, purchased or botted views, deceptive advertising, or attempts to manipulate referral attribution are not allowed.</p>
        <p>Refunded, disputed, charged-back or reversed qualifying payments can reverse the related commission and any referral Max reward created by that payment.</p>
      </>
    ),
  },
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
          <a className={styles.launch} href={AFFILIATE_URL}>Get affiliate link →</a>
        </div>
      </header>

      <section className={affiliateStyles.hero}>
        <div className={affiliateStyles.heroCopy}>
          <p className={affiliateStyles.eyebrow}>LabNarrative Affiliate Program</p>
          <h1><span>Earn 40% commission</span><br />from every trader you refer.</h1>
          <p className={affiliateStyles.heroLead}>
            Turn your audience into affiliate income. Earn on qualifying Pro, Max
            and paid Performance settlements — plus Max rewards for customers and
            useful creator content.
          </p>
          <div className={affiliateStyles.heroActions}>
            <a className={affiliateStyles.primaryCta} href={AFFILIATE_URL}>Get your affiliate link →</a>
            <a className={affiliateStyles.secondaryCta} href="#how-it-works">How it works</a>
          </div>
          <div className={affiliateStyles.heroProof}>
            <span><b>40%</b> cash commission</span>
            <span><b>30 days</b> attribution</span>
            <span><b>Performance</b> included</span>
          </div>
        </div>
        <AffiliateCalculator />
      </section>

      <section className={affiliateStyles.audienceSection}>
        <div className={affiliateStyles.sectionHeading}>
          <p className={affiliateStyles.eyebrow}>Built for trading audiences</p>
          <h2>Share it where traders already learn and compare tools.</h2>
        </div>
        <div className={affiliateStyles.audienceGrid}>
          {audiences.map(([title, copy]) => (
            <article key={title}>
              <span>{title.slice(0, 1)}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={affiliateStyles.howSection} id="how-it-works">
        <div className={affiliateStyles.sectionHeadingCentered}>
          <p className={affiliateStyles.eyebrow}>How to get started</p>
          <h2>Three steps. One referral link.</h2>
        </div>
        <div className={affiliateStyles.howGrid}>
          <article>
            <div className={affiliateStyles.stepIcon}>↗</div>
            <span>01</span>
            <h3>Get your affiliate link</h3>
            <p>Open your LabNarrative affiliate dashboard and copy your unique referral link.</p>
          </article>
          <article>
            <div className={affiliateStyles.stepIcon}>◎</div>
            <span>02</span>
            <h3>Invite traders</h3>
            <p>Share useful content, tutorials, comparisons or community resources that send traders to LabNarrative.</p>
          </article>
          <article>
            <div className={affiliateStyles.stepIcon}>$</div>
            <span>03</span>
            <h3>Earn 40% commission</h3>
            <p>Get paid on qualifying Pro, Max and non-zero Performance payments attributed to your link.</p>
          </article>
        </div>
        <div className={affiliateStyles.centerCta}>
          <a className={affiliateStyles.primaryCta} href={AFFILIATE_URL}>Get your affiliate link →</a>
        </div>
      </section>

      <section className={affiliateStyles.commissionSection}>
        <div className={affiliateStyles.commissionIntro}>
          <p className={affiliateStyles.eyebrow}>Affiliate economics</p>
          <h2>40% of what LabNarrative actually collects.</h2>
          <p>No separate Performance formula for affiliates. If your referral pays LabNarrative, the qualifying payment uses the same 40% affiliate rate.</p>
        </div>
        <div className={affiliateStyles.commissionGrid}>
          <article>
            <small>Pro monthly</small>
            <strong>$6.00</strong>
            <span>40% of $14.99</span>
          </article>
          <article>
            <small>Max monthly</small>
            <strong>$16.00</strong>
            <span>40% of $39.99</span>
          </article>
          <article>
            <small>Performance example</small>
            <strong>$20.00</strong>
            <span>40% of a $50 settlement</span>
          </article>
          <article className={affiliateStyles.highlightCard}>
            <small>Performance monthly cap</small>
            <strong>$31.20</strong>
            <span>40% of the $78 maximum settlement</span>
          </article>
        </div>
      </section>

      <section className={affiliateStyles.bonusSection}>
        <div className={affiliateStyles.sectionHeadingCentered}>
          <p className={affiliateStyles.eyebrow}>More ways to earn</p>
          <h2>Cash commission is only one layer.</h2>
          <p>Creator and referral Max rewards stack with your affiliate cash earnings.</p>
        </div>
        <div className={affiliateStyles.bonusGrid}>
          {creatorBonuses.map((item) => (
            <article key={item.title}>
              <small>{item.eyebrow}</small>
              <strong>{item.value}</strong>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={affiliateStyles.faqSection}>
        <div className={affiliateStyles.sectionHeadingCentered}>
          <p className={affiliateStyles.eyebrow}>FAQ</p>
          <h2>Affiliate program details</h2>
        </div>
        <div className={affiliateStyles.faqList}>
          {faqs.map((faq) => (
            <details key={faq.title}>
              <summary>{faq.title}<span>+</span></summary>
              <div className={affiliateStyles.faqBody}>{faq.body}</div>
            </details>
          ))}
        </div>
      </section>

      <section className={affiliateStyles.finalCta}>
        <p className={affiliateStyles.eyebrow}>Start sharing LabNarrative</p>
        <h2>Get your affiliate link and start earning.</h2>
        <p>Your dashboard tracks referrals, commissions, Max rewards and creator submissions in one place.</p>
        <a className={affiliateStyles.primaryCta} href={AFFILIATE_URL}>Open Affiliate dashboard →</a>
      </section>

      <footer className={styles.footer}>
        <a href="/"><Brand /></a>
        <div className={styles.footerLinks}>
          <a href="/pricing">Pricing</a>
          <a href="/affiliate">Affiliates</a>
          <a href={APP_URL}>Launch app</a>
          <a href="mailto:hello@labnarrative.com">Contact</a>
        </div>
        <small>Creator and affiliate participation does not permit spam, misleading claims, investment advice, or guaranteed-profit marketing.</small>
      </footer>
    </main>
  );
}
