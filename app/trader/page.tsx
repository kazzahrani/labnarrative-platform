import type { Metadata } from "next";
import TraderPlatformShell from "./TraderPlatformShell";

export const metadata: Metadata = {
  title: "LabNarrative — Trading Automations",
  description: "Authenticated crypto trading automation with isolated Paper and Real accounts and secured Binance Spot connectivity.",
};

export default function TraderPage() {
  return <TraderPlatformShell />;
}
