"use client";

import { useEffect } from "react";

const ROUTES: Record<string, string> = {
  "الدخل": "/wealth/income",
  "Income": "/wealth/income",
  "التحليلات": "/wealth/analytics",
  "Analytics": "/wealth/analytics",
  "الالتزام الشرعي": "/wealth/shariah",
  "Shariah": "/wealth/shariah",
  "الحسابات": "/wealth/accounts",
  "Accounts": "/wealth/accounts",
  "اسأل ثروتي": "/wealth/ask",
  "Ask Thrwa": "/wealth/ask",
};

function portfolioSuffix() {
  const params = new URLSearchParams(window.location.search);
  return params.get("portfolio") === "paper" ? "?portfolio=paper" : "";
}

function currentLanguage() {
  return document.documentElement.dataset.wealthLang === "en" ? "en" : "ar";
}

function currentLogo() {
  return document.documentElement.dataset.wealthTheme === "light" ? "/tharwa-logo-dark.svg" : "/tharwa-logo-light.svg";
}

function addBrandMark() {
  document.querySelectorAll<HTMLElement>('[class*="brand"]').forEach((node) => {
    const label = node.textContent?.trim();
    if (node.dataset.wealthBrandEnhanced === "1") {
      const mark = node.querySelector<HTMLImageElement>(".wealth-brand-mark");
      if (mark) mark.src = currentLogo();
      return;
    }
    if (label !== "ثروة" && label !== "Tharwa") return;

    node.dataset.wealthBrandEnhanced = "1";
    node.classList.add("wealth-brand-with-mark");

    const mark = document.createElement("img");
    mark.className = "wealth-brand-mark";
    mark.src = currentLogo();
    mark.alt = "";
    mark.setAttribute("aria-hidden", "true");
    node.prepend(mark);
  });
}

function addAskLink() {
  document.querySelectorAll<HTMLElement>("nav").forEach((nav) => {
    const text = nav.textContent || "";
    const isWealthNav = (text.includes("نظرة عامة") && text.includes("الأصول")) || (text.includes("Overview") && text.includes("Assets"));
    const alreadyHasAsk = text.includes("اسأل ثروتي") || text.includes("Ask Thrwa") || Boolean(nav.querySelector('[data-wealth-generated-ask="1"]'));
    if (!isWealthNav || alreadyHasAsk) return;

    const sample = Array.from(nav.children).find((child) => ["الحسابات", "Accounts"].includes(child.textContent?.trim() || "")) || nav.lastElementChild;
    const link = document.createElement("a");
    link.textContent = currentLanguage() === "en" ? "Ask Thrwa" : "اسأل ثروتي";
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
    window.addEventListener("wealth:theme-change", enhance);
    window.addEventListener("wealth:language-change", enhance);
    return () => {
      observer.disconnect();
      window.removeEventListener("wealth:theme-change", enhance);
      window.removeEventListener("wealth:language-change", enhance);
    };
  }, []);
  return null;
}
