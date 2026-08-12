"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SalesConceptMetricsPlacement from "../../../components/SalesConceptMetricsPlacement";
import SalesReplyAssistant from "../../../components/SalesReplyAssistant";
import SalesProposalLauncher from "../../../components/SalesProposalLauncher";
import SalesPaymentLauncher from "../../../components/SalesPaymentLauncher";
import SalesOnboardingLauncher from "../../../components/SalesOnboardingLauncher";
import SalesFinalReviewLauncher from "../../../components/SalesFinalReviewLauncher";
import SalesLaunchLauncher from "../../../components/SalesLaunchLauncher";
import SalesCareLauncher from "../../../components/SalesCareLauncher";

export default function SalesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSalesHome = pathname === "/admin/sales" || pathname === "/admin/sales/";
  const leadMatch = pathname.match(/^\/admin\/sales\/([0-9a-f-]{36})\/?$/i);
  const prospectId = leadMatch?.[1] || "";

  return (
    <>
      {children}
      {isSalesHome ? <SalesConceptMetricsPlacement /> : null}
      {prospectId ? (
        <>
          <SalesProposalLauncher prospectId={prospectId} />
          <SalesPaymentLauncher prospectId={prospectId} />
          <SalesOnboardingLauncher prospectId={prospectId} />
          <SalesFinalReviewLauncher prospectId={prospectId} />
          <SalesLaunchLauncher prospectId={prospectId} />
          <SalesCareLauncher prospectId={prospectId} />
          <SalesReplyAssistant prospectId={prospectId} />
        </>
      ) : null}
    </>
  );
}
