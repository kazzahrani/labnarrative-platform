"use client";

import { useLayoutEffect } from "react";

export default function DefaultLightTheme() {
  useLayoutEffect(() => {
    const systemsRoot = document.querySelector<HTMLElement>(".lnSystemsTypography");
    if (!systemsRoot) return;

    const applyDefault = () => {
      systemsRoot.querySelectorAll<HTMLElement>("main[data-theme]").forEach((page) => {
        if (page.dataset.themeInitialized === "true") return;

        const themeControl = page.querySelector<HTMLElement>('[aria-label="Theme"]');
        if (!themeControl) return;

        page.dataset.themeInitialized = "true";

        if (page.dataset.theme !== "light") {
          const lightButton = themeControl.querySelector<HTMLButtonElement>("button:first-child");
          lightButton?.click();
        }
      });
    };

    applyDefault();

    const observer = new MutationObserver(applyDefault);
    observer.observe(systemsRoot, { subtree: true, childList: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
