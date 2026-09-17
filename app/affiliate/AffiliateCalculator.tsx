"use client";

import { useMemo, useState } from "react";
import styles from "./affiliate.module.css";

type PlatformKey =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "x"
  | "facebook"
  | "snapchat"
  | "telegram"
  | "discord"
  | "reddit"
  | "website";

type PlatformPreset = {
  label: string;
  metric: string;
  shortMetric: string;
  starterReach: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  clickRate: number;
  freeRate: number;
  paidRate: number;
  note: string;
};

const PLATFORMS: Record<PlatformKey, PlatformPreset> = {
  youtube: { label: "YouTube", metric: "monthly video views", shortMetric: "views", starterReach: 5_000, sliderMin: 500, sliderMax: 50_000, sliderStep: 500, clickRate: 0.02, freeRate: 0.28, paidRate: 0.08, note: "Starter example: a small, relevant trading channel where viewers can click from the description or pinned comment." },
  tiktok: { label: "TikTok", metric: "monthly video views", shortMetric: "views", starterReach: 20_000, sliderMin: 1_000, sliderMax: 150_000, sliderStep: 1_000, clickRate: 0.005, freeRate: 0.24, paidRate: 0.06, note: "Starter example: higher view volume but a lower outbound-click assumption because viewers usually need an extra step to reach a link." },
  instagram: { label: "Instagram", metric: "monthly Reels / Story views", shortMetric: "views", starterReach: 8_000, sliderMin: 500, sliderMax: 75_000, sliderStep: 500, clickRate: 0.008, freeRate: 0.25, paidRate: 0.06, note: "Starter example: a small trading creator using Stories, profile links, and Reels to move interested followers into a free tool." },
  x: { label: "X", metric: "monthly impressions", shortMetric: "impressions", starterReach: 15_000, sliderMin: 1_000, sliderMax: 100_000, sliderStep: 1_000, clickRate: 0.008, freeRate: 0.24, paidRate: 0.06, note: "Starter example: a small account with regular posts, where impressions are easier to earn than outbound link clicks." },
  facebook: { label: "Facebook", metric: "monthly post / Reel views", shortMetric: "views", starterReach: 7_000, sliderMin: 500, sliderMax: 75_000, sliderStep: 500, clickRate: 0.007, freeRate: 0.23, paidRate: 0.06, note: "Starter example: a small page or group sharing trading content, with modest outbound clicking from posts and Reels." },
  snapchat: { label: "Snapchat", metric: "monthly Story / Spotlight views", shortMetric: "views", starterReach: 10_000, sliderMin: 1_000, sliderMax: 100_000, sliderStep: 1_000, clickRate: 0.004, freeRate: 0.22, paidRate: 0.05, note: "Starter example: strong view volume but a deliberately cautious outbound-click assumption for Story and Spotlight audiences." },
  telegram: { label: "Telegram", metric: "monthly post views", shortMetric: "post views", starterReach: 2_500, sliderMin: 250, sliderMax: 20_000, sliderStep: 250, clickRate: 0.04, freeRate: 0.32, paidRate: 0.09, note: "Starter example: a compact trading community where links are visible directly inside posts and the audience is already topic-focused." },
  discord: { label: "Discord", metric: "monthly announcement / resource views", shortMetric: "views", starterReach: 1_000, sliderMin: 100, sliderMax: 10_000, sliderStep: 100, clickRate: 0.05, freeRate: 0.34, paidRate: 0.09, note: "Starter example: a small trading server where a resource or bot link is shared with an already engaged community." },
  reddit: { label: "Reddit", metric: "monthly post / comment views", shortMetric: "views", starterReach: 8_000, sliderMin: 500, sliderMax: 50_000, sliderStep: 500, clickRate: 0.01, freeRate: 0.25, paidRate: 0.07, note: "Starter example: useful posts and comments in relevant trading communities, with conservative outbound clicking." },
  website: { label: "Website / Blog", metric: "monthly visitors", shortMetric: "visitors", starterReach: 1_500, sliderMin: 100, sliderMax: 20_000, sliderStep: 100, clickRate: 0.05, freeRate: 0.30, paidRate: 0.09, note: "Starter example: a small niche site whose visitors are already reading trading or automation content." },
};

