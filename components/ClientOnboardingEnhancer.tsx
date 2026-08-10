"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SECTION_IDS = ["identity", "content", "team", "contact", "domain", "branding", "hiring"];

export default function ClientOnboardingEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/onboarding/")) return;

    let frame = 0;
    let savedTimer: number | undefined;
    let observer: MutationObserver | undefined;
    let clickBoundButton: HTMLButtonElement | null = null;

    const getSections = () =>
      SECTION_IDS.map((id) => document.getElementById(id)).filter(
        (node): node is HTMLElement => Boolean(node),
      );

    const getNavButtons = () => {
      const aside = document.querySelector("main aside");
      if (!aside) return [] as HTMLButtonElement[];
      return Array.from(aside.querySelectorAll("button")).slice(0, SECTION_IDS.length) as HTMLButtonElement[];
    };

    const syncActiveSection = () => {
      frame = 0;
      const sections = getSections();
      const buttons = getNavButtons();
      if (!sections.length || buttons.length < sections.length) return;

      const header = document.querySelector("main header") as HTMLElement | null;
      const marker = (header?.getBoundingClientRect().height || 72) + 44;
      let activeIndex = 0;

      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= marker) activeIndex = index;
      });

      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
        activeIndex = sections.length - 1;
      }

      buttons.forEach((button, index) => {
        const selected = index === activeIndex;
        button.dataset.scrollActive = selected ? "true" : "false";
        button.style.background = selected ? "#ffffff" : "transparent";
        button.style.color = selected ? "#16231f" : "#56645f";
        button.style.fontWeight = selected ? "700" : "400";
        button.style.transform = selected ? "translateX(4px)" : "translateX(0)";
        button.style.transition = "background .16s ease,color .16s ease,transform .16s ease";
        if (selected) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });

      const aside = document.querySelector("main aside") as HTMLElement | null;
      if (aside && window.innerWidth > 900) {
        aside.style.position = "sticky";
        aside.style.top = `${Math.round((header?.getBoundingClientRect().height || 72) + 20)}px`;
        aside.style.maxHeight = `calc(100vh - ${(header?.getBoundingClientRect().height || 72) + 40}px)`;
        aside.style.overflowY = "auto";
        aside.style.scrollbarWidth = "thin";
      }
    };

    const scheduleSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncActiveSection);
    };

    const findSaveButton = () => {
      const footer = document.querySelector("main footer");
      if (!footer) return null;
      return (
        Array.from(footer.querySelectorAll("button")).find((button) =>
          /save progress|saving|saved/i.test(button.textContent || ""),
        ) as HTMLButtonElement | undefined
      ) || null;
    };

    const restoreSaveButton = (button: HTMLButtonElement) => {
      button.style.background = "transparent";
      button.style.borderColor = "rgba(255,255,255,.3)";
      button.style.color = "#fff";
      button.style.minWidth = "118px";
      if ((button.textContent || "").includes("Saved")) button.textContent = "Save progress";
      button.dataset.saveFeedback = "idle";
    };

    const markSaved = () => {
      const button = findSaveButton();
      if (!button) return;
      if (savedTimer) window.clearTimeout(savedTimer);
      button.dataset.saveFeedback = "saved";
      button.textContent = "✓ Saved";
      button.style.background = "#2f715f";
      button.style.borderColor = "#4f9b86";
      button.style.color = "#fff";
      button.style.minWidth = "118px";

      const footerText = button.parentElement?.querySelector("span") as HTMLElement | null;
      if (footerText) footerText.textContent = "Saved just now";

      savedTimer = window.setTimeout(() => restoreSaveButton(button), 1800);
    };

    const bindSaveButton = () => {
      const button = findSaveButton();
      if (!button || button === clickBoundButton) return;
      clickBoundButton = button;
      button.style.minWidth = "118px";
      button.addEventListener("click", () => {
        button.dataset.saveFeedback = "saving";
        button.style.minWidth = "118px";
      });
    };

    const detectSavedNotice = () => {
      bindSaveButton();
      const savedNotice = Array.from(document.querySelectorAll("p,div")).some(
        (node) => node.textContent?.trim() === "Progress saved.",
      );
      if (savedNotice) markSaved();
      scheduleSync();
    };

    observer = new MutationObserver(detectSavedNotice);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    bindSaveButton();
    scheduleSync();

    return () => {
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (savedTimer) window.clearTimeout(savedTimer);
    };
  }, [pathname]);

  return null;
}
