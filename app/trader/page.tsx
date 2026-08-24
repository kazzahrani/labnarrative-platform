import type { Metadata } from "next";
import TradingAgent from "./TradingAgent";

export const metadata: Metadata = {
  title: "LabNarrative — Trading Automations",
  description: "Trading Automations v2: full DCA automation with live Binance Spot market data, advanced portfolio analytics, and the Thrwa design system.",
};

export default function TraderPage() {
  return <TradingAgent />;
}
