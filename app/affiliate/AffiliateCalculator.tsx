"use client";

import { useMemo, useState } from "react";
import styles from "./affiliate.module.css";

// Illustrative equal mix of Pro annual ($119.88) and Max annual ($239.88) at 40% commission.
const AVERAGE_COMMISSION = 71.952;
const MAX_COMMISSION = 95.952;
const COMMISSION_RATE = 0.4;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function AffiliateCalculator() {
  const [customers, setCustomers] = useState(10);

  const estimated = useMemo(() => customers * AVERAGE_COMMISSION, [customers]);
  const maximum = useMemo(() => customers * MAX_COMMISSION, [customers]);
  const impliedEligibleRevenue = useMemo(() => estimated / COMMISSION_RATE, [estimated]);
  const retained = impliedEligibleRevenue - estimated;

  return (
    <section className={styles.calculatorSection} aria-labelledby="affiliate-calculator-title">
      <div className={styles.calculatorCopy}>
        <p className={styles.label}>Earnings calculator</p>
        <h2 id="affiliate-calculator-title">See what a relevant audience can become.</h2>
        <p>
          Move the slider to estimate commission using an illustrative 50/50 mix of Pro annual and Max annual customers, or <strong>about $71.95 per referred annual-plan customer</strong>.
          A Max annual customer can generate <strong>up to $95.95</strong> in affiliate commission.
        </p>
        <div className={styles.earningHighlights}>
          <div><span>Illustrative annual-plan mix</span><strong>≈ $71.95</strong><small>per referred paid customer</small></div>
          <div><span>Maximum annual commission</span><strong>$95.95</strong><small>per Max annual customer</small></div>
        </div>
      </div>

      <div className={styles.calculatorCard}>
        <div className={styles.calculatorTopline}>
          <div><span>Referred paid customers</span><strong>{customers}</strong></div>
          <div className={styles.rateChip}>40% commission</div>
        </div>

        <div className={styles.calculatorVisual}>
          <div className={styles.commissionDonut} role="img" aria-label="Affiliate receives 40 percent of eligible subscription revenue">
            <div className={styles.donutCenter}>
              <span>Estimated earnings</span>
              <strong>{money(estimated)}</strong>
            </div>
          </div>
          <div className={styles.calculatorNumbers}>
            <div><i className={styles.affiliateDot} /><span>Your affiliate share</span><strong>{money(estimated)}</strong><small>40% of illustrative eligible revenue</small></div>
            <div><i className={styles.platformDot} /><span>LabNarrative share</span><strong>{money(retained)}</strong><small>60% of illustrative eligible revenue</small></div>
            <div className={styles.maxPotential}><span>If every referral chose Max annual</span><strong>Up to {money(maximum)}</strong></div>
          </div>
        </div>

        <label className={styles.sliderLabel} htmlFor="affiliate-referrals">
          Number of referred paid customers
        </label>
        <input
          id="affiliate-referrals"
          className={styles.affiliateSlider}
          type="range"
          min="1"
          max="100"
          step="1"
          value={customers}
          onChange={(event) => setCustomers(Number(event.target.value))}
        />
        <div className={styles.sliderTicks} aria-hidden="true"><span>1</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        <p className={styles.calculatorFootnote}>
          Illustrative estimate only. Actual affiliate earnings vary by plan, billing cycle, refunds, chargebacks, and customer retention. The ≈$71.95 figure assumes an even mix of current Pro annual and Max annual pricing and is not a guaranteed payout.
        </p>
      </div>
    </section>
  );
}
