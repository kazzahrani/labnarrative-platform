"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

const steps = [
  { key: "lead", label: "Lead", suffix: "" },
  { key: "proposal", label: "Proposal", suffix: "/proposal" },
  { key: "onboarding", label: "Onboarding", suffix: "/onboarding" },
  { key: "final-review", label: "Final Review", suffix: "/final-review" },
  { key: "launch", label: "Launch", suffix: "/launch" },
  { key: "care", label: "Care", suffix: "/care" },
] as const;

const titles: Record<string, string> = {
  proposal: "Proposal",
  onboarding: "Client Onboarding",
  "final-review": "Final Review",
  launch: "Launch",
  care: "Care",
};

export default function SalesLeadLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ prospectId: string }>();
  const pathname = usePathname();
  const prospectId = String(params?.prospectId || "");
  const base = `/admin/sales/${prospectId}`;
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const section = useMemo(() => {
    if (!pathname || pathname === base || pathname === `${base}/`) return "lead";
    return steps.find((step) => step.suffix && pathname.startsWith(`${base}${step.suffix}`))?.key || "lead";
  }, [base, pathname]);

  const useSharedHeader = section !== "lead";

  useEffect(() => {
    if (!useSharedHeader) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAdminEmail(data.session?.user.email || "");
    });
    return () => { cancelled = true; };
  }, [useSharedHeader]);

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

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.assign("/admin");
  }

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
      {useSharedHeader ? (
        <header
          data-client-journey-header="true"
          style={{
            width: "100%",
            height: 84,
            minHeight: 84,
            boxSizing: "border-box",
            padding: "0 30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            borderBottom: "1px solid rgba(148,163,184,.18)",
            background: "#14232d",
            color: "#eef4f1",
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28, minWidth: 0 }}>
            <Link href="/admin/sales" style={{ color: "inherit", textDecoration: "none", fontSize: "1.05rem", fontWeight: 800, whiteSpace: "nowrap" }}>
              LabNarrative
            </Link>
            <span style={{ color: "rgba(238,244,241,.68)", fontSize: ".98rem", fontWeight: 600, whiteSpace: "nowrap" }}>
              {titles[section] || "Sales"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 24, marginLeft: "auto", flexShrink: 0 }}>
            {adminEmail ? <span style={{ color: "rgba(238,244,241,.78)", fontSize: ".86rem", fontWeight: 650, whiteSpace: "nowrap" }}>{adminEmail}</span> : null}
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              style={{
                height: 40,
                minHeight: 40,
                padding: "0 16px",
                border: "1px solid rgba(148,163,184,.28)",
                borderRadius: 9,
                background: "#182630",
                color: "#d9e0e6",
                font: "inherit",
                fontSize: ".78rem",
                fontWeight: 750,
                cursor: signingOut ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>
      ) : null}

      <div data-client-journey-section={section}>
        {children}
      </div>

      {useSharedHeader ? (
        <style>{`
          [data-client-journey-section]:not([data-client-journey-section="lead"]) main {
            padding-top: 24px !important;
          }

          [data-client-journey-section]:not([data-client-journey-section="lead"]) main > div:first-child {
            width: min(1440px, calc(100% - 48px)) !important;
            max-width: 1440px !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          [data-client-journey-section]:not([data-client-journey-section="lead"]) a[href="${base}"] {
            display: none !important;
          }

          [data-client-journey-section="proposal"] main > header:first-child {
            min-height: 0 !important;
            height: auto !important;
            padding: 12px 24px !important;
            margin: 0 auto 16px !important;
            width: min(1440px, calc(100% - 48px)) !important;
            box-sizing: border-box !important;
            justify-content: flex-end !important;
            border: 1px solid rgba(92,139,164,.20) !important;
            border-radius: 14px !important;
            background: #10232f !important;
          }

          [data-client-journey-section="proposal"] main > header:first-child > div:first-child {
            display: none !important;
          }

          [data-client-journey-section="proposal"] main > header:first-child > div:last-child {
            margin-left: auto !important;
          }

          [data-client-journey-section="proposal"] main > div:nth-of-type(1) {
            width: min(1440px, calc(100% - 48px)) !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          @media (max-width: 760px) {
            [data-client-journey-header="true"] {
              padding: 0 16px !important;
            }
            [data-client-journey-header="true"] > div:first-child {
              gap: 14px !important;
            }
            [data-client-journey-header="true"] > div:last-child {
              gap: 10px !important;
            }
            [data-client-journey-header="true"] > div:last-child > span {
              display: none !important;
            }
            [data-client-journey-section]:not([data-client-journey-section="lead"]) main > div:first-child,
            [data-client-journey-section="proposal"] main > header:first-child,
            [data-client-journey-section="proposal"] main > div:nth-of-type(1) {
              width: min(100% - 28px, 1440px) !important;
            }
          }
        `}</style>
      ) : null}

      {mount ? createPortal(journey, mount) : null}
    </>
  );
}
