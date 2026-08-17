import type { Metadata } from "next";
import ThemeToggle from "../ThemeToggle";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Client Sign In — LabNarrative",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <><ThemeToggle variant="auth" /><LoginClient /></>;
}
