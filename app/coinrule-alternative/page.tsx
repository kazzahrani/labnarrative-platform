import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "Coinrule Alternative for Spot Automation | LabNarrative";
const description = "Looking for a focused Coinrule alternative for crypto Spot DCA and TradingView automation? Recreate compatible workflows in Paper before going Live.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/coinrule-alternative" },
  openGraph: { title, description, url: "/coinrule-alternative" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "Coinrule Alternative for Spot Automation",
      url: "https://labnarrative.com/coinrule-alternative",
      description,
      isPartOf: { "@type": "WebSite", name: "LabNarrative", url: "https://labnarrative.com" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LabNarrative Trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://labnarrative.com/coinrule-alternative",
      description: "Crypto Spot automation software for DCA bots, TradingView strategy execution, Paper testing, position management and analytics.",
      offers: { "@type": "Offer", price: "9.99", priceCurrency: "USD" },
    },
  ],
};

export default function CoinruleAlternativePage() {
  return (
    <SeoLandingPage
      currentPath="/coinrule-alternative"
      eyebrow="Coinrule alternative"
      title="A focused Coinrule alternative."
      emphasis="For Spot automation you can test first."
      lead="If you use Coinrule mainly to automate crypto Spot entries and exits, LabNarrative offers a narrower workflow built around Spot DCA, TradingView execution, Paper testing, positions and analytics. Recreate the compatible setup in Paper before deciding whether to switch."
      noteStrong="$9.99/month Live"
      note="Start by comparing the compatible workflow with simulated capital."
      introLabel="Who this is for"
      introTitle="Choose the smaller workflow if that is all you need."
      introCopy="LabNarrative is not presented as a replacement for every Coinrule feature or every rule type. It focuses on the parts many Spot traders need most: DCA automation, TradingView-driven execution, Paper testing, position controls and performance analytics. If your current automation fits those boundaries, you can test a compatible recreation before moving anything live."
      featureCards={[
        { number: "01", title: "Recreate supported Spot logic", copy: "Bring the entry, averaging and exit logic from a compatible Spot workflow and rebuild it inside LabNarrative without changing your live setup first." },
        { number: "02", title: "Paper-test before migration", copy: "Run the recreated automation with simulated capital and inspect entries, DCA progression, exits and position behavior over time." },
        { number: "03", title: "Keep execution visible", copy: "See the automation, resulting position, deployed capital, average entry and performance together instead of evaluating the workflow from a single summary number." },
      ]}
      workflowLabel="Migration path"
      workflowTitle="Compare behavior before changing platforms."
      workflowCopy="The safest migration is one you can observe before committing real capital. Recreate the supported parts of your current Coinrule workflow in LabNarrative Paper Trading, let it run forward, and compare the behavior, visibility and cost before choosing whether to connect a live exchange."
      workflowCards={[
        { number: "01", title: "Use your current rules as reference", copy: "Bring the existing Spot settings, screenshots or strategy logic you already use so the compatible workflow can be recreated accurately." },
        { number: "02", title: "Run the recreation in Paper", copy: "Let the automation encounter new market conditions with simulated capital and inspect every resulting position and execution." },
        { number: "03", title: "Decide whether the narrower platform fits", copy: "Compare the workflow you actually use rather than feature lists. Move Live only if LabNarrative covers the automation you need." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "See how LabNarrative handles Spot DCA entry, averaging and exit rules." },
        { href: "/tradingview-automation", title: "TradingView Webhook Automation", copy: "Connect TradingView strategy alerts to Paper or Live crypto Spot execution." },
        { href: "/crypto-paper-trading", title: "Free Crypto Paper Trading", copy: "Forward-test the recreated workflow before connecting real capital." },
      ]}
      finalEyebrow="Compare before switching"
      finalTitle="Bring the Spot automation you already use."
      finalCopy="Recreate the compatible workflow in LabNarrative Paper Trading and decide from the actual behavior whether it fits you better."
      structuredData={structuredData}
    />
  );
}
