"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type PlatformTheme = "light" | "grey" | "dark";

const STORAGE_KEY = "labnarrative-platform-theme";
const PAGE_CLASSES = [
  "platform-home-page",
  "platform-admin-page",
  "platform-monitor-page",
  "platform-automation-page",
  "platform-discovery-page",
];

const THEME_OPTIONS: Array<{ value: PlatformTheme; label: string; icon: string }> = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "grey", label: "Grey", icon: "◐" },
  { value: "dark", label: "Dark", icon: "☾" },
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

function applyTheme(theme: PlatformTheme) {
  document.documentElement.dataset.platformTheme = theme;
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
}

export default function PlatformThemeToggle() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<PlatformTheme>("light");
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const operationalHost = isOperationalHost(window.location.hostname);
    const excludedPath = pathname.startsWith("/admin/preview/");
    const enabled = operationalHost && pathname.startsWith("/admin") && !excludedPath;

    document.body.classList.remove(...PAGE_CLASSES);

    if (!enabled) {
      document.body.classList.remove("platform-theme-active");
      delete document.documentElement.dataset.platformTheme;
      document.documentElement.style.colorScheme = "";
      setAvailable(false);
      return;
    }

    document.body.classList.add("platform-theme-active", "platform-admin-page");

    if (pathname.startsWith("/admin/sites")) {
      document.body.classList.add("platform-monitor-page");
    } else if (pathname.startsWith("/admin/automation")) {
      document.body.classList.add("platform-automation-page");
    } else if (pathname.startsWith("/admin/discovery")) {
      document.body.classList.add("platform-discovery-page");
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initialTheme: PlatformTheme = stored === "dark" || stored === "grey" ? stored : "light";
    setTheme(initialTheme);
    applyTheme(initialTheme);
    setAvailable(true);
  }, [pathname]);

  function selectTheme(nextTheme: PlatformTheme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  if (!available) return null;

  return (
    <div aria-label="Platform appearance" className="platform-theme-toggle" role="group">
      {THEME_OPTIONS.map((option) => (
        <button
          aria-label={`Use ${option.label.toLowerCase()} theme`}
          aria-pressed={theme === option.value}
          className="platform-theme-option"
          key={option.value}
          onClick={() => selectTheme(option.value)}
          title={`${option.label} theme`}
          type="button"
        >
          <span aria-hidden="true">{option.icon}</span>
          <strong>{option.label}</strong>
        </button>
      ))}
    </div>
  );
}
