"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const ADMIN_PAGES = [
  { pathname: "/admin/discovery", title: "Prospects Discovery", navLabel: "Discovery" },
  { pathname: "/admin/automation", title: "Production Engine", navLabel: "Production" },
  { pathname: "/admin/sites", title: "Websites Monitor", navLabel: "Websites" },
] as const;

function linkPath(link: HTMLAnchorElement): string {
  try {
    return new URL(link.href, window.location.origin).pathname;
  } catch {
    return link.getAttribute("href") ?? "";
  }
}

function navHasLink(nav: HTMLElement, pathname: string): boolean {
  return Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[href]")).some(
    (link) => linkPath(link) === pathname,
  );
}

function removeInjectedAdminLinks() {
  document
    .querySelectorAll<HTMLAnchorElement>("a[data-platform-nav]")
    .forEach((link) => link.remove());
}

export default function AutomationNavEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    removeInjectedAdminLinks();

    if (!pathname.startsWith("/admin")) return;

    const currentPage = ADMIN_PAGES.find((page) => pathname === page.pathname);
    if (currentPage) document.title = `${currentPage.title} | LabNarrative`;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const applyNames = () => {
      if (cancelled) return;
      const nav = document.querySelector<HTMLElement>("header nav");
      if (!nav) return;

      nav.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
        const page = ADMIN_PAGES.find((item) => linkPath(link) === item.pathname);
        if (page && link.textContent !== page.navLabel) link.textContent = page.navLabel;
      });

      [...ADMIN_PAGES].reverse().forEach((page) => {
        if (pathname === page.pathname || navHasLink(nav, page.pathname)) return;

        const link = document.createElement("a");
        link.href = page.pathname;
        link.textContent = page.navLabel;
        link.dataset.platformNav = page.pathname.slice(1).replaceAll("/", "-");
        nav.prepend(link);
      });

      if (currentPage) {
        const context = document.querySelector<HTMLElement>("header > div > span");
        if (context && context.textContent !== currentPage.title) {
          context.textContent = currentPage.title;
        }
      }
    };

    applyNames();
    observer = new MutationObserver(applyNames);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
      removeInjectedAdminLinks();
    };
  }, [pathname]);

  return null;
}
