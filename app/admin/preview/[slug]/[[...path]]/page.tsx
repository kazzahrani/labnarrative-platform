"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/SiteShell";
import type { LabSite, SiteSection } from "@/lib/sites";

const allowedSections = new Set<SiteSection>([
  "home",
  "research",
  "team",
  "publications",
]);

type SiteRow = {
  slug: string;
  status: "draft" | "concept" | "live" | "archived";
  content: LabSite;
};

export default function AdminSitePreviewPage() {
  const params = useParams<{ slug: string; path?: string[] }>();
  const slug = String(params.slug ?? "").toLowerCase();
  const requestedSection = Array.isArray(params.path) ? params.path[0] : undefined;
  const section = allowedSections.has(requestedSection as SiteSection)
    ? (requestedSection as SiteSection)
    : "home";

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
        .select("slug,status,content")
        .eq("slug", slug)
        .maybeSingle<SiteRow>();

      if (!active) return;

      if (queryError) {
        setError(queryError.message);
      } else if (!data) {
        setError("This website record could not be found, or your account is not authorised to preview it.");
      } else {
        setSite(data.content);
        setStatus(data.status);
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
        section={section}
        basePath={`/admin/preview/${site.slug}`}
        previewMode
      />
    </>
  );
}
