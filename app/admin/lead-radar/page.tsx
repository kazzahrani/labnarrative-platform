"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";
import styles from "./lead-radar.module.css";

type Lead = {
  id: string;
  source: string;
  source_url: string | null;
  trigger_date: string | null;
  pi_name: string;
  pi_title: string | null;
  pi_count: number;
  institution: string | null;
  department: string | null;
  project_title: string;
  activity_code: string | null;
  award_amount: number | null;
  project_start_date: string | null;
  discovery_score: number;
  discovery_reasons: Array<{ signal?: string; points?: number; detail?: string }>;
  website_status: string;
  website_url: string | null;
  website_opportunity_score: number | null;
  recruiting_status: string;
  contact_status: string;
  preferred_email: string | null;
  contact_confidence_score: number | null;
  final_score: number | null;
  qualification_status: string;
  manual_notes: string | null;
  updated_at: string;
};

type ScanRun = {
  id: string;
  status: string;
  records_fetched: number;
  records_upserted: number;
  priority_count: number;
  started_at: string;
  completed_at: string | null;
  error_text: string | null;
  params: Record<string, unknown>;
};

const stages = [
  "all",
  "enrichment_queue",
  "ready_for_review",
  "ready_for_contact",
  "hold",
  "contacted",
  "replied",
  "interested",
  "proposal",
  "won",
] as const;

function money(value: number | null) {
  if (!value) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function ageLabel(value: string | null) {
  if (!value) return "Unknown date";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value + "T00:00:00Z").getTime()) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function Wordmark() { return <><span>Lab</span>Narrative</>; }

