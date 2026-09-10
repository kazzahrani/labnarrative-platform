import type { Metadata } from "next";
import ArenaClient from "./ArenaClient";

const title = "Bot Arena | Free Public Crypto Bot Forward Testing | LabNarrative";
const description = "Create free public crypto DCA bots with $10,000 virtual capital, watch forward performance on real market prices, compare analytics, and clone strategies in LabNarrative Bot Arena.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/arena" },
  openGraph: { title, description, url: "/arena" },
  twitter: { title, description },
};

export default function ArenaPage() {
  return <ArenaClient />;
}
