"use client";

import { useEffect } from "react";

const routeMap: Array<[string, string]> = [
  ["/intelligence/login", "/login"],
  ["/intelligence/client", "/client"],
  ["/intelligence/workspace", "/workspace"],
  ["/intelligence/plans", "/plans"],
  ["/intelligence/buy", "/buy"],
  ["/intelligence/activate", "/activate"],
];

function patchText(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const value = node.nodeValue || "";
    const next = value
      .replaceAll("LabIntelligence", "LabNarrative")
      .replaceAll("LabNarrative Intelligence", "LabNarrative")
      .replace("Opening your Intelligence client portal", "Opening your LabNarrative client portal")
      .replace("Approved Intelligence reports", "Approved LabNarrative reports")
      .replace("Your scientific commercial intelligence in one place.", "Your scientific revenue intelligence in one place.");
    if (next !== value) node.nodeValue = next;
  }
}

function patchLinks(root: ParentNode) {
  root.querySelectorAll?.("a[href]").forEach((anchor) => {
    const a = anchor as HTMLAnchorElement;
    const href = a.getAttribute("href") || "";
    for (const [oldPath, newPath] of routeMap) {
      if (href === oldPath || href.startsWith(`${oldPath}?`)) {
        a.setAttribute("href", href.replace(oldPath, newPath));
        break;
      }
    }
  });
}

export default function ClientBrandPatch() {
  useEffect(() => {
    const apply = () => {
      patchText(document.body);
      patchLinks(document.body);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
