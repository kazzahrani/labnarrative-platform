"use client";

import { useEffect } from "react";

const routeMap: Array<[string, string]> = [
  ["/login", "/intelligence/login"],
  ["/client", "/intelligence/client"],
  ["/workspace", "/intelligence/workspace"],
  ["/plans", "/intelligence/plans"],
  ["/buy", "/intelligence/buy"],
  ["/activate", "/intelligence/activate"],
];

const modernTheme = `
html:not([data-intelligence-theme="dark"]) body{background:#f7f8fc!important;color:#20243a!important}
[class*="portalPage"]{background:#f7f8fc!important;color:#20243a!important;font-family:Inter,"Helvetica Neue",Arial,sans-serif!important}
[class*="sidebar"]{background:#fafbff!important;border-color:#e7e9f2!important;box-shadow:10px 0 34px rgba(48,58,102,.035)!important}
[class*="logo"]{background:linear-gradient(135deg,#5969e8,#805adf)!important;border:0!important;color:#fff!important;box-shadow:0 8px 22px rgba(89,105,232,.2)!important}
[class*="brand"] strong{color:#20243a!important}[class*="brand"] span{color:#7a8296!important}
[class*="accountBadge"]{background:linear-gradient(135deg,#eef0ff,#f8f9ff)!important;border-color:#dfe3f1!important;border-radius:18px!important}
[class*="nav"] button{border-radius:12px!important;color:#6d758b!important}[class*="nav"] button:hover{background:#f0f2fa!important;color:#20243a!important}[class*="navActive"]{background:#eef0ff!important;color:#4858d5!important;box-shadow:none!important}
[class*="topbar"]{background:rgba(247,248,252,.9)!important;border-color:#e7e9f2!important;backdrop-filter:blur(16px)!important}
[class*="refresh"],[class*="profileChip"],[class*="secondary"]{background:#fff!important;border-color:#e1e5ef!important;color:#596176!important;border-radius:12px!important}
[class*="profileChip"] span{background:#5969e8!important;color:#fff!important}
[class*="content"]{background:radial-gradient(circle at 100% 0,rgba(89,105,232,.05),transparent 22%),radial-gradient(circle at 0 26%,rgba(19,167,146,.04),transparent 22%)!important}
[class*="pageHead"] p,[class*="panelHead"] p,[class*="reference"]>span,[class*="reportCard"]>span{color:#5969e8!important}
[class*="primary"]{background:#5969e8!important;color:#fff!important;border-radius:12px!important;box-shadow:0 8px 20px rgba(89,105,232,.16)!important}
[class*="metrics"] article,[class*="panel"],[class*="newCard"],[class*="formPanel"],[class*="profilePanel"],[class*="reportCard"]{background:#fff!important;border-color:#e3e6ef!important;border-radius:20px!important;box-shadow:0 12px 34px rgba(47,57,100,.05)!important}
[class*="metrics"] article:nth-child(4n+1){background:linear-gradient(145deg,#fff,#eef0ff)!important}[class*="metrics"] article:nth-child(4n+2){background:linear-gradient(145deg,#fff,#e7f8f3)!important}[class*="metrics"] article:nth-child(4n+3){background:linear-gradient(145deg,#fff,#fff0e6)!important}[class*="metrics"] article:nth-child(4n+4){background:linear-gradient(145deg,#fff,#f1edff)!important}
[class*="notice"]{background:#e7f8f3!important;color:#147763!important;border-color:#c9eae1!important}[class*="error"]{background:#ffedf1!important;color:#a64155!important;border-color:#f1cbd4!important}
[class*="creditBar"]{background:linear-gradient(135deg,#5969e8,#745fe0)!important;border-radius:20px!important;box-shadow:0 16px 40px rgba(89,105,232,.17)!important}[class*="creditBar"] strong{color:#dff9f0!important}[class*="creditTrack"]{background:rgba(255,255,255,.18)!important}[class*="creditTrack"] i{background:#dff9f0!important}
[class*="analysisIndex"]{background:#eef0ff!important;color:#5969e8!important}[class*="stageMini"] [class*="on"]{color:#5969e8!important;border-color:#5969e8!important}
[class*="reportCard"]:nth-child(3n+1){background:linear-gradient(145deg,#fff,#eaf4ff)!important}[class*="reportCard"]:nth-child(3n+2){background:linear-gradient(145deg,#fff,#e7f8f3)!important}[class*="reportCard"]:nth-child(3n+3){background:linear-gradient(145deg,#fff,#fff0e6)!important}
[class*="avatarLarge"]{background:linear-gradient(135deg,#5969e8,#805adf)!important;color:#fff!important}
[class*="status_complete"]{background:#e7f8f3!important;color:#147763!important}[class*="status_researching"]{background:#eaf4ff!important;color:#3f7ec6!important}[class*="status_scientific_review"]{background:#fff6d8!important;color:#926415!important}
[class*="formGrid"] input,[class*="formGrid"] select{background:#fff!important;border-color:#dde2ed!important;color:#20243a!important;border-radius:12px!important}[class*="formGrid"] input:focus,[class*="formGrid"] select:focus{border-color:#9aa5ff!important;box-shadow:0 0 0 3px rgba(89,105,232,.09)!important}
[class*="liveDot"] i{background:#13a792!important;box-shadow:0 0 0 4px #dff5ef!important}
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
      if (href === oldPath || href.startsWith(`${oldPath}?`)) {
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
