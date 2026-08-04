"use client";

import { useEffect } from "react";

export default function AutomationNavEnhancer() {
  useEffect(() => {
    const pathname = window.location.pathname;
    if (!pathname.startsWith("/admin") || pathname === "/admin/automation") return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const addLink = () => {
      if (cancelled || document.querySelector("a[data-automation-nav='true']")) return;
      const nav = document.querySelector<HTMLElement>("header nav");
      if (!nav) return;

      const link = document.createElement("a");
      link.href = "/admin/automation";
      link.textContent = "Automation";
      link.dataset.automationNav = "true";
      nav.prepend(link);
    };

    addLink();
    observer = new MutationObserver(addLink);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
