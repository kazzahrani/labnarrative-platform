"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type LinkedInStatus = "not_contacted" | "message_sent" | "not_found";
type ProspectRow = {
  id: string;
  site_id: string | null;
  pi_name: string | null;
  institution: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
};
type SiteRow = { id: string; slug: string; status: string };
type LinkedInRow = { prospect_id: string; status: LinkedInStatus; profile_url: string | null };
type QueueItem = { prospectId: string; siteId: string; createdAt: string };
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
function linkedinSearchUrl(piName: string, institution: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([piName, institution].filter(Boolean).join(" "))}`;
}
function isOutside(metadata: Record<string, any> | null): boolean {
  return String(metadata?.conceptCategory || "").toLowerCase() === "outside_concept";
}

export default function LinkedInQueuePage() {
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "forbidden" | "ready">("loading");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const openItem = useCallback(async (item: QueueItem) => {
    const { data, error: rpcError } = await supabase.rpc("admin_linkedin_workspace", { p_site_id: item.siteId });
    if (rpcError || !data?.ok) throw new Error(rpcError?.message || "LinkedIn workspace could not be opened for this PI.");
    const next = data as Workspace;
    setWorkspace(next);
    setProfileUrl(next.profileUrl || "");
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true); setError(""); setNotice("");
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) { setAuthState("signed_out"); setLoading(false); return; }
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
    if (role?.role !== "admin") { setAuthState("forbidden"); setLoading(false); return; }
    setAuthState("ready");

    const [prospectResult, siteResult, linkedinResult] = await Promise.all([
      supabase.from("prospects").select("id,site_id,pi_name,institution,created_at,metadata").not("site_id", "is", null).order("created_at", { ascending: true }),
      supabase.from("sites").select("id,slug,status"),
      supabase.from("linkedin_outreach").select("prospect_id,status,profile_url"),
    ]);
    const loadError = prospectResult.error || siteResult.error || linkedinResult.error;
    if (loadError) { setError(loadError.message); setLoading(false); return; }

    const sites = new Map(((siteResult.data || []) as SiteRow[]).map(row => [row.id, row]));
    const linkedin = new Map(((linkedinResult.data || []) as LinkedInRow[]).map(row => [row.prospect_id, row.status]));
    const items = ((prospectResult.data || []) as ProspectRow[])
      .filter(row => {
        if (!row.site_id || isOutside(row.metadata)) return false;
        const site = sites.get(row.site_id);
        if (!site || site.status === "archived") return false;
        const status = linkedin.get(row.id);
        return !status || status === "not_contacted";
      })
      .map(row => ({ prospectId: row.id, siteId: row.site_id as string, createdAt: row.created_at }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.prospectId.localeCompare(b.prospectId));

    setQueue(items);
    if (!items.length) {
      setWorkspace(null);
      setProfileUrl("");
      setLoading(false);
      return;
    }
    try { await openItem(items[0]); }
    catch (err) { setError(err instanceof Error ? err.message : "LinkedIn queue could not open."); }
    setLoading(false);
  }, [openItem]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const preparedMessage = useMemo(() => workspace ? connectionNote(workspace.piName, workspace.siteSlug) : "", [workspace]);
  const findHref = workspace ? (workspace.profileUrl || linkedinSearchUrl(workspace.piName, workspace.institution)) : "#";
  const conceptHref = workspace ? conceptUrl(workspace.siteSlug) : "#";

  async function persistLinkedIn(patch: Record<string, unknown>) {
    if (!workspace) return;
    const now = new Date().toISOString();
    const update = { ...patch, updated_at: now };
    const { data, error: updateError } = await supabase.from("linkedin_outreach").update(update).eq("prospect_id", workspace.prospectId).select("prospect_id");
    if (updateError) throw updateError;
    if ((data || []).length) return;
    const { error: insertError } = await supabase.from("linkedin_outreach").insert({ prospect_id: workspace.prospectId, status: "not_contacted", ...update });
    if (insertError) throw insertError;
  }

  async function saveProfile() {
    if (!workspace || acting) return;
    const value = profileUrl.trim();
    if (value && !/^https:\/\/(www\.)?linkedin\.com\//i.test(value)) { setError("Please paste a LinkedIn profile URL."); return; }
    setActing(true); setError(""); setNotice("");
    try {
      await persistLinkedIn({ profile_url: value });
      setWorkspace({ ...workspace, profileUrl: value });
      setNotice("LinkedIn profile saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the LinkedIn profile."); }
    setActing(false);
  }

  async function advance(status: Exclude<LinkedInStatus, "not_contacted">, copyFirst: boolean) {
    if (!workspace || acting) return;
    setActing(true); setError(""); setNotice("");
    try {
      if (copyFirst) await navigator.clipboard.writeText(preparedMessage);
      await persistLinkedIn({
        status,
        last_action_at: new Date().toISOString(),
        ...(status === "message_sent" ? { connection_note: preparedMessage } : {}),
      });
      const remaining = queue.filter(item => item.prospectId !== workspace.prospectId);
      setQueue(remaining);
      if (!remaining.length) {
        setWorkspace(null);
        setProfileUrl("");
        setNotice(status === "message_sent" ? "Message copied and marked sent. LinkedIn queue complete." : "Marked Not found. LinkedIn queue complete.");
      } else {
        await openItem(remaining[0]);
        setNotice(status === "message_sent" ? "Message copied and marked sent. Next PI loaded." : "Marked Not found. Next PI loaded.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update LinkedIn outreach.");
    }
    setActing(false);
  }

  if (authState === "loading" || loading) return <main className="ln-liq-page"><section className="ln-liq-card">Preparing LinkedIn outreach queue…</section><Styles /></main>;
  if (authState === "signed_out") return <main className="ln-liq-page"><section className="ln-liq-card"><h1>Administrator sign-in required.</h1><Link href="/admin">Open dashboard</Link></section><Styles /></main>;
  if (authState === "forbidden") return <main className="ln-liq-page"><section className="ln-liq-card"><h1>Administrator permission required.</h1><Link href="/admin">Return to dashboard</Link></section><Styles /></main>;

  return <main className="ln-liq-page">
    <header className="ln-liq-topbar"><Link href="/admin/sites">← Website Monitor</Link><span>All LinkedIn outreach</span></header>
    <section className="ln-liq-card">
      <div className="ln-liq-head">
        <div><p className="ln-liq-kicker">Oldest pending first</p><h1>LinkedIn outreach queue</h1></div>
        <div className="ln-liq-count"><strong>{queue.length}</strong><span>Not contacted</span></div>
      </div>

      {notice ? <p className="ln-liq-notice">{notice}</p> : null}
      {error ? <p className="ln-liq-error">{error}</p> : null}

      {!workspace ? <section className="ln-liq-complete"><h2>Queue complete.</h2><p>There are no remaining PIs with LinkedIn status Not contacted.</p><Link href="/admin/sites">Return to Website Monitor</Link></section> : <>
        <section className="ln-liq-person">
          <div><p className="ln-liq-kicker">Current PI · oldest pending</p><h2>{workspace.piName}</h2><p>{workspace.institution || "—"}{workspace.email ? ` · ${workspace.email}` : ""}</p></div>
          <a href={conceptHref} target="_blank" rel="noreferrer">Open concept website ↗</a>
        </section>

        <section className="ln-liq-grid">
          <div className="ln-liq-panel">
            <h3>LinkedIn profile</h3>
            <input value={profileUrl} onChange={event => setProfileUrl(event.target.value)} placeholder="Paste LinkedIn profile URL (optional)" />
            <div className="ln-liq-actions"><button onClick={() => void saveProfile()} disabled={acting}>Save profile</button><a href={findHref} target="_blank" rel="noreferrer">{workspace.profileUrl ? "Open profile ↗" : "Find on LinkedIn ↗"}</a></div>
          </div>
          <div className="ln-liq-panel ln-liq-status"><h3>Status</h3><strong>Not contacted</strong><span>After either action below, the next oldest pending PI loads automatically.</span></div>
        </section>

        <section className="ln-liq-message">
          <span>Connection request note</span>
          <p>{preparedMessage}</p>
        </section>

        <div className="ln-liq-decision">
          <button className="ln-liq-notfound" disabled={acting} onClick={() => void advance("not_found", false)}>Not found → next PI</button>
          <button className="ln-liq-send" disabled={acting} onClick={() => void advance("message_sent", true)}>{acting ? "Working…" : "Copy & send → next PI"}</button>
        </div>
        <p className="ln-liq-help">“Copy & send” copies the prepared note, records LinkedIn as Message sent, and advances the queue. You still paste and send the message manually on LinkedIn.</p>
      </>}
    </section>
    <Styles />
  </main>;
}

function Styles() { return <style jsx global>{`
  .ln-liq-page{min-height:100vh;background:#0c1a23;color:#eef4f1;padding:0 24px 48px;font-family:Arial,Helvetica,sans-serif}.ln-liq-topbar{height:68px;display:flex;align-items:center;justify-content:space-between;gap:18px;max-width:1050px;margin:0 auto}.ln-liq-topbar a,.ln-liq-topbar span{color:#dce8e4;text-decoration:none;font-weight:800}.ln-liq-card{max-width:1000px;margin:20px auto 0;background:#10232d;border:1px solid #2a404a;border-radius:22px;padding:28px}.ln-liq-head,.ln-liq-person{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.ln-liq-kicker{margin:0 0 8px;color:#7fcdb7;text-transform:uppercase;letter-spacing:.12em;font-size:.7rem;font-weight:850}.ln-liq-head h1,.ln-liq-person h2{margin:0}.ln-liq-head h1{font-size:2.15rem}.ln-liq-count{display:grid;justify-items:end}.ln-liq-count strong{font-size:2rem}.ln-liq-count span,.ln-liq-person p,.ln-liq-help{color:#9aaca6}.ln-liq-person{margin-top:24px;border-top:1px solid #29434c;padding-top:22px}.ln-liq-person h2{font-size:1.7rem}.ln-liq-person p{margin:7px 0 0}.ln-liq-person>a,.ln-liq-actions a{display:inline-flex;align-items:center;border:1px solid #3b806c;border-radius:9px;background:#285e50;color:#f0f8f4;padding:9px 12px;font-size:.78rem;font-weight:850;text-decoration:none;white-space:nowrap}.ln-liq-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:14px;margin-top:18px}.ln-liq-panel,.ln-liq-message{border:1px solid #29434c;border-radius:15px;background:#0e2029;padding:18px}.ln-liq-panel h3{margin:0 0 12px;font-size:1rem}.ln-liq-panel input{width:100%;box-sizing:border-box;border:1px solid #38515e;border-radius:10px;background:#0b1820;color:#edf4f1;padding:11px;font:inherit}.ln-liq-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.ln-liq-actions button{border:1px solid #31505a;border-radius:9px;background:#142b35;color:#e6efec;padding:9px 11px;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer}.ln-liq-status{display:grid;align-content:start;gap:6px}.ln-liq-status strong{color:#91d7bf}.ln-liq-status span{color:#8fa29c;font-size:.78rem;line-height:1.45}.ln-liq-message{margin-top:14px}.ln-liq-message>span{display:block;color:#83a59b;font-size:.7rem;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.ln-liq-message p{margin-bottom:0;color:#d4e0dc;line-height:1.65;white-space:pre-line}.ln-liq-decision{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}.ln-liq-decision button{border-radius:10px;padding:11px 14px;font:inherit;font-size:.82rem;font-weight:900;cursor:pointer}.ln-liq-notfound{border:1px solid #46565b;background:transparent;color:#aebbb7}.ln-liq-send{border:1px solid #3d8b71;background:#276451;color:#f1faf6}.ln-liq-decision button:disabled{opacity:.55;cursor:wait}.ln-liq-help{margin:10px 0 0;font-size:.76rem;line-height:1.5;text-align:right}.ln-liq-notice,.ln-liq-error{padding:10px 12px;border-radius:10px;font-size:.82rem}.ln-liq-notice{background:#14352e;border:1px solid #316a5b;color:#a8e7d3}.ln-liq-error{background:#3a2022;border:1px solid #744247;color:#ffc2c5}.ln-liq-complete{margin-top:24px;border:1px solid #29434c;border-radius:15px;background:#0e2029;padding:24px}.ln-liq-complete h2{margin-top:0}.ln-liq-complete p{color:#9aaca6}.ln-liq-complete a{color:#9de3ce;font-weight:800;text-decoration:none}@media(max-width:760px){.ln-liq-page{padding:0 14px 34px}.ln-liq-card{padding:20px}.ln-liq-grid{grid-template-columns:1fr}.ln-liq-head,.ln-liq-person{display:grid}.ln-liq-count{justify-items:start}.ln-liq-decision{justify-content:stretch}.ln-liq-decision button{flex:1}.ln-liq-help{text-align:left}}
`}</style>; }
