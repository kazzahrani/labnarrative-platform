import type { Metadata } from "next";
import PlatformClient from "./PlatformClient";
import AutomaticTenderFeed from "./AutomaticTenderFeed";
import TenderIntelligenceLauncher from "./TenderIntelligenceLauncher";
import CatalogIntelligenceLauncher from "./CatalogIntelligenceLauncher";
import BidReviewWorkspace from "./BidReviewWorkspace";
import QuotationPricingWorkspace from "./QuotationPricingWorkspace";

export const metadata: Metadata = {
  title: "LabNarrative — Operating System",
  description: "Tender-to-cash operating workspace for Saudi and GCC businesses.",
  robots: { index: false, follow: false },
};

export default function LabNarrativePlatformPage() {
  return <><PlatformClient /><AutomaticTenderFeed /><TenderIntelligenceLauncher /><CatalogIntelligenceLauncher /><BidReviewWorkspace /><QuotationPricingWorkspace /></>;
}
