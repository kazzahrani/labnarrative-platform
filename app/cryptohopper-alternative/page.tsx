import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "Cryptohopper Alternative for Spot DCA Bots | LabNarrative";
const description = "Looking for a focused Cryptohopper alternative for crypto Spot DCA and TradingView automation? Test compatible workflows in Paper, then choose Pro or Max when ready.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/cryptohopper-alternative" },
  openGraph: { title, description, url: "/cryptohopper-alternative" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "Cryptohopper Alternative for Spot DCA Bots",
      url: "https://labnarrative.com/cryptohopper-alternative",
      description,
      isPartOf: { "@type": "WebSite", name: "LabNarrative", url: "https://labnarrative.com" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com/cryptohopper-alternative",
      description: "Crypto Spot automation software for DCA bots, TradingView strategy execution, Paper testing, position management and analytics.",
      offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "0", highPrice: "29.99", offerCount: "3" },
    },
  ],
};

export default function CryptohopperAlternativePage() {
  return (
    <SeoLandingPage
      currentPath="/cryptohopper-alternative"
      eyebrow="Cryptohopper alternative"
      title="A focused Cryptohopper alternative."
      emphasis="For Spot DCA and TradingView automation."
      lead="If your automation needs are mainly crypto Spot DCA or TradingView-driven execution, LabNarrative gives you a focused workflow you can test with Paper capital before deciding whether to connect a live exchange."
      noteStrong="Pro from $9.99/mo yearly"
      note="Pro is $14.99 monthly or $9.99/mo billed yearly; Max is $29.99 monthly or $19.99/mo billed yearly."
      introLabel="Focused alternative"
      introTitle="Keep the supported workflow simple and observable."
      introCopy="LabNarrative does not try to reproduce every Cryptohopper feature. It focuses on Spot DCA bots, TradingView strategy execution, Paper testing, position controls and analytics. That makes it relevant for traders whose current automation is concentrated in those workflows and who want to compare a simpler setup before moving real capital."
      featureCards={[
        { number: "01", title: "Visible DCA rules", copy: "Configure supported Spot DCA entry, averaging and exit logic and keep the resulting position visible from entry through completion." },
        { number: "02", title: "TradingView-driven execution", copy: "Use TradingView strategy signals as part of a controlled Paper or Live Spot execution workflow instead of treating the signal as an isolated alert." },
        { number: "03", title: "Paper-to-Live path", copy: "Forward-test the compatible setup, review positions and analytics, and connect a supported exchange only when you are comfortable with the behavior." },
      ]}
      workflowLabel="Migration path"
      workflowTitle="Recreate first. Compare second. Switch only if it fits."
      workflowCopy="You do not need to disconnect an existing platform just to evaluate LabNarrative. Recreate the compatible Spot workflow in Paper, let it run, and compare how the automation and resulting positions behave before making a Live decision."
      workflowCards={[
        { number: "01", title: "Use your existing rules as the reference", copy: "Bring the supported DCA settings, TradingView logic or automation rules you already use." },
        { number: "02", title: "Run the workflow with Paper capital", copy: "Check entries, averaging behavior, exits, position controls and performance without exposing real funds." },
        { number: "03", title: "Make the migration decision", copy: "If the narrower LabNarrative workflow covers what you actually use, connect a supported exchange and move Live when ready." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "Build Spot DCA automation with explicit entry, averaging and exit rules." },
        { href: "/tradingview-automation", title: "TradingView Automation", copy: "Connect TradingView strategy signals to crypto Spot execution." },
        { href: "/crypto-paper-trading", title: "Crypto Paper Trading", copy: "Forward-test the recreated automation with simulated capital." },
      ]}
      finalEyebrow="Compare before Live"
      finalTitle="Test the automation workflow you actually use."
      finalCopy="Recreate the compatible Spot setup in LabNarrative Paper Trading and decide whether the simpler workflow is enough for you."
      structuredData={structuredData}
    />
  );
}
