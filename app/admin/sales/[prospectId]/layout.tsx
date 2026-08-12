"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const steps = [
  { key: "lead", label: "Lead", suffix: "" },
  { key: "proposal", label: "Proposal", suffix: "/proposal" },
  { key: "onboarding", label: "Onboarding", suffix: "/onboarding" },
  { key: "final-review", label: "Final Review", suffix: "/final-review" },
  { key: "launch", label: "Launch", suffix: "/launch" },
  { key: "care", label: "Care", suffix: "/care" },
] as const;

export default function SalesLeadLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ prospectId: string }>();
  const pathname = usePathname();
  const prospectId = String(params?.prospectId || "");
  const base = `/admin/sales/${prospectId}`;
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let node: HTMLDivElement | null = null;

    const place = () => {
      if (disposed) return;

      const workspaceTabs = document.querySelector<HTMLElement>("[data-admin-workspace-tabs='true']");
      if (!workspaceTabs?.parentElement) return;

      if (!node) {
        node = document.createElement("div");
        node.dataset.clientJourneyTabs = "true";
        setMount(node);
      }

      if (node.previousElementSibling !== workspaceTabs) {
        workspaceTabs.insertAdjacentElement("afterend", node);
      }
    };

    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(place, 500);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      node?.remove();
      setMount(null);
    };
  }, []);

  const journey = (
    <nav
      aria-label="Client journey"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        gap: 8,
        overflowX: "auto",
        padding: "10px 18px",
        borderBottom: "1px solid rgba(86, 147, 176, 0.22)",
        background: "rgba(10, 27, 39, 0.96)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 10px 26px rgba(3, 12, 20, 0.16)",
      }}
    >
      <span
        style={{
          marginRight: 6,
          whiteSpace: "nowrap",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#8fa6b2",
        }}
      >
        Client journey
      </span>
      {steps.map((step) => {
        const href = `${base}${step.suffix}`;
        const active = step.suffix === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={step.key}
            href={href}
            style={{
              whiteSpace: "nowrap",
              borderRadius: 999,
              padding: "7px 12px",
              fontSize: 13,
              fontWeight: 650,
              textDecoration: "none",
              border: active ? "1px solid #4f9b86" : "1px solid #2d4a5a",
              background: active ? "#2f715f" : "#122a37",
              color: active ? "#ffffff" : "#c4d2d9",
              boxShadow: active ? "inset 0 0 0 1px rgba(125, 226, 179, 0.08)" : "none",
            }}
          >
            {step.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {children}
      {mount ? createPortal(journey, mount) : null}
    </>
  );
}
