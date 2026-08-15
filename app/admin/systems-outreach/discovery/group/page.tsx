"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./group.module.css";

type Prospect = {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  demo_config: Record<string, unknown> | null;
  fit_score: number;
  industry: string | null;
  city: string | null;
  country: string | null;
};

type EntityType = "distributor" | "medical" | "factory" | "service" | "holding" | "other";
type Evidence = "confirmed" | "hypothesis";
type ArchitectureStatus = "draft" | "validated" | "approved";
type IntegrationMode = "per_company" | "central" | "mixed";
type VisibilityMode = "management_only" | "role_based" | "broad";

type GroupEntity = {
  id: string;
  name: string;
  type: EntityType;
  evidence: Evidence;
  locations: string;
  branches: number;
  workflowProfile: string;
  systems: string;
  dataBoundary: string;
  notes: string;
};

type GroupArchitecture = {
  version: string;
  status: ArchitectureStatus;
  groupName: string;
  entities: GroupEntity[];
  groupOverviewEnabled: boolean;
  strictCompanyIsolation: boolean;
  crossCompanyVisibility: VisibilityMode;
  sharedCustomers: boolean;
  sharedSuppliers: boolean;
  sharedFinance: boolean;
  integrationMode: IntegrationMode;
  consolidatedKpis: string;
  permissionModel: string;
  sharedServices: string;
  rolloutPlan: string;
  architectureNotes: string;
  savedAt?: string;
  savedBy?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
function asNumber(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function asBoolean(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function lineList(value: string) { return value.split(/\n+/).map((x) => x.trim()).filter(Boolean); }
function uid() { return `entity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function discoveryFrom(config: Record<string, unknown> | null) {
  const d = asObject(config?.discovery);
  return {
    currentSystems: asString(d.currentSystems),
    companyStructure: asString(d.companyStructure),
    expansionPotential: asString(d.expansionPotential),
    integrationRequirements: asString(d.integrationRequirements),
    managementNeeds: asString(d.managementNeeds),
    notes: asString(d.notes),
  };
}

function entityFrom(value: unknown, index: number): GroupEntity {
  const row = asObject(value);
  const type = asString(row.type);
  const evidence = asString(row.evidence);
  return {
    id: asString(row.id) || `entity-${index + 1}`,
    name: asString(row.name) || `Company ${index + 1}`,
    type: (["distributor", "medical", "factory", "service", "holding", "other"] as string[]).includes(type) ? type as EntityType : "other",
    evidence: evidence === "hypothesis" ? "hypothesis" : "confirmed",
    locations: asString(row.locations),
    branches: asNumber(row.branches, 1),
    workflowProfile: asString(row.workflowProfile),
    systems: asString(row.systems),
    dataBoundary: asString(row.dataBoundary) || "Separate company data by default",
    notes: asString(row.notes),
  };
}

function storedArchitecture(config: Record<string, unknown> | null): GroupArchitecture | null {
  const g = asObject(config?.groupArchitecture);
  if (!Object.keys(g).length) return null;
  const rawEntities = Array.isArray(g.entities) ? g.entities : [];
  const status = asString(g.status);
  const visibility = asString(g.crossCompanyVisibility);
  const integration = asString(g.integrationMode);
  return {
    version: asString(g.version) || "group-v1",
    status: status === "validated" || status === "approved" ? status : "draft",
    groupName: asString(g.groupName),
    entities: rawEntities.map(entityFrom),
    groupOverviewEnabled: asBoolean(g.groupOverviewEnabled, true),
    strictCompanyIsolation: asBoolean(g.strictCompanyIsolation, true),
    crossCompanyVisibility: visibility === "broad" || visibility === "role_based" ? visibility : "management_only",
    sharedCustomers: asBoolean(g.sharedCustomers, false),
    sharedSuppliers: asBoolean(g.sharedSuppliers, false),
    sharedFinance: asBoolean(g.sharedFinance, false),
    integrationMode: integration === "central" || integration === "mixed" ? integration : "per_company",
    consolidatedKpis: asString(g.consolidatedKpis),
    permissionModel: asString(g.permissionModel),
    sharedServices: asString(g.sharedServices),
    rolloutPlan: asString(g.rolloutPlan),
    architectureNotes: asString(g.architectureNotes),
    savedAt: asString(g.savedAt),
    savedBy: asString(g.savedBy),
  };
}

function inferArchitecture(prospect: Prospect): GroupArchitecture {
  const d = discoveryFrom(prospect.demo_config);
  const commercial = asObject(prospect.demo_config?.commercialModel);
  const text = `${d.companyStructure}\n${d.expansionPotential}\n${d.currentSystems}\n${d.integrationRequirements}\n${d.notes}`.toLowerCase();
  const branchCount = Math.max(1, asNumber(commercial.branches, 1));
  const systems = ["Odoo", "Zoho"].filter((name) => text.includes(name.toLowerCase())).join(" + ");
  const entities: GroupEntity[] = [
    {
      id: "primary-company",
      name: prospect.company_name,
      type: "distributor",
      evidence: "confirmed",
      locations: [prospect.city, prospect.country].filter(Boolean).join(" · "),
      branches: branchCount,
      workflowProfile: "Tender / Enquiry → Quotation → Order → Warehouse → Supply → Invoice → Collection → Management",
      systems,
      dataBoundary: "Own company records, users, permissions, customers, stock and finance by default",
      notes: "Primary Pilot / full-system company.",
    },
  ];

  if (text.includes("medical company") || text.includes("شركة طبية") || text.includes("شركة ثانيه طبيه") || text.includes("شركة ثانية طبية")) {
    entities.push({
      id: "medical-company-tbd",
      name: "Additional medical company (name TBD)",
      type: "medical",
      evidence: "confirmed",
      locations: "TBD",
      branches: 1,
      workflowProfile: "Adapt distributor / healthcare operating flow after discovery",
      systems: "TBD",
      dataBoundary: "Separate company records and permissions; group KPIs only where authorized",
      notes: "Existence confirmed by prospect; exact legal entity, users and workflow still to discover.",
    });
  }

  if (text.includes("factory") || text.includes("مصنع")) {
    entities.push({
      id: "factory-tbd",
      name: "Factory under construction (name TBD)",
      type: "factory",
      evidence: "confirmed",
      locations: "TBD",
      branches: 1,
      workflowProfile: "Procurement → Raw Materials → Production Planning → Production → Quality → Finished Goods → Delivery → Invoice / Collection",
      systems: "TBD",
      dataBoundary: "Separate production, inventory, quality and finance data; summarized group visibility only",
      notes: "Factory existence/construction status confirmed; detailed production workflow is a proposed architecture until discovery validates it.",
    });
  }

  if (text.includes("additional companies") || text.includes("other companies") || text.includes("كم شركة") || text.includes("شركات داخله") || text.includes("شركات داخلة")) {
    entities.push({
      id: "future-companies",
      name: "Additional companies (details TBD)",
      type: "other",
      evidence: "confirmed",
      locations: "TBD",
      branches: 0,
      workflowProfile: "Do not assume — define per company during expansion discovery",
      systems: "TBD",
      dataBoundary: "Separate by default until ownership and sharing rules are explicitly approved",
      notes: "Opportunity confirmed, but exact company count and operating models are not yet known. This placeholder must not be used for pricing as a company count.",
    });
  }

  const hasFactory = entities.some((entity) => entity.type === "factory");
  return {
    version: "group-v1",
    status: "draft",
    groupName: `${prospect.company_name} — Group Platform Concept`,
    entities,
    groupOverviewEnabled: true,
    strictCompanyIsolation: true,
    crossCompanyVisibility: "management_only",
    sharedCustomers: false,
    sharedSuppliers: false,
    sharedFinance: false,
    integrationMode: systems ? "mixed" : "per_company",
    consolidatedKpis: [
      "Active tenders / enquiries by company",
      "Quotations requiring action",
      "Orders blocked by incomplete line items",
      "Warehouse / fulfilment shortages",
      "Supply completion and delayed delivery",
      "Invoices issued and outstanding collection",
      "Overdue collection and next action",
      "Highest-priority exceptions by company",
      hasFactory ? "Factory procurement / production / quality exceptions (after factory discovery)" : "",
    ].filter(Boolean).join("\n"),
    permissionModel: [
      "Group Owner / Executive: consolidated KPIs across authorized companies; drill-down only where permitted",
      "Group Admin: manages group structure, company access and shared integrations",
      "Company Admin: full access inside assigned company only",
      "Operations / Tenders / Warehouse: module-level access inside assigned company",
      "Finance / Collection: financial access inside assigned company; group finance only by explicit permission",
      "Read-only Management: dashboards and reports only",
    ].join("\n"),
    sharedServices: [
      "Identity / sign-in and role management",
      "Optional shared supplier directory",
      "Optional shared customer master — only if the group confirms it is appropriate",
      "Central notifications / management alerts",
      "Integration orchestration for Odoo / Zoho / ERP where required",
      "Audit log and cross-company access trace",
    ].join("\n"),
    rolloutPlan: [
      `1. Prove the Pilot in ${prospect.company_name}`,
      `2. Convert ${prospect.company_name} to the production Full Operational System`,
      systems ? `3. Define and implement the required ${systems} integration boundaries` : "3. Confirm production integration requirements",
      "4. Discover and onboard the second company as a separate tenant / operating unit",
      hasFactory ? "5. Run dedicated factory discovery before designing production, materials and quality workflows" : "5. Add additional companies only after company-specific discovery",
      "6. Activate Group Overview after company permissions and KPI definitions are approved",
    ].join("\n"),
    architectureNotes: "Group Platform is an expansion phase. Do not promise a single identical workflow across every company. Each company keeps a tailored operating model under one governed management layer.",
  };
}

function readiness(model: GroupArchitecture) {
  const namedEntities = model.entities.filter((entity) => entity.name && !entity.name.toLowerCase().includes("tbd") && !entity.name.toLowerCase().includes("additional companies"));
  const confirmed = model.entities.filter((entity) => entity.evidence === "confirmed");
  const workflowDefined = model.entities.filter((entity) => entity.workflowProfile.trim()).length;
  const base = [model.groupName.trim(), model.consolidatedKpis.trim(), model.permissionModel.trim(), model.rolloutPlan.trim()].filter(Boolean).length;
  return Math.round(((base + Math.min(namedEntities.length, 3) + Math.min(workflowDefined, 3)) / 10) * 100);
}

function entityLabel(type: EntityType) {
  return ({ distributor: "Distributor", medical: "Medical company", factory: "Factory", service: "Service company", holding: "Holding / HQ", other: "Other" } as Record<EntityType, string>)[type];
}

function Field({ label, value, onChange, rows = 4, hint }: { label: string; value: string; onChange: (value: string) => void; rows?: number; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{hint ? <small>{hint}</small> : null}<textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

export default function GroupArchitectureWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [model, setModel] = useState<GroupArchitecture | null>(null);
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
    const { data, error } = await supabase.from("systems_outreach_prospects").select("id,company_name,slug,status,demo_config,fit_score,industry,city,country").order("updated_at", { ascending: false });
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
      return next.find((item) => {
        const d = discoveryFrom(item.demo_config);
        const text = `${d.companyStructure} ${d.expansionPotential}`.toLowerCase();
        return text.includes("company") || text.includes("factory") || text.includes("شركة") || text.includes("مصنع");
      })?.id ?? next.find((item) => Object.keys(asObject(item.demo_config?.discovery)).length > 0)?.id ?? next[0]?.id ?? "";
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
    if (!selected) { setModel(null); setSavedSnapshot(""); return; }
    const saved = storedArchitecture(selected.demo_config);
    const next = saved ?? inferArchitecture(selected);
    setModel(next);
    setSavedSnapshot(saved ? JSON.stringify(saved) : "");
    setNotice("");
  }, [selectedId, selected?.demo_config]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((item) => {
      const d = discoveryFrom(item.demo_config);
      const text = `${d.companyStructure} ${d.expansionPotential}`.toLowerCase();
      const groupSignal = text.includes("company") || text.includes("companies") || text.includes("factory") || text.includes("شركة") || text.includes("شركات") || text.includes("مصنع") || Boolean(storedArchitecture(item.demo_config));
      if (!groupSignal) return false;
      return !q || [item.company_name, item.industry, item.city, item.country].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [prospects, search]);

  const dirty = model ? JSON.stringify(model) !== savedSnapshot : false;
  const score = model ? Math.min(100, readiness(model)) : 0;
  const realCompanyCount = model?.entities.filter((entity) => entity.evidence === "confirmed" && entity.branches > 0 && !entity.id.includes("future-companies")).length ?? 0;
  const placeholderCount = model?.entities.filter((entity) => entity.name.toLowerCase().includes("tbd") || entity.id.includes("future-companies")).length ?? 0;

  const changeModel = (key: keyof GroupArchitecture, value: string | boolean | GroupEntity[]) => {
    setModel((current) => current ? { ...current, [key]: value } as GroupArchitecture : current);
  };

  const changeEntity = (id: string, key: keyof GroupEntity, value: string | number) => {
    setModel((current) => current ? {
      ...current,
      entities: current.entities.map((entity) => entity.id === id ? { ...entity, [key]: value } as GroupEntity : entity),
    } : current);
  };

  const addEntity = () => {
    if (!model) return;
    changeModel("entities", [...model.entities, {
      id: uid(), name: "New company", type: "other", evidence: "hypothesis", locations: "TBD", branches: 1,
      workflowProfile: "Define after company-specific discovery", systems: "TBD", dataBoundary: "Separate company data by default", notes: "",
    }]);
  };

  const removeEntity = (id: string) => {
    if (!model || model.entities.length <= 1) return;
    changeModel("entities", model.entities.filter((entity) => entity.id !== id));
  };

  const regenerate = () => {
    if (!selected) return;
    const next = inferArchitecture(selected);
    setModel(next);
    setNotice("Regenerated from current Discovery and Commercial context. Review placeholders before saving.");
  };

  const save = async (nextStatus?: ArchitectureStatus) => {
    if (!selected || !model || !session || saving) return;
    setSaving(true); setNotice("");
    const now = new Date().toISOString();
    const current = asObject(selected.demo_config);
    const status = nextStatus ?? model.status;
    const nextModel: GroupArchitecture = { ...model, version: "group-v1", status, savedAt: now, savedBy: session.user.id };
    const nextConfig = {
      ...current,
      groupArchitecture: nextModel,
      groupRecommendation: {
        architectureVersion: "group-v1",
        groupPlatformCandidate: true,
        confirmedOperatingEntities: realCompanyCount,
        unresolvedPlaceholders: placeholderCount,
        strictCompanyIsolation: nextModel.strictCompanyIsolation,
        groupOverviewEnabled: nextModel.groupOverviewEnabled,
        pricingReady: placeholderCount === 0 && realCompanyCount > 1,
        pricingNote: placeholderCount === 0 && realCompanyCount > 1
          ? "Entity count is sufficiently defined for a scoped group-platform commercial estimate."
          : "Do not quote the group rollout yet. Confirm exact legal entities, locations, users, integrations and workflow boundaries first.",
        clientFacing: false,
        generatedAt: now,
      },
    };
    const { error } = await supabase.from("systems_outreach_prospects").update({ demo_config: nextConfig, updated_at: now }).eq("id", selected.id);
    if (error) { setNotice(error.message); setSaving(false); return; }
    await supabase.from("systems_outreach_events").insert({
      prospect_id: selected.id,
      channel: "internal",
      event_type: status === "approved" ? "group_architecture_approved" : status === "validated" ? "group_architecture_validated" : "group_architecture_saved",
      status: "recorded",
      content: `Group architecture ${status}. Confirmed operating entities=${realCompanyCount}; unresolved placeholders=${placeholderCount}; pricing_ready=${placeholderCount === 0 && realCompanyCount > 1}. Internal only.`,
    });
    setModel(nextModel); setSavedSnapshot(JSON.stringify(nextModel));
    setNotice(status === "approved" ? "Group architecture approved internally. Nothing was sent to the prospect." : status === "validated" ? "Architecture marked validated. Group pricing still requires exact entity scope." : "Group architecture saved internally.");
    await load(session); setSaving(false);
  };

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Group Architecture…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}>
      <div><div className={styles.brand}><span>Lab</span>Narrative</div><p className={styles.eyebrow}>Systems · expansion architecture</p><h1>Group Platform Architecture</h1><p>Model multiple companies under one governed management layer without forcing one workflow or exposing one company&apos;s raw data to another.</p></div>
      <div className={styles.headerActions}><Link href="/admin/systems-outreach/discovery" className={styles.secondaryButton}>Discovery</Link><Link href="/admin/systems-outreach/discovery/pilot" className={styles.secondaryButton}>Pilot</Link><Link href="/admin/systems-outreach/discovery/commercial" className={styles.secondaryButton}>Pricing</Link></div>
    </header>

    <section className={styles.principles}>
      <article><span>01</span><strong>Separate by default</strong><p>Each company keeps its own operational records, users, roles and financial boundaries.</p></article>
      <article><span>02</span><strong>Consolidate selectively</strong><p>Group Overview shows authorized KPIs and exceptions rather than automatically sharing raw records.</p></article>
      <article><span>03</span><strong>Tailor per company</strong><p>A distributor and a factory can use different workflows under the same group platform.</p></article>
      <article><span>04</span><strong>Integrate where useful</strong><p>Odoo, Zoho and ERP systems can remain systems of record while LabNarrative coordinates group visibility.</p></article>
    </section>

    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sideHead}><div><span>Group opportunities</span><strong>{visible.length}</strong></div><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "…" : "Refresh"}</button></div>
        <input className={styles.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company…" />
        <div className={styles.prospectList}>{visible.map((item) => {
          const saved = storedArchitecture(item.demo_config);
          return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`${styles.prospect} ${item.id === selectedId ? styles.prospectActive : ""}`}><span><strong>{item.company_name}</strong><b>{item.fit_score}</b></span><small>{saved ? `group ${saved.status}` : "group signal detected"}</small></button>;
        })}</div>
      </aside>

      <section className={styles.workspace}>{selected && model ? <>
        <div className={styles.companyHead}>
          <div><p>{selected.industry || "Systems prospect"}</p><h2>{model.groupName}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div>
          <div className={styles.readiness}><span>Architecture readiness</span><strong>{score}%</strong><small>{realCompanyCount} confirmed operating entities · {placeholderCount} unresolved placeholders</small><div><i style={{ width: `${score}%` }} /></div></div>
        </div>

        <div className={styles.actionRow}><button className={styles.secondaryButton} onClick={regenerate}>Regenerate from Discovery</button><select value={model.status} onChange={(e) => changeModel("status", e.target.value)}><option value="draft">Draft</option><option value="validated">Validated</option><option value="approved">Approved internally</option></select></div>

        <section className={styles.section}>
          <div className={styles.sectionHead}><span>01</span><div><h3>Group governance</h3><p>Decide what is shared, what remains separate, and who can see across companies.</p></div></div>
          <div className={styles.twoCol}>
            <Field label="Group / platform name" value={model.groupName} onChange={(v) => changeModel("groupName", v)} rows={2} />
            <label className={styles.selectField}><span>Cross-company visibility</span><select value={model.crossCompanyVisibility} onChange={(e) => changeModel("crossCompanyVisibility", e.target.value)}><option value="management_only">Management only</option><option value="role_based">Role-based cross-company access</option><option value="broad">Broad shared access</option></select></label>
            <label className={styles.toggle}><input type="checkbox" checked={model.groupOverviewEnabled} onChange={(e) => changeModel("groupOverviewEnabled", e.target.checked)} /><span><strong>Group Overview</strong><small>Consolidated authorized KPIs and exceptions.</small></span></label>
            <label className={styles.toggle}><input type="checkbox" checked={model.strictCompanyIsolation} onChange={(e) => changeModel("strictCompanyIsolation", e.target.checked)} /><span><strong>Strict company isolation</strong><small>Default raw-data boundary between legal entities.</small></span></label>
            <label className={styles.toggle}><input type="checkbox" checked={model.sharedCustomers} onChange={(e) => changeModel("sharedCustomers", e.target.checked)} /><span><strong>Shared customer master</strong><small>Only enable if the group confirms customers should be shared.</small></span></label>
            <label className={styles.toggle}><input type="checkbox" checked={model.sharedSuppliers} onChange={(e) => changeModel("sharedSuppliers", e.target.checked)} /><span><strong>Shared supplier master</strong><small>Optional shared procurement reference layer.</small></span></label>
            <label className={styles.toggle}><input type="checkbox" checked={model.sharedFinance} onChange={(e) => changeModel("sharedFinance", e.target.checked)} /><span><strong>Shared finance visibility</strong><small>Off by default; requires explicit authorization.</small></span></label>
            <label className={styles.selectField}><span>Integration model</span><select value={model.integrationMode} onChange={(e) => changeModel("integrationMode", e.target.value)}><option value="per_company">Per company</option><option value="central">Central group integration</option><option value="mixed">Mixed / hybrid</option></select></label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><span>02</span><div><h3>Companies & operating units</h3><p>Confirmed entities and placeholders are deliberately separated. A placeholder must not silently become a priced company.</p></div></div>
          <div className={styles.entityList}>{model.entities.map((entity, index) => <article className={styles.entityCard} key={entity.id}>
            <div className={styles.entityTop}><div><span>Entity {index + 1}</span><strong>{entity.name}</strong></div><div className={styles.entityBadges}><b>{entityLabel(entity.type)}</b><em className={entity.evidence === "confirmed" ? styles.confirmed : styles.hypothesis}>{entity.evidence}</em></div></div>
            <div className={styles.entityGrid}>
              <label><span>Name</span><input value={entity.name} onChange={(e) => changeEntity(entity.id, "name", e.target.value)} /></label>
              <label><span>Type</span><select value={entity.type} onChange={(e) => changeEntity(entity.id, "type", e.target.value)}><option value="distributor">Distributor</option><option value="medical">Medical company</option><option value="factory">Factory</option><option value="service">Service company</option><option value="holding">Holding / HQ</option><option value="other">Other</option></select></label>
              <label><span>Evidence</span><select value={entity.evidence} onChange={(e) => changeEntity(entity.id, "evidence", e.target.value)}><option value="confirmed">Confirmed by prospect</option><option value="hypothesis">Hypothesis / proposed</option></select></label>
              <label><span>Locations</span><input value={entity.locations} onChange={(e) => changeEntity(entity.id, "locations", e.target.value)} /></label>
              <label><span>Branches / sites</span><input type="number" min="0" value={entity.branches} onChange={(e) => changeEntity(entity.id, "branches", Number(e.target.value) || 0)} /></label>
              <label><span>Existing systems</span><input value={entity.systems} onChange={(e) => changeEntity(entity.id, "systems", e.target.value)} /></label>
            </div>
            <Field label="Operating workflow" value={entity.workflowProfile} onChange={(v) => changeEntity(entity.id, "workflowProfile", v)} rows={3} />
            <Field label="Data / permission boundary" value={entity.dataBoundary} onChange={(v) => changeEntity(entity.id, "dataBoundary", v)} rows={3} />
            <Field label="Entity notes" value={entity.notes} onChange={(v) => changeEntity(entity.id, "notes", v)} rows={2} />
            {model.entities.length > 1 ? <button className={styles.removeButton} onClick={() => removeEntity(entity.id)}>Remove entity</button> : null}
          </article>)}</div>
          <button className={styles.addButton} onClick={addEntity}>+ Add company / operating unit</button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><span>03</span><div><h3>Group Overview & permissions</h3><p>The management layer aggregates signals; permissions determine whether a user can drill into underlying company records.</p></div></div>
          <div className={styles.twoCol}><Field label="Consolidated KPIs · one per line" value={model.consolidatedKpis} onChange={(v) => changeModel("consolidatedKpis", v)} rows={10} /><Field label="Permission model · one role per line" value={model.permissionModel} onChange={(v) => changeModel("permissionModel", v)} rows={10} /></div>
          <Field label="Shared platform services" value={model.sharedServices} onChange={(v) => changeModel("sharedServices", v)} rows={7} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><span>04</span><div><h3>Expansion rollout</h3><p>Grow from the proven Pilot instead of deploying the entire group at once.</p></div></div>
          <Field label="Recommended rollout plan" value={model.rolloutPlan} onChange={(v) => changeModel("rolloutPlan", v)} rows={8} />
          <Field label="Architecture notes" value={model.architectureNotes} onChange={(v) => changeModel("architectureNotes", v)} rows={5} />
        </section>

        <section className={styles.preview}>
          <div className={styles.previewHead}><div><span>Internal Group Overview preview</span><h3>{model.groupName}</h3></div><strong>{model.entities.length} modeled units</strong></div>
          <div className={styles.previewGrid}>{model.entities.map((entity) => <article key={entity.id}><div><b>{entity.name}</b><span>{entityLabel(entity.type)} · {entity.evidence}</span></div><small>{entity.workflowProfile}</small><em>{entity.dataBoundary}</em></article>)}</div>
          <div className={styles.kpiPreview}><span>Group management layer</span>{lineList(model.consolidatedKpis).slice(0, 8).map((item) => <b key={item}>{item}</b>)}</div>
          <p>No client-facing group page is created automatically. This architecture remains internal until the group scope is confirmed and deliberately approved.</p>
        </section>

        <div className={styles.saveBar}><div><strong>{dirty ? "Unsaved group architecture" : `Group architecture ${model.status}`}</strong><span>{placeholderCount ? "Exact group pricing is intentionally blocked while placeholders remain unresolved." : "Entity scope is defined enough for a commercial group estimate."}</span></div><div className={styles.saveActions}><button className={styles.secondaryButton} disabled={saving || !dirty} onClick={() => void save("draft")}>{saving ? "Saving…" : "Save Draft"}</button><button className={styles.primaryButton} disabled={saving || dirty || model.status === "validated" || model.status === "approved"} onClick={() => void save("validated")}>Mark Validated</button><button className={styles.approveButton} disabled={saving || dirty || model.status !== "validated"} onClick={() => void save("approved")}>Approve Internally</button></div></div>
      </> : <div className={styles.empty}>Select a prospect with a multi-company or factory expansion signal.</div>}</section>
    </section>
  </div></main>;
}
