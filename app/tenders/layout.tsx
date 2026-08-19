import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LabNarrative Tenders — Saudi tender intelligence",
  description:
    "AI-powered tender intelligence for Saudi suppliers. Match tenders to your catalog, inspect line-item coverage, and prioritize Bid / Review / No-Bid decisions.",
};

export default function TendersLayout({ children }: { children: ReactNode }) {
  return children;
}
