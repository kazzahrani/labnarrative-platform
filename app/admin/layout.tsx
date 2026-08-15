import type { ReactNode } from "react";
import "./systems-intelligence-light.css";
import "./systems-50-50.css";
import AdminSessionContinuity from "@/components/admin/AdminSessionContinuity";
import SystemsLinkedInBatchLauncher from "./SystemsLinkedInBatchLauncher";
import SystemsEmailBatchLauncher from "./SystemsEmailBatchLauncher";
import SystemsConnectedFilterEnhancer from "./SystemsConnectedFilterEnhancer";
import SystemsContactSearchEnhancer from "./SystemsContactSearchEnhancer";
import SystemsSimpleOutreachPanel from "./SystemsSimpleOutreachPanel";
import SystemsThemeToggle from "./SystemsThemeToggle";
import SystemsPlatformNav from "./SystemsPlatformNav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SystemsPlatformNav />
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
