import type { Metadata } from "next";
import TradingAgent from "./TradingAgent";

export const metadata: Metadata = {
  title: "LabNarrative — Trading Automations",
  description: "Trading Automations v1.1: the full DCA automation workspace with live Binance Spot market data and the new minimal LabNarrative design.",
};

export default function TraderPage() {
  return <TradingAgent />;
}
