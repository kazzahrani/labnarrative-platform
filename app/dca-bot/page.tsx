import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "Crypto DCA Bot for Spot Trading | LabNarrative";
const description = "Build a crypto DCA bot with explicit entry, averaging and exit rules. Paper-test the workflow first, then move to live Spot trading when ready.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/dca-bot" },
  openGraph: { title, description, url: "/dca-bot" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "Crypto DCA Bot for Spot Trading",
      url: "https://labnarrative.com/dca-bot",
      description,
      isPartOf: { "@type": "WebSite", name: "LabNarrative", url: "https://labnarrative.com" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com/dca-bot",
      description: "Crypto Spot trading software for DCA automation, paper testing, position management and performance analysis.",
      featureList: ["DCA automation", "Paper trading", "Spot position management", "Performance analytics"],
    },
  ],
};

export default function DcaBotPage() {
  return (
    <SeoLandingPage
      currentPath="/dca-bot"
      eyebrow="Crypto DCA bot"
      title="Build a crypto DCA bot."
      emphasis="Test it before going live."
      lead="Create Spot DCA automation with explicit entry, averaging and exit rules, run the complete workflow in Paper, and connect a supported exchange only when the strategy is ready."
      noteStrong="Paper first"
      note="Forward-test DCA logic before using real capital."
      introLabel="DCA automation"
      introTitle="A DCA bot should make every rule visible."
      introCopy="In LabNarrative, DCA automation is built around explicit trading rules rather than a hidden black box. Define how a position starts, how additional entries are handled, and how the position exits. The same workspace then shows the resulting positions and performance so you can understand what the bot actually did before deciding whether to use real capital."
      featureCards={[
        { number: "01", title: "Entry logic", copy: "Define the conditions that start a DCA position instead of relying on manual timing. Keep the strategy rule visible alongside the automation that acts on it." },
        { number: "02", title: "Averaging rules", copy: "Control how the automation adds to a position as the strategy progresses. Follow average entry, deployed capital and DCA progression from the position view." },
        { number: "03", title: "Exits and risk controls", copy: "Set the intended take-profit, stop and position controls before the bot runs. The goal is controlled execution, not prediction or guaranteed returns." },
      ]}
      workflowLabel="Paper → live"
      workflowTitle="Prove the DCA workflow before connecting real capital."
      workflowCopy="A strategy can look sensible on paper and still behave differently once it runs over time. LabNarrative keeps simulation and live trading in the same product workflow so you can forward-test the automation, inspect positions and analytics, and make an evidence-based decision about going live."
      workflowCards={[
        { number: "01", title: "Build the bot", copy: "Configure the DCA entry, averaging and exit logic and decide how much capital the automation is allowed to deploy." },
        { number: "02", title: "Run it in Paper", copy: "Use paper capital to observe entries, DCA steps, exits and position behavior without putting real funds at risk." },
        { number: "03", title: "Review before Live", copy: "Study bot drilldown, positions and performance analytics. Connect a supported exchange only when the workflow matches what you intended." },
      ]}
      relatedLinks={[
        { href: "/crypto-paper-trading", title: "Crypto Paper Trading", copy: "Test DCA bots and strategy executions with paper capital before moving live." },
        { href: "/tradingview-automation", title: "TradingView Automation", copy: "Connect TradingView strategy signals to a controlled crypto Spot execution workflow." },
        { href: "/pricing", title: "Plans & Pricing", copy: "Start with Paper and upgrade when you need live exchange connections or more automation capacity." },
      ]}
      finalEyebrow="Start with simulation"
      finalTitle="Build the DCA strategy before you risk the capital."
      finalCopy="Open LabNarrative, create a DCA automation and test the complete trading flow in Paper first."
      structuredData={structuredData}
    />
  );
}
