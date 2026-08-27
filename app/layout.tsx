import type { Metadata } from "next";
import AdminAuthRecoveryEnhancer from "@/components/admin/AdminAuthRecoveryEnhancer";
import AdminHeaderCleanup from "@/components/admin/AdminHeaderCleanup";
import AdminWorkspaceTabs from "@/components/admin/AdminWorkspaceTabs";
import OutreachMonitorEnhancer from "@/components/admin/OutreachMonitorEnhancer";
import PlatformListPaginationEnhancer from "@/components/admin/PlatformListPaginationEnhancer";
import PlatformListPaginationExtensionV2 from "@/components/admin/PlatformListPaginationExtensionV2";
import PlatformPaginationThresholdGuard from "@/components/admin/PlatformPaginationThresholdGuard";
import SalesDeliveryOutreachEnhancer from "@/components/admin/SalesDeliveryOutreachEnhancer";
import WebsiteOutreachSequenceEnhancer from "@/components/admin/WebsiteOutreachSequenceEnhancer";
import WebsiteLinkedInCueEnhancer from "@/components/admin/WebsiteLinkedInCueEnhancer";
import ClientOnboardingEnhancer from "@/components/ClientOnboardingEnhancer";
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
import "./blue-theme-lock.css";
import "./platform-list-pagination.css";
import "./engine-v3-final-review-theme.css";
import "./labnarrative-modern-theme.css";
import "./public-fashion-refresh.css";
import "./public-button-refresh.css";
import "./public-theme-refinement.css";
import "./systems-public-contrast-fix.css";
import "./labnarrative-logo-refresh.css";
// Preserve the lighter modern system while restoring LabNarrative's established dark-green primary identity.
import "./labnarrative-green-identity.css";
// Final guard for the new crypto marketing pages so legacy public-theme rules cannot darken text on dark panels.
import "./crypto-public-contrast-fix.css";
// Public crypto homepage/affiliate branding and Trader-aligned product preview polish.
import "./crypto-home-polish.css";

export const metadata: Metadata = {
  title: {
    default: "LabNarrative — Crypto Trading Automation",
    template: "%s | LabNarrative",
  },
  description:
    "Build, test, and automate crypto trading strategies with a paper-first, exchange-connected workflow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AdminAuthRecoveryEnhancer />
        <AdminWorkspaceTabs />
        <AdminHeaderCleanup />
        <PlatformThemeToggle />
        <OutreachMonitorEnhancer />
        <WebsiteOutreachSequenceEnhancer />
        <WebsiteLinkedInCueEnhancer />
        <PlatformListPaginationEnhancer />
        <PlatformListPaginationExtensionV2 />
        <PlatformPaginationThresholdGuard />
        <SalesDeliveryOutreachEnhancer />
        <ClientOnboardingEnhancer />
        {children}
      </body>
    </html>
  );
}
