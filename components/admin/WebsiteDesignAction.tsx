"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Props = {
  siteId: string;
  slug: string;
  status: string;
  currentVariant?: string | null;
  onChanged?: () => void;
};

type DesignOption = { value: string; label: string; description: string };

const DESIGNS: DesignOption[] = [
  { value: "ciribilli-narita-v1", label: "Ciribilli Narita", description: "Bold image-led laboratory design with strong research presentation." },
  { value: "dobbelstein-editorial-v1", label: "Dobbelstein Editorial", description: "Restrained editorial academic layout." },
  { value: "dobbelstein-scroll-v1", label: "Dobbelstein Scroll", description: "Editorial design with a more dynamic scrolling rhythm." },
  { value: "portrait-first-v1", label: "Portrait First", description: "Minimal portrait-led design focused on the PI." },
  { value: "editorial-image-v1", label: "Editorial Image", description: "Modern editorial structure with stronger image placement." },
  { value: "prives-photo-lab-v1", label: "Prives Photo Lab", description: "Photography-led research layout." },
  { value: "zhang-transcription-v1", label: "Zhang Transcription", description: "Structured mechanism-focused academic design." },
  { value: "gao-ecosystem-v1", label: "Gao Ecosystem", description: "Broad programme and ecosystem-style organization." },
  { value: "goyette-evolution-v1", label: "Goyette Evolution", description: "Narrative, evolution-oriented academic presentation." },
  { value: "engeland-modern-v1", label: "Engeland Modern", description: "Modern multi-page academic layout." },
  { value: "bourdon-classic-v1", label: "Bourdon Classic", description: "Original full LabNarrative laboratory design." },
  { value: "Lens_1", label: "Lens 1", description: "Portrait-led modern design based on the Susanne Lens concept." },
  { value: "WALCZAK_1", label: "Walczak 1", description: "Portrait-led design that automatically derives its accent from the PI portrait." },
  { value: "Kops_1", label: "Kops 1", description: "Independent portrait-led design based on the Kops concept." },
  { value: "Karpen_1", label: "Karpen 1", description: "Portrait-led design with automatic clothing-derived group color and Narita-style homepage overlap." },
];

const AUTO_PORTRAIT_COLOR_DESIGNS = new Set(["WALCZAK_1", "Karpen_1"]);

function normalizedCurrent(value?: string | null) {
  return value?.trim() || "bourdon-classic-v1";
}

export default function WebsiteDesignAction({ siteId, slug, status, currentVariant, onChanged }: Props) {
  const editable = status === "draft" || status === "concept";
  const current = normalizedCurrent(currentVariant);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const option = useMemo(() => DESIGNS.find((item) => item.value === chosen) || DESIGNS[0], [chosen]);

  if (!editable) return null;

  async function derivePortraitAccent() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Administrator sign-in is required for portrait color analysis.");

    const response = await fetch("/api/admin/portrait-accent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ siteId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error || "The portrait color could not be derived automatically.");
    }
    return String(result.accent || "");
  }

  async function applyDesign() {
    if (saving || chosen === current) return;
    setSaving(true);
    setError("");

    if (AUTO_PORTRAIT_COLOR_DESIGNS.has(chosen)) {
      try {
        await derivePortraitAccent();
      } catch (accentError) {
        setError(accentError instanceof Error ? accentError.message : "Automatic portrait color analysis failed.");
        setSaving(false);
        return;
      }
    }

    const { data, error: rpcError } = await supabase.rpc("admin_change_site_design", {
      p_site_id: siteId,
      p_design_variant: chosen,
    });
    if (rpcError || !data || (typeof data === "object" && "ok" in data && data.ok !== true)) {
      setError(rpcError?.message || "The design change was not confirmed.");
      setSaving(false);
      return;
    }
    setOpen(false);
    setSaving(false);
    onChanged?.();
  }

  return (
    <>
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          setChosen(current);
          setError("");
          setOpen(true);
        }}
      >
        Change design
      </a>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 2500, display: "grid", placeItems: "center", padding: 18, background: "rgba(4,11,16,.80)", backdropFilter: "blur(10px)" }}
        >
          <section role="dialog" aria-modal="true" style={{ width: "min(600px, calc(100vw - 36px))", maxHeight: "calc(100vh - 48px)", overflowY: "auto", border: "1px solid rgba(126,153,168,.22)", borderRadius: 18, background: "#13232f", color: "#edf3f6", boxShadow: "0 24px 72px rgba(0,0,0,.42)", padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div>
                <p style={{ margin: "0 0 5px", fontSize: ".68rem", fontWeight: 850, letterSpacing: ".08em", textTransform: "uppercase", opacity: .58 }}>{status} · {slug}</p>
                <h2 style={{ margin: 0, fontSize: "1.28rem" }}>Change website design</h2>
              </div>
              <button type="button" disabled={saving} onClick={() => setOpen(false)} style={{ border: 0, background: "transparent", color: "inherit", fontSize: "1.35rem", cursor: "pointer" }}>×</button>
            </div>

            <p style={{ margin: "12px 0 18px", fontSize: ".8rem", lineHeight: 1.5, opacity: .72 }}>Scientific content, PI information, slug/domain and outreach history stay unchanged. Portrait-responsive designs also analyze the PI portrait and save a matching clothing-derived accent automatically.</p>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: ".72rem", fontWeight: 800, opacity: .7 }}>Design</span>
              <select value={chosen} onChange={(event) => setChosen(event.target.value)} disabled={saving} style={{ width: "100%", border: "1px solid rgba(126,153,168,.28)", borderRadius: 11, background: "#0b1722", color: "#edf3f6", padding: "11px 12px", font: "inherit", fontSize: ".84rem" }}>
                {DESIGNS.map((design) => <option key={design.value} value={design.value}>{design.label}</option>)}
              </select>
            </label>

            <div style={{ marginTop: 11, minHeight: 48, borderRadius: 11, background: "rgba(255,255,255,.035)", padding: "10px 12px" }}>
              <strong style={{ display: "block", fontSize: ".8rem", marginBottom: 3 }}>{option.label}</strong>
              <span style={{ display: "block", fontSize: ".74rem", lineHeight: 1.45, opacity: .66 }}>{option.description}</span>
            </div>

            {status === "concept" ? <p style={{ margin: "13px 0 0", border: "1px solid rgba(224,181,104,.22)", borderRadius: 11, background: "rgba(224,181,104,.07)", padding: "10px 12px", color: "#c49a4b", fontSize: ".73rem", lineHeight: 1.45 }}>This is a public Concept. Applying a design changes the same concept URL.</p> : null}
            {error ? <p style={{ margin: "13px 0 0", color: "#ff9a9a", fontSize: ".76rem", fontWeight: 700 }}>{error}</p> : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button type="button" disabled={saving} onClick={() => setOpen(false)} style={{ border: "1px solid rgba(126,153,168,.22)", borderRadius: 10, padding: "9px 13px", background: "transparent", color: "inherit", font: "inherit", fontSize: ".76rem", fontWeight: 800, cursor: "pointer" }}>Cancel</button>
              <button type="button" disabled={saving || chosen === current} onClick={() => void applyDesign()} style={{ border: "1px solid rgba(63,143,113,.42)", borderRadius: 10, padding: "9px 14px", background: "#2f6f5e", color: "#f4fbf8", font: "inherit", fontSize: ".76rem", fontWeight: 850, cursor: saving || chosen === current ? "default" : "pointer", opacity: saving || chosen === current ? .55 : 1 }}>{saving ? "Applying…" : "Apply design"}</button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
