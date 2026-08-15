import type { ReactNode } from "react";
import SystemsLinkedInBatchLauncher from "./SystemsLinkedInBatchLauncher";
import SystemsEmailBatchLauncher from "./SystemsEmailBatchLauncher";
import SystemsConnectedFilterEnhancer from "./SystemsConnectedFilterEnhancer";
import SystemsContactSearchEnhancer from "./SystemsContactSearchEnhancer";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SystemsConnectedFilterEnhancer />
      <SystemsContactSearchEnhancer />
      <SystemsEmailBatchLauncher />
      <SystemsLinkedInBatchLauncher />
    </>
  );
}
