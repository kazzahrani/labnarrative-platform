"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./commercial.module.css";

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

type IntegrationDepth = "none" | "standard" | "deep";
type MigrationLevel = "none" | "light" | "medium" | "heavy";

type CommercialModel = {
  version: string;
  workflows: number;
  integrations: number;
  integrationDepth: IntegrationDepth;
  companies: number;
  branches: number;
  migration: MigrationLevel;
  advancedAutomation: boolean;
  notes: string;
  savedAt?: string;
  savedBy?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_MODEL: CommercialModel = {
  version: "commercial-v1",
  workflows: 7,
  integrations: 0,
  integrationDepth: "none",
  companies: 1,
  branches: 1,
  migration: "none",
  advancedAutomation: false,
  notes: "",
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
function asNumber(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function asBoolean(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function lineCount(value: string) { return value.split(/\n+/).map((x) => x.trim()).filter(Boolean).length; }
function round500(value: number) { return Math.max(0, Math.round(value / 500) * 500); }
function money(value: number) { return `SAR ${value.toLocaleString("en-US")}`; }

function discoveryFrom(config: Record<string, unknown> | null) {
  const d = asObject(config?.discovery);
  return {
    requestedModules: asString(d.requestedModules),
    currentSystems: asString(d.currentSystems),
    integrationRequirements: asString(d.integrationRequirements),
    companyStructure: asString(d.companyStructure),
    expansionPotential: asString(d.expansionPotential),
    notes: asString(d.notes),
  };
}

function storedModel(config: Record<string, unknown> | null): CommercialModel | null {
  const c = asObject(config?.commercialModel);
  if (!Object.keys(c).length) return null;
  const depth = asString(c.integrationDepth);
  const migration = asString(c.migration);
  return {
    version: asString(c.version) || "commercial-v1",
    workflows: asNumber(c.workflows, 7),
    integrations: asNumber(c.integrations, 0),
    integrationDepth: depth === "standard" || depth === "deep" ? depth : "none",
    companies: asNumber(c.companies, 1),
    branches: asNumber(c.branches, 1),
    migration: migration === "light" || migration === "medium" || migration === "heavy" ? migration : "none",
    advancedAutomation: asBoolean(c.advancedAutomation),
    notes: asString(c.notes),
    savedAt: asString(c.savedAt),
    savedBy: asString(c.savedBy),
  };
}

function inferModel(prospect: Prospect): CommercialModel {
  const d = discoveryFrom(prospect.demo_config);
  const text = `${d.currentSystems}\n${d.integrationRequirements}\n${d.companyStructure}\n${d.expansionPotential}\n${d.notes}`.toLowerCase();
  const modules = Math.max(7, lineCount(d.requestedModules));
  const integrations = ["odoo", "zoho"].filter((name) => text.includes(name)).length;
  return {
    ...DEFAULT_MODEL,
    workflows: modules,
    integrations,
    integrationDepth: integrations ? "standard" : "none",
    companies: 1,
    branches: 1,
    notes: text.includes("factory") || text.includes("مصنع") || text.includes("multi-company") || text.includes("شركة ثانية") || text.includes("شركات")
      ? "Multi-company potential is confirmed as an expansion opportunity, but the number of companies and group scope are not yet confirmed. Keep the immediate estimate single-company until discovery confirms the rollout structure."
      : "",
  };
}

function calculate(model: CommercialModel) {
  const base = 30000;
  const extraWorkflows = Math.max(0, model.workflows - 7) * 2500;
  const integrationUnit = model.integrationDepth === "deep" ? 15000 : model.integrationDepth === "standard" ? 7500 : 0;
  const integrationCost = model.integrations * integrationUnit;
  const extraCompanies = Math.max(0, model.companies - 1) * 12500;
  const groupLayer = model.companies > 1 ? 7500 : 0;
  const extraBranches = Math.max(0, model.branches - 2) * 2500;
  const migrationCost = model.migration === "heavy" ? 15000 : model.migration === "medium" ? 7500 : model.migration === "light" ? 3000 : 0;
  const automation = model.advancedAutomation ? 5000 : 0;
  const estimate = base + extraWorkflows + integrationCost + extraCompanies + groupLayer + extraBranches + migrationCost + automation;
  const min = round500(estimate * 0.85);
  const max = round500(estimate * 1.2);
  const subscription = model.companies > 1 ? Math.max(2500, 2500 + Math.max(0, model.companies - 3) * 400) : (model.integrations > 0 || model.advancedAutomation ? 1250 : 750);
  const band = model.companies > 1 ? "Group Platform" : (model.integrations > 0 || model.workflows > 7 ? "Integrated Full System" : "Full Operational System");
  return { base, extraWorkflows, integrationCost, extraCompanies, groupLayer, extraBranches, migrationCost, automation, estimate, min, max, subscription, band };
}

export default function CommercialArchitecture() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [model, setModel] = useState<CommercialModel>(DEFAULT_MODEL);
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
  useEffect(() => {
    if (!selected) return;
    const saved = storedModel(selected.demo_config);
    const next = saved ?? inferModel(selected);
    setModel(next);
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

  const calc = useMemo(() => calculate(model), [model]);
  const dirty = JSON.stringify(model) !== savedSnapshot;
  const change = (key: keyof CommercialModel, value: string | number | boolean) => setModel((current) => ({ ...current, [key]: value } as CommercialModel));

  const save = async () => {
    if (!selected || !session || saving) return;
    setSaving(true); setNotice("");
    const now = new Date().toISOString();
    const current = asObject(selected.demo_config);
    const nextModel: CommercialModel = { ...model, version: "commercial-v1", savedAt: now, savedBy: session.user.id };
    const nextConfig = {
      ...current,
      commercialModel: nextModel,
      commercialRecommendation: {
        architectureVersion: "pricing-v1",
        band: calc.band,
        implementationEstimate: calc.estimate,
        implementationRangeMin: calc.min,
        implementationRangeMax: calc.max,
        recommendedProductionSubscriptionSar: calc.subscription,
        pilotPriceSar: 7500,
        clientFacing: false,
        generatedAt: now,
      },
    };
    const { error } = await supabase.from("systems_outreach_prospects").update({ demo_config: nextConfig, updated_at: now }).eq("id", selected.id);
    if (error) { setNotice(error.message); setSaving(false); return; }
    await supabase.from("systems_outreach_events").insert({ prospect_id: selected.id, channel: "internal", event_type: "commercial_model_saved", status: "recorded", content: `Commercial model saved. ${calc.band}; internal range ${calc.min}-${calc.max} SAR; recommended production subscription ${calc.subscription} SAR/month. Not client-facing.` });
    setModel(nextModel); setSavedSnapshot(JSON.stringify(nextModel)); setNotice(`Saved internal commercial model for ${selected.company_name}. Nothing was sent to the client.`);
    await load(session); setSaving(false);
  };

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Commercial Architecture…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}>
      <div><div className={styles.brand}><span>Lab</span>Narrative</div><p className={styles.eyebrow}>Systems · commercial architecture</p><h1>Pricing Architecture</h1><p>Keep Pilot pricing simple, then price the full system from confirmed scope. This page is internal guidance only — it never sends or exposes an estimate automatically.</p></div>
      <div className={styles.headerActions}><Link href="/admin/systems-outreach/discovery" className={styles.secondaryButton}>Discovery</Link><Link href="/admin/systems-outreach/discovery/demo-v2" className={styles.secondaryButton}>Demo V2</Link><Link href="/admin/systems-outreach/discovery/pilot" className={styles.secondaryButton}>Pilot Proposal</Link></div>
    </header>

    <section className={styles.ladder}>
      <article><span>01</span><small>Paid Pilot</small><strong>SAR 7,500</strong><p>One focused real workflow. Validation hosting included during the Pilot period.</p></article>
      <article><span>02</span><small>Full Operational System</small><strong>SAR 30k–60k</strong><p>Typical single-company implementation before unusually deep integrations or migration.</p></article>
      <article><span>03</span><small>Integrations</small><strong>+7.5k / +15k</strong><p>Internal anchors per standard API integration / deep two-way integration.</p></article>
      <article><span>04</span><small>Group Platform</small><strong>SAR 60k+</strong><p>Multiple companies, permissions and consolidated management visibility. Scope before quoting.</p></article>
      <article><span>05</span><small>Production subscription</small><strong>750 → 2,500+</strong><p>Starts after production go-live, not during the paid Pilot validation period.</p></article>
    </section>

    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sideHead}><div><span>Discovery prospects</span><strong>{visible.length}</strong></div><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "…" : "Refresh"}</button></div>
        <input className={styles.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company…" />
        <div className={styles.prospectList}>{visible.map((item) => {
          const saved = storedModel(item.demo_config);
          return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`${styles.prospect} ${item.id === selectedId ? styles.prospectActive : ""}`}><span><strong>{item.company_name}</strong><b>{item.fit_score}</b></span><small>{saved ? "commercial model saved" : "not priced yet"}</small></button>;
        })}</div>
      </aside>

      <section className={styles.workspace}>{selected ? <>
        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.estimate}><span>Internal implementation estimate</span><strong>{money(calc.min)} – {money(calc.max).replace("SAR ", "")}</strong><small>{calc.band} · not a client quote</small></div></div>

        <section className={styles.inputs}>
          <label><span>Major workflows</span><small>7 are included in the base full-system anchor.</small><input type="number" min="1" max="30" value={model.workflows} onChange={(e) => change("workflows", Math.max(1, Number(e.target.value) || 1))} /></label>
          <label><span>Live integrations</span><small>Odoo, Zoho, ERP, accounting, etc.</small><input type="number" min="0" max="10" value={model.integrations} onChange={(e) => change("integrations", Math.max(0, Number(e.target.value) || 0))} /></label>
          <label><span>Integration depth</span><small>Standard = normal API sync; Deep = complex two-way/write-back.</small><select value={model.integrationDepth} onChange={(e) => change("integrationDepth", e.target.value)}><option value="none">None</option><option value="standard">Standard API</option><option value="deep">Deep two-way</option></select></label>
          <label><span>Companies</span><small>Keep at 1 until group rollout is genuinely scoped.</small><input type="number" min="1" max="20" value={model.companies} onChange={(e) => change("companies", Math.max(1, Number(e.target.value) || 1))} /></label>
          <label><span>Branches / warehouses</span><small>First two are absorbed by the base architecture.</small><input type="number" min="1" max="40" value={model.branches} onChange={(e) => change("branches", Math.max(1, Number(e.target.value) || 1))} /></label>
          <label><span>Data migration</span><small>Historical import/cleanup effort.</small><select value={model.migration} onChange={(e) => change("migration", e.target.value)}><option value="none">None</option><option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option></select></label>
          <label className={styles.check}><input type="checkbox" checked={model.advancedAutomation} onChange={(e) => change("advancedAutomation", e.target.checked)} /><div><span>Advanced automation / AI</span><small>Beyond the standard embedded workflow intelligence.</small></div></label>
        </section>

        <section className={styles.breakdown}>
          <div className={styles.breakdownHead}><div><span>Recommended commercial band</span><h3>{calc.band}</h3></div><div><small>Working estimate</small><strong>{money(calc.estimate)}</strong></div></div>
          <div className={styles.costGrid}>
            <div><span>Full-system base</span><strong>{money(calc.base)}</strong></div>
            <div><span>Extra workflows</span><strong>{money(calc.extraWorkflows)}</strong></div>
            <div><span>Integrations</span><strong>{money(calc.integrationCost)}</strong></div>
            <div><span>Additional companies</span><strong>{money(calc.extraCompanies + calc.groupLayer)}</strong></div>
            <div><span>Branches</span><strong>{money(calc.extraBranches)}</strong></div>
            <div><span>Migration</span><strong>{money(calc.migrationCost)}</strong></div>
            <div><span>Advanced automation</span><strong>{money(calc.automation)}</strong></div>
            <div className={styles.total}><span>Internal range</span><strong>{money(calc.min)} – {money(calc.max).replace("SAR ", "")}</strong></div>
          </div>
        </section>

        <section className={styles.subscription}>
          <div><span>Recommended production subscription</span><strong>{money(calc.subscription)} / month</strong><p>Starts after the Pilot when the system becomes a real production service. Pilot validation hosting remains included in the Pilot implementation.</p></div>
          <div className={styles.tiers}><span><b>750</b> Core single company</span><span><b>1,250</b> Integrated / advanced</span><span><b>2,500+</b> Group platform</span></div>
        </section>

        <section className={styles.positioning}><div><h3>How to position this commercially</h3><p><strong>Do not quote the calculator automatically.</strong> Use it to stay consistent internally. The client first sees the SAR 7,500 Pilot. After the Pilot proves value, confirm the production scope, then quote the full system. Integrations and multi-company rollout are explicitly separate scope drivers.</p></div><div><h4>Suggested answer when asked “how much is the full system?”</h4><p>“The Pilot is SAR 7,500. The full system is a larger phase and depends mainly on integrations, number of companies/branches, permissions and migration. For a single-company operational rollout we usually think in the tens of thousands of riyals rather than the Pilot price, and we give you a fixed quote once the Pilot confirms the exact scope.”</p></div></section>

        <label className={styles.notes}><span>Internal commercial notes</span><textarea rows={5} value={model.notes} onChange={(e) => change("notes", e.target.value)} placeholder="Pricing sensitivity, group opportunity, integration uncertainty, procurement constraints…" /></label>

        <div className={styles.saveBar}><div><strong>{dirty ? "Unsaved commercial scenario" : "Commercial scenario saved"}</strong><span>Saved estimates remain internal and are never inserted into the client proposal automatically.</span></div><button className={styles.primaryButton} disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save Commercial Model"}</button></div>
      </> : <div className={styles.empty}>Select a prospect to model pricing.</div>}</section>
    </section>
  </div></main>;
}
