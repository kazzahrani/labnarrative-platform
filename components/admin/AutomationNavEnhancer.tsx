"use client";

import { useEffect } from "react";

export default function AutomationNavEnhancer() {
  useEffect(() => {
    const pathname = window.location.pathname;
    if (!pathname.startsWith("/admin")) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const addLinks = () => {
      if (cancelled) return;
      const nav = document.querySelector<HTMLElement>("header nav");
      if (!nav) return;

      if (!document.querySelector("a[data-discovery-nav='true']") && pathname !== "/admin/discovery") {
        const discovery = document.createElement("a");
        discovery.href = "/admin/discovery";
        discovery.textContent = "Discovery";
        discovery.dataset.discoveryNav = "true";
        nav.prepend(discovery);
      }

      if (!document.querySelector("a[data-automation-nav='true']") && pathname !== "/admin/automation") {
        const automation = document.createElement("a");
        automation.href = "/admin/automation";
        automation.textContent = "Automation";
        automation.dataset.automationNav = "true";
        nav.prepend(automation);
      }
    };

    addLinks();
    observer = new MutationObserver(addLinks);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
