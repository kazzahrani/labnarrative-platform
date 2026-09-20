"use client";

import { useMemo, useState } from "react";
import styles from "./affiliate.module.css";

const COMMISSION_RATE = 0.4;
const PRO_MONTHLY = 14.99;
const MAX_MONTHLY = 39.99;
const PERFORMANCE_MONTHLY = 78;
const REFERRAL_OPTIONS = [10, 25, 50, 100] as const;

const AVG_MONTHLY_PAYMENT =
  (PRO_MONTHLY + MAX_MONTHLY + PERFORMANCE_MONTHLY) / 3;
const AVG_MONTHLY_COMMISSION = AVG_MONTHLY_PAYMENT * COMMISSION_RATE;

const whole = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));

export default function AffiliateCalculator() {
  const [referralIndex, setReferralIndex] = useState(2);
  const referrals = REFERRAL_OPTIONS[referralIndex];

  const estimate = useMemo(
    () => referrals * AVG_MONTHLY_COMMISSION,
    [referrals],
  );

  return (
    <aside className={styles.earningsCard} aria-label="Affiliate earnings estimator">
      <p className={styles.earningsHeading}>Estimated monthly commission:</p>

      <div className={styles.earningsValue}>
        <strong>{whole(estimate)}</strong>
        <span>USD</span>
      </div>

      <div className={styles.sliderBlock}>
        <div className={styles.sliderLabel}>
          <span>Number of paying referrals</span>
        </div>

        <input
          className={styles.referralSlider}
          type="range"
          min="0"
          max={REFERRAL_OPTIONS.length - 1}
          step="1"
          value={referralIndex}
          onChange={(event) => setReferralIndex(Number(event.target.value))}
          aria-label="Number of paying referrals"
          aria-valuetext={`${referrals} paying referrals`}
        />

        <div className={styles.sliderTicks} aria-hidden="true">
          {REFERRAL_OPTIONS.map((value) => <span key={value}>{value}</span>)}
        </div>
      </div>

      <p className={styles.calculatorNote}>
        * Estimate uses the current 40% commission and an equal Pro / Max /
        Performance mix. Average modeled payment = $44.33
        (($14.99 + $39.99 + $78) / 3). Performance is modeled at the $78
        monthly cap; actual earnings vary with what referred customers pay.
      </p>
    </aside>
  );
}
