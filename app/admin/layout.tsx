import type { ReactNode } from "react";
import "./systems-intelligence-light.css";
import AdminSessionContinuity from "@/components/admin/AdminSessionContinuity";
import SystemsLinkedInBatchLauncher from "./SystemsLinkedInBatchLauncher";
import SystemsEmailBatchLauncher from "./SystemsEmailBatchLauncher";
import SystemsConnectedFilterEnhancer from "./SystemsConnectedFilterEnhancer";
import SystemsContactSearchEnhancer from "./SystemsContactSearchEnhancer";
import SystemsSimpleOutreachPanel from "./SystemsSimpleOutreachPanel";
import SystemsThemeToggle from "./SystemsThemeToggle";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AdminSessionContinuity />
      <SystemsThemeToggle />
      <SystemsConnectedFilterEnhancer />
      <SystemsContactSearchEnhancer />
      <SystemsSimpleOutreachPanel />
      <SystemsEmailBatchLauncher />
      <SystemsLinkedInBatchLauncher />
    </>
  );
}
