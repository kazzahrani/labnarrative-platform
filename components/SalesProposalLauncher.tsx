"use client";

import Link from "next/link";
import styles from "./sales-proposal-launcher.module.css";

export default function SalesProposalLauncher({ prospectId }: { prospectId: string }) {
  return (
    <Link className={styles.launcher} href={`/admin/sales/${prospectId}/proposal`} aria-label="Open Proposal Builder">
      <span>Proposal</span>
      <strong>Build offer →</strong>
    </Link>
  );
}
