"use client";

import { useEffect } from "react";

const WORKSPACE_PATHS = new Set([
  "/admin/discovery",
  "/admin/automation",
  "/admin/sites",
  "/admin/sales",
]);

const LEGACY_ADMIN_PATHS = new Set([
  "/admin",
  "/admin/discovery",
  "/admin/automation",
  "/admin/sites",
  "/admin/sales",
]);

function pathFor(link: HTMLAnchorElement): string {
  try {
    return new URL(link.href, window.location.origin).pathname;
  } catch {
    return link.getAttribute("href") || "";
  }
}

export default function AdminHeaderCleanup() {
  useEffect(() => {
    if (!WORKSPACE_PATHS.has(window.location.pathname)) return;

    let disposed = false;

    const apply = () => {
      if (disposed) return;
      const main = document.querySelector("main");
      const header = main?.querySelector<HTMLElement>("header") || document.querySelector<HTMLElement>("header");
      if (!header) return;

      // Shared workspace tabs now own cross-page navigation. Keep only utilities
      // such as Sign out, Refresh, device exclusion and View platform in headers.
      header.querySelectorAll<HTMLAnchorElement>("nav a[href], a[href]").forEach((link) => {
        const path = pathFor(link);
        if (!LEGACY_ADMIN_PATHS.has(path)) return;
        // Never remove a brand/home link outside the header's utility/navigation area.
        if (link.closest("nav") || window.location.pathname === "/admin/sales") link.remove();
      });

      if (window.location.pathname !== "/admin/sales") return;

      // Sales used to combine its hero copy with the utility header, which placed
      // the shared tabs below the large title. Keep the utility header compact and
      // render the Sales intro immediately below the shared tabs, matching the
      // other workspace pages.
      const title = header.querySelector<HTMLElement>("h1");
      const kicker = title?.previousElementSibling as HTMLElement | null;
      const subtitle = title?.nextElementSibling as HTMLElement | null;
      if (kicker) kicker.style.display = "none";
      if (title) title.style.display = "none";
      if (subtitle) subtitle.style.display = "none";
      header.style.marginBottom = "0";
      header.style.alignItems = "center";

      const tabsMount = document.querySelector<HTMLElement>("[data-admin-workspace-tabs='true']");
      if (!tabsMount?.parentElement || !title) return;

      let hero = document.querySelector<HTMLElement>("[data-sales-workspace-hero='true']");
      if (!hero) {
        hero = document.createElement("section");
        hero.dataset.salesWorkspaceHero = "true";
        hero.style.padding = "28px 0 26px";
        hero.style.maxWidth = "850px";
      }

      if (!hero.childElementCount) {
        if (kicker) {
          const clone = kicker.cloneNode(true) as HTMLElement;
          clone.style.display = "";
          hero.appendChild(clone);
        }
        const titleClone = title.cloneNode(true) as HTMLElement;
        titleClone.style.display = "";
        hero.appendChild(titleClone);
        if (subtitle) {
          const clone = subtitle.cloneNode(true) as HTMLElement;
          clone.style.display = "";
          hero.appendChild(clone);
        }
      }

      if (tabsMount.nextElementSibling !== hero) tabsMount.insertAdjacentElement("afterend", hero);
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(apply, 700);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelector("[data-sales-workspace-hero='true']")?.remove();
    };
  }, []);

  return null;
}