const SOCIAL_PLATFORMS: PlatformKey[] = ["youtube", "tiktok", "instagram", "x", "facebook", "snapchat"];
const COMMUNITY_PLATFORMS: PlatformKey[] = ["telegram", "discord", "reddit", "website"];

const COMMISSION_RATE = 0.4;
const PRO_MONTHLY_COMMISSION = 14.99 * COMMISSION_RATE;
const MAX_MONTHLY_COMMISSION = 29.99 * COMMISSION_RATE;
const PRO_ANNUAL_COMMISSION = 119.88 * COMMISSION_RATE;
const MAX_ANNUAL_COMMISSION = 239.88 * COMMISSION_RATE;
const AVG_MONTHLY_FIRST_PAYMENT = PRO_MONTHLY_COMMISSION * 0.75 + MAX_MONTHLY_COMMISSION * 0.25;
const AVG_ANNUAL_FIRST_PAYMENT = PRO_ANNUAL_COMMISSION * 0.75 + MAX_ANNUAL_COMMISSION * 0.25;
const AVG_FIRST_PAYMENT_COMMISSION = AVG_MONTHLY_FIRST_PAYMENT * 0.75 + AVG_ANNUAL_FIRST_PAYMENT * 0.25;

function money(value: number, digits = 0) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(value); }
function compact(value: number) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function pct(value: number) { return `${(value * 100).toFixed(value < 0.01 ? 1 : 0)}%`; }
function expected(value: number) { if (value >= 100) return Math.round(value).toLocaleString("en-US"); if (value >= 10) return value.toFixed(1); return value.toFixed(2); }

