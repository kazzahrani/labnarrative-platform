"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/SiteShell";
import VisualOverridesHost from "@/components/VisualOverridesHost";
import { resolveSiteRoute, type LabSite } from "@/lib/sites";

type SiteRow = {
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

type Dashboard = {
  runs?: ReviewRun[];
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

  const [site, setSite] = useState<LabSite | null>(null);
  const [status, setStatus] = useState<SiteRow["status"] | null>(null);
  const [reviewRun, setReviewRun] = useState<ReviewRun | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
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

      const [{ data, error: queryError }, { data: dashboardData }] = await Promise.all([
        supabase
          .from("sites")
          .select("slug,status,content,content_schema_version,design_key,design_version,design_settings")
          .eq("slug", slug)
          .maybeSingle(),
        supabase.rpc("engine_admin_dashboard"),
      ]);

      if (!active) return;

      if (queryError) {
        setError(queryError.message);
      } else if (!data) {
        setError("This website record could not be found, or your account is not authorised to preview it.");
      } else {
        const row = data as SiteRow;
        setSite({
          ...row.content,
          slug: row.content.slug || row.slug,
          schemaVersion: row.content.schemaVersion ?? row.content_schema_version ?? 1,
          theme: row.content.theme ?? PREVIEW_FALLBACK_THEME,
          design: row.content.design ?? {
            key: row.design_key || row.content.template || "scientific-minimal",
            version: row.design_version ?? 1,
            settings: row.design_settings ?? {},
          },
        });
        setStatus(row.status);

        const dashboard = (dashboardData ?? {}) as Dashboard;
        const matchingRun = (dashboard.runs ?? []).find(
          (run) => run.slug === slug && run.state === "final_review",
        );
        setReviewRun(matchingRun ?? null);
      }

      setLoading(false);
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [slug, supabase]);

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
      {publishError ? (
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
            background: "#4a2323",
            color: "#ffd8d3",
            border: "1px solid #7c4440",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
            fontSize: 13,
          }}
        >
          {publishError}
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
