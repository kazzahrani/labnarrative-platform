import type { ReactNode } from "react";
import LinkedInOutreachPanel from "../../../components/LinkedInOutreachPanel";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <LinkedInOutreachPanel />
    </>
  );
}
