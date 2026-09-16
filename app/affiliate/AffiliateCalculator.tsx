"use client";

import { useMemo, useState } from "react";
import styles from "./affiliate.module.css";

type PlatformKey = "youtube" | "telegram" | "x" | "reddit" | "website";

const PLATFORMS: Record<PlatformKey, { label: string; metric: string; shortMetric: string }> = {
  youtube: { label: "YouTube", metric: "monthly video views", shortMetric: "views" },
  telegram: { label: "Telegram", metric: "monthly post views", shortMetric: "post views" },
  x: { label: "X", metric: "monthly impressions", shortMetric: "impressions" },
  reddit: { label: "Reddit", metric: "monthly post / comment views", shortMetric: "views" },
  website: { label: "Website / Blog", metric: "monthly visitors", shortMetric: "visitors" },
};

// Launch-period illustration only. This is intentionally presented as an estimate, not historical performance.
const ESTIMATED_AFFILIATE_RPM = 28.4;
const COMMISSION_RATE = 0.4;
const PRO_ANNUAL_COMMISSION = 47.952;
const MAX_ANNUAL_COMMISSION = 95.952;

function money(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export default function AffiliateCalculator() {
  const [platform, setPlatform] = useState<PlatformKey>("youtube");
  const [reach, setReach] = useState(25_000);

  const selected = PLATFORMS[platform];
  const estimatedMonthly = useMemo(() => (reach / 1000) * ESTIMATED_AFFILIATE_RPM, [reach]);
  const estimatedYearly = estimatedMonthly * 12;

  return (
    <section className={styles.calculatorSection} aria-labelledby="affiliate-calculator-title">
      <div className={styles.calculatorCopy}>
        <p className={styles.label}>Audience earnings estimator</p>
        <h2 id="affiliate-calculator-title">What could your audience earn you?</h2>
        <p>
          Start with the metric you already know: views, impressions, or visitors. LabNarrative turns that audience into a simple estimated affiliate RPM so you can picture the opportunity before you share a link.
        </p>

        <div className={styles.rpmHero}>
          <span>Estimated LabNarrative Affiliate RPM</span>
          <strong>{money(ESTIMATED_AFFILIATE_RPM, 2)} <small>/ 1,000 {selected.shortMetric}</small></strong>
          <p>Illustrative revenue per 1,000 relevant audience views, impressions, or visitors.</p>
        </div>

        <div className={styles.earningHighlights}>
          <div><span>Commission rate</span><strong>{COMMISSION_RATE * 100}%</strong><small>of qualifying subscription revenue</small></div>
          <div><span>Annual-plan commission</span><strong>{money(PRO_ANNUAL_COMMISSION, 2)}–{money(MAX_ANNUAL_COMMISSION, 2)}</strong><small>per Pro / Max annual referral</small></div>
        </div>
      </div>

      <div className={styles.calculatorCard}>
        <div className={styles.platformPicker} role="tablist" aria-label="Audience platform">
          {(Object.keys(PLATFORMS) as PlatformKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={platform === key}
              className={platform === key ? styles.platformActive : ""}
              onClick={() => setPlatform(key)}
            >
              {PLATFORMS[key].label}
            </button>
          ))}
        </div>

        <div className={styles.audienceInputBlock}>
          <div>
            <span>{selected.label}</span>
            <label htmlFor="affiliate-audience">Your {selected.metric}</label>
          </div>
          <div className={styles.audienceNumberWrap}>
            <input
              id="affiliate-audience"
              className={styles.audienceNumber}
              type="number"
              min="1000"
              max="10000000"
              step="1000"
              value={reach}
              onChange={(event) => setReach(Math.max(1000, Math.min(10_000_000, Number(event.target.value) || 1000)))}
            />
            <small>{selected.shortMetric}</small>
          </div>
        </div>

        <input
          className={styles.affiliateSlider}
          type="range"
          min="1000"
          max="500000"
          step="1000"
          value={Math.min(reach, 500000)}
          onChange={(event) => setReach(Number(event.target.value))}
          aria-label={`Estimated ${selected.metric}`}
        />
        <div className={styles.sliderTicks} aria-hidden="true"><span>1K</span><span>100K</span><span>250K</span><span>500K+</span></div>

        <div className={styles.rpmResult}>
          <span>Estimated affiliate earnings</span>
          <strong>≈ {money(estimatedMonthly)}</strong>
          <small>per month at {compact(reach)} {selected.shortMetric}</small>
        </div>

        <div className={styles.resultGrid}>
          <div><span>Affiliate RPM</span><strong>{money(ESTIMATED_AFFILIATE_RPM, 2)}</strong><small>per 1,000 {selected.shortMetric}</small></div>
          <div><span>Monthly audience</span><strong>{compact(reach)}</strong><small>{selected.shortMetric}</small></div>
          <div><span>12-month equivalent</span><strong>{money(estimatedYearly)}</strong><small>if similar audience and conversion repeat</small></div>
        </div>

        <div className={styles.funnelStrip}>
          <div><span>Audience</span><strong>{compact(reach)}</strong></div>
          <b>→</b>
          <div><span>Try free</span><strong>Paper Trading</strong></div>
          <b>→</b>
          <div><span>Upgrade</span><strong>Pro / Max</strong></div>
          <b>→</b>
          <div><span>You earn</span><strong>40%</strong></div>
        </div>

        <p className={styles.calculatorFootnote}>
          Illustrative estimate only — not historical LabNarrative affiliate performance and not a guaranteed payout. The {money(ESTIMATED_AFFILIATE_RPM, 2)} RPM is a launch-period scenario for relevant trading audiences. Actual earnings depend on traffic quality, click-through, free-user activation, paid conversion, plan mix, retention, refunds, and chargebacks. We will replace estimates with observed platform-specific data as the program grows.
        </p>
      </div>
    </section>
  );
}
