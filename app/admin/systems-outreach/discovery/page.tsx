"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./discovery.module.css";

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

type Contact = {
  id: string;
  prospect_id: string;
  name: string;
  title: string;
  priority: number;
};

type DiscoveryForm = {
  phase: string;
  confirmedPains: string;
  currentSystems: string;
  manualWorkflows: string;
  errorPoints: string;
  managementNeeds: string;
  internalChampion: string;
  economicBuyer: string;
  requestedModules: string;
  demoV2Changes: string;
  pilotWorkflow: string;
  integrationRequirements: string;
  companyStructure: string;
  expansionPotential: string;
  nextAction: string;
  nextActionDate: string;
  pilotStatus: string;
  notes: string;
};

const emptyForm: DiscoveryForm = {
  phase: "discovery",
  confirmedPains: "",
  currentSystems: "",
  manualWorkflows: "",
  errorPoints: "",
  managementNeeds: "",
  internalChampion: "",
  economicBuyer: "",
  requestedModules: "",
  demoV2Changes: "",
  pilotWorkflow: "",
  integrationRequirements: "",
  companyStructure: "",
  expansionPotential: "",
  nextAction: "",
  nextActionDate: "",
  pilotStatus: "not_scoped",
  notes: "",
};

const phaseOptions = [
  ["discovery", "Discovery"],
  ["demo_v2", "Demo V2"],
  ["internal_review", "Internal Review"],
  ["pilot_proposed", "Pilot Proposed"],
  ["pilot_won", "Pilot Won"],
  ["expansion", "Expansion"],
] as const;

const pilotOptions = [
  ["not_scoped", "Not scoped"],
  ["candidate", "Pilot candidate"],
  ["scoped", "Scope agreed"],
  ["proposed", "Proposal sent"],
  ["won", "Won"],
  ["active", "Active"],
  ["completed", "Completed"],
] as const;

const statusForPhase: Record<string, string> = {
  discovery: "interested",
  demo_v2: "meeting",
  internal_review: "meeting",
  pilot_proposed: "proposal",
  pilot_won: "won",
  expansion: "won",
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function loadDiscovery(config: Record<string, unknown> | null): DiscoveryForm {
  const discovery = asObject(config?.discovery);
  return {
    phase: asString(discovery.phase) || "discovery",
    confirmedPains: asString(discovery.confirmedPains),
    currentSystems: asString(discovery.currentSystems),
    manualWorkflows: asString(discovery.manualWorkflows),
    errorPoints: asString(discovery.errorPoints),
    managementNeeds: asString(discovery.managementNeeds),
    internalChampion: asString(discovery.internalChampion),
    economicBuyer: asString(discovery.economicBuyer),
    requestedModules: asString(discovery.requestedModules),
    demoV2Changes: asString(discovery.demoV2Changes),
    pilotWorkflow: asString(discovery.pilotWorkflow),
    integrationRequirements: asString(discovery.integrationRequirements),
    companyStructure: asString(discovery.companyStructure),
    expansionPotential: asString(discovery.expansionPotential),
    nextAction: asString(discovery.nextAction),
    nextActionDate: asString(discovery.nextActionDate),
    pilotStatus: asString(discovery.pilotStatus) || "not_scoped",
    notes: asString(discovery.notes),
  };
}

function questionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.en === "string") return item.en;
    if (typeof item.question === "string") return item.question;
  }
  return "";
}

