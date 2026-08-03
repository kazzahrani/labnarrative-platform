import type { Metadata } from "next";
import AdminLandingRedirect from "@/components/admin/AdminLandingRedirect";
import "./globals.css";
import "./platform-overrides.css";

export const metadata: Metadata = {
  title: "LabNarrative Platform",
  description: "Multi-tenant scientific laboratory website platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AdminLandingRedirect />
        {children}
      </body>
    </html>
  );
}
