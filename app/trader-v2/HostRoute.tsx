import { headers } from "next/headers";
import { notFound } from "next/navigation";
import TraderApp from "./TraderApp";
import HistoryApp from "./HistoryApp";
import AnalyticsApp from "./AnalyticsApp";
import SignalMonitorApp from "./SignalMonitorApp";

type View = "overview" | "portfolio" | "positions" | "automations" | "signal-monitor" | "analytics" | "history" | "connections";

export default async function HostRoute({ view }: { view: View }) {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  const previewHost = process.env.VERCEL_ENV !== "production" && host.endsWith(".vercel.app");
  const allowed = host === "app.labnarrative.com" || host === "localhost" || previewHost;
  if (!allowed) notFound();
  if (view === "history") return <HistoryApp />;
  if (view === "analytics") return <AnalyticsApp />;
  if (view === "signal-monitor") return <SignalMonitorApp />;
  return <TraderApp view={view} />;
}
