import type { Metadata } from "next";
import AdminLandingRedirect from "@/components/admin/AdminLandingRedirect";
import PlatformThemeToggle from "@/components/PlatformThemeToggle";
import "./globals.css";
import "./platform-overrides.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://labnarrative.com"),
  title: {
    default: "LabNarrative — Research websites for scientific laboratories",
    template: "%s | LabNarrative",
  },
  description:
    "LabNarrative researches, writes and designs modern laboratory websites for principal investigators.",
  openGraph: {
    type: "website",
    siteName: "LabNarrative",
    title: "LabNarrative — Research websites for scientific laboratories",
    description:
      "Research-led scientific writing, editorial design and managed websites for laboratories.",
    url: "https://labnarrative.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "LabNarrative",
    description: "Research websites shaped by scientific understanding.",
  },
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
