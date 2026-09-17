import type { Metadata } from "next";
import AffiliateWorkspace from "./AffiliateWorkspace";

export const metadata: Metadata = {
  title: "Creator & Affiliate — LabNarrative Trading",
  robots: { index: false, follow: false },
};

export default function TraderAffiliatePage() {
  return <AffiliateWorkspace />;
}
