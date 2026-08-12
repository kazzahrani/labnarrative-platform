"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MIN_ITEMS_FOR_PAGINATION = 11;
const NORMALIZED_PAGE_SIZE = "10";

function totalFromControl(control: HTMLElement): number | null {
  const summary = control.querySelector<HTMLElement>(".platformListPaginationSummary")?.textContent
    || control.querySelector<HTMLElement>("span")?.textContent
    || "";
  const match = summary.match(/\bof\s+(\d+)\b/i);
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : null;
}

function restoreNearbyRows(control: HTMLElement) {
  const candidates: Element[] = [];
  if (control.nextElementSibling) candidates.push(control.nextElementSibling);
  if (control.previousElementSibling) candidates.push(control.previousElementSibling);

  candidates.forEach((candidate) => {
    const scope = candidate instanceof HTMLElement ? candidate : null;
    if (!scope) return;
    const items = [scope, ...Array.from(scope.querySelectorAll<HTMLElement>(
      "[data-platform-pagination-hidden='true'],[data-platform-dual-hidden='true'],[data-platform-extension-hidden='true']",
    ))].filter((item): item is HTMLElement => item instanceof HTMLElement);

    items.forEach((item) => {
      if (
        item.dataset.platformPaginationHidden === "true" ||
        item.dataset.platformDualHidden === "true" ||
        item.dataset.platformExtensionHidden === "true"
      ) {
        item.style.removeProperty("display");
        delete item.dataset.platformPaginationHidden;
        delete item.dataset.platformDualHidden;
        delete item.dataset.platformExtensionHidden;
      }
    });
  });
}

function normalizeControl(control: HTMLElement, total: number) {
  if (total >= MIN_ITEMS_FOR_PAGINATION) {
    control.style.removeProperty("display");
    delete control.dataset.platformThresholdHidden;
    return;
  }

  const select = control.querySelector<HTMLSelectElement>("select");
  if (select && Number(select.value) < Number(NORMALIZED_PAGE_SIZE) && control.dataset.platformThresholdNormalized !== "true") {
    control.dataset.platformThresholdNormalized = "true";
    select.value = NORMALIZED_PAGE_SIZE;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  restoreNearbyRows(control);
  control.style.setProperty("display", "none", "important");
  control.dataset.platformThresholdHidden = "true";
}

export default function PlatformPaginationThresholdGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin") || pathname.startsWith("/admin/preview")) return;

    let disposed = false;
    let frame = 0;

    const apply = () => {
      if (disposed) return;
      document.querySelectorAll<HTMLElement>(".platformListPagination").forEach((control) => {
        const total = totalFromControl(control);
        if (total !== null) normalizeControl(control, total);
      });

      // Native paginators use component-specific classes but still expose an "x–y of N" summary.
      document.querySelectorAll<HTMLElement>("main div").forEach((node) => {
        if (node.classList.contains("platformListPagination")) return;
        const text = (node.firstElementChild?.textContent || "").trim();
        const match = text.match(/^\d+\s*[–-]\s*\d+\s+of\s+(\d+)$/i);
        if (!match) return;
        if (!node.querySelector("select") || !node.querySelector("button")) return;
        normalizeControl(node, Number(match[1]));
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("change", schedule, true);
    window.addEventListener("focus", schedule);
    apply();

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("focus", schedule);
      document.querySelectorAll<HTMLElement>("[data-platform-threshold-hidden='true']").forEach((node) => {
        node.style.removeProperty("display");
        delete node.dataset.platformThresholdHidden;
      });
    };
  }, [pathname]);

  return null;
}
