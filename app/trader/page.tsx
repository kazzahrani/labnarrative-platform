import type { Metadata } from "next";
import TradingAgent from "./TradingAgent";

export const metadata: Metadata = {
  title: "LabNarrative Trading",
  description: "DCA bot trading and portfolio automation with live Binance Spot market data and TradingView charts.",
};

export default function TraderPage() {
  return <TradingAgent />;
}
