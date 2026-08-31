import { notFound } from "next/navigation";
import TraderApp from "../TraderApp";

const SECTIONS = new Set(["positions", "automations", "signal-monitor", "analytics", "history", "connections"]);

type Props = { params: Promise<{ section: string }> };

export default async function TraderV2SectionPage({ params }: Props) {
  const { section } = await params;
  if (!SECTIONS.has(section)) notFound();
  return <TraderApp view={section as "positions" | "automations" | "signal-monitor" | "analytics" | "history" | "connections"} />;
}
