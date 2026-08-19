import type { Metadata } from "next";
import PlatformClient from "./PlatformClient";

export const metadata: Metadata = {
  title: "LabNarrative — Operating System",
  description: "Tender-to-cash operating workspace for Saudi and GCC businesses.",
  robots: { index: false, follow: false },
};

export default function LabNarrativePlatformPage() {
  return <PlatformClient />;
}
