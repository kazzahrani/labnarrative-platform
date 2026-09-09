import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "Crypto Paper Trading for Bots & Strategies | LabNarrative";
const description = "Paper trade crypto DCA bots and TradingView strategy executions before going live. Test positions, controls and performance with simulated capital.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/crypto-paper-trading" },
  openGraph: { title, description, url: "/crypto-paper-trading" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "Crypto Paper Trading for Bots and Strategies",
      url: "https://labnarrative.com/crypto-paper-trading",
      description,
      isPartOf: { "@type": "WebSite", name: "LabNarrative", url: "https://labnarrative.com" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com/crypto-paper-trading",
      description: "Crypto paper trading software for testing DCA bots, TradingView strategy executions, positions and analytics before live trading.",
      featureList: ["Paper trading", "DCA bot testing", "TradingView strategy execution testing", "Position management", "Performance analytics"],
    },
  ],
};

export default function CryptoPaperTradingPage() {
  return (
    <SeoLandingPage
      currentPath="/crypto-paper-trading"
      eyebrow="Crypto paper trading"
      title="Paper trade crypto strategies."
      emphasis="Move live only when ready."
      lead="Test DCA bots and TradingView Strategy Executions with paper capital, follow positions and performance, and keep real exchange connections out of the workflow until you choose to go live."
      noteStrong="30-day expanded Paper trial"
      note="Start without a live exchange connection or payment."
      introLabel="Why Paper"
      introTitle="Automation should be observable before it touches real funds."
      introCopy="Paper trading is most useful when it tests the workflow you actually plan to automate. LabNarrative lets you run trading automations with simulated capital, inspect the positions they create, and review the resulting activity and analytics. That gives you a forward-testing layer between configuring a strategy and deciding whether it deserves a live exchange connection."
      featureCards={[
        { number: "01", title: "Test DCA bots", copy: "Run DCA automation in Paper to observe entries, averaging behavior, exits and capital deployment before the same type of workflow is used with real funds." },
        { number: "02", title: "Test strategy executions", copy: "Use Paper for TradingView Strategy Executions so a signal-driven workflow can be observed before you decide to enable live exchange execution." },
        { number: "03", title: "Inspect every position", copy: "Follow average entry, DCA progression, targets, stop levels, invested capital and PnL from the same position-first workspace used to review automation." },
      ]}
      workflowLabel="Forward testing"
      workflowTitle="Paper trading is a decision layer, not a promise."
      workflowCopy="A profitable paper result does not guarantee the same outcome with real money, and simulated trading cannot remove market risk. Its value is practical: it helps expose rule mistakes, unwanted behavior and weak assumptions before capital is connected. LabNarrative keeps that evidence next to the automation so the move from Paper to Live remains an explicit decision."
      workflowCards={[
        { number: "01", title: "Start in simulation", copy: "Create the automation and run the complete workflow with paper capital instead of attaching a live exchange account immediately." },
        { number: "02", title: "Review the evidence", copy: "Use position history, bot drilldown and analytics to see what drove the result rather than judging a strategy from one PnL number." },
        { number: "03", title: "Choose whether to go Live", copy: "If the strategy behaves as intended, a paid plan can add live crypto Spot exchange connections. Staying in Paper remains an option." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "Build rule-based DCA automation with visible entries, averaging and exit controls." },
        { href: "/tradingview-automation", title: "TradingView Automation", copy: "Test TradingView strategy-driven crypto execution in Paper before moving live." },
        { href: "/pricing", title: "Plans & Pricing", copy: "See the Paper trial, free Paper plan and live automation capacity available on paid plans." },
      ]}
      finalEyebrow="Paper first"
      finalTitle="Give the strategy time to prove how it behaves."
      finalCopy="Start with simulated capital, study the positions and automation history, and connect real capital only when you decide the workflow is ready."
      structuredData={structuredData}
    />
  );
}
