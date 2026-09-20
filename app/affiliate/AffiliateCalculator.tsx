"use client";

import { useMemo, useState } from "react";
import styles from "./affiliate.module.css";

const COMMISSION_RATE = 0.4;
const PRO_MONTHLY = 14.99;
const MAX_MONTHLY = 39.99;
const ILLUSTRATIVE_PRO_SHARE = 0.75;
const ILLUSTRATIVE_MAX_SHARE = 0.25;
const AVG_MONTHLY_PAYMENT =
  PRO_MONTHLY * ILLUSTRATIVE_PRO_SHARE + MAX_MONTHLY * ILLUSTRATIVE_MAX_SHARE;

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

export default function AffiliateCalculator() {
  const [referrals, setReferrals] = useState(50);

  const estimate = useMemo(
    () => referrals * AVG_MONTHLY_PAYMENT * COMMISSION_RATE,
    [referrals],
  );

  const monthlyPerReferral = AVG_MONTHLY_PAYMENT * COMMISSION_RATE;

  return (
    <aside className={styles.earningsCard} aria-label="Affiliate earnings estimator">
      <div className={styles.earningsTop}>
        <span>Illustrative monthly affiliate income</span>
        <b>40% commission</b>
      </div>

      <div className={styles.earningsValue}>
        <strong>{money(estimate)}</strong>
        <span>/ month</span>
      </div>

      <div className={styles.sliderBlock}>
        <div className={styles.sliderLabel}>
          <span>Active referred customers</span>
          <strong>{referrals}</strong>
        </div>
        <input
          className={styles.referralSlider}
          type="range"
          min="10"
          max="100"
          step="5"
          value={referrals}
          onChange={(event) => setReferrals(Number(event.target.value))}
          aria-label="Number of active referred customers"
        />
        <div className={styles.sliderTicks} aria-hidden="true">
          <span>10</span><span>25</span><span>50</span><span>100</span>
        </div>
      </div>

      <div className={styles.calculatorFacts}>
        <div>
          <span>Illustrative fixed-plan commission</span>
          <strong>{money(monthlyPerReferral)}</strong>
          <small>per active monthly referral</small>
        </div>
        <div>
          <span>Performance settlement</span>
          <strong>up to $31.20</strong>
          <small>40% of the $78 monthly cap</small>
        </div>
      </div>

      <p className={styles.calculatorNote}>
        Illustration only, using a 75% Pro / 25% Max monthly-plan mix. Actual
        earnings vary by plan, payment timing and Performance settlements. A
        $0 Performance month earns $0 commission.
      </p>
    </aside>
  );
}
