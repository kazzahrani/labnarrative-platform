"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/SiteShell";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      setLoading(true);
      setError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError || !userData.user) {
        setError("Your administrator session has expired. Sign in again to preview this draft.");
        setLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("sites")
        .select("slug,status,content,content_schema_version,design_key,design_version,design_settings")
        .eq("slug", slug)
        .maybeSingle();

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
      }

      setLoading(false);
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [slug, supabase]);

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
        <Link href="/admin" style={{ color: "white", fontWeight: 700 }}>
          Back to editor ↗
        </Link>
      </div>
      <SiteShell
        site={site}
        route={resolveSiteRoute(path)}
        basePath={`/admin/preview/${site.slug}`}
        previewMode
      />
    </>
  );
}
