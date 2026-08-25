import type { Metadata } from "next";
import TraderV2Shell from "./TraderV2Shell";

export const metadata: Metadata = {
  title: "LabNarrative Trading",
  description: "Crypto trading automation with Real Account first, optional Paper trading, and secure exchange connectivity.",
};

export default function TraderPage() {
  return <TraderV2Shell />;
}
