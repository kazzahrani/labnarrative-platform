"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./systems-theme-toggle.module.css";

type SystemsTheme = "dark" | "light";
const STORAGE_KEY = "labnarrative-systems-theme";

const LIGHT_VARS: Record<string, string> = {
  "--bg": "#f6f7f3",
  "--surface": "#ffffff",
  "--surface2": "#f5f7f4",
  "--surface3": "#e9efeb",
  "--line": "#d8e0da",
  "--line2": "#e7ece8",
  "--text": "#142018",
  "--muted": "#68766f",
  "--muted2": "#89968f",
  "--accent": "#356a58",
  "--accentStrong": "#285443",
  "--lime": "#dceade",
  "--accentInk": "#ffffff",
};

function systemsMain() {
  return document.querySelector<HTMLElement>("main");
}

export default function SystemsThemeToggle() {
  const pathname = usePathname();
  const isSystemsRoute = pathname === "/admin/systems" || pathname === "/admin/systems-outreach";
  const [theme, setTheme] = useState<SystemsTheme>("dark");
  const [target, setTarget] = useState<HTMLElement | null>(null);

  const applyTheme = useCallback((next: SystemsTheme) => {
    document.documentElement.dataset.systemsTheme = next;
    document.body.dataset.systemsTheme = next;
    document.documentElement.style.colorScheme = next;

    const main = systemsMain();
    if (next === "light") {
      document.documentElement.style.backgroundColor = "#f6f7f3";
      document.body.style.backgroundColor = "#f6f7f3";
      if (main) {
        Object.entries(LIGHT_VARS).forEach(([key, value]) => main.style.setProperty(key, value));
        main.style.backgroundColor = "#f6f7f3";
        main.style.color = "#142018";
      }
    } else {
      document.documentElement.style.backgroundColor = "#09161f";
      document.body.style.backgroundColor = "#09161f";
      if (main) {
        Object.keys(LIGHT_VARS).forEach((key) => main.style.removeProperty(key));
        main.style.removeProperty("background-color");
        main.style.removeProperty("color");
      }
    }
  }, []);

  useEffect(() => {
    if (!isSystemsRoute) {
      document.documentElement.removeAttribute("data-systems-theme");
      document.body.removeAttribute("data-systems-theme");
      document.documentElement.style.removeProperty("color-scheme");
      document.documentElement.style.removeProperty("background-color");
      document.body.style.removeProperty("background-color");
      const main = systemsMain();
      if (main) {
        Object.keys(LIGHT_VARS).forEach((key) => main.style.removeProperty(key));
        main.style.removeProperty("background-color");
        main.style.removeProperty("color");
      }
      setTarget(null);
      return;
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next: SystemsTheme = saved === "light" ? "light" : "dark";
    setTheme(next);

    const findTarget = () => {
      applyTheme(next);
      const systemsSiteLink = document.querySelector<HTMLAnchorElement>('a[href="/systems"]');
      const parent = systemsSiteLink?.parentElement;
      if (parent) setTarget(parent);
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [applyTheme, isSystemsRoute]);

  if (!isSystemsRoute) return null;

  const toggleTheme = () => {
    const next: SystemsTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const control = (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={`Switch Systems to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );

  return target ? createPortal(control, target) : <div className={styles.fallback}>{control}</div>;
}
