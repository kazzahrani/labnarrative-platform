"use client";

import { useEffect } from "react";

export default function FullWorkspaceLabelPatch() {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href*="labintelligence-production-v2-lab-narrative.vercel.app/experience"]').forEach((anchor) => {
        if (/OPEN WEB REPORT/i.test(anchor.textContent || "")) anchor.textContent = "OPEN FULL INTELLIGENCE →";
        anchor.setAttribute("aria-label", "Open the full Intelligence workspace for this paid product");
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
