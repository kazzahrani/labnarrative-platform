"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type PlatformTheme = "light" | "dark";

const STORAGE_KEY = "labnarrative-platform-theme";
const PAGE_CLASSES = [
  "platform-home-page",
  "platform-admin-page",
  "platform-monitor-page",
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

function isDedicatedPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";
  if (!host.endsWith(`.${rootDomain}`)) return false;
  const subdomain = host.slice(0, -(rootDomain.length + 1)).split(".")[0];
  return subdomain === "platform" || subdomain === "admin";
}

function applyTheme(theme: PlatformTheme) {
  document.documentElement.dataset.platformTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function PlatformThemeToggle() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<PlatformTheme>("light");
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const operationalHost = isOperationalHost(window.location.hostname);
    const excludedPath = pathname.startsWith("/sites/") || pathname.startsWith("/admin/preview/");
    const enabled =
      operationalHost
      && !excludedPath
      && (pathname.startsWith("/admin") || isDedicatedPlatformHost(window.location.hostname));

    document.body.classList.remove(...PAGE_CLASSES);

    if (!enabled) {
      document.body.classList.remove("platform-theme-active");
      delete document.documentElement.dataset.platformTheme;
      document.documentElement.style.colorScheme = "";
      setAvailable(false);
      return;
    }

    document.body.classList.add("platform-theme-active");
    if (pathname.startsWith("/admin/sites")) {
      document.body.classList.add("platform-monitor-page");
    } else if (pathname.startsWith("/admin")) {
      document.body.classList.add("platform-admin-page");
    } else {
      document.body.classList.add("platform-home-page");
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initialTheme: PlatformTheme = stored === "dark" ? "dark" : "light";
    setTheme(initialTheme);
    applyTheme(initialTheme);
    setAvailable(true);
  }, [pathname]);

  function toggleTheme() {
    const nextTheme: PlatformTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  if (!available) return null;

  const nextLabel = theme === "dark" ? "Light" : "Dark";

  return (
    <button
      aria-label={`Switch to ${nextLabel.toLowerCase()} theme`}
      className="platform-theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${nextLabel.toLowerCase()} theme`}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <strong>{nextLabel}</strong>
    </button>
  );
}
