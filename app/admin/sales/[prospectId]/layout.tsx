"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

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

  return (
    <>
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
          borderBottom: "1px solid rgba(15, 23, 42, 0.12)",
          background: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(12px)",
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
            color: "#64748b",
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
                border: active ? "1px solid #0f172a" : "1px solid #dbe2ea",
                background: active ? "#0f172a" : "#ffffff",
                color: active ? "#ffffff" : "#334155",
              }}
            >
              {step.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
