import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "Free Crypto Paper Trading for Bots | LabNarrative";
const description = "Paper trade DCA bots and TradingView webhooks with simulated capital. No exchange API key is needed for Paper; inspect positions before going live.";

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
      name: "Free Crypto Paper Trading for Bots",
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
      description: "Free crypto paper trading software for testing DCA bots, TradingView webhook strategy executions, positions and analytics before live trading.",
      featureList: ["Free Paper trading", "DCA bot testing", "TradingView webhook testing", "Simulated capital", "Position management", "Performance analytics"],
    },
  ],
};

export default function CryptoPaperTradingPage() {
  return (
    <SeoLandingPage
      currentPath="/crypto-paper-trading"
      eyebrow="Free crypto paper trading"
      title="Paper trade crypto bots for free."
      emphasis="Use simulated capital before real funds."
      lead="Run Spot DCA bots and TradingView Strategy Executions with simulated capital, follow positions and performance, and test the automation without connecting an exchange API key until you choose to go live."
      noteStrong="Start with Paper for free"
      note="No live exchange connection or payment is needed to begin testing."
      introLabel="Why Paper"
      introTitle="Test the bot you actually plan to automate."
      introCopy="Crypto paper trading is most useful when it forward-tests the same workflow you may later run live. LabNarrative lets you create trading automations, let them react to current market data with simulated capital, inspect the positions they create, and review the resulting activity and analytics before any real exchange connection is required."
      featureCards={[
        { number: "01", title: "Paper-test DCA bots", copy: "Run Spot DCA automation with simulated capital to observe entries, averaging behavior, exits and capital deployment before using real funds." },
        { number: "02", title: "Test TradingView webhooks", copy: "Send TradingView Strategy Executions into Paper first so you can verify the signal-to-position workflow before enabling live exchange execution." },
        { number: "03", title: "Inspect every simulated position", copy: "Follow average entry, DCA progression, targets, stop levels, invested capital and PnL from the same position workspace used for live automation." },
      ]}
      workflowLabel="Forward testing"
      workflowTitle="Paper trading is a test bench, not a profit promise."
      workflowCopy="A profitable paper result does not guarantee the same outcome with real money, and simulated trading cannot reproduce every live fill, fee or liquidity condition. Its value is practical: it helps expose rule mistakes, unwanted behavior and weak assumptions while the capital at risk is still zero."
      workflowCards={[
        { number: "01", title: "Start without exchange keys", copy: "Create the automation and run the complete workflow with Paper capital instead of attaching a live exchange account immediately." },
        { number: "02", title: "Watch it forward in time", copy: "Let the strategy encounter new market conditions, then use position history, bot drilldown and analytics to understand what actually happened." },
        { number: "03", title: "Choose whether to go Live", copy: "If the workflow behaves as intended, connect a supported crypto Spot exchange. Staying in Paper remains an option." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "Build rule-based Spot DCA automation with visible entries, averaging and exit controls." },
        { href: "/tradingview-automation", title: "TradingView Webhook Automation", copy: "Test webhook-driven crypto execution in Paper before moving live." },
        { href: "/pricing", title: "Plans & Pricing", copy: "Start with Paper for free and see the live automation plan when you are ready." },
      ]}
      finalEyebrow="Paper first"
      finalTitle="Give the automation time to prove how it behaves."
      finalCopy="Start with simulated capital, study the positions and automation history, and connect real capital only when you decide the workflow is ready."
      structuredData={structuredData}
    />
  );
}
