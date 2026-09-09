import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "TradingView Automation for Crypto Spot | LabNarrative";
const description = "Automate TradingView-driven crypto Spot strategies with controlled strategy executions, Paper testing, position management and performance analytics.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tradingview-automation" },
  openGraph: { title, description, url: "/tradingview-automation" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "TradingView Automation for Crypto Spot",
      url: "https://labnarrative.com/tradingview-automation",
      description,
      isPartOf: { "@type": "WebSite", name: "LabNarrative", url: "https://labnarrative.com" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com/tradingview-automation",
      description: "Crypto Spot trading software for TradingView strategy execution, paper testing, position controls and performance analysis.",
      featureList: ["TradingView strategy execution", "Paper trading", "Crypto Spot automation", "Position management", "Performance analytics"],
    },
  ],
};

export default function TradingViewAutomationPage() {
  return (
    <SeoLandingPage
      currentPath="/tradingview-automation"
      eyebrow="TradingView automation"
      title="Automate TradingView strategies."
      emphasis="Keep execution visible."
      lead="Connect TradingView strategy signals to a controlled crypto Spot execution workflow, test Strategy Executions in Paper, and follow the resulting positions and performance inside LabNarrative."
      noteStrong="Signal → execution → position"
      note="Keep the trading workflow visible from strategy signal to outcome."
      introLabel="Strategy execution"
      introTitle="A signal is only the start of an automated trade."
      introCopy="TradingView can define when a strategy condition is met; an execution platform still has to turn that signal into a controlled trading workflow. LabNarrative keeps the strategy execution connected to position controls, paper testing and analytics so the signal does not disappear into a black box after it fires. The objective is reliable rule execution and visibility, not market prediction."
      featureCards={[
        { number: "01", title: "Strategy-driven execution", copy: "Use TradingView Strategy Executions to connect an external strategy signal with the crypto trading workflow instead of manually reproducing every entry decision." },
        { number: "02", title: "Paper before Live", copy: "Run the strategy execution with paper capital first so you can observe how signals become positions before enabling a live Spot exchange connection." },
        { number: "03", title: "Position-level visibility", copy: "Follow the resulting position, invested capital, average entry, targets, stop controls and PnL rather than treating the incoming signal as the end of the process." },
      ]}
      workflowLabel="Signal workflow"
      workflowTitle="Connect the strategy signal to the rest of the trade."
      workflowCopy="The strongest automation workflow is not simply alert-to-order. It lets you test the signal path, see how positions are managed, and review outcomes over time. LabNarrative combines Strategy Executions with the same position and analytics layers used by its other trading automations so you can examine the full process in one workspace."
      workflowCards={[
        { number: "01", title: "Define the strategy", copy: "Create the strategy logic in TradingView and decide what event should trigger the LabNarrative Strategy Execution workflow." },
        { number: "02", title: "Test the execution", copy: "Run the workflow in Paper and verify that strategy signals produce the intended trading behavior before using real capital." },
        { number: "03", title: "Monitor the outcome", copy: "Review positions, execution history and analytics to understand what happened after each signal and refine the strategy from evidence." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "Build DCA automation with explicit entry, averaging and exit rules." },
        { href: "/crypto-paper-trading", title: "Crypto Paper Trading", copy: "Forward-test automated strategies with simulated capital before connecting real funds." },
        { href: "/pricing", title: "Plans & Pricing", copy: "Compare Paper and live automation capacity across LabNarrative plans." },
      ]}
      finalEyebrow="Test the signal path"
      finalTitle="Make sure the strategy executes the way you intended."
      finalCopy="Start a TradingView Strategy Execution in Paper, inspect the resulting positions and move live only when you are comfortable with the workflow."
      structuredData={structuredData}
    />
  );
}
