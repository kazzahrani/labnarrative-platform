"use client";

import { useEffect } from "react";

const routeMap: Array<[string, string]> = [
  ["/intelligence/login", "/login"],
  ["/intelligence/client", "/client"],
  ["/intelligence/workspace", "/workspace"],
  ["/intelligence/plans", "/plans"],
  ["/intelligence/buy", "/buy"],
  ["/intelligence/activate", "/activate"],
  ["/intelligence", "/"],
];

const modernTheme = `
html body{background:#f4f6f1!important;color:#102019!important}
[class*="portalPage"]{background:radial-gradient(circle at 94% 2%,rgba(156,210,255,.20),transparent 22%),radial-gradient(circle at 4% 22%,rgba(223,255,122,.13),transparent 20%),#f4f6f1!important;color:#102019!important;font-family:"Helvetica Neue",Arial,sans-serif!important}
[class*="sidebar"]{background:rgba(255,255,255,.86)!important;border-color:rgba(36,83,63,.10)!important;box-shadow:10px 0 34px rgba(25,56,43,.035)!important}
[class*="logo"]{background:#17382d!important;border:0!important;color:#fff!important;box-shadow:0 8px 22px rgba(23,56,45,.15)!important}
[class*="brand"] strong{color:#102019!important}[class*="brand"] span{color:#748078!important}
[class*="accountBadge"]{background:linear-gradient(135deg,#dff5ec,#fff)!important;border-color:rgba(36,83,63,.09)!important;border-radius:18px!important}
[class*="nav"] button{border-radius:12px!important;color:#66776e!important}[class*="nav"] button:hover{background:#eef8f3!important;color:#102019!important}[class*="navActive"]{background:#dff5ec!important;color:#24533f!important;box-shadow:none!important}
[class*="topbar"]{background:rgba(244,246,241,.88)!important;border-color:rgba(36,83,63,.08)!important;backdrop-filter:blur(16px)!important}
[class*="refresh"],[class*="profileChip"],[class*="secondary"]{background:#fff!important;border-color:rgba(36,83,63,.11)!important;color:#53675d!important;border-radius:999px!important}
[class*="profileChip"] span{background:#17382d!important;color:#fff!important}
[class*="content"]{background:transparent!important}
[class*="pageHead"] p,[class*="panelHead"] p,[class*="reference"]>span,[class*="reportCard"]>span{color:#24533f!important}
[class*="primary"]{background:#17382d!important;color:#fff!important;border-radius:999px!important;box-shadow:0 10px 24px rgba(23,56,45,.14)!important}
[class*="metrics"] article,[class*="panel"],[class*="newCard"],[class*="formPanel"],[class*="profilePanel"],[class*="reportCard"]{background:#fff!important;border-color:rgba(36,83,63,.10)!important;border-radius:22px!important;box-shadow:0 14px 38px rgba(25,56,43,.05)!important}
[class*="metrics"] article:nth-child(4n+1){background:#dff5ec!important}[class*="metrics"] article:nth-child(4n+2){background:#dcecff!important}[class*="metrics"] article:nth-child(4n+3){background:#eadfff!important}[class*="metrics"] article:nth-child(4n+4){background:#fff6d7!important}
[class*="notice"]{background:#dff5ec!important;color:#245b46!important;border-color:rgba(36,83,63,.10)!important}[class*="error"]{background:#fff0ef!important;color:#a44840!important;border-color:rgba(164,72,64,.14)!important}
[class*="creditBar"]{background:linear-gradient(135deg,#dff5ec,#eadfff 52%,#dcecff)!important;color:#102019!important;border-radius:22px!important;box-shadow:0 18px 46px rgba(25,56,43,.07)!important}[class*="creditBar"] strong{color:#24533f!important}[class*="creditTrack"]{background:rgba(36,83,63,.10)!important}[class*="creditTrack"] i{background:#24533f!important}
[class*="analysisIndex"]{background:#dcecff!important;color:#24533f!important}[class*="stageMini"] [class*="on"]{color:#24533f!important;border-color:#24533f!important}
[class*="reportCard"]:nth-child(3n+1){background:#dff5ec!important}[class*="reportCard"]:nth-child(3n+2){background:#dcecff!important}[class*="reportCard"]:nth-child(3n+3){background:#eadfff!important}
[class*="avatarLarge"]{background:linear-gradient(135deg,#24533f,#7d65b7)!important;color:#fff!important}
[class*="status_complete"]{background:#dff5ec!important;color:#245b46!important}[class*="status_researching"]{background:#dcecff!important;color:#3f6482!important}[class*="status_scientific_review"]{background:#fff6d7!important;color:#806522!important}
[class*="formGrid"] input,[class*="formGrid"] select{background:#fff!important;border-color:rgba(36,83,63,.14)!important;color:#102019!important;border-radius:15px!important}[class*="formGrid"] input:focus,[class*="formGrid"] select:focus{border-color:#78aa92!important;box-shadow:0 0 0 4px rgba(120,227,213,.14)!important}
[class*="liveDot"] i{background:#dfff7a!important;box-shadow:0 0 0 4px rgba(223,255,122,.24)!important}
`;

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
      .replace("Your scientific commercial intelligence in one place.", "Your scientific revenue intelligence in one place.")
      .replaceAll("COMPLIMENTARY REPORT", "FREE PRODUCT PROOF")
      .replaceAll("complimentary report", "free product proof")
      .replaceAll("complimentary one-product", "free one-product");
    if (next !== value) node.nodeValue = next;
  }
}

function patchLinks(root: ParentNode) {
  root.querySelectorAll?.("a[href]").forEach((anchor) => {
    const a = anchor as HTMLAnchorElement;
    const href = a.getAttribute("href") || "";
    for (const [oldPath, newPath] of routeMap) {
      if (href === oldPath || href.startsWith(`${oldPath}?`) || href.startsWith(`${oldPath}#`)) {
        a.setAttribute("href", href.replace(oldPath, newPath));
        break;
      }
    }
  });
}

export default function ClientBrandPatch() {
  useEffect(() => {
    let style = document.getElementById("ln-client-modern-theme") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "ln-client-modern-theme";
      style.textContent = modernTheme;
      document.head.appendChild(style);
    }
    const apply = () => {
      document.title = "LabNarrative — Client Portal";
      document.querySelectorAll('[class*="logo"]').forEach((el) => { if ((el.textContent || "").trim() === "LI") el.textContent = "LN"; });
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
