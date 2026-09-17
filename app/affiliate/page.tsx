import type { Metadata } from "next";
import affiliateStyles from "./affiliate.module.css";
import styles from "../trading-public-pages.module.css";

export const metadata: Metadata = {
  title: "Creator & Affiliate Program — LabNarrative",
  description: "Create useful LabNarrative content to earn free Max, unlock performance bonuses as your content grows, and earn 40% cash commission from qualifying referrals.",
};

const APP_URL = "https://app.labnarrative.com";
const AFFILIATE_URL = "https://app.labnarrative.com/affiliate";
const SUBMIT_URL = "https://app.labnarrative.com/affiliate#submit-content";

const creatorRewards = [
  ["YouTube", "1 long-form video (5+ min) or 2 standard videos (<5 min)", "1 month Max"],
  ["YouTube Shorts", "5 approved Shorts", "1 month Max"],
  ["TikTok", "5 approved videos", "1 month Max"],
  ["Instagram Reels", "5 approved Reels", "1 month Max"],
  ["Reddit", "2 high-quality original posts in relevant communities; share/repost in other relevant communities where permitted (up to 5 per original)", "1 month Max"],
  ["X / Twitter", "4 substantial posts or 3 substantial threads", "1 month Max"],
  ["LinkedIn", "4 substantial posts", "1 month Max"],
  ["Medium / Substack / Blog", "1 original detailed article", "1 month Max"],
  ["Telegram / Discord / Facebook", "5 substantial posts in relevant communities", "1 month Max"],
];

const performanceRewards = [
  ["YouTube long-form video", "1K / 5K / 10K / 50K / 100K views", "+1 / +2 / +3 / +6 / +12 months Max"],
  ["Short / Reel / TikTok", "10K / 50K / 100K / 500K / 1M views", "+1 / +2 / +3 / +6 / +12 months Max"],
  ["Reddit / X / LinkedIn", "10K / 50K / 100K+ verified views or impressions", "+1 / +3 / +6 months Max"],
];

const steps = [
  ["01", "Create or refer", "Publish an approved content package, share your affiliate link, or do both."],
  ["02", "Earn Max for content", "Each completed approved content package earns 1 month of LabNarrative Max."],
  ["03", "Grow the content", "Hit verified view or impression milestones to unlock additional Max performance rewards."],
  ["04", "Convert customers", "Qualifying referred subscription payments earn 40% cash commission. Referral Max rewards stack too."],
];

const terms = [
  "Creator rewards and affiliate commissions can be earned together.",
  "A completed approved content package earns 1 month of LabNarrative Max according to the platform requirements shown above.",
  "Performance bonuses use the highest verified milestone reached for eligible content and are not added repeatedly for lower milestones. If the same content later reaches a higher tier, only the additional difference is awarded.",
  "Performance bonuses currently apply to YouTube long-form videos, YouTube Shorts, TikTok, Instagram Reels, Reddit, X / Twitter, and LinkedIn as listed above.",
  "Content must be public, original, genuinely useful, and substantially about LabNarrative.",
  "Honest reviews, tutorials, strategy tests, comparisons, bot experiments, and educational content may qualify. Content does not need to be uniformly positive.",
  "Community posts must follow the rules of each community. Reddit reposting/cross-posting is optional and only qualifies where permitted; spam or repetitive low-value promotion does not qualify.",
  "Affiliates earn 40% of qualifying subscription revenue. Every new paying customer adds Max access, and each 10-customer milestone receives the 2-month bonus needed to make 10 paying customers = 1 full year of Max.",
  "Referral attribution lasts 30 days. If a visitor uses more than one LabNarrative affiliate link, the most recent valid referral receives attribution.",
  "Refunded, disputed, charged-back, fraudulent, reversed, botted, purchased, or manipulated activity can reverse or invalidate related rewards.",
  "No self-referrals, impersonation, misleading performance claims, or promises of guaranteed trading profits. Affiliate relationships must be disclosed wherever required.",
];

function Brand() { return <span className={styles.brand}><img src="/labnarrative-mark.svg" alt="" />LabNarrative</span>; }

