import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Client Portal — LabNarrative",
  robots: { index: false, follow: false },
};

export default async function LabNarrativeWorkspacePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = String(params?.token || "").trim();
  redirect(token ? `/activate?token=${encodeURIComponent(token)}` : "/login");
}
