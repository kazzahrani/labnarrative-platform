"use client";

import { useEffect, useRef } from "react";
import TraderV2FullShell from "./TraderV2FullShell";

/**
 * User-facing language layer for LabNarrative Trading.
 *
 * The production trading engine intentionally keeps its established internal
 * field names (baseOrder, safetyOrder, maxSafetyOrders, stepScale, etc.).
 * This layer changes only rendered product language so the execution contracts,
 * Supabase payloads, stored bot state, and live/paper behavior remain untouched.
 */
const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/DCA BOTS · TRADES/g, "DCA BOTS · POSITIONS"],
  [/Active Trades/g, "Active Positions"],
  [/Closed Trades/g, "Closed Positions"],
  [/Active trades/g, "Active positions"],
  [/Closed trades/g, "Closed positions"],
  [/active trades/g, "active positions"],
  [/closed trades/g, "closed positions"],
  [/Max active trades/g, "Maximum active positions"],
  [/max active trades/g, "maximum active positions"],
  [/trade-level/g, "position-level"],
  [/trade levels/g, "position levels"],
  [/trade history/g, "position history"],
  [/Permanent trade history/g, "Permanent position history"],
  [/bot trades/g, "bot positions"],
  [/Bot trades/g, "Bot positions"],
  [/DCA trade PnL/g, "DCA position PnL"],
  [/DCA trades/g, "DCA positions"],
  [/DCA trade/g, "DCA position"],
  [/Completed DCA trades/g, "Completed DCA positions"],
  [/Trades/g, "Positions"],
  [/Main settings/g, "Market & Entry"],
  [/Averaging orders/g, "DCA Plan"],
  [/Exit settings/g, "Exit"],
  [/Concurrency/g, "Position Limits"],
  [/Base order/g, "Initial order"],
  [/Base Order/g, "Initial Order"],
  [/Active safety orders/g, "Active DCA orders"],
  [/Max safety orders/g, "Maximum DCA orders"],
  [/safety orders/g, "DCA orders"],
  [/Safety orders/g, "DCA orders"],
  [/Safety order/g, "DCA order"],
  [/Price deviation/g, "First DCA trigger"],
  [/Step scale/g, "Price step multiplier"],
  [/Volume scale/g, "Order size multiplier"],
  [/Start condition/g, "Entry condition"],
  [/DCA ladder preview/g, "Capital Preview"],
  [/Total planned capital/g, "Maximum planned capital"],
  [/Capital plan/g, "Planned capital"],
  [/Capital requirements based on the configured volume and step scales\./g, "See the full DCA ladder and capital exposure before you launch the bot."],
  [/Control the DCA ladder, order count and capital scaling\./g, "Define when additional entries trigger, how many can execute, and how order size changes across the ladder."],
  [/Core pair and initial order configuration\./g, "Choose the market and define how the position opens."],
  [/Click any bot to open its full configuration\./g, "Open any bot to inspect its strategy and capital plan."],
  [/Create a DCA bot to start automating this account\./g, "Create a DCA strategy and test it on this account."],
  [/Create your first DCA bot to begin\./g, "Create your first DCA strategy to begin."],
  [/Its bot and position history will remain available\./g, "Its bot and position history will remain available."],
];

function translateText(value: string) {
  let next = value;
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function translateTree(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const original = node.nodeValue;
    if (!original) continue;
    const translated = translateText(original);
    if (translated !== original) node.nodeValue = translated;
  }
}

export default function TraderExperienceLayer() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let translating = false;
    const apply = () => {
      if (translating) return;
      translating = true;
      translateTree(root);
      translating = false;
    };

    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} data-labnarrative-trading-experience="independent">
      <TraderV2FullShell />
    </div>
  );
}
