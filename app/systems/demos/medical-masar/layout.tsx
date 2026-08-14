import type { Metadata } from "next";
import "./flat-dark.css";
import LatinNumerals from "./latin-numerals";

export const metadata: Metadata = {
  title: "Private Concept — Medical Masar | LabNarrative Systems",
  description: "A private illustrative LabNarrative Systems concept connecting tenders, quotations, orders, warehouse, supply, invoicing, collections, and management visibility for a laboratory distributor.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function MedicalMasarConceptLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <LatinNumerals />
      {children}
    </>
  );
}
