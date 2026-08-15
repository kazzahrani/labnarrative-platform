import type { ReactNode } from "react";
import SystemsLinkedInBatchLauncher from "./SystemsLinkedInBatchLauncher";
import SystemsEmailBatchLauncher from "./SystemsEmailBatchLauncher";
import SystemsConnectedFilterEnhancer from "./SystemsConnectedFilterEnhancer";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SystemsConnectedFilterEnhancer />
      <SystemsEmailBatchLauncher />
      <SystemsLinkedInBatchLauncher />
    </>
  );
}
