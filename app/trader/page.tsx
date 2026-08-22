import type { Metadata } from "next";
import TradingAgent from "./TradingAgent";

export const metadata: Metadata = {
  title: "Trading Agent — Weekly Accumulation Radar",
  description: "Personal weekly buying-zone scanner with configurable DCA and multi-take-profit plans.",
};

export default function TraderPage() {
  return <TradingAgent />;
}
