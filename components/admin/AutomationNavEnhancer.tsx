"use client";

import { useEffect } from "react";

function navHasLink(nav: HTMLElement, pathname: string): boolean {
  return Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .some((link) => {
      try {
        return new URL(link.href, window.location.origin).pathname === pathname;
      } catch {
        return link.getAttribute("href") === pathname;
      }
    });
}

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

      if (pathname !== "/admin/discovery" && !navHasLink(nav, "/admin/discovery")) {
        const discovery = document.createElement("a");
        discovery.href = "/admin/discovery";
        discovery.textContent = "Discovery";
        discovery.dataset.discoveryNav = "true";
        nav.prepend(discovery);
      }

      if (pathname !== "/admin/automation" && !navHasLink(nav, "/admin/automation")) {
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
