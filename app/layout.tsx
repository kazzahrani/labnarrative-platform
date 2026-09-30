import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thrwa.tech"),
  title: "THRWA — From WhatsApp to quotation",
  description: "Turn text and voice notes into professional quotations. Built for Saudi field businesses.",
  applicationName: "THRWA",
  openGraph: {
    title: "THRWA — From WhatsApp to quotation",
    description: "Turn text and voice notes into professional quotations in seconds.",
    siteName: "THRWA",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
