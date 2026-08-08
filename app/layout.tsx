import type { Metadata } from "next";
import AdminLandingRedirect from "@/components/admin/AdminLandingRedirect";
import AdminAuthRecoveryEnhancer from "@/components/admin/AdminAuthRecoveryEnhancer";
import EngineV2HardNavigation from "@/components/admin/EngineV2HardNavigation";
import OutreachMonitorEnhancer from "@/components/admin/OutreachMonitorEnhancer";
import OutreachSequencePanel from "@/components/admin/OutreachSequencePanel";
import WebsiteOutreachSequenceEnhancer from "@/components/admin/WebsiteOutreachSequenceEnhancer";
import PlatformThemeToggle from "@/components/PlatformThemeToggle";
import "./globals.css";
import "./platform-overrides.css";
import "./dark-theme-refinement.css";
import "./gao-layout-fix.css";
import "./labnarrative-public-refinement.css";
import "./labnarrative-type-amplification.css";
import "./labnarrative-section-colors.css";
import "./narita-home-hero-flow.css";
import "./pipeline-event-colors.css";
import "./pipeline-status-colors.css";
import "./grey-theme.css";
import "./mid-theme.css";
import "./mid-theme-gradient-refinement.css";
import "./ocean-theme.css";
import "./ocean-theme-reference-refinement.css";
import "./ocean-theme-compact-stats.css";
import "./engine-typography-compact.css";
import "./editable-field-weight-fix.css";
import "./automation-prospect-modals.css";
import "./discovery-typography-increase.css";
import "./production-system-typography-increase.css";
import "./websites-monitor-typography.css";
import "./platform-rounded-edges.css";
import "./review-notes-ui.css";
import "./compact-admin-header-actions.css";
import "./production-header-alignment.css";
import "./discovery-split-layout.css";
import "./discovery-pagination.css";
import "./production-pagination.css";
import "./resend-delivery-tracking.css";
import "./review-buffer-control.css";
import "./review-modal.css";
import "./bourdon-simple-header.css";
import "./engine-v2-interaction-fix.css";

export const metadata: Metadata = {
  title: {
    default: "LabNarrative — Scientific Laboratory Websites",
    template: "%s | LabNarrative",
  },
  description:
    "LabNarrative researches, writes, designs and launches modern websites for scientific laboratories.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AdminLandingRedirect />
        <AdminAuthRecoveryEnhancer />
        <EngineV2HardNavigation />
        <PlatformThemeToggle />
        <OutreachMonitorEnhancer />
        <OutreachSequencePanel />
        <WebsiteOutreachSequenceEnhancer />
        {children}
      </body>
    </html>
  );
}
