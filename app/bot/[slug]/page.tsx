import type { Metadata } from "next";
import PublicBotAnalytics from "./PublicBotAnalytics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared Paper Bot Analytics | LabNarrative",
  description: "Read-only forward Paper trading analytics shared from LabNarrative Trading.",
  robots: { index: false, follow: false },
};

export default async function SharedBotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBotAnalytics slug={slug} />;
}
