import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "LabNarrative Trading", template: "%s | LabNarrative Trading" },
  description: "Fast multi-exchange trading automation workspace.",
  robots: { index: false, follow: false },
};

export default function TraderV2Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
