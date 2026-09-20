"use client";

import { useMemo, useState } from "react";
import styles from "./affiliate.module.css";

const COMMISSION_RATE = 0.4;
const PRO_MONTHLY = 14.99;
const MAX_MONTHLY = 39.99;
const PRO_SHARE = 0.75;
const MAX_SHARE = 0.25;
const AVG_MONTHLY_PAYMENT = PRO_MONTHLY * PRO_SHARE + MAX_MONTHLY * MAX_SHARE;
const AVG_MONTHLY_COMMISSION = AVG_MONTHLY_PAYMENT * COMMISSION_RATE;

const whole = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));

export default function AffiliateCalculator() {
  const [referrals, setReferrals] = useState(50);

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
          min="10"
          max="100"
          step="5"
          value={referrals}
          onChange={(event) => setReferrals(Number(event.target.value))}
          aria-label="Number of paying referrals"
        />

        <div className={styles.sliderTicks} aria-hidden="true">
          <span>10</span><span>25</span><span>50</span><span>100</span>
        </div>
      </div>

      <p className={styles.calculatorNote}>
        * Estimate uses the current 40% commission and an illustrative 75% Pro /
        25% Max monthly-plan mix. Performance payments vary; a $0 Performance
        month earns $0 commission.
      </p>
    </aside>
  );
}
