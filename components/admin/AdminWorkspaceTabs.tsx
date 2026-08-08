"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TABS = [
  { label: "Websites", href: "/admin/sites" },
  { label: "Production", href: "/admin/automation" },
  { label: "Discovery", href: "/admin/discovery" },
  { label: "Sales", href: "/admin/sales" },
] as const;

const PATHS = new Set(TABS.map((tab) => tab.href));

export default function AdminWorkspaceTabs() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [path, setPath] = useState("");

  useEffect(() => {
    const currentPath = window.location.pathname;
    if (!PATHS.has(currentPath as (typeof TABS)[number]["href"])) return;
    setPath(currentPath);

    let disposed = false;
    let node: HTMLDivElement | null = null;

    const place = () => {
      if (disposed) return;
      const main = document.querySelector("main");
      const header = main?.querySelector("header") ?? document.querySelector("header");
      if (!header?.parentElement) return;

      if (!node) {
        node = document.createElement("div");
        node.dataset.adminWorkspaceTabs = "true";
        setMount(node);
      }

      if (node.previousElementSibling !== header) {
        header.insertAdjacentElement("afterend", node);
      }
    };

    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(place, 800);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      node?.remove();
      setMount(null);
    };
  }, []);

  if (!mount || !path) return null;

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
          const active = path === tab.href;
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
                transition: "background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease",
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
