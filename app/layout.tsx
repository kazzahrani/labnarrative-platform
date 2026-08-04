import type { Metadata } from "next";
import AdminLandingRedirect from "@/components/admin/AdminLandingRedirect";
import PlatformThemeToggle from "@/components/PlatformThemeToggle";
import "./globals.css";
import "./platform-overrides.css";

export const metadata: Metadata = {
  title: "LabNarrative Platform",
  description: "Multi-tenant scientific laboratory website platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AdminLandingRedirect />
        <PlatformThemeToggle />
        {children}
      </body>
    </html>
  );
}
