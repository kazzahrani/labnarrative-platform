"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/SiteShell";
import VisualOverridesHost from "@/components/VisualOverridesHost";
import { resolveSiteRoute, type LabSite } from "@/lib/sites";

type SiteRow = {
  id: string;
  slug: string;
  status: "draft" | "concept" | "live" | "archived";
  content: LabSite;
  content_schema_version?: number;
  design_key?: string;
  design_version?: number;
  design_settings?: Record<string, unknown>;
};

type ReviewRun = {
  engine: "v3" | "v4";
  runId: string;
  slug: string;
  state: string;
};

type PublishResult = {
  ok?: boolean;
  outreachSent?: boolean;
};

const PREVIEW_FALLBACK_THEME: LabSite["theme"] = {
  background: "#f4f3ee",
  surface: "#ffffff",
  foreground: "#16231f",
  muted: "#66736e",
  accent: "#315f50",
};

function currentPortraitUrl(site: LabSite) {
  const content = site as LabSite & {
    pages?: {
      home?: { piImage?: string; topPortrait?: string; homepageImage?: string };
      contact?: { piImage?: string };
    };
    team?: Array<{ name?: string; role?: string; image?: string }>;
  };

  const candidates = [
    content.pages?.home?.piImage,
    content.pages?.home?.topPortrait,
    content.members?.[0]?.image,
    content.team?.[0]?.image,
    content.pages?.contact?.piImage,
    content.pages?.home?.homepageImage,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function withPortraitUrl(site: LabSite, nextUrl: string) {
  const previousUrl = currentPortraitUrl(site);
  const next = structuredClone(site) as any;

  const sameOrEmpty = (value: unknown) => !value || value === previousUrl;
  const isPiEntry = (entry: { name?: string; role?: string } | undefined) => {
    if (!entry) return false;
    const sameName = String(entry.name || "").trim().toLowerCase() === String(site.piName || "").trim().toLowerCase();
    const piRole = String(entry.role || "").toLowerCase().includes("principal investigator");
    return sameName || piRole;
  };

  next.pages = { ...(next.pages || {}) };
  const home = { ...(next.pages.home || {}) };
  home.piImage = nextUrl;
  if (sameOrEmpty(home.topPortrait)) home.topPortrait = nextUrl;
  if (sameOrEmpty(home.homepageImage)) home.homepageImage = nextUrl;
  next.pages.home = home;

  if (next.pages.contact) {
    const contact = { ...next.pages.contact };
    if (sameOrEmpty(contact.piImage)) contact.piImage = nextUrl;
    next.pages.contact = contact;
  }

  if (Array.isArray(next.members) && next.members[0] && isPiEntry(next.members[0])) {
    const member = next.members[0];
    if (sameOrEmpty(member.image)) next.members[0] = { ...member, image: nextUrl };
  }

  if (Array.isArray(next.team) && next.team[0] && isPiEntry(next.team[0])) {
    const member = next.team[0];
    if (sameOrEmpty(member.image)) next.team[0] = { ...member, image: nextUrl };
  }

  if (site.heroImage === previousUrl) next.heroImage = nextUrl;

  return next as LabSite;
}

export default function AdminSitePreviewPage() {
  const params = useParams<{ slug: string; path?: string[] }>();
  const slug = String(params.slug ?? "").toLowerCase();
  const path = Array.isArray(params.path) ? params.path : undefined;

  const supabase = useMemo(
    () => createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    ),
    [],
  );

  const [siteId, setSiteId] = useState("");
  const [site, setSite] = useState<LabSite | null>(null);
  const [status, setStatus] = useState<SiteRow["status"] | null>(null);
  const [reviewRun, setReviewRun] = useState<ReviewRun | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [portraitOpen, setPortraitOpen] = useState(false);
  const [portraitInput, setPortraitInput] = useState("");
  const [portraitSaving, setPortraitSaving] = useState(false);
  const [portraitError, setPortraitError] = useState("");
  const [portraitNotice, setPortraitNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      setLoading(true);
      setError("");
      setPublishError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError || !userData.user) {
        setError("Your administrator session has expired. Sign in again to preview this draft.");
        setLoading(false);
        return;
      }

      const [{ data, error: queryError }, { data: targetData, error: targetError }] = await Promise.all([
        supabase
          .from("sites")
          .select("id,slug,status,content,content_schema_version,design_key,design_version,design_settings")
          .eq("slug", slug)
          .maybeSingle(),
        supabase.rpc("engine_admin_preview_review_target", { p_slug: slug }),
      ]);

      if (!active) return;

      if (queryError) {
        setError(queryError.message);
      } else if (!data) {
        setError("This website record could not be found, or your account is not authorised to preview it.");
      } else {
        const row = data as SiteRow;
        const loadedSite: LabSite = {
          ...row.content,
          slug: row.content.slug || row.slug,
          schemaVersion: row.content.schemaVersion ?? row.content_schema_version ?? 1,
          theme: row.content.theme ?? PREVIEW_FALLBACK_THEME,
          design: row.content.design ?? {
            key: row.design_key || row.content.template || "scientific-minimal",
            version: row.design_version ?? 1,
            settings: row.design_settings ?? {},
          },
        };
        setSiteId(row.id);
        setSite(loadedSite);
        setStatus(row.status);
        setReviewRun(targetError ? null : ((targetData as ReviewRun | null) ?? null));
      }

      setLoading(false);
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [slug, supabase]);

  function openPortraitEditor() {
    if (!site) return;
    setPortraitInput(currentPortraitUrl(site));
    setPortraitError("");
    setPortraitNotice("");
    setPortraitOpen(true);
  }

  async function savePortraitUrl() {
    if (!site || !siteId || portraitSaving) return;
    if (status !== "draft") {
      setPortraitError("Portrait replacement from Preview is limited to private Drafts. Use the Visual Site Editor for a published website.");
      return;
    }

    const value = portraitInput.trim();
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") throw new Error("Use a secure HTTPS image URL.");
    } catch (urlError) {
      setPortraitError(urlError instanceof Error ? urlError.message : "Enter a valid HTTPS image URL.");
      return;
    }

    setPortraitSaving(true);
    setPortraitError("");
    setPortraitNotice("");

    const nextSite = withPortraitUrl(site, value);
    const { data, error: saveError } = await supabase
      .from("sites")
      .update({ content: nextSite })
      .eq("id", siteId)
      .select("content")
      .single();

    if (saveError || !data) {
      setPortraitError(saveError?.message || "The portrait URL could not be saved.");
      setPortraitSaving(false);
      return;
    }

    setSite((data as { content: LabSite }).content);
    setPortraitSaving(false);
    setPortraitOpen(false);
    setPortraitNotice("Portrait updated. Review the image before publishing.");
  }

  async function approveAndPublish() {
    if (!reviewRun || publishing) return;

    setPublishing(true);
    setPublishError("");

    const { data, error: publishRpcError } = await supabase.rpc("engine_admin_approve_publish", {
      p_run_id: reviewRun.runId,
      p_engine: reviewRun.engine,
      p_note: null,
    });

    if (publishRpcError) {
      setPublishError(publishRpcError.message || "Approve & Publish failed.");
      setPublishing(false);
      return;
    }

    const result = data as PublishResult | null;
    if (!result?.ok || result.outreachSent) {
      setPublishError("Publication did not return the expected safe outreach-draft state.");
      setPublishing(false);
      return;
    }

    window.location.href = `/admin/outreach/${reviewRun.runId}`;
  }

  if (loading) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <p className="eyebrow">Private preview</p>
          <h1>Loading draft website…</h1>
        </section>
      </main>
    );
  }

  if (error || !site) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <p className="eyebrow">Preview unavailable</p>
          <h1>This draft could not be opened.</h1>
          <p>{error}</p>
          <Link className="admin-primary-button" href="/admin">
            Return to administrator dashboard
          </Link>
        </section>
      </main>
    );
  }

  const route = resolveSiteRoute(path);

  return (
    <>
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 100,
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "10px 14px",
          borderRadius: 999,
          background: "rgba(15, 35, 29, 0.94)",
          color: "white",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          fontSize: 14,
        }}
      >
        <span>{status === "draft" ? "Draft preview" : `${status} preview`}</span>
        {status === "draft" ? (
          <button
            type="button"
            onClick={openPortraitEditor}
            style={{
              border: "1px solid rgba(255,255,255,0.24)",
              borderRadius: 999,
              background: "rgba(255,255,255,0.10)",
              color: "white",
              padding: "7px 12px",
              font: "inherit",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Portrait URL
          </button>
        ) : null}
        {reviewRun ? (
          <button
            type="button"
            onClick={() => void approveAndPublish()}
            disabled={publishing}
            style={{
              border: "1px solid rgba(255,255,255,0.24)",
              borderRadius: 999,
              background: publishing ? "#24453d" : "#2f8a73",
              color: "white",
              padding: "7px 12px",
              font: "inherit",
              fontWeight: 800,
              cursor: publishing ? "wait" : "pointer",
              opacity: publishing ? 0.78 : 1,
            }}
          >
            {publishing ? "Publishing…" : "Approve & Publish"}
          </button>
        ) : null}
        <Link href="/admin/sites" style={{ color: "white", fontWeight: 700 }}>
          Back to Website Monitor ↗
        </Link>
      </div>

      {portraitOpen ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !portraitSaving) setPortraitOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(4,14,12,.66)",
            backdropFilter: "blur(8px)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="portrait-url-title"
            style={{
              width: "min(640px, 100%)",
              borderRadius: 24,
              padding: 26,
              background: "#f7f5ef",
              color: "#16231f",
              boxShadow: "0 28px 80px rgba(0,0,0,.34)",
              border: "1px solid rgba(22,35,31,.18)",
            }}
          >
            <p style={{ margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".13em", fontSize: 11, fontWeight: 900, color: "#607069" }}>
              Private draft tool
            </p>
            <h2 id="portrait-url-title" style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 34, fontWeight: 500 }}>
              Replace PI portrait
            </h2>
            <p style={{ margin: "10px 0 20px", color: "#62706a", lineHeight: 1.55 }}>
              Paste the direct HTTPS URL for the portrait you want to use. This updates the PI portrait references in the private draft only.
            </p>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".1em" }}>Portrait URL</span>
              <input
                autoFocus
                type="url"
                value={portraitInput}
                onChange={(event) => setPortraitInput(event.target.value)}
                placeholder="https://institution.edu/path/portrait.jpg"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void savePortraitUrl();
                  }
                  if (event.key === "Escape" && !portraitSaving) setPortraitOpen(false);
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #bdc8c2",
                  borderRadius: 14,
                  padding: "13px 14px",
                  background: "white",
                  color: "#16231f",
                  font: "inherit",
                }}
              />
            </label>
            {portraitError ? <p role="alert" style={{ margin: "12px 0 0", color: "#8a2d2d", fontWeight: 700 }}>{portraitError}</p> : null}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
              {portraitInput.trim() ? (
                <a href={portraitInput.trim()} target="_blank" rel="noreferrer" style={{ color: "#315f50", fontWeight: 800 }}>
                  Open image ↗
                </a>
              ) : <span />}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPortraitOpen(false)}
                  disabled={portraitSaving}
                  style={{ border: "1px solid #bdc8c2", borderRadius: 999, padding: "9px 14px", background: "transparent", color: "#16231f", font: "inherit", fontWeight: 800, cursor: portraitSaving ? "wait" : "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void savePortraitUrl()}
                  disabled={portraitSaving}
                  style={{ border: 0, borderRadius: 999, padding: "9px 15px", background: "#315f50", color: "white", font: "inherit", fontWeight: 900, cursor: portraitSaving ? "wait" : "pointer", opacity: portraitSaving ? .72 : 1 }}
                >
                  {portraitSaving ? "Saving…" : "Save portrait"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {publishError || portraitNotice ? (
        <div
          role="alert"
          style={{
            position: "fixed",
            right: 16,
            bottom: 76,
            zIndex: 101,
            maxWidth: 420,
            padding: "10px 14px",
            borderRadius: 12,
            background: publishError ? "#4a2323" : "#173b31",
            color: publishError ? "#ffd8d3" : "#eaf5ef",
            border: publishError ? "1px solid #7c4440" : "1px solid #315f50",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
            fontSize: 13,
          }}
        >
          {publishError || portraitNotice}
        </div>
      ) : null}
      <VisualOverridesHost site={site} route={route}>
        <SiteShell
          site={site}
          route={route}
          basePath={`/admin/preview/${site.slug}`}
          previewMode
        />
      </VisualOverridesHost>
    </>
  );
}
