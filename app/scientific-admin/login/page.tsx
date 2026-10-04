import type { Metadata } from "next";
import ScientificLoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Scientific Admin — LabNarrative",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ScientificLoginClient />;
}
