"use client";

import { useEffect } from "react";

const CLEAN_ADMIN_PAGES = new Set([
  "/admin/automation",
  "/admin/sites",
  "/admin/discovery",
  "/admin",
]);

export default function EngineV2HardNavigation() {
  useEffect(() => {
    if (!CLEAN_ADMIN_PAGES.has(window.location.pathname)) return;

    const navigateCleanly = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;

      let path = "";
      try {
        const url = new URL(link.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        path = url.pathname;
      } catch {
        return;
      }

      if (!CLEAN_ADMIN_PAGES.has(path) || path === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.assign(path);
    };

    document.addEventListener("click", navigateCleanly, true);
    return () => document.removeEventListener("click", navigateCleanly, true);
  }, []);

  return null;
}
