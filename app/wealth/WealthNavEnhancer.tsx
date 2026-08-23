"use client";

import { useEffect } from "react";

const ROUTES: Record<string, string> = {
  "الدخل": "/wealth/income",
  "التحليلات": "/wealth/analytics",
  "الالتزام الشرعي": "/wealth/shariah",
};

export default function WealthNavEnhancer() {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll("span").forEach((node) => {
        const label = node.textContent?.trim() || "";
        const base = ROUTES[label];
        if (!base || node.dataset.wealthNavEnhanced === "1") return;
        node.dataset.wealthNavEnhanced = "1";
        node.setAttribute("role", "link");
        node.setAttribute("tabindex", "0");
        node.style.cursor = "pointer";
        const go = () => {
          const params = new URLSearchParams(window.location.search);
          const suffix = params.get("portfolio") === "paper" ? "?portfolio=paper" : "";
          window.location.assign(`${base}${suffix}`);
        };
        node.addEventListener("click", go);
        node.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); go(); }
        });
      });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
