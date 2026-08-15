"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./pilot.module.css";

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

type PilotProposal = {
  version: string;
  status: "draft" | "approved" | "sent";
  title: string;
  objective: string;
  priceSar: number;
  timeline: string;
  pilotWorkflow: string;
  deliverables: string;
  successMetrics: string;
  included: string;
  exclusions: string;
  integrationAssumptions: string;
  expansionPath: string;
  ongoingSubscriptionSar: string;
  ongoingSubscriptionNote: string;
  vatNote: string;
  nextStep: string;
  generatedAt?: string;
  updatedAt?: string;
  approvedAt?: string;
  sentAt?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
function asNumber(value: unknown, fallback = 0) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function splitLines(value: string) { return value.split(/\n+/).map((x) => x.trim()).filter(Boolean); }
function compact(lines: string[]) { return Array.from(new Set(lines.filter(Boolean))).join("\n"); }

function discoveryFrom(config: Record<string, unknown> | null) {
  const d = asObject(config?.discovery);
  return {
    phase: asString(d.phase),
    confirmedPains: asString(d.confirmedPains),
    currentSystems: asString(d.currentSystems),
    manualWorkflows: asString(d.manualWorkflows),
    errorPoints: asString(d.errorPoints),
    managementNeeds: asString(d.managementNeeds),
    internalChampion: asString(d.internalChampion),
    economicBuyer: asString(d.economicBuyer),
    requestedModules: asString(d.requestedModules),
    demoV2Changes: asString(d.demoV2Changes),
    pilotWorkflow: asString(d.pilotWorkflow),
    integrationRequirements: asString(d.integrationRequirements),
    companyStructure: asString(d.companyStructure),
    expansionPotential: asString(d.expansionPotential),
    nextAction: asString(d.nextAction),
    pilotStatus: asString(d.pilotStatus),
    notes: asString(d.notes),
  };
}

function proposalFrom(config: Record<string, unknown> | null): PilotProposal | null {
  const p = asObject(config?.pilotProposal);
  if (!Object.keys(p).length) return null;
  const rawStatus = asString(p.status);
  return {
    version: asString(p.version) || "pilot-v1",
    status: rawStatus === "approved" || rawStatus === "sent" ? rawStatus : "draft",
    title: asString(p.title),
    objective: asString(p.objective),
    priceSar: asNumber(p.priceSar, 7500),
    timeline: asString(p.timeline),
    pilotWorkflow: asString(p.pilotWorkflow),
    deliverables: asString(p.deliverables),
    successMetrics: asString(p.successMetrics),
    included: asString(p.included),
    exclusions: asString(p.exclusions),
    integrationAssumptions: asString(p.integrationAssumptions),
    expansionPath: asString(p.expansionPath),
    ongoingSubscriptionSar: asString(p.ongoingSubscriptionSar),
    ongoingSubscriptionNote: asString(p.ongoingSubscriptionNote),
    vatNote: asString(p.vatNote),
    nextStep: asString(p.nextStep),
    generatedAt: asString(p.generatedAt),
    updatedAt: asString(p.updatedAt),
    approvedAt: asString(p.approvedAt),
    sentAt: asString(p.sentAt),
  };
}

function inferProposal(prospect: Prospect): PilotProposal {
  const d = discoveryFrom(prospect.demo_config);
  const text = Object.values(d).join("\n").toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => text.includes(term));
  const tender = has("tender", "مناقصة", "مناقصات");
  const quote = has("quotation", "quote", "عرض سعر", "عروض الأسعار");
  const warehouse = has("warehouse", "stock", "inventory", "مستودع", "مخزون");
  const supply = has("supply", "line item", "missing", "omission", "توريد", "بند", "بنود", "نقص", "خطأ");
  const collection = has("collection", "invoice", "receivable", "تحصيل", "فاتورة", "فواتير", "مالية");
  const management = has("overview", "management", "dashboard", "إدارة", "الادارة", "الإدارة", "لوحة", "نظرة عامة");
  const odooZoho = has("odoo", "zoho", "erp", "crm", "تكامل", "ربط");
  const group = has("multi-company", "group", "factory", "sister", "subsidiar", "شركة ثانية", "شركات", "مصنع", "مجموعة");
  const manual = has("excel", "whatsapp", "manual", "إكسل", "اكسل", "واتساب", "يدوي");

  const workflow = d.pilotWorkflow || compact([
    tender ? "Tender / enquiry" : "Enquiry",
    quote ? "Quotation" : "Commercial review",
    "Order",
    warehouse ? "Warehouse" : "Fulfilment",
    supply ? "Supply completeness" : "Delivery",
    "Invoice",
    collection ? "Collection" : "Payment follow-up",
    management ? "Management Overview" : "Management visibility",
  ]).replaceAll("\n", " → ");

  const deliverables = compact([
    "Bilingual operational Pilot workspace (English / Arabic)",
    tender ? "Tender/enquiry tracking with owner, deadline, readiness and missing requirements" : "Enquiry and commercial-work tracking",
    quote ? "Quotation tracking with line-item and review visibility" : "Commercial review and approval visibility",
    warehouse ? "Warehouse availability and shortage visibility linked to the affected order" : "Fulfilment readiness visibility",
    supply ? "Item-level completeness gate so incomplete orders are clearly blocked before dispatch" : "Delivery-readiness control",
    "Invoice and payment-status tracking for the agreed Pilot workflow",
    collection ? "Collection follow-up with owner, due/overdue status and next action" : "Payment follow-up visibility",
    management ? "Management Overview highlighting active work, risks, delays and outstanding actions" : "Management summary of the Pilot workflow",
    "Configuration around the agreed Pilot users and workflow",
    "Pilot environment hosting during the agreed validation period",
  ]);

  const metrics = compact([
    tender ? "Every Pilot tender/enquiry has a visible owner, deadline and readiness state" : "Every Pilot work item has a visible owner and current state",
    quote ? "Every Pilot quotation shows its current review/status and next action" : "Commercial actions are visible with a clear next step",
    supply ? "No Pilot order is shown as dispatch-ready while required line items remain incomplete" : "Delivery readiness is visible before release",
    warehouse ? "Shortages are visible against the affected Pilot order rather than tracked separately" : "Fulfilment blockers are visible against the affected work item",
    collection ? "Every Pilot invoice/collection item has a visible status, owner and next action" : "Payment follow-up items are visible with ownership",
    management ? "Management can see the Pilot workflow and its highest-priority exceptions in one Overview" : "Management can review the Pilot workflow from one screen",
    manual ? "Identify which Excel/WhatsApp/manual follow-up steps can be removed or reduced during the Pilot" : "Validate whether the Pilot reduces fragmented manual follow-up",
  ]);

  const included = compact([
    "Pilot discovery and final scope confirmation",
    "Configuration of the agreed Pilot workflow",
    "Illustrative/sample data setup, followed by agreed Pilot operating data as available",
    "Reasonable adjustments within the agreed Pilot scope",
    "Basic onboarding for the Pilot users",
    "Pilot validation and feedback review",
  ]);

  const exclusions = compact([
    "Company-wide full-system rollout beyond the agreed Pilot scope",
    odooZoho ? "Deep/live Odoo or Zoho integration unless explicitly added to the Pilot scope" : "Deep/live ERP or CRM integration unless explicitly added to the Pilot scope",
    "Large-scale historical data migration or data cleansing",
    group ? "Multi-company / group-wide deployment (kept as a later expansion phase)" : "Multi-company / group-wide deployment",
    "Replacement of the company's accounting/ERP system",
    "Third-party software, messaging, ERP or paid API/license fees not supplied by LabNarrative",
    "Major new modules requested after Pilot scope approval; these are quoted separately",
  ]);

  const integrationAssumptions = odooZoho
    ? "The Pilot is designed to prove the specialized workflow first. Odoo/Zoho can remain in place. Any live synchronization, API integration, system-of-record mapping, or write-back is scoped separately after we confirm exactly what should stay in each system."
    : "The Pilot can run as a focused operational layer. Any live ERP/CRM integration is added only after the required system-of-record boundaries and APIs are confirmed.";

  const expansionPath = group
    ? "If the Pilot proves value, the next phase can expand into the full operational system, deeper integrations, additional branches/companies, and a consolidated Group Overview while preserving permissions and separation between companies."
    : "If the Pilot proves value, the next phase can expand into the full operational system, deeper integrations, additional teams/branches, permissions, automation and company-wide management visibility.";

  return {
    version: "pilot-v1",
    status: "draft",
    title: `${prospect.company_name} — Operational Pilot`,
    objective: `Validate one focused, real operating workflow for ${prospect.company_name} before committing to a larger company-wide implementation. The Pilot is built around confirmed discovery, not a generic CRM template.`,
    priceSar: 7500,
    timeline: "Estimated 2–4 weeks after final Pilot scope and required access/data are confirmed.",
    pilotWorkflow: workflow,
    deliverables,
    successMetrics: metrics,
    included,
    exclusions,
    integrationAssumptions,
    expansionPath,
    ongoingSubscriptionSar: "",
    ongoingSubscriptionNote: "Ongoing hosting, support, maintenance and AI usage after the Pilot are agreed separately before production operation. Leave the monthly price blank until the commercial model is confirmed.",
    vatNote: "VAT, if applicable, is handled separately.",
    nextStep: d.nextAction || "Confirm Pilot scope with the team, approve the proposal, then schedule kickoff.",
    generatedAt: new Date().toISOString(),
  };
}