export default function AffiliatePage() {
  return <main className={styles.page}>
    <header className={styles.header}><a href="/" aria-label="Home"><Brand /></a><nav className={styles.nav} aria-label="Primary navigation"><a href="/#product">Product</a><a href="/#platform">Platform</a><a href="/#workflow">How it works</a><a href="/pricing">Pricing</a><a className={styles.current} href="/affiliate">Creators & Affiliates</a></nav><div className={styles.headerActions}><a className={styles.signIn} href={APP_URL}>Sign in</a><a className={styles.launch} href={APP_URL}>Launch app →</a></div></header>

    <section className={styles.affiliateHero}><div className={styles.affiliateHeroInner}><div><p className={styles.eyebrow}>Creator + Affiliate Program</p><h1>Create. Grow.<br /><em>Earn.</em></h1><p className={styles.affiliateLead}><strong>Create useful content → earn Max.</strong> Grow your views → earn more Max. Refer paying customers → earn <strong>40% cash commission</strong>.</p><div className={styles.heroActions}><a className={styles.primary} href={AFFILIATE_URL}>Open Creator & Affiliate dashboard →</a><a className={styles.secondary} href="#creator-rewards">See content rewards</a></div></div><aside className={styles.commissionPanel}><small>Three ways to earn</small><strong>40%</strong><p>Cash commission on qualifying referral revenue, plus Max rewards for approved content and performance.</p><div className={affiliateStyles.commissionStats}><div><span>Content package</span><b>1 month</b><small>Max free</small></div><div><span>Affiliate sale</span><b>40%</b><small>cash commission</small></div></div></aside></div></section>

    <section className={affiliateStyles.rewardsSection} id="creator-rewards"><div className={styles.sectionIntro}><p className={styles.label}>Layer 1 · Content rewards</p><h2>Publish useful LabNarrative content. Earn Max.</h2><p>Complete any approved package below to earn 1 month of Max. You can complete packages across multiple platforms.</p></div><div className={affiliateStyles.rewardTable}><div className={affiliateStyles.rewardHead}><span>Platform</span><span>Qualifying content</span><span>Reward</span></div>{creatorRewards.map(([platform, content, reward]) => <div className={affiliateStyles.rewardRow} key={platform}><strong>{platform}</strong><span>{content}</span><b>{reward}</b></div>)}</div></section>

    <section className={affiliateStyles.performanceSection}><div className={styles.sectionIntro}><p className={styles.label}>Layer 2 · Performance bonuses</p><h2>When your content grows, your reward grows too.</h2><p>Performance rewards are additional to the content-package reward. The reward shown is the total bonus for the highest verified milestone; if you move to a higher tier later, we add only the difference.</p></div><div className={affiliateStyles.rewardTable}>{performanceRewards.map(([type, milestone, reward]) => <div className={affiliateStyles.performanceRow} key={type}><strong>{type}</strong><span>{milestone}</span><b>{reward}</b></div>)}</div></section>

    <section className={styles.section}><div className={styles.sectionIntro}><p className={styles.label}>Layer 3 · Results</p><h2>Turn the audience into customers.</h2></div><div className={styles.programGrid}><article><span>01</span><h3>40% cash commission</h3><p>Earn 40% of each qualifying subscription payment attributed to your affiliate link.</p></article><article><span>02</span><h3>+1 Max month per customer</h3><p>Every new paying customer creates a Max reward. Later eligible payments from the same customer continue to earn cash commission.</p></article><article><span>10</span><h3>10 customers = 1 Max year</h3><p>Every 10th valid paying customer adds the 2-month milestone bonus, making each block of 10 worth 12 Max months.</p></article></div></section>


    <section className={styles.section} id="program"><div className={styles.sectionIntro}><p className={styles.label}>How it works</p><h2>Content earns Max. Reach earns more. Customers earn cash.</h2></div><div className={styles.programGrid}>{steps.map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className={styles.terms} id="terms"><div><div className={styles.sectionIntro}><p className={styles.label}>Program rules</p><h2>Useful, honest content — not spam.</h2></div><ul className={styles.termList}>{terms.map(term => <li key={term}>{term}</li>)}</ul></div><aside className={styles.applyBox}><h3>Ready to participate?</h3><p>Open your dashboard for your affiliate link and referral earnings. Submit completed creator packages and performance milestones directly inside your account for review.</p><a className={styles.applyCta} href={AFFILIATE_URL}>Open dashboard →</a><a className={affiliateStyles.creatorContact} href={SUBMIT_URL}>Submit creator content →</a></aside></section>

    <footer className={styles.footer}><a href="/"><Brand /></a><div className={styles.footerLinks}><a href="/pricing">Pricing</a><a href="/affiliate">Creators & Affiliates</a><a href={APP_URL}>Launch app</a><a href="mailto:hello@labnarrative.com">Contact</a></div><small>Creator and affiliate participation does not permit spam, misleading claims, investment advice, or guaranteed-profit marketing.</small></footer>
  </main>;
}
