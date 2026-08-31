import type { Metadata } from "next";
import { headers } from "next/headers";
import PlatformClient from "./PlatformClient";
import AutomaticTenderFeed from "./AutomaticTenderFeed";
import TenderIntelligenceLauncher from "./TenderIntelligenceLauncher";
import CatalogIntelligenceLauncher from "./CatalogIntelligenceLauncher";
import BidReviewWorkspace from "./BidReviewWorkspace";
import QuotationPricingWorkspace from "./QuotationPricingWorkspace";
import TenderSourcingWorkspace from "./TenderSourcingWorkspace";
import SupplierIntelligenceWorkspace from "./SupplierIntelligenceWorkspace";
import SupplierContactEmailWorkspace from "./SupplierContactEmailWorkspace";
import SupplierQuoteIntakeWorkspace from "./SupplierQuoteIntakeWorkspace";
import SupplierQuoteExtractionWorkspace from "./SupplierQuoteExtractionWorkspace";
import HostRoute from "../trader-v2/HostRoute";

async function requestHost() {
  return (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
}

export async function generateMetadata(): Promise<Metadata> {
  if (await requestHost() === "app.labnarrative.com") {
    return {
      title: "LabNarrative Trading",
      description: "Fast multi-exchange trading automation workspace.",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: "LabNarrative — Operating System",
    description: "Tender-to-cash operating workspace for Saudi and GCC businesses.",
    robots: { index: false, follow: false },
  };
}

export default async function LabNarrativePlatformPage() {
  if (await requestHost() === "app.labnarrative.com") return <HostRoute view="overview" />;
  return <><PlatformClient /><AutomaticTenderFeed /><TenderIntelligenceLauncher /><CatalogIntelligenceLauncher /><BidReviewWorkspace /><QuotationPricingWorkspace /><TenderSourcingWorkspace /><SupplierIntelligenceWorkspace /><SupplierContactEmailWorkspace /><SupplierQuoteIntakeWorkspace /><SupplierQuoteExtractionWorkspace /></>;
}
