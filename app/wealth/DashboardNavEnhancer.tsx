"use client";

import { useEffect } from "react";

export default function DashboardNavEnhancer() {
  useEffect(() => {
    const candidates = Array.from(document.querySelectorAll("nav *")).filter(
      (element) => element.textContent?.trim() === "الأصول",
    );

    const cleanups = candidates.map((element) => {
      const target = element as HTMLElement;
      const openAssets = () => window.location.assign("/wealth/assets");
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openAssets();
        }
      };
      target.setAttribute("role", "link");
      target.setAttribute("tabindex", "0");
      target.style.cursor = "pointer";
      target.addEventListener("click", openAssets);
      target.addEventListener("keydown", onKeyDown);
      return () => {
        target.removeEventListener("click", openAssets);
        target.removeEventListener("keydown", onKeyDown);
      };
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}
