import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private Concept — Medical Masar | LabNarrative Systems",
  description: "A private illustrative LabNarrative Systems concept for a medical and laboratory distribution sales workflow.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function MedicalMasarConceptLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
