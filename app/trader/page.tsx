import type { Metadata } from "next";
import TradingAutomationsV1 from "./v1/TradingAutomationsV1";

export const metadata: Metadata = {
  title: "Trading Automations",
  description: "A focused portfolio and DCA automation workspace powered by live Binance Spot market data.",
};

export default function TraderPage() {
  return <TradingAutomationsV1 />;
}