function Field({ label, value, onChange, rows = 4, hint }: { label: string; value: string; onChange: (value: string) => void; rows?: number; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{hint ? <small>{hint}</small> : null}<textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

export default function PilotProposalBuilder() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [proposal, setProposal] = useState<PilotProposal | null>(null);
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
      return next.find((item) => Object.keys(asObject(item.demo_config?.discovery)).length > 0)?.id ?? next[0]?.id ?? "";
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); if (data.session) void load(data.session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); if (next) void load(next); });
    return () => subscription.unsubscribe();
  }, [load]);

  const selected = prospects.find((item) => item.id === selectedId) ?? null;
  const discovery = useMemo(() => discoveryFrom(selected?.demo_config ?? null), [selected]);
  const demoV2 = useMemo(() => asObject(selected?.demo_config?.demoV2), [selected]);

  useEffect(() => {
    if (!selected) { setProposal(null); setSavedSnapshot(""); return; }
    const saved = proposalFrom(selected.demo_config);
    const next = saved ?? inferProposal(selected);
    setProposal(next);
    setSavedSnapshot(saved ? JSON.stringify(saved) : "");
    setNotice("");
  }, [selectedId, selected?.demo_config]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((item) => {
      const hasDiscovery = Object.keys(asObject(item.demo_config?.discovery)).length > 0;
      if (!hasDiscovery) return false;
      return !q || [item.company_name, item.industry, item.city, item.country, item.status].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [prospects, search]);

  const dirty = proposal ? JSON.stringify(proposal) !== savedSnapshot : false;
  const setField = <K extends keyof PilotProposal>(key: K, value: PilotProposal[K]) => setProposal((current) => current ? { ...current, [key]: value } : current);

  const saveProposal = async (nextStatus?: PilotProposal["status"], sent = false) => {
    if (!selected || !proposal || !session || saving) return;
    setSaving(true); setNotice("");
    const now = new Date().toISOString();
    const currentConfig = asObject(selected.demo_config);
    const status = nextStatus ?? proposal.status;
    const nextProposal: PilotProposal = {
      ...proposal,
      version: "pilot-v1",
      status,
      updatedAt: now,
      approvedAt: status === "approved" || status === "sent" ? (proposal.approvedAt || now) : undefined,
      sentAt: sent ? now : proposal.sentAt,
    };
    const currentDiscovery = discoveryFrom(selected.demo_config);
    const nextDiscovery = {
      ...asObject(currentConfig.discovery),
      phase: sent ? "pilot_proposed" : currentDiscovery.phase || "internal_review",
      pilotStatus: sent ? "proposed" : currentDiscovery.pilotStatus || "candidate",
      updatedAt: now,
      updatedBy: session.user.id,
    };
    const nextConfig = { ...currentConfig, pilotProposal: nextProposal, discovery: nextDiscovery };
    const patch: Record<string, unknown> = { demo_config: nextConfig, updated_at: now };
    if (sent) patch.status = "proposal";
    const { error } = await supabase.from("systems_outreach_prospects").update(patch).eq("id", selected.id);
    if (error) { setNotice(error.message); setSaving(false); return; }
    await supabase.from("systems_outreach_events").insert({
      prospect_id: selected.id,
      channel: "internal",
      event_type: sent ? "pilot_proposal_sent_recorded" : status === "approved" ? "pilot_proposal_approved" : "pilot_proposal_saved",
      status: "recorded",
      content: sent
        ? `Pilot proposal recorded as sent. Price SAR ${nextProposal.priceSar}.`
        : status === "approved"
          ? `Pilot proposal approved at human gate. Price SAR ${nextProposal.priceSar}.`
          : `Pilot proposal draft saved. Price SAR ${nextProposal.priceSar}.`,
    });
    setProposal(nextProposal);
    setSavedSnapshot(JSON.stringify(nextProposal));
    setNotice(sent ? "Proposal recorded as sent. Prospect moved to Pilot Proposed." : status === "approved" ? "Proposal approved. Private client link is ready." : "Pilot proposal draft saved.");
    await load(session);
    setSaving(false);
  };

  const regenerate = () => {
    if (!selected) return;
    const next = inferProposal(selected);
    const existing = proposalFrom(selected.demo_config);
    if (existing?.approvedAt || existing?.sentAt) {
      next.status = "draft";
      next.approvedAt = undefined;
      next.sentAt = undefined;
    }
    setProposal(next);
    setNotice("Regenerated from the latest Discovery. Review before saving or approving.");
  };

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Pilot Proposal Builder…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}>
      <div><div className={styles.brand}><span>Lab</span>Narrative</div><p className={styles.eyebrow}>Systems · discovery → pilot</p><h1>Pilot Proposal Builder</h1><p>Turn confirmed discovery and Demo V2 into a tightly scoped paid Pilot. The Pilot proves value first; the full system and deep integrations are priced separately after validation.</p></div>
      <div className={styles.headerActions}><Link className={styles.secondaryButton} href="/admin/systems-outreach/discovery">Discovery</Link><Link className={styles.secondaryButton} href="/admin/systems-outreach/discovery/demo-v2">Demo V2</Link>{selected?.demo_status === "ready" ? <Link className={styles.secondaryButton} target="_blank" href={`/systems/demos/${selected.slug}`}>Open demo ↗</Link> : null}</div>
    </header>
    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sideHead}><div><span>Discovery prospects</span><strong>{visible.length}</strong></div><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "…" : "Refresh"}</button></div>
        <input className={styles.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company…" />
        <div className={styles.prospectList}>{visible.map((item) => {
          const p = proposalFrom(item.demo_config);
          return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`${styles.prospect} ${item.id === selectedId ? styles.prospectActive : ""}`}><span><strong>{item.company_name}</strong><b>{item.fit_score}</b></span><small>{p ? `proposal ${p.status}` : "proposal not saved"}</small></button>;
        })}</div>
      </aside>

      <section className={styles.workspace}>{selected && proposal ? <>
        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.statusBox}><span>Proposal status</span><strong>{proposal.status}</strong><small>{proposal.sentAt ? `Sent ${new Date(proposal.sentAt).toLocaleDateString("en-GB")}` : proposal.approvedAt ? "Human-approved" : "Human review required"}</small></div></div>

        <section className={styles.snapshot}>
          <div><span>Discovery phase</span><strong>{(discovery.phase || "discovery").replaceAll("_", " ")}</strong></div>
          <div><span>Demo V2</span><strong>{Object.keys(demoV2).length ? "Built" : "Not built"}</strong></div>
          <div><span>Pilot price</span><strong>SAR {proposal.priceSar.toLocaleString("en-US")}</strong></div>
          <div><span>Full system</span><strong>Separate scope</strong></div>
        </section>

        <div className={styles.builderActions}><button className={styles.secondaryButton} onClick={regenerate}>Regenerate from Discovery</button>{proposal.status !== "draft" ? <button className={styles.secondaryButton} onClick={() => setField("status", "draft")}>Return to draft</button> : null}{proposal.status === "approved" || proposal.status === "sent" ? <Link className={styles.primaryButton} target="_blank" href={`/systems/proposals/${selected.slug}`}>Open client proposal ↗</Link> : null}</div>

        <section className={styles.section}><div className={styles.sectionHead}><span>01</span><div><h3>Commercial frame</h3><p>Keep the Pilot small enough to buy and real enough to prove value.</p></div></div><div className={styles.twoCol}>
          <Field label="Proposal title" value={proposal.title} onChange={(v) => setField("title", v)} rows={2} />
          <label className={styles.inputField}><span>Pilot price · SAR</span><input type="number" min="0" value={proposal.priceSar} onChange={(e) => setField("priceSar", Number(e.target.value) || 0)} /></label>
          <Field label="Objective" value={proposal.objective} onChange={(v) => setField("objective", v)} rows={5} />
          <Field label="Estimated timeline" value={proposal.timeline} onChange={(v) => setField("timeline", v)} rows={3} hint="Use an estimate; final timing follows scope/data confirmation." />
        </div></section>

        <section className={styles.section}><div className={styles.sectionHead}><span>02</span><div><h3>Pilot scope</h3><p>Derived from the workflow the prospect actually cares about.</p></div></div>
          <Field label="Pilot workflow" value={proposal.pilotWorkflow} onChange={(v) => setField("pilotWorkflow", v)} rows={4} />
          <div className={styles.twoCol}><Field label="Deliverables · one per line" value={proposal.deliverables} onChange={(v) => setField("deliverables", v)} rows={11} /><Field label="Success metrics · one per line" value={proposal.successMetrics} onChange={(v) => setField("successMetrics", v)} rows={11} /></div>
        </section>

        <section className={styles.section}><div className={styles.sectionHead}><span>03</span><div><h3>Boundaries</h3><p>Protect the Pilot from becoming a full enterprise implementation for SAR 7,500.</p></div></div><div className={styles.twoCol}><Field label="Included · one per line" value={proposal.included} onChange={(v) => setField("included", v)} rows={9} /><Field label="Not included / separately scoped · one per line" value={proposal.exclusions} onChange={(v) => setField("exclusions", v)} rows={9} /></div>
          <Field label="Integration assumptions" value={proposal.integrationAssumptions} onChange={(v) => setField("integrationAssumptions", v)} rows={5} />
        </section>

        <section className={styles.section}><div className={styles.sectionHead}><span>04</span><div><h3>After the Pilot</h3><p>Show the expansion path without pricing the full system before discovery is complete.</p></div></div>
          <Field label="Expansion path" value={proposal.expansionPath} onChange={(v) => setField("expansionPath", v)} rows={5} />
          <div className={styles.twoCol}><label className={styles.inputField}><span>Optional ongoing subscription · SAR/month</span><small>Leave blank until we formally decide the subscription.</small><input inputMode="numeric" value={proposal.ongoingSubscriptionSar} onChange={(e) => setField("ongoingSubscriptionSar", e.target.value.replace(/[^0-9]/g, ""))} placeholder="Not set" /></label><Field label="Subscription note" value={proposal.ongoingSubscriptionNote} onChange={(v) => setField("ongoingSubscriptionNote", v)} rows={4} /></div>
          <div className={styles.twoCol}><Field label="VAT note" value={proposal.vatNote} onChange={(v) => setField("vatNote", v)} rows={2} /><Field label="Next step" value={proposal.nextStep} onChange={(v) => setField("nextStep", v)} rows={3} /></div>
        </section>

        <section className={styles.preview}><div className={styles.previewHead}><div><span>Client preview</span><h3>{proposal.title}</h3></div><strong>SAR {proposal.priceSar.toLocaleString("en-US")}</strong></div><p>{proposal.objective}</p><div className={styles.previewGrid}><div><span>Workflow</span><strong>{proposal.pilotWorkflow}</strong></div><div><span>Timeline</span><strong>{proposal.timeline}</strong></div></div><div className={styles.previewLists}><div><h4>Core deliverables</h4><ul>{splitLines(proposal.deliverables).slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul></div><div><h4>Success criteria</h4><ul>{splitLines(proposal.successMetrics).slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul></div></div><small>Full implementation, deep integrations and multi-company rollout remain separate scopes unless explicitly added above.</small></section>

        <div className={styles.saveBar}><div><strong>{dirty ? "Unsaved proposal changes" : `Proposal ${proposal.status}`}</strong><span>Approval is a human gate. Recording “sent” moves the prospect to Pilot Proposed.</span></div><div className={styles.saveActions}><button className={styles.secondaryButton} disabled={saving || !dirty} onClick={() => void saveProposal("draft")}>{saving ? "Saving…" : "Save Draft"}</button><button className={styles.primaryButton} disabled={saving || dirty || proposal.status === "approved" || proposal.status === "sent"} onClick={() => void saveProposal("approved")}>Approve Proposal</button><button className={styles.sentButton} disabled={saving || dirty || proposal.status !== "approved"} onClick={() => void saveProposal("sent", true)}>Record Sent</button></div></div>
      </> : <div className={styles.empty}>Select a prospect with Discovery data to build the Pilot proposal.</div>}</section>
    </section>
  </div></main>;
}