function Field({ label, value, onChange, placeholder, tall = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; tall?: boolean }) {
  return <label className={styles.field}><span>{label}</span><textarea rows={tall ? 5 : 3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export default function SystemsDiscoveryWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<DiscoveryForm>(emptyForm);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
    setNotice("");
    const { data: roleRow, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", activeSession.user.id).maybeSingle();
    if (roleError || roleRow?.role !== "admin") {
      setRole(roleRow?.role ?? null);
      setNotice(roleError?.message ?? "Administrator access required.");
      setLoading(false);
      return;
    }
    setRole("admin");
    const [prospectResult, contactResult] = await Promise.all([
      supabase.from("systems_outreach_prospects").select("id,company_name,slug,status,demo_status,demo_config,fit_score,industry,city,country").order("updated_at", { ascending: false }),
      supabase.from("systems_outreach_contacts").select("id,prospect_id,name,title,priority").order("priority", { ascending: true }),
    ]);
    if (prospectResult.error || contactResult.error) {
      setNotice(prospectResult.error?.message ?? contactResult.error?.message ?? "Unable to load Discovery workspace.");
      setLoading(false);
      return;
    }
    const next = (prospectResult.data ?? []) as Prospect[];
    setProspects(next);
    setContacts((contactResult.data ?? []) as Contact[]);
    const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("prospect") : null;
    setSelectedId((current) => {
      if (requested && next.some((item) => item.id === requested || item.slug === requested)) return next.find((item) => item.id === requested || item.slug === requested)?.id ?? current;
      if (current && next.some((item) => item.id === current)) return current;
      return next.find((item) => ["replied", "interested", "meeting", "proposal"].includes(item.status))?.id ?? next[0]?.id ?? "";
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void load(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
      if (next) void load(next);
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const selected = prospects.find((item) => item.id === selectedId) ?? null;
  const selectedContacts = selected ? contacts.filter((item) => item.prospect_id === selected.id) : [];

  useEffect(() => {
    const next = selected ? loadDiscovery(selected.demo_config) : emptyForm;
    setForm(next);
    setSavedSnapshot(JSON.stringify(next));
    setNotice("");
  }, [selectedId, selected?.demo_config]);

  const visibleProspects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prospects.filter((item) => !query || [item.company_name, item.industry, item.city, item.country, item.status].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [prospects, search]);

  const discoveryQuestions = useMemo(() => {
    const config = asObject(selected?.demo_config);
    const raw = Array.isArray(config.discoveryQuestions) ? config.discoveryQuestions : [];
    return raw.map(questionText).filter(Boolean).slice(0, 8);
  }, [selected]);

  const completionFields: (keyof DiscoveryForm)[] = ["confirmedPains", "currentSystems", "managementNeeds", "internalChampion", "requestedModules", "pilotWorkflow", "nextAction"];
  const completion = Math.round((completionFields.filter((key) => form[key].trim()).length / completionFields.length) * 100);
  const dirty = JSON.stringify(form) !== savedSnapshot;

  const setField = (key: keyof DiscoveryForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!selected || !session || saving) return;
    setSaving(true);
    setNotice("");
    const currentConfig = asObject(selected.demo_config);
    const now = new Date().toISOString();
    const nextConfig = {
      ...currentConfig,
      discovery: {
        ...form,
        updatedAt: now,
        updatedBy: session.user.id,
      },
    };
    const patch: Record<string, unknown> = { demo_config: nextConfig, updated_at: now };
    const mappedStatus = statusForPhase[form.phase];
    if (mappedStatus) patch.status = mappedStatus;
    const { error } = await supabase.from("systems_outreach_prospects").update(patch).eq("id", selected.id);
    if (error) {
      setNotice(error.message);
      setSaving(false);
      return;
    }
    await supabase.from("systems_outreach_events").insert({
      prospect_id: selected.id,
      channel: "internal",
      event_type: "discovery_workspace_saved",
      status: "recorded",
      content: `Discovery workspace saved. Phase=${form.phase}; pilot_status=${form.pilotStatus}; completion=${completion}%.`,
    });
    setSavedSnapshot(JSON.stringify(form));
    setNotice(`Saved ${selected.company_name} discovery · ${completion}% complete.`);
    await load(session);
    setSaving(false);
  };

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Discovery workspace…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.brand}><span>Lab</span>Narrative</div>
          <p className={styles.eyebrow}>Systems · discovery-led sales</p>
          <h1>Discovery Workspace</h1>
          <p>Turn a real prospect reply into Demo V2, a focused paid pilot, and a larger implementation opportunity.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/admin/systems-outreach" className={styles.secondaryButton}>← Outreach</Link>
          {selected?.demo_status === "ready" ? <Link href={`/systems/demos/${selected.slug}`} target="_blank" className={styles.primaryButton}>Open demo ↗</Link> : null}
        </div>
      </header>

      {notice ? <div className={styles.notice}>{notice}</div> : null}

      <section className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sideHead}><div><span>Prospects</span><strong>{prospects.length}</strong></div><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "…" : "Refresh"}</button></div>
          <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company…" />
          <div className={styles.prospectList}>
            {visibleProspects.map((item) => {
              const discovery = loadDiscovery(item.demo_config);
              return <button key={item.id} className={`${styles.prospect} ${item.id === selectedId ? styles.prospectActive : ""}`} onClick={() => setSelectedId(item.id)}>
                <span className={styles.prospectTop}><strong>{item.company_name}</strong><b>{item.fit_score}</b></span>
                <span>{[item.city, item.country].filter(Boolean).join(" · ") || item.industry || "Prospect"}</span>
                <small>{discovery.phase ? discovery.phase.replaceAll("_", " ") : item.status.replaceAll("_", " ")}</small>
              </button>;
            })}
          </div>
        </aside>

        <section className={styles.workspace}>
          {selected ? <>
            <div className={styles.companyHead}>
              <div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div>
              <div className={styles.completion}><span>Discovery completeness</span><strong>{completion}%</strong><div><i style={{ width: `${completion}%` }} /></div></div>
            </div>

            <div className={styles.phaseRow}>
              <label><span>Sales phase</span><select value={form.phase} onChange={(event) => setField("phase", event.target.value)}>{phaseOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>Pilot status</span><select value={form.pilotStatus} onChange={(event) => setField("pilotStatus", event.target.value)}>{pilotOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>Next action date</span><input type="date" value={form.nextActionDate} onChange={(event) => setField("nextActionDate", event.target.value)} /></label>
            </div>

            <section className={styles.section}>
              <div className={styles.sectionHead}><span>01</span><div><h3>What we learned</h3><p>Only confirmed information from the prospect belongs here.</p></div></div>
              <div className={styles.twoCol}>
                <Field label="Confirmed pains" value={form.confirmedPains} onChange={(value) => setField("confirmedPains", value)} placeholder="Collection delays, quotation errors, missing supply line items…" tall />
                <Field label="Current systems" value={form.currentSystems} onChange={(value) => setField("currentSystems", value)} placeholder="Odoo, Zoho, Excel, WhatsApp, email…" tall />
                <Field label="Manual workflows" value={form.manualWorkflows} onChange={(value) => setField("manualWorkflows", value)} placeholder="What is still tracked or followed up manually?" />
                <Field label="Where errors / omissions happen" value={form.errorPoints} onChange={(value) => setField("errorPoints", value)} placeholder="Where does work get lost, delayed or incomplete?" />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><span>02</span><div><h3>People & management</h3><p>Identify the internal champion and the person who can approve the pilot.</p></div></div>
              {selectedContacts.length ? <div className={styles.people}>{selectedContacts.map((contact) => <button key={contact.id} title="Use as internal champion" onClick={() => setField("internalChampion", `${contact.name} — ${contact.title}`)}><strong>{contact.name}</strong><span>{contact.title}</span></button>)}</div> : null}
              <div className={styles.twoCol}>
                <Field label="Internal champion" value={form.internalChampion} onChange={(value) => setField("internalChampion", value)} placeholder="Person who feels the pain and can sell the idea internally" />
                <Field label="Economic buyer / management decision-maker" value={form.economicBuyer} onChange={(value) => setField("economicBuyer", value)} placeholder="GM, owner, CEO, finance/operations leadership…" />
                <Field label="What management wants to see" value={form.managementNeeds} onChange={(value) => setField("managementNeeds", value)} placeholder="Overview, risks, delayed supply, outstanding collection…" tall />
                <Field label="Company / group structure" value={form.companyStructure} onChange={(value) => setField("companyStructure", value)} placeholder="Branches, sister companies, factory, business units…" tall />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><span>03</span><div><h3>Demo V2</h3><p>Convert confirmed discovery into the second demo — not assumptions.</p></div></div>
              <div className={styles.twoCol}>
                <Field label="Requested modules / capabilities" value={form.requestedModules} onChange={(value) => setField("requestedModules", value)} placeholder="Tenders, quotation checks, warehouse, collection, overview…" tall />
                <Field label="Demo V2 changes" value={form.demoV2Changes} onChange={(value) => setField("demoV2Changes", value)} placeholder="Exactly what should change in the next demo?" tall />
                <Field label="Integration requirements" value={form.integrationRequirements} onChange={(value) => setField("integrationRequirements", value)} placeholder="Odoo, Zoho, ERP, email, Excel import…" />
                <Field label="Expansion potential" value={form.expansionPotential} onChange={(value) => setField("expansionPotential", value)} placeholder="Other companies, branches, departments, factory, group overview…" />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><span>04</span><div><h3>Paid Pilot</h3><p>Choose one valuable workflow we can prove quickly before expanding.</p></div></div>
              <div className={styles.twoCol}>
                <Field label="Best pilot workflow" value={form.pilotWorkflow} onChange={(value) => setField("pilotWorkflow", value)} placeholder="Tender → quotation → order → warehouse → supply → invoice → collection" tall />
                <Field label="Next action" value={form.nextAction} onChange={(value) => setField("nextAction", value)} placeholder="Team review, discovery call, send Demo V2, pilot proposal…" tall />
              </div>
            </section>

            {discoveryQuestions.length ? <section className={styles.section}>
              <div className={styles.sectionHead}><span>?</span><div><h3>Prepared discovery questions</h3><p>Questions generated before the conversation. Use only what is relevant.</p></div></div>
              <ol className={styles.questions}>{discoveryQuestions.map((question, index) => <li key={`${question}-${index}`}>{question}</li>)}</ol>
            </section> : null}

            <section className={styles.section}>
              <div className={styles.sectionHead}><span>05</span><div><h3>Operator notes</h3><p>Context that should survive beyond the current conversation.</p></div></div>
              <Field label="Notes" value={form.notes} onChange={(value) => setField("notes", value)} placeholder="Important objections, timing, relationship context, pricing sensitivity, next-step details…" tall />
            </section>

            <div className={styles.saveBar}>
              <div><strong>{dirty ? "Unsaved discovery changes" : "Discovery saved"}</strong><span>Saving also aligns the coarse pipeline status with the selected sales phase.</span></div>
              <button className={styles.primaryButton} onClick={() => void save()} disabled={saving || !dirty}>{saving ? "Saving…" : "Save Discovery"}</button>
            </div>
          </> : <div className={styles.empty}>Select a prospect to start discovery.</div>}
        </section>
      </section>
    </div>
  </main>;
}
