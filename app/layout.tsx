import type { Metadata } from "next";
import AdminLandingRedirect from "@/components/admin/AdminLandingRedirect";
import AutomationNavEnhancer from "@/components/admin/AutomationNavEnhancer";
import OutreachMonitorEnhancer from "@/components/admin/OutreachMonitorEnhancer";
import PlatformThemeToggle from "@/components/PlatformThemeToggle";
import "./globals.css";
import "./platform-overrides.css";
import "./dark-theme-refinement.css";
import "./gao-layout-fix.css";
import "./labnarrative-public-refinement.css";
import "./labnarrative-type-amplification.css";
import "./labnarrative-section-colors.css";

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
        <AutomationNavEnhancer />
        <PlatformThemeToggle />
        <OutreachMonitorEnhancer />
        {children}
      </body>
    </html>
  );
}
