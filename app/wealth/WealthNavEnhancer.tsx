"use client";

import { useEffect } from "react";

const ROUTES: Record<string, string> = {
  "الدخل": "/wealth/income",
  "التحليلات": "/wealth/analytics",
  "الالتزام الشرعي": "/wealth/shariah",
  "الحسابات": "/wealth/accounts",
  "اسأل ثروتي": "/wealth/ask",
};

function portfolioSuffix() {
  const params = new URLSearchParams(window.location.search);
  return params.get("portfolio") === "paper" ? "?portfolio=paper" : "";
}

function addBrandMark() {
  document.querySelectorAll<HTMLElement>('[class*="brand"]').forEach((node) => {
    if (node.dataset.wealthBrandEnhanced === "1") return;
    if (node.textContent?.trim() !== "ثروة") return;

    node.dataset.wealthBrandEnhanced = "1";
    node.classList.add("wealth-brand-with-mark");

    const mark = document.createElement("img");
    mark.className = "wealth-brand-mark";
    mark.src = "/tharwa-logo-light.svg";
    mark.alt = "";
    mark.setAttribute("aria-hidden", "true");
    node.prepend(mark);
  });
}

function addAskLink() {
  document.querySelectorAll<HTMLElement>("nav").forEach((nav) => {
    const text = nav.textContent || "";
    if (!text.includes("نظرة عامة") || !text.includes("الأصول") || text.includes("اسأل ثروتي")) return;

    const sample = Array.from(nav.children).find((child) => child.textContent?.trim() === "الحسابات") || nav.lastElementChild;
    const link = document.createElement("a");
    link.textContent = "اسأل ثروتي";
    link.href = `/wealth/ask${portfolioSuffix()}`;
    if (sample instanceof HTMLElement) link.className = sample.className;
    link.dataset.wealthGeneratedAsk = "1";
    nav.appendChild(link);
  });
}

export default function WealthNavEnhancer() {
  useEffect(() => {
    const enhance = () => {
      addBrandMark();
      addAskLink();

      document.querySelectorAll("span").forEach((node) => {
        const label = node.textContent?.trim() || "";
        const base = ROUTES[label];
        if (!base || node.dataset.wealthNavEnhanced === "1") return;
        node.dataset.wealthNavEnhanced = "1";
        node.setAttribute("role", "link");
        node.setAttribute("tabindex", "0");
        node.style.cursor = "pointer";
        const go = () => window.location.assign(`${base}${portfolioSuffix()}`);
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
