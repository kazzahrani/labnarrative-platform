"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./systems-theme-toggle.module.css";

type SystemsTheme = "dark" | "light";
const STORAGE_KEY = "labnarrative-systems-theme";

export default function SystemsThemeToggle() {
  const pathname = usePathname();
  const isSystemsRoute = pathname === "/admin/systems" || pathname === "/admin/systems-outreach";
  const [theme, setTheme] = useState<SystemsTheme>("dark");
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isSystemsRoute) {
      document.documentElement.removeAttribute("data-systems-theme");
      setTarget(null);
      return;
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next: SystemsTheme = saved === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.systemsTheme = next;

    const findTarget = () => {
      const systemsSiteLink = document.querySelector<HTMLAnchorElement>('a[href="/systems"]');
      const parent = systemsSiteLink?.parentElement;
      if (parent) setTarget(parent);
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isSystemsRoute]);

  if (!isSystemsRoute) return null;

  const toggleTheme = () => {
    const next: SystemsTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.systemsTheme = next;
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
