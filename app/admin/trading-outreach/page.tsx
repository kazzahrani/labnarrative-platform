import type { Metadata } from "next";
import TradingAdminGate from "@/components/admin/TradingAdminGate";
import TradingOutreachConsole from "./TradingOutreachConsole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Trading Outreach · LabNarrative",
  description: "Internal lead generation, personalization and automated email outreach for LabNarrative Trading.",
  robots: { index: false, follow: false },
};

export default function TradingOutreachPage() {
  return (
    <TradingAdminGate>
      <TradingOutreachConsole />
    </TradingAdminGate>
  );
}
