"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./systems.module.css";

type Prospect = {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  demo_status: string;
  fit_score: number;
  industry: string | null;
  city: string | null;
  country: string | null;
  contacted_at: string | null;
  replied_at: string | null;
  updated_at: string;
  demo_config: Record<string, unknown> | null;
};

type StageInfo = { label: string; detail: string; href: string; action: string; order: number };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const modules = [
  { key: "acquisition", n: "01", title: "Acquisition", text: "Prospects, contacts, LinkedIn, email and the human send gate.", href: "/admin/systems-outreach" },
  { key: "discovery", n: "02", title: "Discovery", text: "Capture confirmed pains, current systems, management needs and next action.", href: "/admin/systems-outreach/discovery" },
  { key: "demo", n: "03", title: "Demo V2", text: "Turn confirmed discovery into a more relevant operational demo.", href: "/admin/systems-outreach/discovery/demo-v2" },
  { key: "pilot", n: "04", title: "Pilot Proposal", text: "Build and approve the focused SAR 7,500 paid Pilot.", href: "/admin/systems-outreach/discovery/pilot" },
  { key: "delivery", n: "05", title: "Pilot Delivery", text: "Scope lock, kickoff, build, testing, evidence and acceptance.", href: "/admin/systems-outreach/delivery" },
  { key: "conversion", n: "06", title: "Full-System Conversion", text: "Convert proven Pilot value into the production implementation.", href: "/admin/systems-outreach/conversion" },
  { key: "pricing", n: "07", title: "Pricing Architecture", text: "Internal implementation ranges, integrations and production subscription.", href: "/admin/systems-outreach/discovery/commercial" },
  { key: "group", n: "08", title: "Group Architecture", text: "Multiple companies, branches, permissions and consolidated management.", href: "/admin/systems-outreach/discovery/group" },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
function asNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function dateLabel(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

function getSprint(config: Record<string, unknown> | null) {
  const root = asObject(config);
  const candidates = [root.acquisitionSprint, root.acquisition_sprint, root.acquisition, root.sprint].map(asObject);
  const sprint = candidates.find((item) => Object.keys(item).length) ?? {};
  return {
    rank: asNumber(sprint.rank || sprint.rankNo || sprint.rank_no),
    batch: asNumber(sprint.batch || sprint.batchNo || sprint.batch_no),
    score: asNumber(sprint.acquisitionScore || sprint.acqScore || sprint.acquisition_score),
    channel: asString(sprint.channel || sprint.recommendedChannel),
    contact: asString(sprint.primaryContact || sprint.contactName || sprint.contact_name),
  };
}

function stageFor(prospect: Prospect): StageInfo {
  const config = asObject(prospect.demo_config);
  const discovery = asObject(config.discovery);
  const demoV2 = asObject(config.demoV2 || config.demo_v2);
  const pilot = asObject(config.pilotProposal || config.pilot_proposal);
  const delivery = asObject(config.pilotDelivery || config.pilot_delivery);
  const conversion = asObject(config.fullSystemConversion || config.full_system_conversion);
  const phase = asString(discovery.phase);
  const deliveryStage = asString(delivery.stage);
  const conversionStatus = asString(conversion.status);
  const pilotStatus = asString(pilot.status);

  if (conversionStatus === "approved" || conversionStatus === "sent") return { label: "Full-System Conversion", detail: conversionStatus === "sent" ? "Production proposal sent" : "Production proposal approved", href: "/admin/systems-outreach/conversion", action: "Open Conversion", order: 8 };
  if (asString(delivery.acceptance) === "accepted" || deliveryStage === "conversion") return { label: "Pilot Accepted", detail: "Ready to scope production conversion", href: "/admin/systems-outreach/conversion", action: "Prepare Full System", order: 7 };
  if (prospect.status === "won" || (deliveryStage && deliveryStage !== "planning")) return { label: "Pilot Delivery", detail: deliveryStage ? deliveryStage.replaceAll("_", " ") : "Pilot won — ready to start", href: "/admin/systems-outreach/delivery", action: "Open Delivery", order: 6 };
  if (pilotStatus === "sent" || prospect.status === "proposal") return { label: "Pilot Proposed", detail: "Waiting for Pilot decision", href: "/admin/systems-outreach/discovery/pilot", action: "Open Pilot", order: 5 };
  if (pilotStatus === "approved" || pilotStatus === "draft" || phase === "internal_review") return { label: "Internal Review", detail: "Review Demo V2 and Pilot scope", href: "/admin/systems-outreach/discovery/pilot", action: "Prepare Pilot", order: 4 };
  if (Object.keys(demoV2).length || prospect.status === "interested" || phase === "demo_v2") return { label: "Demo V2", detail: "Tailored demo based on discovery", href: "/admin/systems-outreach/discovery/demo-v2", action: "Open Demo V2", order: 3 };
  if (Object.keys(discovery).length || prospect.status === "replied") return { label: "Discovery", detail: "Capture the real workflow and pains", href: "/admin/systems-outreach/discovery", action: "Continue Discovery", order: 2 };
  return { label: prospect.status === "ready_to_send" ? "Teaser Ready" : "Acquisition", detail: prospect.status.replaceAll("_", " "), href: "/admin/systems-outreach", action: "Open Acquisition", order: 1 };
}

function prospectHref(base: string, prospect: Prospect) {
  if (base === "/admin/systems-outreach") return base;
  return `${base}?prospect=${encodeURIComponent(prospect.id)}`;
}

export default function SystemsHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true); setNotice("");
    const { data: roleRow, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", activeSession.user.id).maybeSingle();
    if (roleError || roleRow?.role !== "admin") {
      setRole(roleRow?.role ?? null); setNotice(roleError?.message ?? "Administrator access required."); setLoading(false); return;
    }
    setRole("admin");
    const { data, error } = await supabase.from("systems_outreach_prospects").select("id,company_name,slug,status,demo_status,fit_score,industry,city,country,contacted_at,replied_at,updated_at,demo_config").order("updated_at", { ascending: false });
    if (error) { setNotice(error.message); setLoading(false); return; }
    const next = (data ?? []) as Prospect[];
    setProspects(next);
    setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next.find((item) => item.status === "interested")?.id ?? next.find((item) => item.status === "ready_to_send")?.id ?? next[0]?.id ?? ""));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); if (data.session) void load(data.session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); if (next) void load(next); });
    return () => subscription.unsubscribe();
  }, [load]);

  const selected = prospects.find((item) => item.id === selectedId) ?? null;
  const selectedStage = selected ? stageFor(selected) : null;
  const selectedConfig = selected ? asObject(selected.demo_config) : {};
  const selectedDiscovery = asObject(selectedConfig.discovery);
  const nextAction = asString(selectedDiscovery.nextAction) || (selectedStage ? selectedStage.detail : "");
  const selectedSprint = selected ? getSprint(selected.demo_config) : null;

  const metrics = useMemo(() => ({
    total: prospects.length,
    ready: prospects.filter((p) => p.status === "ready_to_send").length,
    discovery: prospects.filter((p) => p.status === "replied").length,
    demoV2: prospects.filter((p) => p.status === "interested").length,
    proposed: prospects.filter((p) => p.status === "proposal").length,
    won: prospects.filter((p) => p.status === "won").length,
  }), [prospects]);

  const sprintProspects = useMemo(() => prospects.map((p) => ({ p, sprint: getSprint(p.demo_config) })).filter((x) => x.sprint.rank > 0).sort((a, b) => a.sprint.rank - b.sprint.rank).slice(0, 10), [prospects]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((p) => !q || [p.company_name, p.industry, p.city, p.country, p.status].filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0, 50);
  }, [prospects, search]);

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing LabNarrative Systems…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>LabNarrative Systems · operating platform</p><h1>One platform from first prospect to full-system conversion.</h1><p className={styles.lead}>Research, outreach, discovery, tailored demos, paid Pilots, delivery, pricing and group expansion are now connected from one command center.</p></div>
      <div className={styles.heroActions}><Link href="/admin/systems-outreach" className={styles.primary}>Open Acquisition</Link><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "Refreshing…" : "Refresh platform"}</button></div>
    </header>

    <section className={styles.metrics}>
      <article><span>Total prospects</span><strong>{metrics.total}</strong></article>
      <article><span>Teaser ready</span><strong>{metrics.ready}</strong></article>
      <article><span>Discovery</span><strong>{metrics.discovery}</strong></article>
      <article><span>Demo V2</span><strong>{metrics.demoV2}</strong></article>
      <article><span>Pilot proposed</span><strong>{metrics.proposed}</strong></article>
      <article><span>Pilot won</span><strong>{metrics.won}</strong></article>
    </section>

    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.flow}>
      {modules.slice(0, 6).map((module, index) => <div key={module.key} className={styles.flowItem}><span>{module.n}</span><b>{module.title}</b>{index < 5 ? <i>→</i> : null}</div>)}
    </section>

    <section className={styles.commandLayout}>
      <aside className={styles.prospectRail}>
        <div className={styles.railHead}><div><span>Prospect command</span><strong>{prospects.length}</strong></div></div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company…" />
        <div className={styles.prospectList}>{visible.map((p) => {
          const stage = stageFor(p); const sprint = getSprint(p.demo_config);
          return <button key={p.id} onClick={() => setSelectedId(p.id)} className={p.id === selectedId ? styles.activeProspect : ""}><span><strong>{p.company_name}</strong><b>{p.fit_score}</b></span><small>{stage.label}{sprint.rank ? ` · Sprint #${sprint.rank}` : ""}</small></button>;
        })}</div>
      </aside>

      <section className={styles.command}>{selected && selectedStage ? <>
        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.stageBadge}><span>Current stage</span><strong>{selectedStage.label}</strong><small>Updated {dateLabel(selected.updated_at)}</small></div></div>

        <div className={styles.nextAction}><div><span>Recommended next action</span><strong>{nextAction || selectedStage.detail}</strong></div><Link href={prospectHref(selectedStage.href, selected)}>{selectedStage.action} →</Link></div>

        {selectedSprint?.rank ? <div className={styles.sprintStrip}><span>Acquisition Sprint</span><b>Rank #{selectedSprint.rank}</b><b>Batch {selectedSprint.batch || "—"}</b><b>Score {selectedSprint.score || "—"}</b>{selectedSprint.channel ? <b>{selectedSprint.channel}</b> : null}{selectedSprint.contact ? <em>{selectedSprint.contact}</em> : null}</div> : null}

        <div className={styles.moduleGrid}>{modules.map((module) => {
          const isCurrent = selectedStage.href === module.href;
          return <Link key={module.key} href={prospectHref(module.href, selected)} className={isCurrent ? styles.currentModule : ""}><span>{module.n}</span><div><strong>{module.title}</strong><p>{module.text}</p></div><b>Open →</b></Link>;
        })}</div>

        <div className={styles.quickLinks}>
          {selected.demo_status === "ready" ? <a href={`/systems/demos/${selected.slug}`} target="_blank" rel="noreferrer">Open client demo ↗</a> : <span>Client demo not ready</span>}
          <a href={`/systems/proposals/${selected.slug}`} target="_blank" rel="noreferrer">Pilot proposal page ↗</a>
          <a href={`/systems/proposals/${selected.slug}/full`} target="_blank" rel="noreferrer">Full-system proposal page ↗</a>
        </div>
      </> : <div className={styles.empty}>Select a prospect to open its complete Systems lifecycle.</div>}</section>
    </section>

    <section className={styles.bottomGrid}>
      <article className={styles.sprintCard}><div className={styles.sectionHead}><div><p>Current acquisition sprint</p><h2>Top 10 NSC-like opportunities</h2></div><Link href="/admin/systems-outreach">Open acquisition →</Link></div>{sprintProspects.length ? <div className={styles.rankList}>{sprintProspects.map(({ p, sprint }) => <button key={p.id} onClick={() => setSelectedId(p.id)}><span>#{sprint.rank}</span><div><strong>{p.company_name}</strong><small>Batch {sprint.batch || "—"} · {sprint.channel || "human send"}</small></div><b>{sprint.score || p.fit_score}</b></button>)}</div> : <p className={styles.muted}>No ranked sprint metadata found yet. Acquisition itself remains available.</p>}</article>

      <article className={styles.architectureCard}><p>Platform architecture</p><h2>Modular underneath. Unified for you.</h2><div className={styles.architectureSteps}><span>One prospect record</span><i>→</i><span>One demo_config lifecycle</span><i>→</i><span>Human gates</span><i>→</i><span>Production conversion</span></div><p className={styles.muted}>The tools remain separate modules so they stay stable, but this home screen connects them as one operating platform. No outreach, proposal approval, Pilot start or expansion sale happens automatically.</p><div className={styles.supportLinks}><Link href="/admin/systems-outreach/discovery/commercial">Pricing Architecture</Link><Link href="/admin/systems-outreach/discovery/group">Group Architecture</Link></div></article>
    </section>
  </div></main>;
}
