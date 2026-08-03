import type { Metadata } from "next";
import "./globals.css";
import "./platform-overrides.css";

export const metadata: Metadata = {
  title: "LabNarrative Platform",
  description: "Multi-tenant scientific laboratory website platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
