"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SalesActionCenter from "../../../components/SalesActionCenter";
import SalesConversionInbox from "../../../components/SalesConversionInbox";
import LinkedInOutreachPanel from "../../../components/LinkedInOutreachPanel";

export default function SalesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSalesHome = pathname === "/admin/sales" || pathname === "/admin/sales/";

  return (
    <>
      {children}
      {isSalesHome ? (
        <>
          <SalesConversionInbox />
          <SalesActionCenter />
          <LinkedInOutreachPanel />
        </>
      ) : null}
    </>
  );
}
