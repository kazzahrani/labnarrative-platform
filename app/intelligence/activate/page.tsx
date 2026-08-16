import type { Metadata } from "next";
import ThemeToggle from "../ThemeToggle";
import ActivateClient from "./ActivateClient";

export const metadata: Metadata = {
  title: "Activate Client Portal — LabNarrative Intelligence",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <><ThemeToggle variant="auth" /><ActivateClient /></>;
}
