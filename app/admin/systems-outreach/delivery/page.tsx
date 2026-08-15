"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./delivery.module.css";

type Prospect = {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  demo_status: string;
  demo_config: Record<string, unknown> | null;
  fit_score: number;
  industry: string | null;
  city: string | null;
  country: string | null;
};

type DeliveryStage = "planning" | "scope_lock" | "kickoff" | "access_data" | "build" | "client_testing" | "success_review" | "acceptance" | "conversion";
type Acceptance = "not_ready" | "pending" | "accepted" | "changes_requested";
type ConversionDecision = "not_discussed" | "full_system" | "extend_pilot" | "group_platform" | "no_expansion";

type PilotDelivery = {
  version: string;
  stage: DeliveryStage;
  planningOnly: boolean;
  scopeSummary: string;
  pilotWorkflow: string;
  pilotOwner: string;
  clientChampion: string;
  clientApprover: string;
  kickoffDate: string;
  targetCompletionDate: string;
  usersAndAccess: string;
  dataRequirements: string;
  integrationsInPilot: string;
  buildChecklist: string;
  testPlan: string;
  successMetrics: string;
  metricEvidence: string;
  clientFeedback: string;
  blockers: string;
  nextAction: string;
  acceptance: Acceptance;
  acceptanceNotes: string;
  conversionDecision: ConversionDecision;
  fullSystemNextStep: string;
  startedAt?: string;
  acceptedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const stages: Array<{ id: DeliveryStage; label: string; short: string }> = [
  { id: "planning", label: "Planning", short: "Plan" },
  { id: "scope_lock", label: "Scope Lock", short: "Scope" },
  { id: "kickoff", label: "Kickoff", short: "Kickoff" },
  { id: "access_data", label: "Users & Data", short: "Access" },
  { id: "build", label: "Build / Configure", short: "Build" },
  { id: "client_testing", label: "Client Testing", short: "Test" },
  { id: "success_review", label: "Success Review", short: "Measure" },
  { id: "acceptance", label: "Pilot Acceptance", short: "Accept" },
  { id: "conversion", label: "Full-System Conversion", short: "Expand" },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
function asBool(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function asStage(value: unknown): DeliveryStage {
  const raw = asString(value) as DeliveryStage;
  return stages.some((stage) => stage.id === raw) ? raw : "planning";
}
function asAcceptance(value: unknown): Acceptance {
  const raw = asString(value);
  return raw === "pending" || raw === "accepted" || raw === "changes_requested" ? raw : "not_ready";
}
function asConversion(value: unknown): ConversionDecision {
  const raw = asString(value);
  return raw === "full_system" || raw === "extend_pilot" || raw === "group_platform" || raw === "no_expansion" ? raw : "not_discussed";
}
function splitLines(value: string) { return value.split(/\n+/).map((line) => line.trim()).filter(Boolean); }
function nonEmpty(...values: string[]) { return values.find((value) => value.trim()) || ""; }

function deliveryFrom(config: Record<string, unknown> | null): PilotDelivery | null {
  const d = asObject(config?.pilotDelivery);
  if (!Object.keys(d).length) return null;
  return {
    version: asString(d.version) || "delivery-v1",
    stage: asStage(d.stage),
    planningOnly: asBool(d.planningOnly, true),
    scopeSummary: asString(d.scopeSummary),
    pilotWorkflow: asString(d.pilotWorkflow),
    pilotOwner: asString(d.pilotOwner),
    clientChampion: asString(d.clientChampion),
    clientApprover: asString(d.clientApprover),
    kickoffDate: asString(d.kickoffDate),
    targetCompletionDate: asString(d.targetCompletionDate),
    usersAndAccess: asString(d.usersAndAccess),
    dataRequirements: asString(d.dataRequirements),
    integrationsInPilot: asString(d.integrationsInPilot),
    buildChecklist: asString(d.buildChecklist),
    testPlan: asString(d.testPlan),
    successMetrics: asString(d.successMetrics),
    metricEvidence: asString(d.metricEvidence),
    clientFeedback: asString(d.clientFeedback),
    blockers: asString(d.blockers),
    nextAction: asString(d.nextAction),
    acceptance: asAcceptance(d.acceptance),
    acceptanceNotes: asString(d.acceptanceNotes),
    conversionDecision: asConversion(d.conversionDecision),
    fullSystemNextStep: asString(d.fullSystemNextStep),
    startedAt: asString(d.startedAt),
    acceptedAt: asString(d.acceptedAt),
    completedAt: asString(d.completedAt),
    updatedAt: asString(d.updatedAt),
    updatedBy: asString(d.updatedBy),
  };
}

function inferDelivery(prospect: Prospect): PilotDelivery {
  const config = asObject(prospect.demo_config);
  const discovery = asObject(config.discovery);
  const proposal = asObject(config.pilotProposal);
  const demoV2 = asObject(config.demoV2);
  const proposalWorkflow = asString(proposal.pilotWorkflow);
  const discoveryWorkflow = asString(discovery.pilotWorkflow);
  const metrics = asString(proposal.successMetrics);
  const requestedModules = asString(discovery.requestedModules);
  const integrationRequirements = asString(discovery.integrationRequirements);
  const currentSystems = asString(discovery.currentSystems);
  const champion = asString(discovery.internalChampion);
  const buyer = asString(discovery.economicBuyer);
  const next = asString(discovery.nextAction);
  const focus = Array.isArray(demoV2.focus) ? (demoV2.focus as unknown[]).filter((x): x is string => typeof x === "string") : [];

  const workflow = nonEmpty(proposalWorkflow, discoveryWorkflow, "Enquiry → Quotation → Order → Fulfilment → Invoice → Collection → Management");
  const deliverables = asString(proposal.deliverables);
  const buildChecklist = deliverables || [
    "Confirm final Pilot workflow and scope boundaries",
    "Configure Pilot workspace and permissions",
    "Prepare agreed sample / operating data",
    "Configure operational views and exception controls",
    "Prepare management Overview",
    "Complete internal QA before client testing",
  ].join("\n");

  return {
    version: "delivery-v1",
    stage: "planning",
    planningOnly: prospect.status !== "won",
    scopeSummary: asString(proposal.objective) || `Validate one focused real operating workflow for ${prospect.company_name} before a larger rollout.`,
    pilotWorkflow: workflow,
    pilotOwner: "Dr. Khaled Azzahrani / LabNarrative",
    clientChampion: champion,
    clientApprover: buyer,
    kickoffDate: "",
    targetCompletionDate: "",
    usersAndAccess: "Confirm Pilot users, roles, access level, and who can see management information before kickoff.",
    dataRequirements: "Confirm the minimum real data needed for the Pilot. Prefer a small controlled dataset over a large historical migration.",
    integrationsInPilot: integrationRequirements || (currentSystems ? `Existing systems noted in discovery: ${currentSystems}. No live integration is assumed unless explicitly included in Pilot scope.` : "No live third-party integration assumed unless explicitly included in the Pilot scope."),
    buildChecklist,
    testPlan: [
      "Walk through the agreed Pilot workflow end-to-end",
      "Test the main exception / error scenarios",
      "Verify user permissions and management visibility",
      "Confirm that each agreed success metric can be observed",
      "Collect structured client feedback before acceptance",
    ].join("\n"),
    successMetrics: metrics || [
      "Every Pilot work item has a visible owner and current state",
      "Operational blockers are visible before they cause a missed step",
      "Management can review the Pilot workflow from one Overview",
      "Manual follow-up is reduced where the Pilot replaces fragmented tracking",
    ].join("\n"),
    metricEvidence: "",
    clientFeedback: "",
    blockers: "",
    nextAction: next || (prospect.status === "won" ? "Lock scope and schedule Pilot kickoff." : "Wait for Pilot approval/win, then lock scope before kickoff."),
    acceptance: "not_ready",
    acceptanceNotes: "",
    conversionDecision: "not_discussed",
    fullSystemNextStep: focus.includes("group") ? "After Pilot acceptance, scope the full operational system first and validate the separate multi-company / Group Platform requirements before quoting group rollout." : "After Pilot acceptance, scope the full operational system, production integrations, permissions, data migration and recurring support before final quotation.",
  };
}

function Field({ label, value, onChange, rows = 4, hint }: { label: string; value: string; onChange: (value: string) => void; rows?: number; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{hint ? <small>{hint}</small> : null}<textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function PilotDeliveryWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [delivery, setDelivery] = useState<PilotDelivery | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true); setNotice("");
    const { data: roleRow, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", activeSession.user.id).maybeSingle();
    if (roleError || roleRow?.role !== "admin") {
      setRole(roleRow?.role ?? null); setNotice(roleError?.message ?? "Administrator access required."); setLoading(false); return;
    }
    setRole("admin");
    const { data, error } = await supabase.from("systems_outreach_prospects").select("id,company_name,slug,status,demo_status,demo_config,fit_score,industry,city,country").order("updated_at", { ascending: false });
    if (error) { setNotice(error.message); setLoading(false); return; }
    const next = (data ?? []) as Prospect[];
    setProspects(next);
    const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("prospect") : null;
    setSelectedId((current) => {
      if (requested) {
        const match = next.find((item) => item.id === requested || item.slug === requested);
        if (match) return match.id;
      }
      if (current && next.some((item) => item.id === current)) return current;
      return next.find((item) => item.status === "won")?.id ?? next.find((item) => Object.keys(asObject(item.demo_config?.pilotProposal)).length > 0)?.id ?? "";
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); if (data.session) void load(data.session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); if (next) void load(next); });
    return () => subscription.unsubscribe();
  }, [load]);

  const selected = prospects.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) { setDelivery(null); setSavedSnapshot(""); return; }
    const saved = deliveryFrom(selected.demo_config);
    const next = saved ?? inferDelivery(selected);
    setDelivery(next);
    setSavedSnapshot(saved ? JSON.stringify(saved) : "");
    setNotice("");
  }, [selectedId, selected?.demo_config]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((item) => {
      const hasProposal = Object.keys(asObject(item.demo_config?.pilotProposal)).length > 0;
      const hasDelivery = Object.keys(asObject(item.demo_config?.pilotDelivery)).length > 0;
      if (!hasProposal && !hasDelivery && item.status !== "won") return false;
      return !q || [item.company_name, item.industry, item.city, item.country, item.status].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [prospects, search]);

  const dirty = delivery ? JSON.stringify(delivery) !== savedSnapshot : false;
  const currentStageIndex = delivery ? stages.findIndex((stage) => stage.id === delivery.stage) : 0;
  const progress = delivery ? Math.round((Math.max(0, currentStageIndex) / (stages.length - 1)) * 100) : 0;
  const readiness = delivery ? [delivery.scopeSummary, delivery.pilotWorkflow, delivery.clientChampion, delivery.buildChecklist, delivery.testPlan, delivery.successMetrics, delivery.nextAction].filter((value) => value.trim()).length : 0;
  const readinessPct = Math.round((readiness / 7) * 100);

  const setField = (key: keyof PilotDelivery, value: string | boolean) => setDelivery((current) => current ? ({ ...current, [key]: value } as PilotDelivery) : current);

  const persist = async (next: PilotDelivery, eventType: string, eventContent: string) => {
    if (!selected || !session) return false;
    const now = new Date().toISOString();
    const currentConfig = asObject(selected.demo_config);
    const saved: PilotDelivery = { ...next, version: "delivery-v1", updatedAt: now, updatedBy: session.user.id };
    const nextConfig = { ...currentConfig, pilotDelivery: saved };
    const { error } = await supabase.from("systems_outreach_prospects").update({ demo_config: nextConfig, updated_at: now }).eq("id", selected.id);
    if (error) { setNotice(error.message); return false; }
    await supabase.from("systems_outreach_events").insert({ prospect_id: selected.id, channel: "internal", event_type: eventType, status: "recorded", content: eventContent });
    setDelivery(saved); setSavedSnapshot(JSON.stringify(saved));
    return true;
  };

  const save = async () => {
    if (!delivery || saving) return;
    setSaving(true); setNotice("");
    const ok = await persist(delivery, "pilot_delivery_saved", `Pilot delivery plan saved. Stage=${delivery.stage}; planning_only=${delivery.planningOnly}.`);
    if (ok) setNotice(`Saved ${selected?.company_name} Pilot delivery plan. Nothing was sent to the client.`);
    if (session) await load(session);
    setSaving(false);
  };

  const startPilot = async () => {
    if (!selected || !delivery || saving) return;
    if (selected.status !== "won") { setNotice("Pilot cannot start yet: this prospect is not marked Pilot Won."); return; }
    setSaving(true); setNotice("");
    const now = new Date().toISOString();
    const next: PilotDelivery = { ...delivery, planningOnly: false, stage: "scope_lock", startedAt: delivery.startedAt || now, nextAction: delivery.nextAction || "Lock final scope and schedule kickoff." };
    const ok = await persist(next, "pilot_delivery_started", "Pilot delivery started after Pilot Won. Stage moved to Scope Lock.");
    if (ok) setNotice("Pilot delivery started. Scope Lock is now the active stage.");
    if (session) await load(session);
    setSaving(false);
  };

  const moveStage = async (stage: DeliveryStage) => {
    if (!delivery || !selected || saving) return;
    if (delivery.planningOnly || selected.status !== "won") { setNotice("Stage progression is locked until the prospect is Pilot Won and the Pilot is started."); return; }
    setSaving(true); setNotice("");
    const next: PilotDelivery = { ...delivery, stage };
    if (stage === "acceptance" && next.acceptance === "not_ready") next.acceptance = "pending";
    const ok = await persist(next, "pilot_delivery_stage_changed", `Pilot delivery stage changed to ${stage}.`);
    if (ok) setNotice(`Pilot moved to ${stages.find((item) => item.id === stage)?.label}.`);
    if (session) await load(session);
    setSaving(false);
  };

  const acceptPilot = async () => {
    if (!delivery || !selected || saving) return;
    if (selected.status !== "won" || delivery.planningOnly) { setNotice("Pilot acceptance is unavailable until the Pilot is active."); return; }
    setSaving(true); setNotice("");
    const now = new Date().toISOString();
    const next: PilotDelivery = { ...delivery, stage: "conversion", acceptance: "accepted", acceptedAt: now, completedAt: now, nextAction: "Review Pilot evidence with the client and scope the production / full-system conversion." };
    const ok = await persist(next, "pilot_accepted", "Pilot marked accepted. Delivery moved to Full-System Conversion. No expansion was sold automatically.");
    if (ok) setNotice("Pilot accepted. The next stage is Full-System Conversion; no expansion quote was sent automatically.");
    if (session) await load(session);
    setSaving(false);
  };

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Pilot Delivery Workspace…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}>
      <div><div className={styles.brand}><span>Lab</span>Narrative</div><p className={styles.eyebrow}>Systems · pilot delivery</p><h1>Pilot Delivery Workspace</h1><p>Turn a won Pilot into controlled delivery, measurable evidence, client acceptance and a disciplined path to the full system.</p></div>
      <div className={styles.headerActions}><Link href="/admin/systems-outreach/discovery" className={styles.secondaryButton}>Discovery</Link><Link href="/admin/systems-outreach/discovery/pilot" className={styles.secondaryButton}>Pilot Proposal</Link><Link href="/admin/systems-outreach/discovery/commercial" className={styles.secondaryButton}>Pricing</Link><Link href="/admin/systems-outreach/discovery/group" className={styles.secondaryButton}>Group</Link></div>
    </header>

    <section className={styles.lifecycle}>{stages.map((stage, index) => <div key={stage.id} className={`${styles.lifeStage} ${delivery && index <= currentStageIndex ? styles.lifeDone : ""} ${delivery?.stage === stage.id ? styles.lifeActive : ""}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage.short}</strong></div>)}</section>

    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sideHead}><div><span>Pilot opportunities</span><strong>{visible.length}</strong></div><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "…" : "Refresh"}</button></div>
        <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company…" />
        <div className={styles.prospectList}>{visible.map((item) => {
          const saved = deliveryFrom(item.demo_config);
          return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`${styles.prospect} ${item.id === selectedId ? styles.prospectActive : ""}`}><span><strong>{item.company_name}</strong><b>{item.fit_score}</b></span><small>{item.status === "won" ? (saved?.planningOnly === false ? saved.stage.replaceAll("_", " ") : "won · ready to start") : saved ? "delivery plan only" : "not won yet"}</small></button>;
        })}</div>
      </aside>

      <section className={styles.workspace}>{selected && delivery ? <>
        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.statusBox}><span>{delivery.planningOnly ? "Delivery readiness" : "Pilot progress"}</span><strong>{delivery.planningOnly ? `${readinessPct}%` : `${progress}%`}</strong><small>{delivery.planningOnly ? "Planning only — Pilot has not started" : stages.find((stage) => stage.id === delivery.stage)?.label}</small></div></div>

        <section className={`${styles.gate} ${selected.status === "won" ? styles.gateReady : styles.gateLocked}`}><div><span>{selected.status === "won" ? "Pilot Won" : "Human gate"}</span><strong>{selected.status === "won" ? "Delivery can start when the scope is ready." : "Planning is allowed, execution is locked."}</strong><p>{selected.status === "won" ? "Starting the Pilot moves delivery into Scope Lock. Nothing is sent automatically." : `Current prospect status is “${selected.status.replaceAll("_", " ")}”. We can prepare the delivery plan now, but cannot progress delivery stages until the Pilot is actually won.`}</p></div><button className={styles.startButton} onClick={() => void startPilot()} disabled={saving || selected.status !== "won" || !delivery.planningOnly}>Start Pilot</button></section>

        <section className={styles.section}><div className={styles.sectionHead}><span>01</span><div><h3>Scope Lock</h3><p>Freeze what the SAR 7,500 Pilot will prove before implementation expands.</p></div></div><div className={styles.twoCol}>
          <Field label="Scope summary" value={delivery.scopeSummary} onChange={(value) => setField("scopeSummary", value)} rows={5} />
          <Field label="Pilot workflow" value={delivery.pilotWorkflow} onChange={(value) => setField("pilotWorkflow", value)} rows={5} />
          <Field label="LabNarrative Pilot owner" value={delivery.pilotOwner} onChange={(value) => setField("pilotOwner", value)} rows={3} />
          <Field label="Client champion" value={delivery.clientChampion} onChange={(value) => setField("clientChampion", value)} rows={3} />
          <Field label="Client approver" value={delivery.clientApprover} onChange={(value) => setField("clientApprover", value)} rows={3} hint="Leave unknown until confirmed." />
          <div className={styles.dateGrid}><label><span>Kickoff date</span><input type="date" value={delivery.kickoffDate} onChange={(event) => setField("kickoffDate", event.target.value)} /></label><label><span>Target completion</span><input type="date" value={delivery.targetCompletionDate} onChange={(event) => setField("targetCompletionDate", event.target.value)} /></label></div>
        </div></section>

        <section className={styles.section}><div className={styles.sectionHead}><span>02</span><div><h3>Kickoff, users & data</h3><p>Get the minimum access and data needed to prove the workflow without turning the Pilot into a migration project.</p></div></div><div className={styles.twoCol}>
          <Field label="Users & access" value={delivery.usersAndAccess} onChange={(value) => setField("usersAndAccess", value)} rows={6} />
          <Field label="Pilot data requirements" value={delivery.dataRequirements} onChange={(value) => setField("dataRequirements", value)} rows={6} />
          <Field label="Integrations inside the Pilot" value={delivery.integrationsInPilot} onChange={(value) => setField("integrationsInPilot", value)} rows={6} hint="Do not silently include deep Odoo/Zoho work." />
          <Field label="Current blockers" value={delivery.blockers} onChange={(value) => setField("blockers", value)} rows={6} />
        </div></section>

        <section className={styles.section}><div className={styles.sectionHead}><span>03</span><div><h3>Build & client testing</h3><p>One checklist for our delivery team and one explicit test plan for the client.</p></div></div><div className={styles.twoCol}>
          <Field label="Build / configuration checklist · one per line" value={delivery.buildChecklist} onChange={(value) => setField("buildChecklist", value)} rows={11} />
          <Field label="Client test plan · one per line" value={delivery.testPlan} onChange={(value) => setField("testPlan", value)} rows={11} />
        </div><div className={styles.checkPreview}><div><span>Build items</span><strong>{splitLines(delivery.buildChecklist).length}</strong></div><div><span>Test scenarios</span><strong>{splitLines(delivery.testPlan).length}</strong></div></div></section>

        <section className={styles.section}><div className={styles.sectionHead}><span>04</span><div><h3>Success evidence</h3><p>The Pilot should end with evidence, not “they liked the demo.”</p></div></div><div className={styles.twoCol}>
          <Field label="Success metrics · one per line" value={delivery.successMetrics} onChange={(value) => setField("successMetrics", value)} rows={10} />
          <Field label="Metric evidence / observations" value={delivery.metricEvidence} onChange={(value) => setField("metricEvidence", value)} rows={10} placeholder="Example: 0 incomplete orders marked ready; collection owner visible for all Pilot invoices…" />
          <Field label="Client feedback" value={delivery.clientFeedback} onChange={(value) => setField("clientFeedback", value)} rows={7} />
          <Field label="Next action" value={delivery.nextAction} onChange={(value) => setField("nextAction", value)} rows={7} />
        </div></section>

        <section className={styles.section}><div className={styles.sectionHead}><span>05</span><div><h3>Acceptance & conversion</h3><p>Acceptance finishes the Pilot; the next commercial phase remains a separate decision.</p></div></div><div className={styles.threeCol}>
          <label className={styles.selectField}><span>Acceptance</span><select value={delivery.acceptance} onChange={(event) => setField("acceptance", event.target.value)}><option value="not_ready">Not ready</option><option value="pending">Pending client review</option><option value="accepted">Accepted</option><option value="changes_requested">Changes requested</option></select></label>
          <label className={styles.selectField}><span>Conversion decision</span><select value={delivery.conversionDecision} onChange={(event) => setField("conversionDecision", event.target.value)}><option value="not_discussed">Not discussed</option><option value="full_system">Full Operational System</option><option value="group_platform">Group Platform</option><option value="extend_pilot">Extend Pilot</option><option value="no_expansion">No expansion</option></select></label>
          <div className={styles.acceptAction}><span>Human acceptance gate</span><button onClick={() => void acceptPilot()} disabled={saving || delivery.planningOnly || selected.status !== "won" || delivery.acceptance === "accepted"}>Mark Pilot Accepted</button></div>
        </div><div className={styles.twoCol}><Field label="Acceptance notes" value={delivery.acceptanceNotes} onChange={(value) => setField("acceptanceNotes", value)} rows={6} /><Field label="Full-system / expansion next step" value={delivery.fullSystemNextStep} onChange={(value) => setField("fullSystemNextStep", value)} rows={6} /></div></section>

        {!delivery.planningOnly ? <section className={styles.stageControl}><div><span>Active delivery stage</span><strong>{stages.find((stage) => stage.id === delivery.stage)?.label}</strong><p>Move stages only when the real delivery situation changes.</p></div><div className={styles.stageButtons}>{stages.slice(1).map((stage) => <button key={stage.id} className={delivery.stage === stage.id ? styles.stageCurrent : ""} disabled={saving || delivery.stage === stage.id} onClick={() => void moveStage(stage.id)}>{stage.label}</button>)}</div></section> : null}

        <div className={styles.saveBar}><div><strong>{dirty ? "Unsaved delivery changes" : delivery.planningOnly ? "Delivery plan saved" : "Pilot delivery saved"}</strong><span>Internal workspace only. No customer messages, approvals or expansion quotes are sent automatically.</span></div><button className={styles.primaryButton} onClick={() => void save()} disabled={saving || !dirty}>{saving ? "Saving…" : "Save Delivery"}</button></div>
      </> : <div className={styles.empty}>No Pilot opportunity selected. A proposal or Pilot Won status is needed before delivery planning appears here.</div>}</section>
    </section>
  </div></main>;
}
