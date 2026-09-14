import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "TradingView Webhook Automation for Crypto Spot | LabNarrative";
const description = "Send TradingView webhook strategy alerts into Paper or Live crypto Spot execution. Test signals, positions and controls before connecting real capital.";

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
      name: "TradingView Webhook Automation for Crypto Spot",
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
      description: "Crypto Spot trading software for TradingView webhook strategy execution, Paper testing, position controls and performance analysis.",
      featureList: ["TradingView webhook automation", "TradingView strategy execution", "Paper trading", "Crypto Spot automation", "Position management", "Performance analytics"],
    },
  ],
};

export default function TradingViewAutomationPage() {
  return (
    <SeoLandingPage
      currentPath="/tradingview-automation"
      eyebrow="TradingView webhook automation"
      title="Automate TradingView webhooks."
      emphasis="Keep crypto Spot execution visible."
      lead="Send TradingView strategy webhook alerts into a controlled crypto Spot workflow, test the same signal path in Paper, and follow the resulting execution, position and performance inside LabNarrative."
      noteStrong="Webhook → execution → position"
      note="Test the signal path in Paper before enabling real exchange execution."
      introLabel="Webhook execution"
      introTitle="A TradingView webhook is only the start of the trade."
      introCopy="TradingView can send an alert when your strategy condition is met, but an execution platform still has to validate that signal, turn it into a controlled order workflow and show you what happened afterward. LabNarrative connects webhook-driven Strategy Executions to Paper testing, position controls and analytics so the alert does not disappear into a black box after it fires."
      featureCards={[
        { number: "01", title: "Webhook-to-execution workflow", copy: "Route TradingView strategy alerts into a LabNarrative Strategy Execution instead of manually reproducing each entry decision." },
        { number: "02", title: "Paper before Live", copy: "Send the same strategy workflow into Paper first so you can verify how webhook signals become positions before connecting real capital." },
        { number: "03", title: "Execution and position visibility", copy: "Follow the resulting trade, invested capital, average entry, targets, stop controls and PnL rather than treating the webhook alert as the end of the process." },
      ]}
      workflowLabel="TradingView webhook workflow"
      workflowTitle="Connect the alert to the rest of the trade."
      workflowCopy="Useful TradingView automation is more than alert-to-order. You need to confirm that the webhook reaches the intended automation, that the strategy action is interpreted correctly, and that the resulting position behaves as expected. LabNarrative keeps that path visible from signal through outcome."
      workflowCards={[
        { number: "01", title: "Define the TradingView strategy", copy: "Create the strategy logic and alert in TradingView, then point the webhook workflow to the LabNarrative Strategy Execution you want to test." },
        { number: "02", title: "Run the webhook in Paper", copy: "Trigger the workflow with simulated capital and verify that incoming strategy alerts produce the intended crypto Spot behavior." },
        { number: "03", title: "Review before Live", copy: "Inspect execution history, positions and analytics. Enable a supported live exchange only after the webhook workflow behaves the way you intended." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "Build DCA automation with explicit entry, averaging and exit rules." },
        { href: "/crypto-paper-trading", title: "Crypto Paper Trading", copy: "Forward-test TradingView webhook automation with simulated capital before moving live." },
        { href: "/3commas-alternative", title: "3Commas Alternative", copy: "Compare a focused Spot and TradingView automation workflow before switching platforms." },
      ]}
      finalEyebrow="Test the webhook path"
      finalTitle="Make sure every TradingView alert executes the way you intended."
      finalCopy="Start a TradingView Strategy Execution in Paper, inspect the resulting positions and move live only when you are comfortable with the complete webhook workflow."
      structuredData={structuredData}
    />
  );
}
