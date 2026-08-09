import type { ReactNode } from "react";
import SalesActionCenter from "../../../components/SalesActionCenter";
import LinkedInOutreachPanel from "../../../components/LinkedInOutreachPanel";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SalesActionCenter />
      <LinkedInOutreachPanel />
    </>
  );
}
