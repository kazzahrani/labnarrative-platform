import type { Metadata } from "next";
import SeoLandingPage from "../SeoLandingPage";

const title = "Bitsgap Alternative for Spot DCA Bots | LabNarrative";
const description = "Looking for a focused Bitsgap alternative for crypto Spot DCA and TradingView automation? Test compatible workflows in Paper, then choose Pro or Max when ready.";

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
      offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "0", highPrice: "29.99", offerCount: "3" },
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
      lead="If your Bitsgap usage is centered on crypto Spot automation, LabNarrative gives you a focused workflow for DCA bots, TradingView execution, Paper testing, positions and analytics. Recreate the compatible setup in Paper before deciding whether to move Live."
      noteStrong="Pro from $9.99/mo yearly"
      note="Pro is $14.99 monthly or $9.99/mo billed yearly; Max is $29.99 monthly or $19.99/mo billed yearly."
      introLabel="Who this is for"
      introTitle="Pay for the automation workflow you actually use."
      introCopy="LabNarrative is not designed to reproduce every Bitsgap feature. It focuses on Spot DCA automation, TradingView strategy execution, Paper testing, position controls and analytics. If that is the part of your current workflow you rely on, you can compare a compatible recreation before moving real capital."
      featureCards={[
        { number: "01", title: "Recreate supported Spot logic", copy: "Bring the compatible entry, averaging and exit settings from your current workflow and rebuild them inside LabNarrative." },
        { number: "02", title: "Paper-test the migration", copy: "Run the recreated automation with simulated capital to inspect entries, DCA behavior, exits and positions before enabling Live execution." },
        { number: "03", title: "See the full outcome", copy: "Keep automation activity, positions, capital deployment and analytics together so you can compare more than a single headline return." },
      ]}
      workflowLabel="Migration path"
      workflowTitle="Test the narrower workflow before switching."
      workflowCopy="Instead of cancelling one platform and hoping the replacement behaves the same, recreate the supported Spot workflow in LabNarrative Paper Trading first. Let it run, inspect the execution and compare the experience before deciding whether the switch makes sense."
      workflowCards={[
        { number: "01", title: "Use your current setup as the reference", copy: "Start with the settings, screenshots or TradingView rules you already use rather than rebuilding from memory." },
        { number: "02", title: "Run it in Paper", copy: "Forward-test the compatible recreation with simulated capital while your existing live workflow remains untouched." },
        { number: "03", title: "Move only if it fits", copy: "Compare the supported workflow, visibility and pricing. Connect a live exchange only after you are comfortable with the result." },
      ]}
      relatedLinks={[
        { href: "/dca-bot", title: "Crypto DCA Bots", copy: "Build explicit Spot DCA entry, averaging and exit rules." },
        { href: "/tradingview-automation", title: "TradingView Automation", copy: "Connect TradingView strategy signals to controlled Spot execution." },
        { href: "/crypto-paper-trading", title: "Crypto Paper Trading", copy: "Test compatible automations before connecting real funds." },
      ]}
      finalEyebrow="Compare before switching"
      finalTitle="Test your compatible Spot workflow first."
      finalCopy="Use LabNarrative Paper Trading to recreate the supported automation and compare how it behaves before moving Live."
      structuredData={structuredData}
    />
  );
}