export default function AffiliateCalculator() {
  const [platform, setPlatform] = useState<PlatformKey>("youtube");
  const [reach, setReach] = useState(PLATFORMS.youtube.starterReach);
  const selected = PLATFORMS[platform];

  const funnel = useMemo(() => {
    const clicks = reach * selected.clickRate;
    const freeUsers = clicks * selected.freeRate;
    const paidUsers = freeUsers * selected.paidRate;
    const commission = paidUsers * AVG_FIRST_PAYMENT_COMMISSION;
    const rpm = reach > 0 ? (commission / reach) * 1000 : 0;
    return { clicks, freeUsers, paidUsers, commission, rpm };
  }, [reach, selected]);

  function choosePlatform(key: PlatformKey) { setPlatform(key); setReach(PLATFORMS[key].starterReach); }
  function platformButtons(keys: PlatformKey[], label: string) {
    return <div className={styles.platformGroup}><span className={styles.platformGroupLabel}>{label}</span><div className={styles.platformPicker} role="tablist" aria-label={label}>{keys.map((key) => <button key={key} type="button" role="tab" aria-selected={platform === key} className={platform === key ? styles.platformActive : ""} onClick={() => choosePlatform(key)}>{PLATFORMS[key].label}</button>)}</div></div>;
  }

  return (
    <section className={styles.calculatorSection} aria-labelledby="affiliate-calculator-title">
      <div className={styles.calculatorCopy}>
        <p className={styles.label}>Starter creator earnings estimator</p>
        <h2 id="affiliate-calculator-title">What could a small audience become?</h2>
        <p>Choose the channel you already use. Each platform starts with a different small-creator audience size and funnel assumption. The cash estimate counts the first qualifying payment only; recurring commission can add more later.</p>
        <div className={styles.rpmHero}><div className={styles.rpmHeroTop}><span>Estimated {selected.label} Affiliate RPM</span><em>Starter preset</em></div><strong>{money(funnel.rpm, 2)} <small>/ 1,000 {selected.shortMetric}</small></strong><p>{selected.note}</p></div>
        <div className={styles.earningHighlights}>
          <div><span>Cash commission</span><strong>{COMMISSION_RATE * 100}%</strong><small>of qualifying subscription revenue</small></div>
          <div><span>Free Max reward</span><strong>1 year</strong><small>for every 10 new paying customers</small></div>
        </div>
      </div>

      <div className={styles.calculatorCard}>
        <div className={styles.platformGroups}>{platformButtons(SOCIAL_PLATFORMS, "Social creators")}{platformButtons(COMMUNITY_PLATFORMS, "Communities & content")}</div>
        <div className={styles.audienceInputBlock}><div><span>{selected.label} · starter creator</span><label htmlFor="affiliate-audience">Your {selected.metric}</label></div><div className={styles.audienceNumberWrap}><input id="affiliate-audience" className={styles.audienceNumber} type="number" min={selected.sliderMin} max="10000000" step={selected.sliderStep} value={reach} onChange={(event) => setReach(Math.max(selected.sliderMin, Math.min(10_000_000, Number(event.target.value) || selected.sliderMin)))} /><small>{selected.shortMetric}</small></div></div>
        <input className={styles.affiliateSlider} type="range" min={selected.sliderMin} max={selected.sliderMax} step={selected.sliderStep} value={Math.min(Math.max(reach, selected.sliderMin), selected.sliderMax)} onChange={(event) => setReach(Number(event.target.value))} aria-label={`Estimated ${selected.metric}`} />
        <div className={styles.sliderTicks} aria-hidden="true"><span>{compact(selected.sliderMin)}</span><span>{compact(selected.starterReach)}</span><span>{compact(selected.sliderMax / 2)}</span><span>{compact(selected.sliderMax)}+</span></div>

        <div className={styles.rpmResult}><span>Estimated cash commission from one month of audience activity</span><strong>≈ {money(funnel.commission)}</strong><small>at {compact(reach)} {selected.shortMetric} · plus free Max access: 10 new paying customers = 1 full year</small></div>

        <div className={styles.funnelNumbers}><div><span>Audience</span><strong>{compact(reach)}</strong><small>{selected.shortMetric}</small></div><b>→</b><div><span>Link visits</span><strong>≈ {expected(funnel.clicks)}</strong><small>{pct(selected.clickRate)} click rate</small></div><b>→</b><div><span>Try free</span><strong>≈ {expected(funnel.freeUsers)}</strong><small>{pct(selected.freeRate)} of visits</small></div><b>→</b><div><span>New paid</span><strong>≈ {expected(funnel.paidUsers)}</strong><small>{pct(selected.paidRate)} of free users</small></div></div>

        <div className={styles.resultGrid}>
          <div><span>Estimated affiliate RPM</span><strong>{money(funnel.rpm, 2)}</strong><small>cash per 1,000 {selected.shortMetric}</small></div>
          <div><span>First-payment cash commission</span><strong>{money(AVG_FIRST_PAYMENT_COMMISSION, 2)}</strong><small>modelled average per new paid customer</small></div>
          <div><span>Free Max</span><strong>1 year / 10 customers</strong><small>1 month each + 2 bonus months at each 10-customer milestone</small></div>
        </div>

        <details className={styles.assumptionBox}><summary>See the assumptions behind this {selected.label} estimate</summary><div><span><b>{pct(selected.clickRate)}</b> audience → LabNarrative visit</span><span><b>{pct(selected.freeRate)}</b> visit → free Paper Trading user</span><span><b>{pct(selected.paidRate)}</b> free user → paid user</span><span><b>75 / 25</b> illustrative Pro / Max mix</span><span><b>75 / 25</b> illustrative monthly / annual mix</span></div></details>
        <p className={styles.calculatorFootnote}>Illustrative starter-creator scenario only — not an industry benchmark, historical LabNarrative affiliate performance, or guaranteed payout. Real results can be lower or higher. Cash RPM does not include the value of free Max access.</p>
      </div>
    </section>
  );
}
