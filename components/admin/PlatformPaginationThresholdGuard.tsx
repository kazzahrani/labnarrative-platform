"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MIN_ITEMS_FOR_PAGINATION = 11;
const NORMALIZED_PAGE_SIZE = "10";

function totalFromControl(control: HTMLElement): number | null {
  const summary = control.querySelector<HTMLElement>(".platformListPaginationSummary")?.textContent
    || control.textContent
    || "";
  const matches = Array.from(summary.matchAll(/\bof\s+(\d+)\b/gi));
  if (!matches.length) return null;
  const total = Number(matches[0][1]);
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

function hideControl(control: HTMLElement, reason: "short" | "top") {
  control.hidden = true;
  control.style.setProperty("display", "none", "important");
  control.dataset.platformThresholdHidden = reason;
}

function showControl(control: HTMLElement) {
  control.hidden = false;
  control.style.removeProperty("display");
  delete control.dataset.platformThresholdHidden;
}

function looksLikePaginator(node: HTMLElement) {
  if (node.classList.contains("platformListPagination")) return true;
  const className = typeof node.className === "string" ? node.className : "";
  if (!/pagination/i.test(className)) return false;
  if (!node.querySelector("select") || !node.querySelector("button")) return false;
  return /\bof\s+\d+\b/i.test(node.textContent || "");
}

function hasLaterSiblingPaginator(control: HTMLElement, total: number) {
  let sibling = control.nextElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement && looksLikePaginator(sibling) && totalFromControl(sibling) === total) return true;
    sibling = sibling.nextElementSibling;
  }
  return false;
}

function isTopControl(control: HTMLElement, total: number) {
  if (control.classList.contains("platformListPaginationBottom")) return false;
  const className = typeof control.className === "string" ? control.className : "";
  if (/paginationBottom|paginationMirror/i.test(className)) return false;
  if (control.classList.contains("platformListPagination")) return true;
  return hasLaterSiblingPaginator(control, total);
}

function normalizeControl(control: HTMLElement, total: number) {
  if (total < MIN_ITEMS_FOR_PAGINATION) {
    const select = control.querySelector<HTMLSelectElement>("select");
    if (select && Number(select.value) < Number(NORMALIZED_PAGE_SIZE) && control.dataset.platformThresholdNormalized !== "true") {
      control.dataset.platformThresholdNormalized = "true";
      select.value = NORMALIZED_PAGE_SIZE;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    restoreNearbyRows(control);
    hideControl(control, "short");
    return;
  }

  if (isTopControl(control, total)) {
    hideControl(control, "top");
    return;
  }

  showControl(control);
}

export default function PlatformPaginationThresholdGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin") || pathname.startsWith("/admin/preview")) return;

    let disposed = false;
    let frame = 0;

    const apply = () => {
      if (disposed) return;

      const controls = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>(".platformListPagination").forEach((control) => controls.add(control));
      document.querySelectorAll<HTMLElement>("main div[class*='pagination'], main div[class*='Pagination']").forEach((node) => {
        if (looksLikePaginator(node)) controls.add(node);
      });

      controls.forEach((control) => {
        const total = totalFromControl(control);
        if (total !== null) normalizeControl(control, total);
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
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    document.addEventListener("change", schedule, true);
    window.addEventListener("focus", schedule);
    const timer = window.setInterval(apply, 750);
    apply();

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("focus", schedule);
      document.querySelectorAll<HTMLElement>("[data-platform-threshold-hidden]").forEach((node) => {
        node.hidden = false;
        node.style.removeProperty("display");
        delete node.dataset.platformThresholdHidden;
      });
    };
  }, [pathname]);

  return null;
}
