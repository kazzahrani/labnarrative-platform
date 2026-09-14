export type LearnGuide = {
  href: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  kicker: string;
  visual: "paper" | "dca" | "tradingview" | "threecommas" | "bitsgap" | "cryptohopper" | "coinrule";
  featured?: boolean;
};

export const learnCategories = [
  "Latest",
  "DCA Bots",
  "Paper Trading",
  "TradingView",
  "Comparisons",
] as const;

export const learnGuides: LearnGuide[] = [
  {
    href: "/crypto-paper-trading",
    title: "Crypto Paper Trading: Test Your Automation Before Going Live",
    excerpt:
      "Learn how to forward-test DCA bots and TradingView-driven Spot automation with simulated capital before deciding whether to use real funds.",
    category: "Paper Trading",
    readTime: "8 min read",
    kicker: "Paper first",
    visual: "paper",
    featured: true,
  },
  {
    href: "/dca-bot",
    title: "Crypto DCA Bots: Entries, Averaging and Exit Rules Explained",
    excerpt:
      "Understand how Spot DCA entries, averaging orders, capital limits and exit rules interact before you put the automation Live.",
    category: "DCA Bots",
    readTime: "9 min read",
    kicker: "DCA fundamentals",
    visual: "dca",
  },
  {
    href: "/tradingview-automation",
    title: "TradingView Webhook Automation for Crypto Spot Trading",
    excerpt:
      "Follow the complete path from TradingView alert to webhook, automation action and resulting Spot position—and learn what to test first.",
    category: "TradingView",
    readTime: "10 min read",
    kicker: "Webhook workflow",
    visual: "tradingview",
  },
  {
    href: "/3commas-alternative",
    title: "Looking for a 3Commas Alternative? Start With the Workflow",
    excerpt:
      "Compare the Spot DCA and TradingView workflow you actually use, then recreate supported settings in Paper before switching.",
    category: "Comparisons",
    readTime: "7 min read",
    kicker: "Platform comparison",
    visual: "threecommas",
  },
  {
    href: "/bitsgap-alternative",
    title: "Considering a Bitsgap Alternative? Compare the Spot Workflow First",
    excerpt:
      "See when a focused Spot DCA and TradingView workflow may fit—and where unsupported grid-style behavior means it will not be a direct replacement.",
    category: "Comparisons",
    readTime: "6 min read",
    kicker: "Platform comparison",
    visual: "bitsgap",
  },
  {
    href: "/cryptohopper-alternative",
    title: "Considering a Cryptohopper Alternative? Compare the Automation You Actually Use",
    excerpt:
      "Identify the DCA or TradingView rules you really depend on, then test whether the supported LabNarrative workflow reproduces them clearly.",
    category: "Comparisons",
    readTime: "6 min read",
    kicker: "Platform comparison",
    visual: "cryptohopper",
  },
  {
    href: "/coinrule-alternative",
    title: "Considering a Coinrule Alternative? Map the Rules Before You Move",
    excerpt:
      "Translate the intent of your current Spot automation rules, recreate the supported logic in Paper, and compare behavior before moving Live.",
    category: "Comparisons",
    readTime: "6 min read",
    kicker: "Platform comparison",
    visual: "coinrule",
  },
];
