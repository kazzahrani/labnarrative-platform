"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Discovery", href: "/admin/discovery" },
  { label: "Production", href: "/admin/automation" },
  { label: "Review", href: "/admin/review" },
  { label: "Websites", href: "/admin/sites" },
  { label: "Sales", href: "/admin/sales" },
] as const;

function isActivePath(path: string, href: (typeof TABS)[number]["href"]) {
  if (href === "/admin/sites") {
    return path === href || path.startsWith(`${href}/`) || path === "/admin/sites-v3" || path.startsWith("/admin/sites-v3/");
  }
  return path === href || path.startsWith(`${href}/`);
}

function isClientJourneyPath(path: string) {
  return /^\/admin\/sales\/[^/]+(?:\/.*)?$/.test(path);
}

export default function AdminWorkspaceTabs() {
  const pathname = usePathname();
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const currentPath = pathname || "";
    if (!currentPath.startsWith("/admin")) {
      setMount(null);
      return;
    }

    let disposed = false;
    let node: HTMLDivElement | null = null;

    const place = () => {
      if (disposed) return;

      const journeyHeader = isClientJourneyPath(currentPath)
        ? document.querySelector<HTMLElement>("[data-client-journey-header='true']")
        : null;
      const main = document.querySelector("main");
      const pageHeader = main?.querySelector("header") ?? document.querySelector("header");
      const anchor = journeyHeader ?? pageHeader;
      if (!anchor?.parentElement) return;

      if (!node) {
        node = document.createElement("div");
        node.dataset.adminWorkspaceTabs = "true";
      }

      if (node.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement("afterend", node);
      }

      setMount(node);
    };

    // Run after the route's new DOM has committed, then retry briefly if its header
    // is still mounting. This avoids holding a stale anchor across client navigation.
    const firstFrame = window.requestAnimationFrame(place);
    const retry = window.setInterval(place, 250);
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 3000);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(firstFrame);
      window.clearInterval(retry);
      window.clearTimeout(stopRetry);
      node?.remove();
      setMount(null);
    };
  }, [pathname]);

  if (!mount || !pathname) return null;

  return createPortal(
    <div
      style={{
        width: "100%",
        borderBottom: "1px solid rgba(148,163,184,.18)",
        background: "#10212c",
        color: "#eef4f1",
      }}
    >
      <nav
        aria-label="LabNarrative workspace"
        style={{
          width: "min(1500px, calc(100% - 48px))",
          margin: "0 auto",
          padding: "10px 0",
          display: "flex",
          gap: 8,
          alignItems: "center",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {TABS.map((tab) => {
          const active = isActivePath(pathname, tab.href);
          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 38,
                minWidth: 112,
                padding: "0 17px",
                borderRadius: 999,
                border: active ? "1px solid rgba(139,211,176,.36)" : "1px solid rgba(148,163,184,.16)",
                background: active ? "#2f6f5e" : "rgba(255,255,255,.035)",
                color: active ? "#ffffff" : "rgba(238,244,241,.72)",
                textDecoration: "none",
                fontSize: ".78rem",
                fontWeight: active ? 800 : 700,
                letterSpacing: ".01em",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>
    </div>,
    mount,
  );
}
