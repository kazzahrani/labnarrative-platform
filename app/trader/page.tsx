import type { Metadata } from "next";
import TradingAgent from "./TradingAgent";

export const metadata: Metadata = {
  title: "LabNarrative Trading",
  description: "Crypto SmartTrades, DCA bots and portfolio automation with live TradingView charts.",
};

export default function TraderPage() {
  return <TradingAgent />;
}
