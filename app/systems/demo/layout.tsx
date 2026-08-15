import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Operations Demo — LabNarrative Systems",
  description:
    "Explore a LabNarrative Systems operations demo connecting tenders, quotations, orders, warehouse, supply, invoices, collection and management visibility.",
};

export default function SystemsDemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
