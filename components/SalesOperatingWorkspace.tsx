"use client";

import SalesConversionInbox from "./SalesConversionInbox";
import SalesDailyActionQueue from "./SalesDailyActionQueue";
import styles from "./sales-operating-workspace.module.css";

export default function SalesOperatingWorkspace() {
  return (
    <section className={styles.section} aria-label="Sales operating workspace">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Sales workspace</p>
            <h2>Opportunities and actions in one place</h2>
            <p>Start with active conversations, then work the overdue and today queue. Everything here is for manual sales decisions and follow-through.</p>
          </div>
        </header>

        <div className={styles.part}>
          <div className={styles.partLabel}>
            <span>1</span>
            <div><strong>Active opportunities</strong><small>Replies, interested leads and next commercial steps.</small></div>
          </div>
          <SalesConversionInbox />
        </div>

        <div className={styles.divider} />

        <div className={styles.part}>
          <div className={styles.partLabel}>
            <span>2</span>
            <div><strong>Action queue</strong><small>Work overdue items first, then today, upcoming and completed.</small></div>
          </div>
          <SalesDailyActionQueue />
        </div>
      </div>
    </section>
  );
}
