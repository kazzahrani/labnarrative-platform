"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./demo-v2.module.css";

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

type Discovery = {
  phase?: string;
  confirmedPains?: string;
  currentSystems?: string;
  manualWorkflows?: string;
  errorPoints?: string;
  managementNeeds?: string;
  internalChampion?: string;
  economicBuyer?: string;
  requestedModules?: string;
  demoV2Changes?: string;
  pilotWorkflow?: string;
  integrationRequirements?: string;
  companyStructure?: string;
  expansionPotential?: string;
  nextAction?: string;
  pilotStatus?: string;
  notes?: string;
};

type SignalKey = "tender" | "quotation" | "warehouse" | "supply" | "collection" | "management" | "integration" | "group" | "manual";
type Signal = { key: SignalKey; label: string; detail: string; active: boolean };

type Bi = { en: string; ar: string };

const B = (en: string, ar: string): Bi => ({ en, ar });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function discoveryFrom(config: Record<string, unknown> | null): Discovery {
  const d = asObject(config?.discovery);
  return {
    phase: asString(d.phase), confirmedPains: asString(d.confirmedPains), currentSystems: asString(d.currentSystems), manualWorkflows: asString(d.manualWorkflows),
    errorPoints: asString(d.errorPoints), managementNeeds: asString(d.managementNeeds), internalChampion: asString(d.internalChampion), economicBuyer: asString(d.economicBuyer),
    requestedModules: asString(d.requestedModules), demoV2Changes: asString(d.demoV2Changes), pilotWorkflow: asString(d.pilotWorkflow), integrationRequirements: asString(d.integrationRequirements),
    companyStructure: asString(d.companyStructure), expansionPotential: asString(d.expansionPotential), nextAction: asString(d.nextAction), pilotStatus: asString(d.pilotStatus), notes: asString(d.notes),
  };
}

