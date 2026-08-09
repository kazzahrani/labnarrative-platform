"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import BourdonEditor from "@/components/admin/BourdonEditor";
import LiveSitePreview from "@/components/admin/LiveSitePreview";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import type { LabSite, SiteRoute } from "@/lib/sites";
import styles from "./site-editor.module.css";

type SiteStatus = "draft" | "concept" | "live" | "archived";

type Validation = {
  ok?: boolean;
  issues?: string[];
  engineV3?: boolean;
};

type SiteMeta = {
  id: string;
  slug: string;
  status: SiteStatus;
  content: LabSite;
  updatedAt: string;
  domainStatus?: string | null;
  domainUrl?: string | null;
  outreachStatus?: string | null;
};

type Revision = {
  id: string;
  content: LabSite;
  note?: string;
  baseSiteUpdatedAt: string;
  updatedAt: string;
  validation?: Validation;
};

type HistoryItem = {
  id: string;
  status: "published" | "snapshot";
  note?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  restoreOf?: string | null;
  validation?: Validation;
};

type Workspace = {
  site: SiteMeta;
  revision: Revision;
  history: HistoryItem[];
  validation: Validation;
  engineV3?: boolean;
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeIssues(validation?: Validation): string[] {
  return Array.isArray(validation?.issues) ? validation!.issues!.map(String) : [];
}

export default function SiteEditorPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(String(params?.slug || ""));
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [content, setContent] = useState<LabSite | null>(null);
  const [note, setNote] = useState("");
  const [route, setRoute] = useState<SiteRoute>({ section: "home" });
  const [validation, setValidation] = useState<Validation>({ ok: true, issues: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("site_editor_open", { p_slug: slug });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const next = data as Workspace;
    setWorkspace(next);
    setContent(next.revision.content);
    setNote(next.revision.note || "");
    setValidation(next.validation || next.revision.validation || { ok: true, issues: [] });
    setDirty(false);
    setLoading(false);
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const issues = useMemo(() => normalizeIssues(validation), [validation]);

  function safeContent(value: LabSite): LabSite {
    if (!workspace) return value;
    return { ...value, slug: workspace.site.slug };
  }

  async function saveDraft(showNotice = true): Promise<boolean> {
    if (!workspace || !content) return false;
    setSaving(true);
    setError("");
    const normalized = safeContent(content);
    const { data, error: rpcError } = await supabase.rpc("site_editor_save", {
      p_revision_id: workspace.revision.id,
      p_content: normalized,
      p_note: note,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return false;
    }
    setContent(normalized);
    setValidation((data as any)?.validation || { ok: true, issues: [] });
    setDirty(false);
    if (showNotice) setNotice("Draft saved. The public website has not changed.");
    return true;
  }

  async function publishChanges() {
    if (!workspace || !content || publishing) return;
    setPublishing(true);
    setNotice("");
    setError("");
    const saved = await saveDraft(false);
    if (!saved) { setPublishing(false); return; }
    const { data, error: rpcError } = await supabase.rpc("site_editor_publish", { p_revision_id: workspace.revision.id });
    if (rpcError) {
      setError(rpcError.message);
      setPublishing(false);
      return;
    }
    const result = data as any;
    if (!result?.ok) {
      const nextValidation = result?.validation || { ok: false, issues: result?.issues || ["Revision could not be published."] };
      setValidation(nextValidation);
      setError(result?.stale ? "The live site changed while this draft was open. Reset to Live before publishing." : "Fix the validation problems before publishing.");
      setPublishing(false);
      return;
    }
    setNotice("Changes published successfully. The previous live version was saved automatically in Revision History.");
    setPublishing(false);
    await load();
  }

  async function resetToLive() {
    if (!workspace) return;
    setSaving(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("site_editor_reset_to_live", { p_revision_id: workspace.revision.id });
    setSaving(false);
    if (rpcError) { setError(rpcError.message); return; }
    const result = data as any;
    setContent(result.content as LabSite);
    setNote("");
    setValidation(result.validation || { ok: true, issues: [] });
    setDirty(false);
    setNotice("Draft reset to the current live website.");
  }

  async function useHistory(item: HistoryItem) {
    setRestoring(item.id);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("site_editor_use_history", { p_history_id: item.id });
    setRestoring(null);
    if (rpcError) { setError(rpcError.message); return; }
    const result = data as any;
    setContent(result.content as LabSite);
    setValidation(result.validation || { ok: true, issues: [] });
    setNote(`Restore candidate from ${formatDate(item.publishedAt || item.createdAt)}`);
    setDirty(false);
    setNotice("Historical version loaded into the draft. Preview it, then Publish Changes if you want to restore it.");
    setRoute({ section: "home" });
  }

  async function copyRepairBrief() {
    const text = [
      `Repair LabNarrative site: ${workspace?.site.slug || slug}`,
      `PI: ${content?.piName || ""}`,
      `Current validation problems: ${issues.length ? issues.join("; ") : "none"}`,
      "Please inspect the live Site Editor revision and repair only the identified problem without changing unrelated scientific content or design.",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setNotice("Repair brief copied for ChatGPT.");
  }

  if (loading) return <main className={styles.statePage}>Preparing the safe revision workspace…</main>;
  if (error && !workspace) return <main className={styles.statePage}><section className={styles.stateCard}><h1>Site Editor could not open.</h1><p>{error}</p><Link href="/admin/sites">Return to Website Monitor</Link></section></main>;
  if (!workspace || !content) return null;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <Link className={styles.brand} href="/admin/sites">LabNarrative</Link>
          <span>Site Editor · {workspace.site.slug}</span>
        </div>
        <nav>
          <Link href="/admin/sites">Website Monitor</Link>
          <Link href="/admin/review">Final Review</Link>
          <Link href="/admin/sales">Sales</Link>
        </nav>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div>
            <p className={styles.kicker}>Safe repair workspace</p>
            <h1>{content.piName || content.labName || workspace.site.slug}</h1>
            <p>Edits are isolated in a draft revision. The public website changes only when <strong>Publish Changes</strong> succeeds.</p>
          </div>
          <div className={styles.meta}>
            <span>{workspace.engineV3 ? "Engine v3" : "Legacy"}</span>
            <span>Site: {workspace.site.status}</span>
            <span>Domain: {workspace.site.domainStatus || "—"}</span>
            <span>Outreach: {workspace.site.outreachStatus || "—"}</span>
          </div>
        </div>

        <section className={styles.safetyBar}>
          <div>
            <strong>{dirty ? "Unsaved edits" : "Draft saved"}</strong>
            <span>Slug and publication state are protected in this repair workspace.</span>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={() => void resetToLive()} disabled={saving || publishing}>Reset to Live</button>
            <button className={styles.secondaryButton} type="button" onClick={() => setPreviewOnly((value) => !value)}>{previewOnly ? "Back to Editor" : "Preview Revision"}</button>
            <button className={styles.secondaryButton} type="button" onClick={() => void saveDraft()} disabled={saving || publishing}>{saving ? "Saving…" : "Save Draft"}</button>
            <button className={styles.publishButton} type="button" onClick={() => void publishChanges()} disabled={publishing || saving}>{publishing ? "Publishing…" : "Publish Changes"}</button>
          </div>
        </section>

        {notice ? <p className={styles.notice}>{notice}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <section className={`${styles.validation} ${issues.length ? styles.validationBad : styles.validationGood}`}>
          <div>
            <strong>{issues.length ? `${issues.length} validation problem${issues.length === 1 ? "" : "s"}` : "Renderer contract valid"}</strong>
            <span>{issues.length ? "These must be fixed before publishing." : "This revision passes the deterministic content checks."}</span>
          </div>
          {issues.length ? <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
          <button type="button" onClick={() => void copyRepairBrief()}>Copy ChatGPT repair brief</button>
        </section>

        <section className={`${styles.workspace} ${previewOnly ? styles.previewOnly : ""}`}>
          {!previewOnly ? (
            <div className={styles.editorPane}>
              <BourdonEditor
                content={content}
                status={workspace.site.status}
                onContentChange={(next) => { setContent(safeContent(next)); setDirty(true); setNotice(""); }}
                onStatusChange={() => undefined}
                onPreviewSectionChange={(section) => setRoute({ section })}
              />
              <label className={styles.noteField}>
                <span>Revision note</span>
                <textarea rows={3} value={note} onChange={(event) => { setNote(event.target.value); setDirty(true); }} placeholder="What changed and why?" />
              </label>
            </div>
          ) : null}

          <div className={styles.previewPane}>
            <LiveSitePreview site={content} status="draft" route={route} onRouteChange={setRoute} />
          </div>
        </section>

        <section className={styles.history}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>Rollback safety</p><h2>Revision History</h2></div>
            <span>{workspace.history.length} saved versions</span>
          </div>
          {workspace.history.length === 0 ? (
            <p className={styles.empty}>No published revisions yet. The first Publish Changes action will automatically save the current live version here.</p>
          ) : (
            <div className={styles.historyList}>
              {workspace.history.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.status === "snapshot" ? "Previous live version" : "Published revision"}</strong>
                    <span>{formatDate(item.publishedAt || item.createdAt)}</span>
                    {item.note ? <p>{item.note}</p> : null}
                  </div>
                  <button type="button" onClick={() => void useHistory(item)} disabled={Boolean(restoring)}>{restoring === item.id ? "Loading…" : "Use as Draft"}</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
