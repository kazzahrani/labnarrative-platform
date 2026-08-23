"use client";

import { useEffect } from "react";

const ROUTES: Record<string, string> = {
  "الدخل": "/wealth/income",
  "التحليلات": "/wealth/analytics",
  "الالتزام الشرعي": "/wealth/shariah",
};

function addBrandMark() {
  document.querySelectorAll<HTMLElement>('[class*="brand"]').forEach((node) => {
    if (node.dataset.wealthBrandEnhanced === "1") return;
    if (node.textContent?.trim() !== "ثروة") return;

    node.dataset.wealthBrandEnhanced = "1";
    node.classList.add("wealth-brand-with-mark");

    const mark = document.createElement("span");
    mark.className = "wealth-brand-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = "<i></i><i></i><i></i>";

    // In RTL the first flex item is visually on the right of the word.
    node.prepend(mark);
  });
}

export default function WealthNavEnhancer() {
  useEffect(() => {
    const enhance = () => {
      addBrandMark();

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
