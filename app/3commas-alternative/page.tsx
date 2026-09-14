import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "3Commas Alternative for Spot DCA Bots | LabNarrative";
const description = "Looking for a focused 3Commas alternative for crypto Spot DCA and TradingView automation? Test compatible workflows in Paper, then choose Pro or Max when ready.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/3commas-alternative" },
  openGraph: { title, description, url: "/3commas-alternative" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "3Commas Alternative for Spot DCA Bots",
      url: "https://labnarrative.com/3commas-alternative",
      description,
      isPartOf: { "@type": "WebSite", name: "LabNarrative", url: "https://labnarrative.com" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com/3commas-alternative",
      description: "Crypto Spot automation software for DCA bots, TradingView strategy execution, Paper testing, position management and analytics.",
      offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "0", highPrice: "29.99", offerCount: "3" },
    },
  ],
};

export default function ThreeCommasAlternativePage() {
  return (
    <SeoLandingPage
      currentPath="/3commas-alternative"
      eyebrow="3Commas alternative"
      title="A focused 3Commas alternative."
      emphasis="For Spot DCA and TradingView workflows."
      lead="If your current workflow is mainly crypto Spot DCA or TradingView-driven automation, LabNarrative gives you a simpler path: recreate the compatible setup, test it in Paper, inspect the positions and analytics, then decide whether to move Live."
      noteStrong="Pro from $9.99/mo yearly"
      note="Pro is $14.99 monthly or $9.99/mo billed yearly; Max is $29.99 monthly or $19.99/mo billed yearly."
      introLabel="Who this is for"
      introTitle="Switch the workflow, not everything at once."
      introCopy="LabNarrative is not positioned as a clone of every 3Commas feature. It is deliberately focused on Spot automation: DCA bots, TradingView strategy execution, Paper testing, position controls and performance analytics. If those are the parts of your current setup you actually use, you can test a compatible recreation before deciding whether the narrower workflow fits you better."
      featureCards={[
        { number: "01", title: "Recreate compatible DCA logic", copy: "Bring the entry, averaging and exit rules from a supported Spot DCA workflow and rebuild the compatible setup inside LabNarrative." },
        { number: "02", title: "Test before switching", copy: "Run the recreated automation with Paper capital first. Check entries, DCA progression, exits, positions and analytics before enabling live execution." },
        { number: "03", title: "Keep the workflow visible", copy: "See the signal or bot, resulting position, deployed capital, average entry and performance in the same product instead of evaluating the bot from one summary number." },
      ]}
      workflowLabel="Migration path"
      workflowTitle="Compare the compatible setup before you move."
      workflowCopy="A migration should not require blind trust. LabNarrative lets you recreate the supported parts of your current Spot workflow and run them in Paper so you can compare behavior first. If the workflow matches your needs, you can then connect a supported exchange for Live execution."
      workflowCards={[
        { number: "01", title: "Share the current setup", copy: "Use your existing DCA settings, strategy rules or TradingView workflow as the reference for the migration." },
        { number: "02", title: "Rebuild and Paper-test", copy: "Recreate the compatible rules in LabNarrative and let the automation run with simulated capital long enough to inspect its behavior." },
        { number: "03", title: "Choose whether to switch", copy: "Compare the workflow, visibility and cost. Move Live only if the recreated setup fits what you actually need." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "See how LabNarrative handles Spot DCA entry, averaging and exit rules." },
        { href: "/tradingview-automation", title: "TradingView Automation", copy: "Connect TradingView strategy signals to Paper or Live crypto Spot execution." },
        { href: "/crypto-paper-trading", title: "Crypto Paper Trading", copy: "Forward-test the recreated workflow before connecting real capital." },
      ]}
      finalEyebrow="Compare before switching"
      finalTitle="Bring the Spot workflow you already use."
      finalCopy="Recreate the compatible setup in LabNarrative Paper Trading and compare it before deciding whether to move Live."
      structuredData={structuredData}
    />
  );
}
