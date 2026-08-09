"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SalesActionCenter from "../../../components/SalesActionCenter";
import SalesConversionInbox from "../../../components/SalesConversionInbox";
import SalesDailyActionQueue from "../../../components/SalesDailyActionQueue";
import SalesReplyAssistant from "../../../components/SalesReplyAssistant";
import LinkedInOutreachPanel from "../../../components/LinkedInOutreachPanel";

export default function SalesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSalesHome = pathname === "/admin/sales" || pathname === "/admin/sales/";
  const leadMatch = pathname.match(/^\/admin\/sales\/([0-9a-f-]{36})\/?$/i);
  const prospectId = leadMatch?.[1] || "";

  return (
    <>
      {isSalesHome ? <SalesDailyActionQueue /> : null}
      {children}
      {isSalesHome ? (
        <>
          <SalesConversionInbox />
          <SalesActionCenter />
          <LinkedInOutreachPanel />
        </>
      ) : prospectId ? <SalesReplyAssistant prospectId={prospectId} /> : null}
    </>
  );
}