function allDiscoveryText(discovery: Discovery) {
  return Object.values(discovery).filter((value): value is string => typeof value === "string").join("\n").toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function detectSignals(discovery: Discovery): Signal[] {
  const text = allDiscoveryText(discovery);
  return [
    { key: "tender", label: "Tender control", detail: "Deadlines, readiness, missing requirements and ownership.", active: includesAny(text, ["tender", "مناقصة", "مناقصات"]) },
    { key: "quotation", label: "Quotation accuracy", detail: "Line-item validation and technical/commercial review before send.", active: includesAny(text, ["quotation", "quote", "عرض سعر", "عروض الأسعار", "عرض السعر"]) },
    { key: "warehouse", label: "Warehouse visibility", detail: "Stock, reservation, shortages and affected orders.", active: includesAny(text, ["warehouse", "stock", "inventory", "مستودع", "المستودع", "مخزون"]) },
    { key: "supply", label: "Complete supply", detail: "Prevent incomplete dispatch and surface missing customer line items.", active: includesAny(text, ["supply", "line item", "missing", "omission", "incomplete", "توريد", "بند", "بنود", "نقص", "خطأ", "بدون نقص", "بدون خطاء", "بدون خطأ"]) },
    { key: "collection", label: "Collection control", detail: "Outstanding invoices, overdue balances, owners and next actions.", active: includesAny(text, ["collection", "invoice", "receivable", "تحصيل", "الفواتير", "فاتورة", "مالية", "finance"]) },
    { key: "management", label: "Management Overview", detail: "A single view of risk, delays, outstanding cash and operational attention.", active: includesAny(text, ["overview", "management", "dashboard", "إدارة", "الادارة", "الإدارة", "نظرة عامة", "لوحة"]) },
    { key: "integration", label: "Existing-system integration", detail: "Position LabNarrative alongside current ERP/CRM rather than replacing it.", active: includesAny(text, ["odoo", "zoho", "integration", "erp", "crm", "تكامل", "ربط"]) },
    { key: "group", label: "Multi-company potential", detail: "Separate company operations with a consolidated group-level view.", active: includesAny(text, ["multi-company", "group", "sister", "factory", "subsidiar", "شركة ثانية", "شركات", "مصنع", "مجموعة"]) },
    { key: "manual", label: "Manual-work reduction", detail: "Replace fragmented Excel, WhatsApp and email follow-up with one workflow.", active: includesAny(text, ["excel", "whatsapp", "manual", "email", "إكسل", "اكسل", "واتساب", "يدوي"]) },
  ];
}

function active(signal: Signal[], key: SignalKey) {
  return Boolean(signal.find((item) => item.key === key)?.active);
}

function buildWorkflows(signals: Signal[]) {
  const workflows: Array<{ name: Bi; detail: Bi; enabled: boolean }> = [];
  if (active(signals, "tender")) workflows.push({ name: B("Tender deadline & readiness control", "متابعة مواعيد وجاهزية المناقصات"), detail: B("Track deadline, owner, readiness and missing requirements before submission risk appears.", "متابعة الموعد والمسؤول والجاهزية والمتطلبات الناقصة قبل ظهور خطر التأخير."), enabled: true });
  if (active(signals, "quotation")) workflows.push({ name: B("Quotation line-item validation", "التحقق من بنود عرض السعر"), detail: B("Validate requested items, quantities and technical review before the quotation is released.", "التحقق من البنود والكميات والمراجعة الفنية قبل اعتماد وإرسال عرض السعر."), enabled: true });
  if (active(signals, "supply")) workflows.push({ name: B("Complete-supply dispatch gate", "بوابة اكتمال التوريد قبل الشحن"), detail: B("Do not release an order until every required line item is allocated or explicitly resolved.", "عدم خروج الطلب حتى يتم تخصيص كل بند مطلوب أو معالجة النقص بشكل واضح."), enabled: true });
  if (active(signals, "warehouse")) workflows.push({ name: B("Warehouse shortage escalation", "تصعيد نقص المستودع"), detail: B("Connect stock shortages directly to the affected customer order and required supplier action.", "ربط نقص المخزون مباشرة بطلب العميل والإجراء المطلوب من المورد."), enabled: true });
  if (active(signals, "collection")) workflows.push({ name: B("Invoice & collection follow-up", "متابعة الفواتير والتحصيل"), detail: B("Surface due and overdue balances with the responsible owner and next collection action.", "إظهار المستحق والمتأخر مع المسؤول وإجراء التحصيل التالي."), enabled: true });
  if (active(signals, "management")) workflows.push({ name: B("Management attention brief", "ملخص الإدارة للأولويات"), detail: B("Summarize operational risks, incomplete supply and outstanding cash in one management view.", "تلخيص مخاطر التشغيل والتوريد غير المكتمل والمبالغ المستحقة في شاشة إدارية واحدة."), enabled: true });
  if (active(signals, "integration")) workflows.push({ name: B("Odoo / Zoho coexistence", "التكامل مع Odoo / Zoho"), detail: B("Keep existing systems where they add value while LabNarrative orchestrates the specialized workflow around them.", "الإبقاء على الأنظمة الحالية فيما تجيده، مع إدارة LabNarrative لمسار العمل المتخصص حولها."), enabled: true });
  if (!workflows.length) workflows.push({ name: B("Discovery-led operating workflow", "مسار تشغيلي مبني على الاكتشاف"), detail: B("Use confirmed prospect requirements to shape the next operational workflow instead of assuming internal processes.", "استخدام متطلبات العميل المؤكدة لتشكيل النظام بدل افتراض طريقة العمل الداخلية."), enabled: true });
  return workflows.slice(0, 7);
}

function buildV2Config(prospect: Prospect, discovery: Discovery, signals: Signal[]) {
  const current = asObject(prospect.demo_config);
  const useIntegration = active(signals, "integration");
  const useGroup = active(signals, "group");
  const useSupply = active(signals, "supply") || active(signals, "warehouse");
  const useCollection = active(signals, "collection");
  const useManagement = active(signals, "management") || true;
  const useQuote = active(signals, "quotation") || active(signals, "tender");

  const focus = signals.filter((item) => item.active).map((item) => item.key);
  const tagline = useSupply && useCollection
    ? B("From tender to collection — complete, visible and controlled", "من المناقصة إلى التحصيل — اكتمال ووضوح وتحكم")
    : useSupply
      ? B("Complete every customer order before it leaves the operation", "اكتمال كل طلب عميل قبل خروجه من التشغيل")
      : B("A fast, modern operating layer built around the real workflow", "نظام تشغيلي سريع وعصري مبني حول طريقة العمل الفعلية");

  const aiBrief = B(
    `Demo V2 management brief: flag quotation/tender risk, incomplete supply, warehouse shortages and overdue collection where relevant. Prioritize the few actions that need attention now${useIntegration ? ", while keeping Odoo/Zoho as connected systems of record where appropriate" : ""}${useGroup ? ", with future group-level visibility across companies" : ""}.`,
    `ملخص Demo V2 للإدارة: إظهار مخاطر المناقصات وعروض الأسعار والتوريد غير المكتمل ونقص المستودع والتحصيل المتأخر حسب الحاجة، وترتيب أهم الإجراءات التي تحتاج الانتباه الآن${useIntegration ? " مع إمكانية الإبقاء على Odoo وZoho كأنظمة مرتبطة حسب الحاجة" : ""}${useGroup ? " وإمكانية التوسع مستقبلًا إلى رؤية موحدة على مستوى مجموعة الشركات" : ""}.`
  );

  const reportSummary = B(
    `Demo V2 is shaped by confirmed discovery rather than assumptions. It emphasizes ${focus.length ? focus.join(", ") : "the prospect's confirmed operating priorities"}. All operational records remain illustrative and fictitious.`,
    `تم تشكيل Demo V2 بناءً على معلومات الاكتشاف المؤكدة بدل الافتراضات، مع التركيز على أولويات التشغيل التي ذكرها العميل. جميع السجلات التشغيلية المعروضة أمثلة توضيحية وافتراضية.`
  );

  const operationalExamples = {
    orders: useSupply ? [
      { id: "SO-2026-041", customerId: 1, source: "Q-2026-084", value: 176000, items: 24, ready: 21, missing: 3, due: B("20 Aug 2026", "20 أغسطس 2026"), status: B("Hold — incomplete", "موقوف — غير مكتمل"), illustrative: true },
      { id: "SO-2026-038", customerId: 2, source: "Q-2026-079", value: 98000, items: 18, ready: 18, missing: 0, due: B("18 Aug 2026", "18 أغسطس 2026"), status: B("Ready for dispatch", "جاهز للشحن"), illustrative: true },
      { id: "SO-2026-034", customerId: 3, source: "Q-2026-071", value: 215000, items: 32, ready: 31, missing: 1, due: B("25 Aug 2026", "25 أغسطس 2026"), status: B("Awaiting final line", "بانتظار البند الأخير"), illustrative: true },
    ] : current.orders,
    warehouse: useSupply ? [
      { sku: "LAB-112", name: B("Priority reagent / consumable", "كاشف / مستهلك ذو أولوية"), stock: 34, reserved: 30, needed: 32, available: 4, status: B("Short by 2", "نقص 2"), illustrative: true },
      { sku: "LAB-204", name: B("Specialized assay component", "مكوّن فحص متخصص"), stock: 18, reserved: 11, needed: 11, available: 7, status: B("Covered", "مغطى"), illustrative: true },
      { sku: "LAB-037", name: B("Technical line item", "بند فني"), stock: 7, reserved: 7, needed: 8, available: 0, status: B("Short by 1", "نقص 1"), illustrative: true },
      { sku: "LAB-082", name: B("Routine consumable", "مستهلك اعتيادي"), stock: 120, reserved: 52, needed: 52, available: 68, status: B("Covered", "مغطى"), illustrative: true },
    ] : current.warehouse,
    supplyLines: useSupply ? [
      { no: 1, sku: "LAB-112", item: B("Priority reagent / consumable", "كاشف / مستهلك ذو أولوية"), qty: 12, allocated: 10, source: B("Main warehouse", "المستودع الرئيسي"), status: B("Missing 2", "ناقص 2"), illustrative: true },
      { no: 2, sku: "LAB-204", item: B("Specialized assay component", "مكوّن فحص متخصص"), qty: 5, allocated: 5, source: B("Main warehouse", "المستودع الرئيسي"), status: B("Ready", "جاهز"), illustrative: true },
      { no: 3, sku: "LAB-037", item: B("Technical line item", "بند فني"), qty: 3, allocated: 2, source: B("Supplier replenishment", "تعزيز من المورد"), status: B("Missing 1", "ناقص 1"), illustrative: true },
      { no: 4, sku: "LAB-082", item: B("Routine consumable", "مستهلك اعتيادي"), qty: 4, allocated: 4, source: B("Main warehouse", "المستودع الرئيسي"), status: B("Ready", "جاهز"), illustrative: true },
    ] : current.supplyLines,
    invoices: useCollection ? [
      { id: "INV-2026-118", customerId: 1, order: "SO-2026-041", amount: 176000, issued: B("12 Aug 2026", "12 أغسطس 2026"), due: B("26 Aug 2026", "26 أغسطس 2026"), paid: 0, status: B("Due", "مستحق"), illustrative: true },
      { id: "INV-2026-109", customerId: 2, order: "SO-2026-038", amount: 98000, issued: B("30 Jul 2026", "30 يوليو 2026"), due: B("13 Aug 2026", "13 أغسطس 2026"), paid: 28000, status: B("Partially paid", "مدفوع جزئيًا"), illustrative: true },
      { id: "INV-2026-097", customerId: 3, order: "SO-2026-034", amount: 215000, issued: B("15 Jul 2026", "15 يوليو 2026"), due: B("29 Jul 2026", "29 يوليو 2026"), paid: 0, status: B("Overdue", "متأخر"), illustrative: true },
    ] : current.invoices,
    collectionActions: useCollection ? [
      { invoice: "INV-2026-097", customerId: 3, amount: 215000, overdue: 17, owner: B("Collection owner", "مسؤول التحصيل"), action: B("Escalate and confirm payment date", "تصعيد ومتابعة تاريخ السداد"), status: B("Priority", "أولوية"), illustrative: true },
      { invoice: "INV-2026-109", customerId: 2, amount: 70000, overdue: 2, owner: B("Finance team", "الفريق المالي"), action: B("Follow up remaining balance", "متابعة الرصيد المتبقي"), status: B("Follow-up due", "متابعة مستحقة"), illustrative: true },
    ] : current.collectionActions,
  };

  return {
    ...current,
    strategyVersion: "discovery-led-v2",
    demoVersion: "v2",
    tagline,
    workflows: buildWorkflows(signals),
    aiBrief,
    reportSummary,
    ...operationalExamples,
    demoV2: {
      source: "confirmed_discovery",
      company: prospect.company_name,
      focus,
      managementOverview: useManagement,
      quotationValidation: useQuote,
      completeSupplyGate: useSupply,
      collectionControl: useCollection,
      integrationPositioning: useIntegration ? "coexist_and_connect" : "not_yet_confirmed",
      groupOverviewPotential: useGroup,
      illustrativeDataOnly: true,
      discoverySnapshot: discovery,
    },
  };
}

const phaseRank: Record<string, number> = { discovery: 1, demo_v2: 2, internal_review: 3, pilot_proposed: 4, pilot_won: 5, expansion: 6 };
const statusForPhase: Record<string, string> = { discovery: "interested", demo_v2: "meeting", internal_review: "meeting", pilot_proposed: "proposal", pilot_won: "won", expansion: "won" };

export default function DemoV2BuilderPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
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
      if (requested) return next.find((item) => item.id === requested || item.slug === requested)?.id ?? current;
      if (current && next.some((item) => item.id === current)) return current;
      return next.find((item) => asString(asObject(item.demo_config?.discovery).phase) === "internal_review")?.id ?? next.find((item) => Boolean(asObject(item.demo_config?.discovery).confirmedPains))?.id ?? next[0]?.id ?? "";
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
  const signals = useMemo(() => detectSignals(discovery), [discovery]);
  const activeSignals = signals.filter((item) => item.active);
  const preview = useMemo(() => selected ? buildV2Config(selected, discovery, signals) : null, [selected, discovery, signals]);
  const hasDiscovery = Boolean(discovery.confirmedPains || discovery.managementNeeds || discovery.requestedModules || discovery.demoV2Changes || discovery.pilotWorkflow);
  const currentVersion = asString(selected?.demo_config?.demoVersion) || "teaser";

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((item) => !q || [item.company_name, item.industry, item.city, item.country].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [prospects, search]);

  const applyV2 = async () => {
    if (!selected || !session || !preview || building || !hasDiscovery) return;
    setBuilding(true); setNotice("");
    const now = new Date().toISOString();
    const currentDiscovery = asObject(selected.demo_config?.discovery);
    const currentPhase = asString(currentDiscovery.phase) || "discovery";
    const nextPhase = (phaseRank[currentPhase] ?? 1) >= phaseRank.demo_v2 ? currentPhase : "demo_v2";
    const nextConfig = {
      ...preview,
      discovery: {
        ...currentDiscovery,
        demoV2BuiltAt: now,
        demoV2Version: "v2",
        phase: nextPhase,
      },
      demoV2: {
        ...asObject(preview.demoV2),
        builtAt: now,
        builtBy: session.user.id,
      },
    };
    const nextStatus = ["proposal", "won"].includes(selected.status) ? selected.status : (statusForPhase[nextPhase] ?? selected.status);
    const { error } = await supabase.from("systems_outreach_prospects").update({ demo_config: nextConfig, demo_status: "ready", status: nextStatus, updated_at: now }).eq("id", selected.id);
    if (error) { setNotice(error.message); setBuilding(false); return; }
    await supabase.from("systems_outreach_events").insert({ prospect_id: selected.id, channel: "internal", event_type: "demo_v2_built", status: "recorded", content: `Demo V2 built from confirmed discovery. Focus=${activeSignals.map((item) => item.key).join(",") || "general"}. Existing prospect data preserved; operational examples remain illustrative.` });
    setNotice(`${selected.company_name} Demo V2 applied from confirmed discovery.`);
    await load(session);
    setBuilding(false);
  };

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Demo V2 Builder…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}>
      <div><div className={styles.brand}><span>Lab</span>Narrative</div><p className={styles.eyebrow}>Systems · discovery → product</p><h1>Demo V2 Builder</h1><p>Turn confirmed customer discovery into the next operational demo without inventing internal company facts.</p></div>
      <div className={styles.actions}><Link href="/admin/systems-outreach/discovery" className={styles.secondary}>← Discovery</Link>{selected ? <Link href={`/systems/demos/${selected.slug}`} target="_blank" className={styles.primary}>Open live demo ↗</Link> : null}</div>
    </header>
    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sideHead}><span>Prospects</span><button onClick={() => session && void load(session)}>{loading ? "…" : "Refresh"}</button></div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company…" className={styles.search} />
        <div className={styles.list}>{visible.map((item) => { const d = discoveryFrom(item.demo_config); const version = asString(item.demo_config?.demoVersion) || "teaser"; return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`${styles.prospect} ${item.id === selectedId ? styles.activeProspect : ""}`}><strong>{item.company_name}</strong><span>{[item.city, item.country].filter(Boolean).join(" · ")}</span><small>{d.phase?.replaceAll("_", " ") || item.status.replaceAll("_", " ")} · {version}</small></button>; })}</div>
      </aside>

      <section className={styles.workspace}>{selected ? <>
        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.version}><span>Current demo</span><strong>{currentVersion.toUpperCase()}</strong></div></div>

        <section className={styles.panel}><div className={styles.panelHead}><span>01</span><div><h3>Confirmed discovery</h3><p>Only information already recorded in Discovery is used to decide the V2 focus.</p></div></div>
          <div className={styles.discoveryGrid}>
            <article><span>Confirmed pains</span><p>{discovery.confirmedPains || "Not recorded yet."}</p></article>
            <article><span>Current systems</span><p>{discovery.currentSystems || "Not recorded yet."}</p></article>
            <article><span>Management needs</span><p>{discovery.managementNeeds || "Not recorded yet."}</p></article>
            <article><span>Demo V2 changes</span><p>{discovery.demoV2Changes || "Not recorded yet."}</p></article>
            <article><span>Pilot workflow</span><p>{discovery.pilotWorkflow || "Not recorded yet."}</p></article>
            <article><span>Expansion</span><p>{discovery.expansionPotential || "Not recorded yet."}</p></article>
          </div>
        </section>

        <section className={styles.panel}><div className={styles.panelHead}><span>02</span><div><h3>Detected V2 focus</h3><p>These are deterministic signals extracted from the confirmed discovery record.</p></div></div>
          <div className={styles.signalGrid}>{signals.map((signal) => <article key={signal.key} className={signal.active ? styles.signalOn : styles.signalOff}><div><strong>{signal.label}</strong><span>{signal.active ? "IN V2" : "Not confirmed"}</span></div><p>{signal.detail}</p></article>)}</div>
        </section>

        <section className={styles.panel}><div className={styles.panelHead}><span>03</span><div><h3>What Apply Demo V2 will change</h3><p>Existing company identity, research context, accounts, tenders and quotations are preserved unless the V2 layer specifically replaces an operational example.</p></div></div>
          <div className={styles.planList}>
            <div><strong>Management Overview</strong><span>Strengthened around current operational attention, incomplete supply and outstanding cash.</span></div>
            {active(signals, "quotation") || active(signals, "tender") ? <div><strong>Tender / quotation control</strong><span>Add line-item validation, readiness and technical-review emphasis.</span></div> : null}
            {active(signals, "supply") || active(signals, "warehouse") ? <div><strong>Order → Warehouse → Supply</strong><span>Add a visible incomplete-order gate with missing line items and warehouse shortage escalation.</span></div> : null}
            {active(signals, "collection") ? <div><strong>Invoices → Collection</strong><span>Add overdue balances, owners and next collection actions.</span></div> : null}
            {active(signals, "integration") ? <div><strong>Odoo / Zoho positioning</strong><span>Show LabNarrative as a specialized operational layer that can coexist with existing systems.</span></div> : null}
            {active(signals, "group") ? <div><strong>Future Group Overview</strong><span>Record multi-company expansion as a premium future architecture, not part of the small pilot by default.</span></div> : null}
            <div><strong>Embedded AI</strong><span>AI brief prioritizes concrete operational risk instead of generic AI features.</span></div>
          </div>
        </section>

        <div className={styles.applyBar}><div><strong>{hasDiscovery ? `Ready to build from ${activeSignals.length} confirmed signals` : "Discovery is not ready"}</strong><span>{hasDiscovery ? "Apply creates Demo V2 and records an audit event. All operational examples remain illustrative." : "Record confirmed pains / management needs / requested modules in Discovery first."}</span></div><button onClick={() => void applyV2()} disabled={building || !hasDiscovery}>{building ? "Building…" : currentVersion === "v2" ? "Rebuild Demo V2" : "Apply Demo V2"}</button></div>
      </> : <div className={styles.empty}>Select a prospect to build Demo V2.</div>}</section>
    </section>
  </div></main>;
}
