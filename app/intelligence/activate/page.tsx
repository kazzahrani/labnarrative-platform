import type { Metadata } from "next";
import ActivateClient from "./ActivateClient";

export const metadata: Metadata = {
  title: "Activate Client Portal — LabNarrative Intelligence",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ActivateClient />;
}
