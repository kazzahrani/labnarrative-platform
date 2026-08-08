"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type SiteStatus = "draft" | "concept" | "live" | "archived";
type SiteInfo = {
  id: string;
  slug: string;
  status: SiteStatus;
  design_key: string | null;
  design_settings: { variant?: string } | null;
};

type DesignOption = {
  value: string;
  label: string;
  description: string;
};

const CONTROL_ATTR = "data-labnarrative-design-switcher";

const DESIGNS: DesignOption[] = [
  {
    value: "ciribilli-narita-v1",
    label: "Ciribilli Narita",
    description: "Bold, image-led laboratory design with strong research-page presentation.",
  },
  {
    value: "dobbelstein-editorial-v1",
    label: "Dobbelstein Editorial",
    description: "Text-led editorial design with restrained academic typography and spacing.",
  },
  {
    value: "dobbelstein-scroll-v1",
    label: "Dobbelstein Scroll",
    description: "Editorial design with section motion and a more dynamic scrolling experience.",
  },
  {
    value: "portrait-first-v1",
    label: "Portrait First",
    description: "Minimal design built around one PI portrait; no group photograph is required.",
  },
  {
    value: "editorial-image-v1",
    label: "Editorial Image",
    description: "Modern editorial structure with stronger image placement throughout the site.",
  },
  {
    value: "prives-photo-lab-v1",
    label: "Prives Photo Lab",
    description: "Kinetic, photography-led research layout with a more visual presentation.",
  },
  {
    value: "zhang-transcription-v1",
    label: "Zhang Transcription",
    description: "Structured signature-academic design suited to mechanism-focused laboratories.",
  },
  {
    value: "gao-ecosystem-v1",
    label: "Gao Ecosystem",
    description: "Signature-academic design with broad programme and ecosystem-style organization.",
  },
  {
    value: "goyette-evolution-v1",
    label: "Goyette Evolution",
    description: "Signature-academic design with a narrative, evolution-oriented visual rhythm.",
  },
  {
    value: "engeland-modern-v1",
    label: "Engeland Modern",
    description: "Modern multi-page academic layout with strong research and publication sections.",
  },
  {
    value: "bourdon-classic-v1",
    label: "Bourdon Classic",
    description: "The original full LabNarrative laboratory design with balanced research sections.",
  },
];

function currentVariant(site: SiteInfo): string {
  return site.design_settings?.variant?.trim() || "bourdon-classic-v1";
}

function designLabel(value: string): string {
  return DESIGNS.find((design) => design.value === value)?.label || value;
}

