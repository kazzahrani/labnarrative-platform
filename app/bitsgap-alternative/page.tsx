import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "Bitsgap Alternative for Spot DCA Bots | LabNarrative";
const description = "Looking for a focused Bitsgap alternative for crypto Spot DCA and TradingView automation? Test compatible workflows in Paper, then go live for $9.99/month.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/bitsgap-alternative" },
  openGraph: { title, description, url: "/bitsgap-alternative" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "Bitsgap Alternative for Spot DCA Bots",
      url: "https://labnarrative.com/bitsgap-alternative",
      description,
      isPartOf: { "@type": "WebSite", name: "LabNarrative", url: "https://labnarrative.com" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com/bitsgap-alternative",
      description: "Crypto Spot automation software for DCA bots, TradingView strategy execution, Paper testing, position management and analytics.",
      offers: { "@type": "Offer", price: "9.99", priceCurrency: "USD" },
    },
  ],
};

export default function BitsgapAlternativePage() {
  return (
    <SeoLandingPage
      currentPath="/bitsgap-alternative"
      eyebrow="Bitsgap alternative"
      title="A focused Bitsgap alternative."
      emphasis="For Spot automation you can test first."
      lead="If your workflow centers on crypto Spot DCA or TradingView-driven automation, LabNarrative lets you recreate the compatible setup, run it with Paper capital, and inspect positions and analytics before deciding whether to move Live."
      noteStrong="$9.99/month Live"
      note="Paper-test the compatible workflow before connecting real capital."
      introLabel="Focused alternative"
      introTitle="Use the automation you need without copying an entire platform."
      introCopy="LabNarrative focuses on a narrower Spot trading workflow: DCA bots, TradingView strategy execution, Paper testing, position management and analytics. It is not intended to reproduce every Bitsgap feature. The goal is to give traders who mainly need those supported workflows a simpler product they can test before moving real execution."
      featureCards={[
        { number: "01", title: "Spot DCA automation", copy: "Build supported DCA workflows with visible entry, averaging and exit rules and monitor the resulting position rather than treating the bot as a black box." },
        { number: "02", title: "Paper validation", copy: "Run the recreated setup with simulated capital first so you can observe how the automation behaves over time before enabling Live execution." },
        { number: "03", title: "Position and performance visibility", copy: "Review deployed capital, average entry, DCA progression, exits and bot analytics from the same trading workspace." },
      ]}
      workflowLabel="Migration path"
      workflowTitle="Test the supported workflow before replacing anything."
      workflowCopy="Instead of switching platforms first and evaluating later, recreate the compatible Spot workflow in LabNarrative Paper Trading. That gives you a practical comparison of the automation, visibility and cost before you decide whether a Live migration makes sense."
      workflowCards={[
        { number: "01", title: "Bring your setup", copy: "Start from the DCA rules, screenshots or TradingView logic you currently use as the reference for the migration." },
        { number: "02", title: "Run the recreation in Paper", copy: "Observe entries, DCA steps, exits and analytics with simulated capital while your existing setup remains untouched." },
        { number: "03", title: "Move only if it fits", copy: "Connect a supported exchange for Live Spot automation only after the recreated workflow behaves the way you expect." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "Explore LabNarrative's Spot DCA automation workflow." },
        { href: "/crypto-paper-trading", title: "Crypto Paper Trading", copy: "Test bots and strategy executions with simulated capital before going Live." },
        { href: "/tradingview-automation", title: "TradingView Automation", copy: "Use TradingView strategy signals with controlled crypto Spot execution." },
      ]}
      finalEyebrow="Paper first"
      finalTitle="Compare the Spot workflow before you switch."
      finalCopy="Bring the compatible automation you already use, recreate it in Paper, and decide from actual behavior rather than a feature list."
      structuredData={structuredData}
    />
  );
}
