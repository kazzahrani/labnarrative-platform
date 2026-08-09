"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { LabSite, SiteRoute } from "@/lib/sites";

export type VisualOverride = {
  route: string;
  selector: string;
  kind: "text" | "image" | "hidden";
  value: string;
};

function routeKey(route: SiteRoute) {
  return `${route.section}${route.projectSlug ? `:${route.projectSlug}` : ""}`;
}

function readOverrides(site: LabSite): VisualOverride[] {
  const value = (site as LabSite & { visualOverrides?: unknown }).visualOverrides;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VisualOverride => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.route === "string"
      && typeof row.selector === "string"
      && typeof row.kind === "string"
      && typeof row.value === "string";
  });
}

function restorePrevious(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-ln-visual-overridden='1']").forEach((element) => {
    const kind = element.dataset.lnVisualKind;
    if (kind === "text") {
      element.textContent = element.dataset.lnVisualOriginalText ?? "";
    } else if (kind === "image" && element instanceof HTMLImageElement) {
      const original = element.dataset.lnVisualOriginalSrc ?? "";
      if (original) element.src = original;
      element.style.display = element.dataset.lnVisualOriginalDisplay ?? "";
    } else if (kind === "hidden") {
      element.style.display = element.dataset.lnVisualOriginalDisplay ?? "";
    }
    delete element.dataset.lnVisualOverridden;
    delete element.dataset.lnVisualKind;
  });
}

function remember(element: HTMLElement, kind: VisualOverride["kind"]) {
  if (element.dataset.lnVisualOriginalDisplay == null) {
    element.dataset.lnVisualOriginalDisplay = element.style.display || "";
  }
  if (kind === "text" && element.dataset.lnVisualOriginalText == null) {
    element.dataset.lnVisualOriginalText = element.textContent ?? "";
  }
  if (kind === "image" && element instanceof HTMLImageElement && element.dataset.lnVisualOriginalSrc == null) {
    element.dataset.lnVisualOriginalSrc = element.getAttribute("src") || element.src || "";
  }
  element.dataset.lnVisualOverridden = "1";
  element.dataset.lnVisualKind = kind;
}

export default function VisualOverridesHost({
  site,
  route,
  children,
  className,
}: {
  site: LabSite;
  route: SiteRoute;
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    restorePrevious(root);

    const key = routeKey(route);
    const overrides = readOverrides(site).filter((item) => item.route === "*" || item.route === key);

    for (const override of overrides) {
      let element: HTMLElement | null = null;
      try {
        element = root.querySelector<HTMLElement>(override.selector);
      } catch {
        element = null;
      }
      if (!element) continue;

      remember(element, override.kind);
      if (override.kind === "text") {
        if ((element.textContent ?? "") !== override.value) element.textContent = override.value;
      } else if (override.kind === "image" && element instanceof HTMLImageElement) {
        if (!override.value) {
          element.style.display = "none";
        } else {
          element.style.display = element.dataset.lnVisualOriginalDisplay ?? "";
          if (element.src !== override.value) element.src = override.value;
        }
      } else if (override.kind === "hidden") {
        element.style.display = override.value === "true" ? "none" : (element.dataset.lnVisualOriginalDisplay ?? "");
      }
    }

    return () => restorePrevious(root);
  }, [route.projectSlug, route.section, site]);

  return <div ref={rootRef} className={className} data-ln-visual-root>{children}</div>;
}
