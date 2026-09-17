import type { Metadata } from "next";
import TradingAdminGate from "@/components/admin/TradingAdminGate";
import TradingOutreachConsole from "@/app/admin/trading-outreach/TradingOutreachConsole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Internal · LabNarrative Trading",
  description: "Internal lead generation and personalized outreach for LabNarrative Trading.",
  robots: { index: false, follow: false },
};

export default function TradingInternalPage() {
  return (
    <TradingAdminGate>
      <TradingOutreachConsole />
    </TradingAdminGate>
  );
}
