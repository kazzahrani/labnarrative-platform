import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Demo — LabNarrative Systems",
  description:
    "Explore an interactive LabNarrative Systems demo showing AI lead qualification, CRM pipeline management, automated follow-up and business reporting.",
};

export default function SystemsDemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