export default function ScientificLeadRadarPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<(typeof stages)[number]>("enrichment_queue");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [lookback, setLookback] = useState(90);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const { data: adminResult, error: adminError } = await supabase.rpc("is_labnarrative_admin");
    if (adminError || !adminResult) {
      setIsAdmin(false);
      setNotice(adminError?.message || "Administrator access required.");
      setLoading(false);
      return;
    }
    setIsAdmin(true);

    const [leadResult, runResult] = await Promise.all([
      supabase
        .from("scientific_lead_radar_leads")
        .select("id,source,source_url,trigger_date,pi_name,pi_title,pi_count,institution,department,project_title,activity_code,award_amount,project_start_date,discovery_score,discovery_reasons,website_status,website_url,website_opportunity_score,recruiting_status,contact_status,preferred_email,contact_confidence_score,final_score,qualification_status,manual_notes,updated_at")
        .order("discovery_score", { ascending: false })
        .order("trigger_date", { ascending: false })
        .limit(1000),
      supabase
        .from("scientific_lead_radar_runs")
        .select("id,status,records_fetched,records_upserted,priority_count,started_at,completed_at,error_text,params")
        .order("started_at", { ascending: false })
        .limit(12),
    ]);
    const error = leadResult.error || runResult.error;
    if (error) setNotice(error.message);
    setLeads((leadResult.data || []) as Lead[]);
    setRuns((runResult.data || []) as ScanRun[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void load();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
      if (next) void load();
      else setIsAdmin(false);
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const scan = async () => {
    setScanning(true);
    setNotice("");
    const { data, error } = await supabase.functions.invoke("scientific-lead-radar", {
      body: { action: "scan_nih", lookback_days: lookback, max_pages: 4, min_award: 250000 },
    });
    if (error) setNotice(error.message);
    else if (data?.error) setNotice(data.error);
    else setNotice(`NIH scan complete: ${data?.records_upserted ?? 0} leads loaded, ${data?.priority_count ?? 0} sent to enrichment.`);
    await load();
    setScanning(false);
  };

  const updateLead = async (lead: Lead, patch: Partial<Lead>) => {
    setNotice("");
    const { error } = await supabase
      .from("scientific_lead_radar_leads")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (error) { setNotice(error.message); return; }
    const { error: scoreError } = await supabase.rpc("scientific_lead_radar_recalculate", { p_lead_id: lead.id });
    if (scoreError) { setNotice(scoreError.message); return; }
    await load();
    const { data } = await supabase
      .from("scientific_lead_radar_leads")
      .select("*")
      .eq("id", lead.id)
      .maybeSingle();
    if (data) setSelected(data as Lead);
  };

  const metrics = useMemo(() => ({
    total: leads.length,
    enrich: leads.filter((x) => x.qualification_status === "enrichment_queue").length,
    review: leads.filter((x) => x.qualification_status === "ready_for_review").length,
    contact: leads.filter((x) => x.qualification_status === "ready_for_contact").length,
    interested: leads.filter((x) => ["interested","proposal","won"].includes(x.qualification_status)).length,
    won: leads.filter((x) => x.qualification_status === "won").length,
  }), [leads]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (stage !== "all" && lead.qualification_status !== stage) return false;
      if (!q) return true;
      return [lead.pi_name,lead.institution,lead.department,lead.project_title,lead.activity_code]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    }).slice(0, 250);
  }, [leads, search, stage]);

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Lead Radar…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Scientific admin session required.</h1><p>Sign in through the LabNarrative admin, then return here.</p><Link href="/admin">Go to admin →</Link></div></main>;
  if (!isAdmin) return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  const latestRun = runs[0];

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/admin/websites" className={styles.wordmark}><Wordmark /></Link>
        <span className={styles.branch}>SCIENTIFIC LEAD RADAR</span>
        <div className={styles.topActions}>
          <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
          <button onClick={() => void scan()} disabled={scanning}>{scanning ? "Scanning NIH…" : "Scan NIH now"}</button>
          <button className={styles.secondary} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Trigger-driven scientific acquisition</p>
          <h1>Find the labs with a <em>reason to buy now.</em></h1>
        </div>
        <div className={styles.heroAside}>
          <p>V0 starts with new NIH awards. It scans recent funding at scale, scores timing + money + grant type, and only sends the strongest records into enrichment. No outreach is allowed until website and contact evidence are added.</p>
          <div className={styles.sourceBadge}><span>LIVE SOURCE</span><strong>NIH RePORTER V2 · new awards · $250k+</strong></div>
        </div>
      </section>

      <section className={styles.metrics}>
        <article><span>Loaded</span><strong>{metrics.total}</strong><small>current lead records</small></article>
        <article><span>Enrichment queue</span><strong>{metrics.enrich}</strong><small>website + contact research</small></article>
        <article><span>Ready review</span><strong>{metrics.review}</strong><small>evidence sufficiently strong</small></article>
        <article><span>Ready contact</span><strong>{metrics.contact}</strong><small>verified + score ≥70</small></article>
        <article><span>Interested</span><strong>{metrics.interested}</strong><small>reply → proposal → won</small></article>
        <article><span>Won</span><strong>{metrics.won}</strong><small>paying scientific clients</small></article>
      </section>

      {notice ? <div className={styles.notice}>{notice}</div> : null}

      <section className={styles.runStrip}>
        <div><span>LAST SCAN</span><strong>{latestRun ? new Date(latestRun.started_at).toLocaleString() : "Not run yet"}</strong></div>
        <div><span>FETCHED</span><strong>{latestRun?.records_fetched ?? 0}</strong></div>
        <div><span>UPSERTED</span><strong>{latestRun?.records_upserted ?? 0}</strong></div>
        <div><span>PRIORITY</span><strong>{latestRun?.priority_count ?? 0}</strong></div>
        <div><span>STATUS</span><strong>{latestRun?.status ?? "—"}</strong></div>
      </section>

      <section className={styles.queueSection}>
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>QUALIFIED PIPELINE</p><h2>Funding-triggered opportunities.</h2></div>
          <div className={styles.filters}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PI, institution, project…" />
            <select value={stage} onChange={(e) => setStage(e.target.value as (typeof stages)[number])}>
              {stages.map((item) => <option key={item} value={item}>{item.replaceAll("_"," ")}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Score</th><th>PI / institution</th><th>Trigger</th><th>Award</th><th>Website</th><th>Contact</th><th>Stage</th><th/></tr></thead>
            <tbody>
              {visible.map((lead) => <tr key={lead.id}>
                <td><span className={lead.discovery_score >= 75 ? styles.scoreHigh : styles.score}>{lead.discovery_score}</span><small>discovery</small></td>
                <td><strong>{lead.pi_name}</strong><small>{lead.institution || "Institution unknown"}{lead.department ? ` · ${lead.department}` : ""}</small><p>{lead.project_title}</p></td>
                <td><b>{lead.activity_code || "NIH"}</b><small>{ageLabel(lead.trigger_date)}</small></td>
                <td><b>{money(lead.award_amount)}</b><small>{lead.project_start_date ? `Starts ${lead.project_start_date}` : "Start unknown"}</small></td>
                <td><span className={styles.state}>{lead.website_status.replaceAll("_"," ")}</span>{lead.website_opportunity_score !== null ? <small>{lead.website_opportunity_score}/100 opportunity</small> : null}</td>
                <td><span className={styles.state}>{lead.contact_status}</span>{lead.preferred_email ? <small>{lead.preferred_email}</small> : null}</td>
                <td><span className={styles.stage}>{lead.qualification_status.replaceAll("_"," ")}</span>{lead.final_score !== null ? <small>Final {lead.final_score}</small> : null}</td>
                <td><button className={styles.openButton} onClick={() => setSelected(lead)}>Open</button></td>
              </tr>)}
            </tbody>
          </table>
          {!visible.length ? <div className={styles.empty}>No leads in this view yet. Run the NIH scan or change the stage filter.</div> : null}
        </div>
      </section>
    </div>

    {selected ? <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
      <aside className={styles.drawer}>
        <div className={styles.drawerTop}><div><span>LEAD EVIDENCE</span><h2>{selected.pi_name}</h2><p>{selected.institution}</p></div><button onClick={() => setSelected(null)}>×</button></div>

        <div className={styles.projectCard}><span>{selected.activity_code || "NIH"} · {money(selected.award_amount)} · {ageLabel(selected.trigger_date)}</span><h3>{selected.project_title}</h3>{selected.source_url ? <a href={selected.source_url} target="_blank" rel="noreferrer">Open NIH record ↗</a> : null}</div>

        <div className={styles.reasonList}><h3>Why it entered the queue</h3>{(selected.discovery_reasons || []).map((reason, i) => <div key={i}><b>+{reason.points ?? 0}</b><span>{reason.detail || reason.signal}</span></div>)}</div>

        <div className={styles.editGrid}>
          <label>Website status<select value={selected.website_status} onChange={(e) => setSelected({ ...selected, website_status: e.target.value })}><option value="unknown">Unknown</option><option value="none">No dedicated site</option><option value="institution_only">Institution profile only</option><option value="weak">Weak / outdated</option><option value="adequate">Adequate</option><option value="strong">Strong modern site</option></select></label>
          <label>Website opportunity score<input type="number" min="0" max="100" value={selected.website_opportunity_score ?? ""} onChange={(e) => setSelected({ ...selected, website_opportunity_score: e.target.value === "" ? null : Number(e.target.value) })}/></label>
          <label className={styles.full}>Website URL<input value={selected.website_url ?? ""} onChange={(e) => setSelected({ ...selected, website_url: e.target.value })} placeholder="https://…"/></label>
          <label>Recruiting<select value={selected.recruiting_status} onChange={(e) => setSelected({ ...selected, recruiting_status: e.target.value })}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label>Contact status<select value={selected.contact_status} onChange={(e) => setSelected({ ...selected, contact_status: e.target.value })}><option value="unknown">Unknown</option><option value="found">Found</option><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="missing">Missing</option></select></label>
          <label className={styles.full}>Preferred email<input value={selected.preferred_email ?? ""} onChange={(e) => setSelected({ ...selected, preferred_email: e.target.value })} placeholder="PI or project contact"/></label>
          <label>Contact confidence<input type="number" min="0" max="100" value={selected.contact_confidence_score ?? ""} onChange={(e) => setSelected({ ...selected, contact_confidence_score: e.target.value === "" ? null : Number(e.target.value) })}/></label>
          <label className={styles.full}>Notes<textarea value={selected.manual_notes ?? ""} onChange={(e) => setSelected({ ...selected, manual_notes: e.target.value })} placeholder="Only evidence-backed notes."/></label>
        </div>

        <div className={styles.drawerActions}>
          <button onClick={() => void updateLead(selected, {
            website_status: selected.website_status,
            website_url: selected.website_url,
            website_opportunity_score: selected.website_opportunity_score,
            recruiting_status: selected.recruiting_status,
            contact_status: selected.contact_status,
            preferred_email: selected.preferred_email,
            contact_confidence_score: selected.contact_confidence_score,
            manual_notes: selected.manual_notes,
          })}>Save + recalculate</button>
          <button className={styles.secondary} onClick={() => setSelected(null)}>Close</button>
        </div>
      </aside>
    </div> : null}
  </main>;
}
