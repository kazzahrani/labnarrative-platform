"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type LinkedInStatus = "not_contacted" | "message_sent" | "not_found";
type Workspace = {
  ok: boolean;
  siteId: string;
  siteSlug: string;
  prospectId: string;
  piName: string;
  institution: string;
  email: string;
  researchArea: string;
  profileUrl: string;
  status: LinkedInStatus;
  connectionNote: string;
  lastActionAt: string | null;
  updatedAt: string | null;
};

const STATUS_OPTIONS: Array<{ value: LinkedInStatus; label: string }> = [
  { value: "not_contacted", label: "Not connected" },
  { value: "message_sent", label: "Message sent" },
  { value: "not_found", label: "Not found" },
];

function familyName(piName: string): string {
  const cleaned = piName.replace(/\b(Professor|Prof\.?|Doctor|Dr\.?|Ph\.?D\.?|DPhil|M\.?D\.?|MD|FRS|FMedSci|MBA|MSc|MS)\b/gi, " ").replace(/[,.()]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.split(" ").filter(Boolean).at(-1) || "Professor";
}
function conceptUrl(siteSlug: string): string {
  return `https://${siteSlug}.labnarrative.com`;
}
function connectionNote(piName: string, siteSlug: string): string {
  const url = conceptUrl(siteSlug);
  return `Dear Professor ${familyName(piName)}, I recently sent you a website concept I prepared for your laboratory. You can view it here:\n\n${url}\n\nI’m also a molecular oncology researcher working in p53 and cell-cycle biology, so I wanted to connect here as well.\n\nBest wishes,\nKhaled`;
}
function followUpMessage(piName: string): string {
  return `Thank you for connecting, Professor ${familyName(piName)}. I hope you had a chance to see the laboratory website concept I sent. I’d be very interested to hear what you think of the direction.`;
}
function linkedinSearchUrl(piName: string, institution: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([piName, institution].filter(Boolean).join(" "))}`;
}

export default function LinkedInWorkspacePage() {
  const params = useParams<{ siteId: string }>();
  const searchParams = useSearchParams();
  const siteId = String(params?.siteId || "");
  const followUpMode = searchParams.get("mode") === "followup";
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true); setError(""); setNotice("");
    const { data, error: rpcError } = await supabase.rpc("admin_linkedin_workspace", { p_site_id: siteId });
    if (rpcError || !data?.ok) {
      setError(rpcError?.message || "LinkedIn workspace could not be opened for this PI.");
      setLoading(false); return;
    }
    const next = data as Workspace;
    setWorkspace(next); setProfileUrl(next.profileUrl || ""); setLoading(false);
  }, [siteId]);

  useEffect(() => { void load(); }, [load]);

  const connection = useMemo(() => workspace ? connectionNote(workspace.piName, workspace.siteSlug) : "", [workspace]);
  const followUp = useMemo(() => workspace ? followUpMessage(workspace.piName) : "", [workspace]);
  const preparedMessage = followUpMode ? followUp : connection;

  async function saveProfile() {
    if (!workspace || saving) return;
    const value = profileUrl.trim();
    if (value && !/^https:\/\/(www\.)?linkedin\.com\//i.test(value)) { setError("Please paste a LinkedIn profile URL."); return; }
    setSaving(true); setError(""); setNotice("");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("linkedin_outreach").update({ profile_url: value, updated_at: now }).eq("prospect_id", workspace.prospectId);
    if (updateError) setError(updateError.message); else { setWorkspace({ ...workspace, profileUrl: value, updatedAt: now }); setNotice("LinkedIn profile saved."); }
    setSaving(false);
  }

  async function updateStatus(status: LinkedInStatus) {
    if (!workspace || saving) return;
    setSaving(true); setError(""); setNotice("");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("linkedin_outreach").update({ status, last_action_at: now, updated_at: now }).eq("prospect_id", workspace.prospectId);
    if (updateError) setError(updateError.message); else { setWorkspace({ ...workspace, status, lastActionAt: now, updatedAt: now }); setNotice(`LinkedIn status updated to ${STATUS_OPTIONS.find(x => x.value === status)?.label}.`); }
    setSaving(false);
  }

  async function copyPreparedMessage() {
    try { await navigator.clipboard.writeText(preparedMessage); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setError("Clipboard access was unavailable. Select and copy the text manually."); }
  }

  if (loading) return <main className="ln-li-page"><section className="ln-li-card">Preparing LinkedIn outreach…</section><Styles /></main>;
  if (error && !workspace) return <main className="ln-li-page"><section className="ln-li-card"><h1>LinkedIn outreach could not open.</h1><p>{error}</p><Link href="/admin/sites">← Back to Website Monitor</Link></section><Styles /></main>;
  if (!workspace) return null;

  const findHref = workspace.profileUrl || linkedinSearchUrl(workspace.piName, workspace.institution);
  const conceptHref = conceptUrl(workspace.siteSlug);

  return <main className="ln-li-page">
    <header className="ln-li-topbar"><Link href="/admin/sites">← Website Monitor</Link><span>{followUpMode ? "LinkedIn Follow-up" : "LinkedIn Outreach"}</span></header>
    <section className="ln-li-card">
      <p className="ln-li-kicker">{followUpMode ? "Manual LinkedIn follow-up" : "Manual LinkedIn workspace"}</p>
      <h1>{workspace.piName}</h1>
      <p className="ln-li-meta">{workspace.institution || "—"}{workspace.email ? ` · ${workspace.email}` : ""}</p>
      <p className="ln-li-help">{followUpMode ? "Use the prepared follow-up message below. You still send everything yourself on LinkedIn." : "Find the PI, copy the prepared connection note, send it yourself on LinkedIn, then update the status here."}</p>
      <div className="ln-li-concept"><a href={conceptHref} target="_blank" rel="noreferrer">Open concept website ↗</a></div>

      {notice ? <p className="ln-li-notice">{notice}</p> : null}
      {error ? <p className="ln-li-error">{error}</p> : null}

      <div className="ln-li-grid">
        <section className="ln-li-panel">
          <h2>LinkedIn profile</h2>
          <input value={profileUrl} onChange={e => setProfileUrl(e.target.value)} placeholder="Paste LinkedIn profile URL" />
          <div className="ln-li-actions"><button onClick={() => void saveProfile()} disabled={saving}>Save profile</button><a href={findHref} target="_blank" rel="noreferrer">{workspace.profileUrl ? "Open profile ↗" : "Find on LinkedIn ↗"}</a></div>
        </section>

        <section className="ln-li-panel">
          <h2>Status</h2>
          <select value={workspace.status} onChange={e => void updateStatus(e.target.value as LinkedInStatus)} disabled={saving}>
            {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </section>
      </div>

      <section className="ln-li-message">
        <span>{followUpMode ? "LinkedIn follow-up message" : "Connection request note"}</span>
        <p>{preparedMessage}</p>
        <button onClick={() => void copyPreparedMessage()}>{copied ? "✓ Copied" : followUpMode ? "Copy follow-up" : "Copy connection note"}</button>
      </section>

      <div className="ln-li-return"><Link href="/admin/sites">← Return to Website Monitor</Link></div>
    </section>
    <Styles />
  </main>;
}

function Styles() { return <style jsx global>{`
  .ln-li-page{min-height:100vh;background:#0c1a23;color:#eef4f1;padding:0 24px 48px;font-family:Arial,Helvetica,sans-serif}.ln-li-topbar{height:68px;display:flex;align-items:center;gap:18px;max-width:1050px;margin:0 auto}.ln-li-topbar a,.ln-li-topbar span{color:#dce8e4;text-decoration:none;font-weight:800}.ln-li-card{max-width:1000px;margin:20px auto 0;background:#10232d;border:1px solid #2a404a;border-radius:22px;padding:28px}.ln-li-kicker{margin:0 0 8px;color:#7fcdb7;text-transform:uppercase;letter-spacing:.12em;font-size:.7rem;font-weight:850}.ln-li-card h1{margin:0;font-size:2.25rem}.ln-li-meta,.ln-li-help{color:#9aaca6}.ln-li-help{max-width:760px;line-height:1.55}.ln-li-concept{display:flex;margin-top:12px}.ln-li-concept a{display:inline-flex;align-items:center;border:1px solid #3b806c;border-radius:9px;background:#285e50;color:#f0f8f4;padding:9px 12px;font-size:.78rem;font-weight:850;text-decoration:none}.ln-li-concept a:hover{background:#32715f;border-color:#4d987f;color:#fff}.ln-li-grid{display:grid;grid-template-columns:1.4fr .8fr;gap:14px;margin-top:24px}.ln-li-panel,.ln-li-message{border:1px solid #29434c;border-radius:15px;background:#0e2029;padding:18px}.ln-li-panel h2{margin:0 0 12px;font-size:1rem}.ln-li-panel input,.ln-li-panel select{width:100%;box-sizing:border-box;border:1px solid #38515e;border-radius:10px;background:#0b1820;color:#edf4f1;padding:11px;font:inherit}.ln-li-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.ln-li-actions button,.ln-li-actions a,.ln-li-message button{border:1px solid #31505a;border-radius:9px;background:#142b35;color:#e6efec;padding:9px 11px;font:inherit;font-size:.78rem;font-weight:800;text-decoration:none;cursor:pointer}.ln-li-actions a{background:#285e50;border-color:#3b806c}.ln-li-message{margin-top:14px}.ln-li-message span{display:block;color:#83a59b;font-size:.7rem;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.ln-li-message p{color:#d4e0dc;line-height:1.6;white-space:pre-line}.ln-li-message button{color:#9de3ce}.ln-li-return{display:flex;justify-content:flex-start;margin-top:18px}.ln-li-return a{display:inline-flex;align-items:center;border:1px solid #38515e;border-radius:9px;background:#142b35;color:#dce8e4;padding:10px 13px;font-size:.78rem;font-weight:850;text-decoration:none}.ln-li-return a:hover{border-color:#527180;background:#19333e;color:#fff}.ln-li-notice,.ln-li-error{padding:10px 12px;border-radius:10px;font-size:.82rem}.ln-li-notice{background:#14352e;border:1px solid #316a5b;color:#a8e7d3}.ln-li-error{background:#3a2022;border:1px solid #744247;color:#ffc2c5}@media(max-width:760px){.ln-li-grid{grid-template-columns:1fr}.ln-li-card{padding:20px}.ln-li-page{padding:0 14px 34px}}
`}</style>; }
