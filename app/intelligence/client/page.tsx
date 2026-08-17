import type { Metadata } from "next";
import ClientPortal from "./ClientPortal";
import FullWorkspaceLabelPatch from "./FullWorkspaceLabelPatch";
import ClientBrandPatch from "./ClientBrandPatch";
import ThemeToggle from "../ThemeToggle";
import styles from "./client.module.css";

export const metadata: Metadata = {
  title: "Client Portal — LabNarrative",
  description: "Authenticated LabNarrative client portal for product analyses, full workspaces, reports, company profile and billing.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <main className={styles.portalPage}><ThemeToggle variant="portal" /><ClientPortal /><FullWorkspaceLabelPatch /><ClientBrandPatch /></main>;
}
