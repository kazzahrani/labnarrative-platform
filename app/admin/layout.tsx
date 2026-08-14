import type { ReactNode } from "react";
import SystemsLinkedInBatchLauncher from "./SystemsLinkedInBatchLauncher";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SystemsLinkedInBatchLauncher />
    </>
  );
}
