"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { browserSupabase } from "@/lib/supabase-browser";

type PortfolioKind = "real" | "paper";
type PriceStatus = "fresh" | "delayed" | "stale" | "unavailable";
type Holding = {
  id: string;
  asset_name: string;
  symbol: string | null;
  asset_type: string | null;
  unit_price: number | string | null;
  market_value: number | string | null;
  metadata: Record<string, unknown> | null;
};

type StatusRow = Holding & { status: PriceStatus };

function bool(v: unknown) {
  return v === true || v === "true";
}

function isManaged(h: Holding) {
  const meta = h.metadata ?? {};
  return bool(meta.market_price_managed) || String(meta.source ?? "") === "binance_api";
}

function effectiveStatus(h: Holding, now: number): PriceStatus {
  const meta = h.metadata ?? {};
  if (h.unit_price === null || h.market_value === null || String(meta.price_status ?? "") === "unavailable") return "unavailable";
  const staleAt = Date.parse(String(meta.price_stale_after ?? ""));
  if (Number.isFinite(staleAt) && staleAt < now) return "stale";
  if (bool(meta.price_delayed)) return "delayed";
  const observedAt = Date.parse(String(meta.price_observed_at ?? meta.synced_at ?? ""));
  if (Number.isFinite(observedAt)) return "fresh";
  return "unavailable";
}

export default function WealthPricingIntegrity() {
  const searchParams = useSearchParams();
  const kind: PortfolioKind = searchParams.get("portfolio") === "paper" ? "paper" : "real";
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: userData } = await browserSupabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await browserSupabase
        .from("wealth_holdings")
        .select("id,asset_name,symbol,asset_type,unit_price,market_value,metadata")
        .eq("user_id", userData.user.id)
        .eq("portfolio_kind", kind);
      if (active) setHoldings((data ?? []) as Holding[]);
    }
    void load();
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    const refresh = window.setInterval(() => void load(), 300_000);
    return () => {
      active = false;
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, [kind]);

  const rows = useMemo<StatusRow[]>(() => holdings.filter(isManaged).map(h => ({ ...h, status: effectiveStatus(h, now) })), [holdings, now]);
  const counts = useMemo(() => ({
    fresh: rows.filter(r => r.status === "fresh").length,
    delayed: rows.filter(r => r.status === "delayed").length,
    stale: rows.filter(r => r.status === "stale").length,
    unavailable: rows.filter(r => r.status === "unavailable").length,
  }), [rows]);

  if (!rows.length) return null;
  const affected = rows.filter(r => r.status === "stale" || r.status === "unavailable");
  const affectedNames = affected.slice(0, 3).map(r => r.symbol || r.asset_name).join("، ");
  const hasProblem = counts.stale > 0 || counts.unavailable > 0;

  return (
    <div aria-live="polite" style={wrap}>
      <div style={titleRow}>
        <strong style={title}>سلامة الأسعار</strong>
        <span style={hasProblem ? issueDot : okDot} />
      </div>
      <div style={countsRow}>
        <span>حديث {counts.fresh}</span>
        <span>متأخر {counts.delayed}</span>
        <span>قديم {counts.stale}</span>
        <span>غير متاح {counts.unavailable}</span>
      </div>
      {hasProblem && (
        <small style={note}>
          {affectedNames ? `${affectedNames}${affected.length > 3 ? "…" : ""} · ` : ""}
          القيم القديمة في صافي الثروة هي آخر قيمة معروفة وليست سعرًا حاليًا.
        </small>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  left: 18,
  bottom: 18,
  zIndex: 120,
  width: "min(420px, calc(100vw - 36px))",
  background: "#242424",
  border: "1px solid #3a3a3a",
  borderRadius: 14,
  padding: "11px 13px",
  color: "#d7d7d7",
  fontFamily: "Tahoma, Arial, sans-serif",
  boxShadow: "none",
};
const titleRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7 };
const title: React.CSSProperties = { fontSize: 11, color: "#fafafa" };
const okDot: React.CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "#8a8a8a" };
const issueDot: React.CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "#ef4444" };
const countsRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "5px 11px", marginTop: 6, fontSize: 10, color: "#989898" };
const note: React.CSSProperties = { display: "block", marginTop: 7, paddingTop: 7, borderTop: "1px solid #343434", color: "#b0b0b0", fontSize: 9, lineHeight: 1.7 };