export default function WebsiteDesignSwitcher() {
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [chosenDesign, setChosenDesign] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedSite = useMemo(
    () => sites.find((site) => site.slug === selectedSlug) ?? null,
    [selectedSlug, sites],
  );

  const chosenOption = useMemo(
    () => DESIGNS.find((design) => design.value === chosenDesign) ?? DESIGNS[0],
    [chosenDesign],
  );

  useEffect(() => {
    if (!selectedSite) return;
    setChosenDesign(currentVariant(selectedSite));
    setError("");
  }, [selectedSite]);

  useEffect(() => {
    if (!selectedSite) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setSelectedSlug("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [saving, selectedSite]);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/admin/sites") return;

    let disposed = false;
    let siteMap = new Map<string, SiteInfo>();

    const findMonitorTable = (): HTMLTableElement | null => {
      for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table"))) {
        const headings = Array.from(table.querySelectorAll("thead th")).map((node) => node.textContent?.trim());
        if (headings.includes("Website") && headings.includes("Design") && headings.includes("Actions")) return table;
      }
      return null;
    };

    const applyControls = () => {
      if (disposed) return;
      const table = findMonitorTable();
      if (!table) return;

      for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
        const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("button"));
        const slugButton = buttons.find((candidate) => siteMap.has((candidate.textContent || "").trim()));
        const slug = (slugButton?.textContent || "").trim();
        const site = siteMap.get(slug);
        const designCell = row.querySelector<HTMLElement>("[data-label='Design']");
        if (!site || !designCell) continue;

        const existing = designCell.querySelector<HTMLButtonElement>(`button[${CONTROL_ATTR}]`);
        const editable = site.status === "draft" || site.status === "concept";
        if (!editable) {
          existing?.remove();
          continue;
        }
        if (existing) continue;

        const control = document.createElement("button");
        control.type = "button";
        control.setAttribute(CONTROL_ATTR, "true");
        control.textContent = "Change design";
        control.title = "Switch this Draft or Concept to another LabNarrative design.";
        control.style.display = "block";
        control.style.marginTop = "7px";
        control.style.border = "1px solid rgba(91,128,148,.32)";
        control.style.borderRadius = "8px";
        control.style.padding = "5px 8px";
        control.style.background = "rgba(44,93,111,.10)";
        control.style.color = "inherit";
        control.style.font = "inherit";
        control.style.fontSize = ".68rem";
        control.style.fontWeight = "800";
        control.style.cursor = "pointer";
        control.addEventListener("click", () => setSelectedSlug(site.slug));
        designCell.append(control);
      }
    };

    const load = async () => {
      const { data, error: loadError } = await supabase
        .from("sites")
        .select("id,slug,status,design_key,design_settings")
        .in("status", ["draft", "concept", "live", "archived"]);
      if (disposed || loadError) return;
      const rows = (data ?? []) as SiteInfo[];
      siteMap = new Map(rows.map((site) => [site.slug, site]));
      setSites(rows);
      document.querySelectorAll(`button[${CONTROL_ATTR}]`).forEach((node) => node.remove());
      applyControls();
    };

    const observer = new MutationObserver(() => applyControls());
    observer.observe(document.body, { childList: true, subtree: true });
    const applyTimer = window.setInterval(applyControls, 800);
    const refreshTimer = window.setInterval(() => void load(), 20_000);
    void load();

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(applyTimer);
      window.clearInterval(refreshTimer);
      document.querySelectorAll(`button[${CONTROL_ATTR}]`).forEach((node) => node.remove());
    };
  }, []);

  async function applyDesign() {
    if (!selectedSite || saving || !chosenDesign) return;
    setSaving(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_change_site_design", {
        p_site_id: selectedSite.id,
        p_design_variant: chosenDesign,
      });
      if (rpcError) throw rpcError;
      if (!data || (typeof data === "object" && "ok" in data && data.ok !== true)) {
        throw new Error("The design change was not confirmed by LabNarrative.");
      }
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website design could not be changed.");
      setSaving(false);
    }
  }

  if (!selectedSite || typeof document === "undefined") return null;

  const current = currentVariant(selectedSite);
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) setSelectedSlug("");
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2200,
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "rgba(4,11,16,.78)",
        backdropFilter: "blur(10px)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="website-design-switcher-title"
        style={{
          width: "min(560px, calc(100vw - 36px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          border: "1px solid rgba(126,153,168,.22)",
          borderRadius: 18,
          background: "#13232f",
          color: "#edf3f6",
          boxShadow: "0 24px 72px rgba(0,0,0,.42)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: "0 0 5px", fontSize: ".7rem", fontWeight: 850, letterSpacing: ".08em", textTransform: "uppercase", opacity: .58 }}>
              {selectedSite.status === "draft" ? "Draft" : "Concept"} · {selectedSite.slug}
            </p>
            <h2 id="website-design-switcher-title" style={{ margin: 0, fontSize: "1.3rem" }}>Change website design</h2>
          </div>
          <button
            type="button"
            aria-label="Close design selector"
            disabled={saving}
            onClick={() => setSelectedSlug("")}
            style={{ border: 0, background: "transparent", color: "inherit", fontSize: "1.35rem", cursor: saving ? "default" : "pointer", opacity: .72 }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: "12px 0 18px", fontSize: ".82rem", lineHeight: 1.55, opacity: .72 }}>
          Scientific content, PI information, publications and outreach history stay unchanged. Only the visual design is switched.
        </p>

        <div style={{ display: "grid", gap: 7, marginBottom: 15 }}>
          <span style={{ fontSize: ".72rem", fontWeight: 800, opacity: .7 }}>Current design</span>
          <strong style={{ fontSize: ".9rem" }}>{designLabel(current)}</strong>
        </div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: ".72rem", fontWeight: 800, opacity: .7 }}>New design</span>
          <select
            value={chosenDesign}
            onChange={(event) => setChosenDesign(event.target.value)}
            disabled={saving}
            style={{
              width: "100%",
              border: "1px solid rgba(126,153,168,.28)",
              borderRadius: 11,
              background: "#0b1722",
              color: "#edf3f6",
              padding: "11px 12px",
              font: "inherit",
              fontSize: ".84rem",
            }}
          >
            {DESIGNS.map((design) => <option key={design.value} value={design.value}>{design.label}</option>)}
          </select>
        </label>

        <div style={{ marginTop: 11, minHeight: 48, borderRadius: 11, background: "rgba(255,255,255,.035)", padding: "10px 12px" }}>
          <strong style={{ display: "block", fontSize: ".8rem", marginBottom: 3 }}>{chosenOption.label}</strong>
          <span style={{ display: "block", fontSize: ".74rem", lineHeight: 1.45, opacity: .66 }}>{chosenOption.description}</span>
        </div>

        {selectedSite.status === "concept" ? (
          <p style={{ margin: "13px 0 0", border: "1px solid rgba(224,181,104,.22)", borderRadius: 11, background: "rgba(224,181,104,.07)", padding: "10px 12px", color: "#e0b568", fontSize: ".73rem", lineHeight: 1.45 }}>
            This is a public Concept. Applying a design changes the same concept URL, including for a PI who may already have received that link.
          </p>
        ) : null}

        {error ? <p style={{ margin: "13px 0 0", color: "#ff9a9a", fontSize: ".76rem", fontWeight: 700 }}>{error}</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => setSelectedSlug("")}
            style={{ border: "1px solid rgba(126,153,168,.22)", borderRadius: 10, padding: "9px 13px", background: "transparent", color: "inherit", font: "inherit", fontSize: ".76rem", fontWeight: 800, cursor: saving ? "default" : "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || chosenDesign === current}
            onClick={() => void applyDesign()}
            style={{ border: "1px solid rgba(75,150,122,.42)", borderRadius: 10, padding: "9px 14px", background: "#2f6f5e", color: "#f4fbf8", font: "inherit", fontSize: ".76rem", fontWeight: 850, cursor: saving || chosenDesign === current ? "default" : "pointer", opacity: saving || chosenDesign === current ? .55 : 1 }}
          >
            {saving ? "Applying…" : "Apply design"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
