import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Client Sign In — LabNarrative Intelligence",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <LoginClient />;
}
