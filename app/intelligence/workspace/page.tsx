import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Client Portal — LabNarrative Intelligence",
  robots: { index: false, follow: false },
};

export default async function IntelligenceWorkspacePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = String(params?.token || "").trim();
  redirect(token ? `/intelligence/activate?token=${encodeURIComponent(token)}` : "/intelligence/login");
}
