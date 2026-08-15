import type { ReactNode } from "react";
import "./systems-intelligence-light.css";
import SystemsLinkedInBatchLauncher from "./SystemsLinkedInBatchLauncher";
import SystemsEmailBatchLauncher from "./SystemsEmailBatchLauncher";
import SystemsConnectedFilterEnhancer from "./SystemsConnectedFilterEnhancer";
import SystemsContactSearchEnhancer from "./SystemsContactSearchEnhancer";
import SystemsThemeToggle from "./SystemsThemeToggle";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SystemsThemeToggle />
      <SystemsConnectedFilterEnhancer />
      <SystemsContactSearchEnhancer />
      <SystemsEmailBatchLauncher />
      <SystemsLinkedInBatchLauncher />
    </>
  );
}
