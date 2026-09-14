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
  "Trading Strategies",
  "Analytics",
  "Comparisons",
  "Product",
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
      "Understand the core mechanics of a Spot DCA bot, from the first entry through safety orders, average price and controlled exits.",
    category: "DCA Bots",
    readTime: "9 min read",
    kicker: "DCA fundamentals",
    visual: "dca",
  },
  {
    href: "/tradingview-automation",
    title: "TradingView Automation for Crypto Spot Trading",
    excerpt:
      "See how TradingView strategy signals can move from alerts into a controlled Spot execution workflow while keeping every signal visible.",
    category: "TradingView",
    readTime: "10 min read",
    kicker: "Webhook workflow",
    visual: "tradingview",
  },
  {
    href: "/3commas-alternative",
    title: "Looking for a 3Commas Alternative? Start With the Workflow",
    excerpt:
      "Compare Spot DCA, TradingView automation, Paper testing and execution visibility when evaluating a move away from 3Commas.",
    category: "Comparisons",
    readTime: "7 min read",
    kicker: "Platform comparison",
    visual: "threecommas",
  },
  {
    href: "/bitsgap-alternative",
    title: "Bitsgap Alternative for Focused Spot Automation",
    excerpt:
      "A practical comparison for traders who mainly need Spot automation, Paper testing and clear execution visibility rather than a broad feature suite.",
    category: "Comparisons",
    readTime: "6 min read",
    kicker: "Platform comparison",
    visual: "bitsgap",
  },
  {
    href: "/cryptohopper-alternative",
    title: "Cryptohopper Alternative for DCA and TradingView Workflows",
    excerpt:
      "See where a focused DCA and TradingView automation workflow differs when you do not need a larger bot marketplace or strategy ecosystem.",
    category: "Comparisons",
    readTime: "6 min read",
    kicker: "Platform comparison",
    visual: "cryptohopper",
  },
  {
    href: "/coinrule-alternative",
    title: "Coinrule Alternative for Spot Traders Who Want to Test First",
    excerpt:
      "Compare rule-driven automation approaches and how Paper Trading can fit into the workflow before a supported setup moves Live.",
    category: "Comparisons",
    readTime: "6 min read",
    kicker: "Platform comparison",
    visual: "coinrule",
  },
];
