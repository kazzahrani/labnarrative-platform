"use client";

import { useEffect } from "react";

export default function SalesConceptMetricsPlacement() {
  useEffect(() => {
    let clone: HTMLElement | null = null;
    let source: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    let rootObserver: MutationObserver | null = null;

    const mount = () => {
      source = document.querySelector<HTMLElement>('[aria-label="Sales funnel summary"]');
      const conceptHeading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2"))
        .find((heading) => heading.textContent?.trim() === "Concept activity");
      const conceptSection = conceptHeading?.closest<HTMLElement>("section");
      const conceptHeader = conceptSection?.firstElementChild instanceof HTMLElement
        ? conceptSection.firstElementChild
        : null;

      if (!source || !conceptSection || !conceptHeader) return false;

      const existing = conceptSection.querySelector<HTMLElement>('[data-concept-metrics="true"]');
      if (existing) {
        clone = existing;
      } else {
        clone = source.cloneNode(true) as HTMLElement;
        clone.dataset.conceptMetrics = "true";
        clone.removeAttribute("aria-hidden");
        conceptHeader.insertAdjacentElement("afterend", clone);
      }

      source.style.display = "none";
      source.setAttribute("aria-hidden", "true");

      observer?.disconnect();
      observer = new MutationObserver(() => {
        if (!source || !clone) return;
        const fresh = source.cloneNode(true) as HTMLElement;
        clone.innerHTML = fresh.innerHTML;
      });
      observer.observe(source, { childList: true, subtree: true, characterData: true });
      return true;
    };

    if (!mount()) {
      rootObserver = new MutationObserver(() => {
        if (mount()) rootObserver?.disconnect();
      });
      rootObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      rootObserver?.disconnect();
      clone?.remove();
      if (source) {
        source.style.display = "";
        source.removeAttribute("aria-hidden");
      }
    };
  }, []);

  return null;
}
