import type { Metadata } from "next";
import PublicBotAnalyticsProxy from "./PublicBotAnalyticsProxy";
import { fetchSharedBot, signedMoney, summarizeSharedBot } from "./shared-bot-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const payload = await fetchSharedBot(slug);
  const summary = summarizeSharedBot(payload);
  const title = `${summary.name} · Public Paper Bot | LabNarrative`;
  const metrics = summary.closedTrades
    ? `${summary.closedTrades} closed trades · ${summary.winners}W/${summary.losers}L · Realized P&L ${signedMoney(summary.realizedPnl)}.`
    : "A newly shared Paper bot with live forward analytics.";
  const description = `PAPER TRADING · ${metrics} Inspect the live analytics and exact configuration, then clone a fresh Paper copy.`;
  const canonical = `https://labnarrative.com/bot/${encodeURIComponent(slug)}`;

  return {
    metadataBase: new URL("https://labnarrative.com"),
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "LabNarrative Trading",
      url: canonical,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SharedBotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBotAnalyticsProxy slug={slug} />;
}
