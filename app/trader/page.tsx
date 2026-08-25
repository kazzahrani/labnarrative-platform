import type { Metadata } from "next";
import TraderV2FullShell from "./TraderV2FullShell";

export const metadata: Metadata = {
  title: "LabNarrative Trading",
  description: "Crypto trading automation with Real Account first, optional Paper trading, secure exchange connectivity, and full DCA bot management.",
};

export default function TraderPage() {
  return <TraderV2FullShell />;
}
