import type { Metadata } from "next";
import ClientPortal from "./ClientPortal";
import ThemeToggle from "../ThemeToggle";
import styles from "./client.module.css";

export const metadata: Metadata = {
  title: "Client Portal — LabNarrative Intelligence",
  description: "Authenticated LabNarrative Intelligence client portal for analyses, reports, company profile and billing.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <main className={styles.portalPage}><ThemeToggle variant="portal" /><ClientPortal /></main>;
}
