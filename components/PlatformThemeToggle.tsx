"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const STORAGE_KEY = "labnarrative-platform-theme";
const PAGE_CLASSES = [
  "platform-home-page",
  "platform-admin-page",
  "platform-monitor-page",
  "platform-automation-page",
  "platform-discovery-page",
  "platform-sales-page",
];

function isOperationalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";

  if (
    host === rootDomain
    || host === `www.${rootDomain}`
    || host === "localhost"
    || host === "127.0.0.1"
    || host.endsWith(".vercel.app")
  ) {
    return true;
  }

  if (!host.endsWith(`.${rootDomain}`)) return false;
  const subdomain = host.slice(0, -(rootDomain.length + 1)).split(".")[0];
  return subdomain === "platform" || subdomain === "admin";
}

function applyBlueTheme() {
  document.documentElement.dataset.platformTheme = "ocean";
  document.documentElement.style.colorScheme = "dark";
  window.localStorage.setItem(STORAGE_KEY, "ocean");
}

export default function PlatformThemeToggle() {
  const pathname = usePathname();

  useEffect(() => {
    const operationalHost = isOperationalHost(window.location.hostname);
    const excludedPath = pathname.startsWith("/admin/preview/");
    const enabled = operationalHost && pathname.startsWith("/admin") && !excludedPath;

    document.body.classList.remove(...PAGE_CLASSES);

    if (!enabled) {
      document.body.classList.remove("platform-theme-active");
      delete document.documentElement.dataset.platformTheme;
      document.documentElement.style.colorScheme = "";
      return;
    }

    document.body.classList.add("platform-theme-active", "platform-admin-page");

    if (pathname.startsWith("/admin/sites")) {
      document.body.classList.add("platform-monitor-page");
    } else if (pathname.startsWith("/admin/automation")) {
      document.body.classList.add("platform-automation-page");
    } else if (pathname.startsWith("/admin/discovery")) {
      document.body.classList.add("platform-discovery-page");
    } else if (pathname.startsWith("/admin/sales")) {
      document.body.classList.add("platform-sales-page");
    }

    applyBlueTheme();
  }, [pathname]);

  return null;
}
