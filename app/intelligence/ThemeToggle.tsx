"use client";

import { useEffect, useState } from "react";
import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";

type Props = {
  variant?: "portal" | "auth";
};

const STORAGE_KEY = "labnarrative-intelligence-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.intelligenceTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle({ variant = "auth" }: Props) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: Theme = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className={`${styles.toggle} ${variant === "portal" ? styles.portal : styles.auth}`}
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      style={{ visibility: ready ? "visible" : "hidden" }}
    >
      <span className={styles.icon} aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
