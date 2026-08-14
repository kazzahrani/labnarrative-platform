"use client";

import { useMemo, useState } from "react";
import styles from "../medical-masar/v2.module.css";

type Lang = "en" | "ar";
type Theme = "light" | "dark";
type View = "overview" | "accounts" | "opportunities" | "contacts" | "quotes" | "tenders" | "tasks" | "email" | "automation" | "team" | "documents" | "reports" | "ai";
type Bi = string | { en?: string; ar?: string };

type Account = { name: Bi; type?: Bi; region?: Bi; division?: Bi; owner?: Bi; health?: number; value?: number; contacts?: number };
type Opportunity = { account?: Bi; title: Bi; value?: number; score?: number; stage?: Bi; division?: Bi };
type Contact = { account?: Bi; name: Bi; role?: Bi; decision?: Bi; email?: string };
type Row = { title: Bi; account?: Bi; status?: Bi; value?: number; when?: Bi; owner?: Bi; meta?: Bi };
type Workflow = { name: Bi; detail?: Bi; enabled?: boolean };
type TeamRow = { name: Bi; region?: Bi; pipeline?: number; followups?: number; rate?: number };

type DemoConfig = {
  shortName?: Bi;
  tagline?: Bi;
  conceptLabel?: Bi;
  currency?: string;
  regions?: Bi[];
  divisions?: Bi[];
  aiBrief?: Bi;
  reportSummary?: Bi;
  accounts?: Account[];
  opportunities?: Opportunity[];
  contacts?: Contact[];
  quotes?: Row[];
  tenders?: Row[];
  tasks?: Row[];
  emails?: Row[];
  documents?: Row[];
  workflows?: Workflow[];
  team?: TeamRow[];
};

const B = (en: string, ar: string) => ({ en, ar });
const nav: Array<{ id: View; icon: string; label: { en: string; ar: string } }> = [
  { id: "overview", icon: "◫", label: B("Overview", "نظرة عامة") },
  { id: "accounts", icon: "▦", label: B("Accounts", "الحسابات") },
  { id: "opportunities", icon: "↗", label: B("Opportunities", "الفرص") },
  { id: "contacts", icon: "♙", label: B("Contacts", "جهات الاتصال") },
  { id: "quotes", icon: "▤", label: B("Quotes", "عروض الأسعار") },
  { id: "tenders", icon: "◇", label: B("Tenders", "المنافسات") },
  { id: "tasks", icon: "✓", label: B("Tasks", "المهام") },
  { id: "email", icon: "✉", label: B("Email & Follow-up", "البريد والمتابعة") },
  { id: "automation", icon: "↯", label: B("Automation", "الأتمتة") },
  { id: "team", icon: "♧", label: B("Team", "الفريق") },
  { id: "documents", icon: "▱", label: B("Documents", "المستندات") },
  { id: "reports", icon: "▥", label: B("Reports", "التقارير") },
  { id: "ai", icon: "✦", label: B("AI Command Center", "مركز الذكاء الاصطناعي") },
];

const fallbackAccounts: Account[] = [
  { name: B("Priority hospital account", "حساب مستشفى ذو أولوية"), type: B("Institutional customer", "عميل مؤسسي"), region: B("Central region", "المنطقة الوسطى"), division: B("Core business", "النشاط الأساسي"), owner: B("Sales team", "فريق المبيعات"), health: 92, value: 145000, contacts: 3 },
  { name: B("Regional laboratory group", "مجموعة مختبرات إقليمية"), type: B("Commercial account", "حساب تجاري"), region: B("Western region", "المنطقة الغربية"), division: B("Specialized products", "المنتجات المتخصصة"), owner: B("Regional sales", "المبيعات الإقليمية"), health: 87, value: 220000, contacts: 4 },
  { name: B("University research center", "مركز أبحاث جامعي"), type: B("Research account", "حساب بحثي"), region: B("Central region", "المنطقة الوسطى"), division: B("Life science", "علوم الحياة"), owner: B("Key accounts", "الحسابات الرئيسية"), health: 84, value: 98000, contacts: 3 },
];

const fallbackOpps: Opportunity[] = [
  { account: fallbackAccounts[0].name, title: B("High-fit commercial enquiry", "استفسار تجاري عالي التوافق"), value: 145000, score: 94, stage: B("Quotation", "عرض سعر"), division: B("Core business", "النشاط الأساسي") },
  { account: fallbackAccounts[1].name, title: B("Multi-site supply opportunity", "فرصة توريد متعددة المواقع"), value: 220000, score: 89, stage: B("Technical review", "مراجعة فنية"), division: B("Specialized products", "المنتجات المتخصصة") },
  { account: fallbackAccounts[2].name, title: B("Research workflow expansion", "توسعة سير عمل بحثي"), value: 98000, score: 86, stage: B("Tender", "منافسة"), division: B("Life science", "علوم الحياة") },
];

const fallbackContacts: Contact[] = [
  { account: fallbackAccounts[0].name, name: B("Commercial Director", "المدير التجاري"), role: B("Decision maker", "صاحب قرار"), decision: B("Commercial ownership", "مسؤولية تجارية") },
  { account: fallbackAccounts[0].name, name: B("Technical Manager", "المدير الفني"), role: B("Technical influencer", "مؤثر فني") },
  { account: fallbackAccounts[0].name, name: B("Procurement Lead", "مسؤول المشتريات"), role: B("Buying process", "عملية الشراء") },
];

const fallbackWorkflows: Workflow[] = [
  { name: B("Inbound enquiry routing", "توجيه الاستفسارات الواردة"), detail: B("Classify, score and assign every new enquiry automatically.", "تصنيف وتقييم وتعيين كل استفسار جديد تلقائياً."), enabled: true },
  { name: B("Quotation follow-up", "متابعة عروض الأسعار"), detail: B("Create reminders and follow-up drafts until a reply is received.", "إنشاء تذكيرات ومسودات متابعة حتى استلام الرد."), enabled: true },
  { name: B("Tender deadline watch", "مراقبة مواعيد المنافسات"), detail: B("Surface upcoming deadlines and missing documents before risk appears.", "إبراز المواعيد القادمة والمستندات الناقصة قبل ظهور المخاطر."), enabled: true },
  { name: B("Stale opportunity alerts", "تنبيهات الفرص المتوقفة"), detail: B("Escalate high-value opportunities with no recent activity.", "تصعيد الفرص مرتفعة القيمة عند غياب النشاط الحديث."), enabled: true },
];

const ui = {
  en: {
    privateConcept: "Private concept", prepared: "Prepared specifically for", disclaimer: "Illustrative workflow based only on public business context. No internal company data is used.", discuss: "Discuss this concept ↗", live: "Automation live", simulate: "+ Simulate enquiry", command: "Commercial command center", hero: "Sales, follow-up and operational execution in one system", heroCopy: "A tailored concept showing how enquiries, accounts, decision-makers, quotations, tasks, follow-up and management reporting can work together.", openValue: "Open opportunity value", highFit: "High-fit opportunities", urgent: "Urgent priorities", contacts: "Decision-maker coverage", priority: "Highest-priority opportunities", account: "Account", ai: "AI", stage: "Stage", value: "Value", management: "AI MANAGEMENT BRIEF", attention: "What deserves attention today?", viewAll: "View all", accounts: "Commercial accounts", opportunities: "Opportunity pipeline", contactTitle: "Decision-maker map", quotes: "Quotes & proposals", tenders: "Tenders & deadlines", tasks: "Tasks & next actions", emails: "Email & follow-up", automation: "Automation workflows", team: "Team performance", documents: "Commercial documents", reports: "Management reporting", aiCenter: "AI command center", illustrative: "Illustrative", enabled: "Enabled", paused: "Paused", pipeline: "Pipeline", followups: "Follow-ups", response: "Response rate", generate: "Generate insight", ask: "Ask AI", risk: "Show risks", forecast: "Forecast", priorities: "Priorities", ready: "Ready for review", complete: "Mark complete", generated: "AI insight generated", simulated: "New enquiry captured, scored and routed", noData: "No items configured for this concept yet." },
  ar: {
    privateConcept: "تصور خاص", prepared: "أُعد خصيصاً لـ", disclaimer: "سير عمل توضيحي مبني فقط على سياق أعمال عام. لا يتم استخدام أي بيانات داخلية للشركة.", discuss: "ناقش هذا التصور ↗", live: "الأتمتة مفعلة", simulate: "+ محاكاة استفسار", command: "مركز القيادة التجارية", hero: "المبيعات والمتابعة والتنفيذ التشغيلي في نظام واحد", heroCopy: "تصور مخصص يوضح كيف يمكن ربط الاستفسارات والحسابات وصناع القرار وعروض الأسعار والمهام والمتابعة وتقارير الإدارة.", openValue: "قيمة الفرص المفتوحة", highFit: "فرص عالية التوافق", urgent: "أولويات عاجلة", contacts: "تغطية صناع القرار", priority: "الفرص ذات الأولوية", account: "الحساب", ai: "AI", stage: "المرحلة", value: "القيمة", management: "ملخص الإدارة بالذكاء الاصطناعي", attention: "ما الذي يستحق الاهتمام اليوم؟", viewAll: "عرض الكل", accounts: "الحسابات التجارية", opportunities: "مسار الفرص", contactTitle: "خريطة صناع القرار", quotes: "عروض الأسعار والمقترحات", tenders: "المنافسات والمواعيد", tasks: "المهام والإجراءات التالية", emails: "البريد والمتابعة", automation: "سير عمل الأتمتة", team: "أداء الفريق", documents: "المستندات التجارية", reports: "تقارير الإدارة", aiCenter: "مركز الذكاء الاصطناعي", illustrative: "توضيحي", enabled: "مفعّل", paused: "متوقف", pipeline: "المسار", followups: "المتابعات", response: "نسبة الرد", generate: "إنشاء تحليل", ask: "اسأل AI", risk: "إظهار المخاطر", forecast: "التوقعات", priorities: "الأولويات", ready: "جاهز للمراجعة", complete: "إكمال المهمة", generated: "تم إنشاء التحليل", simulated: "تم التقاط الاستفسار وتقييمه وتوجيهه", noData: "لا توجد عناصر مهيأة لهذا التصور بعد." },
};

function isObj(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseConfig(value: Record<string, unknown>): DemoConfig {
  return value as DemoConfig;
}

export default function ConceptDemoClient({ companyName, industry, location, config: rawConfig }: { companyName: string; industry: string; location: string; config: Record<string, unknown> }) {
  const config = parseConfig(rawConfig);
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [active, setActive] = useState<View>("overview");
  const [toast, setToast] = useState("");
  const [workflowState, setWorkflowState] = useState<Record<number, boolean>>(() => Object.fromEntries((config.workflows ?? fallbackWorkflows).map((w, i) => [i, w.enabled !== false])));
  const [taskDone, setTaskDone] = useState<Record<number, boolean>>({});

  const t = ui[lang];
  const L = (value: Bi | undefined): string => {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value[lang] ?? value.en ?? value.ar ?? "";
  };
  const num = (value: number) => new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-arab" : "en-US").format(value);
  const money = (value: number) => new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-arab" : "en-SA", { style: "currency", currency: config.currency ?? "SAR", maximumFractionDigits: 0 }).format(value);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 1800); };

  const accounts = config.accounts?.length ? config.accounts : fallbackAccounts;
  const opportunities = config.opportunities?.length ? config.opportunities : fallbackOpps;
  const contacts = config.contacts?.length ? config.contacts : fallbackContacts;
  const workflows = config.workflows?.length ? config.workflows : fallbackWorkflows;
  const quotes = config.quotes ?? [
    { title: B("Priority quotation", "عرض سعر ذو أولوية"), account: accounts[0]?.name, status: B("Viewed", "تمت المشاهدة"), value: opportunities[0]?.value ?? 145000, when: B("Due today", "مستحق اليوم") },
    { title: B("Technical proposal", "مقترح فني"), account: accounts[1]?.name, status: B("Technical revision", "مراجعة فنية"), value: opportunities[1]?.value ?? 220000, when: B("Tomorrow", "غداً") },
  ];
  const tenders = config.tenders ?? [
    { title: B("Institutional tender package", "حزمة منافسة مؤسسية"), account: accounts[2]?.name, status: B("Documents in progress", "المستندات قيد الإعداد"), value: opportunities[2]?.value ?? 98000, when: B("7 days", "7 أيام") },
  ];
  const tasks = config.tasks ?? [
    { title: B("Follow up highest-fit quotation", "متابعة أعلى عرض سعري توافقاً"), account: accounts[0]?.name, owner: B("Sales", "المبيعات"), status: B("High priority", "أولوية عالية"), when: B("Today", "اليوم") },
    { title: B("Complete technical review", "إكمال المراجعة الفنية"), account: accounts[1]?.name, owner: B("Applications", "التطبيقات"), status: B("Medium priority", "أولوية متوسطة"), when: B("Tomorrow", "غداً") },
  ];
  const emails = config.emails ?? [
    { title: B("Quotation follow-up", "متابعة عرض السعر"), account: accounts[0]?.name, status: B("Ready for review", "جاهز للمراجعة"), when: B("Due today", "مستحق اليوم") },
    { title: B("Technical call confirmation", "تأكيد المكالمة الفنية"), account: accounts[1]?.name, status: B("Scheduled", "مجدول"), when: B("Tomorrow", "غداً") },
  ];
  const documents = config.documents ?? [
    { title: B("Commercial proposal.pdf", "المقترح التجاري.pdf"), account: accounts[0]?.name, status: B("Shared", "تمت المشاركة"), meta: B("Proposal", "مقترح") },
    { title: B("Technical specification.pdf", "المواصفات الفنية.pdf"), account: accounts[1]?.name, status: B("Viewed", "تمت المشاهدة"), meta: B("Technical", "فني") },
  ];
  const team = config.team ?? [
    { name: B("Commercial lead", "قائد المبيعات"), region: B("National", "وطني"), pipeline: opportunities.reduce((s, o) => s + (o.value ?? 0), 0), followups: 4, rate: 46 },
    { name: B("Regional sales", "المبيعات الإقليمية"), region: config.regions?.[0] ?? B("Central", "الوسطى"), pipeline: Math.round(opportunities.reduce((s, o) => s + (o.value ?? 0), 0) * .55), followups: 3, rate: 42 },
    { name: B("Technical applications", "التطبيقات الفنية"), region: B("Cross-region", "جميع المناطق"), pipeline: Math.round(opportunities.reduce((s, o) => s + (o.value ?? 0), 0) * .42), followups: 2, rate: 51 },
  ];

  const metrics = useMemo(() => {
    const openValue = opportunities.reduce((sum, item) => sum + (item.value ?? 0), 0);
    const highFit = opportunities.filter((item) => (item.score ?? 0) >= 85).length;
    return { openValue, highFit, urgent: Math.max(2, Math.min(5, tasks.length)), contacts: contacts.length };
  }, [contacts.length, opportunities, tasks.length]);

  const title = nav.find((item) => item.id === active)?.label ?? nav[0].label;
  const shortName = L(config.shortName) || companyName;
  const aiBrief = L(config.aiBrief) || (lang === "ar" ? "ابدأ بالفرص الأعلى توافقاً، وأغلق فجوات المتابعة، وأظهر المواعيد التجارية الحرجة قبل أن تصبح مخاطر." : "Start with the highest-fit opportunities, close follow-up gaps and surface critical commercial deadlines before they become risks.");

  const SectionHead = ({ eyebrow, heading, copy }: { eyebrow: string; heading: string; copy?: string }) => (
    <div className={styles.sectionHeader}><div><small>{eyebrow}</small><h2>{heading}</h2>{copy ? <p>{copy}</p> : null}</div></div>
  );

  const GenericRows = ({ rows, kind }: { rows: Row[]; kind: "quote" | "tender" | "task" | "mail" | "doc" }) => {
    const rowClass = kind === "quote" ? styles.quoteRow : kind === "tender" ? styles.tenderRow : kind === "task" ? styles.taskRow : kind === "mail" ? styles.mailRow : styles.docRow;
    if (!rows.length) return <div className={styles.panel}>{t.noData}</div>;
    return <div className={styles.panel}>{rows.map((row, i) => <div className={rowClass} key={`${kind}-${i}`}><div className={styles.rowTitle}><strong>{L(row.title)}</strong><small>{L(row.account)}</small></div><div className={styles.rowCell}>{L(row.status)}</div><div className={styles.rowCell}>{row.value ? money(row.value) : L(row.when)}</div><div className={styles.rowCell}>{row.value ? L(row.when) : L(row.owner ?? row.meta)}</div>{kind === "task" ? <button className={styles.secondary} onClick={() => { setTaskDone((v) => ({ ...v, [i]: !v[i] })); notify(t.complete); }}>{taskDone[i] ? "✓" : t.complete}</button> : null}</div>)}</div>;
  };

  return <main className={styles.page} data-theme={theme} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/systems"><span>Lab</span>Narrative<b>Systems</b></a>
      <div className={styles.conceptTag}>{t.privateConcept} · {shortName}</div>
      <nav className={styles.nav}>{nav.map((item) => <button key={item.id} className={active === item.id ? styles.active : ""} onClick={() => setActive(item.id)}><i>{item.icon}</i>{item.label[lang]}</button>)}</nav>
      <div className={styles.sidebarFoot}><strong>{t.prepared} {companyName}</strong><p>{t.disclaimer}</p><a href={`mailto:hello@labnarrative.com?subject=${encodeURIComponent(`${companyName} Systems concept`)}`}>{t.discuss}</a></div>
    </aside>

    <section className={styles.main}>
      <header className={styles.topbar}>
        <div className={styles.titleBlock}><small>{L(config.conceptLabel) || `${shortName} · ${industry}${location ? ` · ${location}` : ""}`}</small><h1>{title[lang]}</h1></div>
        <div className={styles.topActions}>
          <div className={styles.seg}><button className={lang === "en" ? styles.selected : ""} onClick={() => setLang("en")}>EN</button><button className={lang === "ar" ? styles.selected : ""} onClick={() => setLang("ar")}>عربي</button></div>
          <div className={styles.seg}><button className={theme === "light" ? styles.selected : ""} onClick={() => setTheme("light")}>☀ {lang === "ar" ? "فاتح" : "Light"}</button><button className={theme === "dark" ? styles.selected : ""} onClick={() => setTheme("dark")}>☾ {lang === "ar" ? "داكن" : "Dark"}</button></div>
          <span className={styles.live}><i></i>{t.live}</span>
          <button className={styles.primary} onClick={() => notify(t.simulated)}>{t.simulate}</button>
        </div>
      </header>

      <div className={styles.content}>
        {active === "overview" && <>
          <section className={styles.heroStrip}><div><span>{t.command}</span><h2>{L(config.tagline) || t.hero}</h2><p>{t.heroCopy}</p></div><button className={styles.primary} onClick={() => setActive("ai")}>{t.ask} ✦</button></section>
          <section className={styles.metricGrid}>
            <article className={styles.metric}><span>{t.openValue}</span><strong>{money(metrics.openValue)}</strong><small>{num(opportunities.length)} {t.opportunities.toLowerCase()}</small></article>
            <article className={styles.metric}><span>{t.highFit}</span><strong>{num(metrics.highFit)}</strong><small>AI ≥ {num(85)}</small></article>
            <article className={styles.metric}><span>{t.contacts}</span><strong>{num(metrics.contacts)}</strong><small>{t.illustrative}</small></article>
            <article className={styles.metric}><span>{t.urgent}</span><strong>{num(metrics.urgent)}</strong><small>{lang === "ar" ? "تحتاج إجراء" : "Need action"}</small></article>
          </section>
          <section className={styles.grid2}>
            <article className={styles.panel}><div className={styles.panelHead}><div><small>{t.pipeline}</small><h2>{t.priority}</h2></div><button onClick={() => setActive("opportunities")}>{t.viewAll}</button></div><table className={styles.table}><thead><tr><th>{t.account}</th><th>{t.ai}</th><th>{t.stage}</th><th>{t.value}</th></tr></thead><tbody>{opportunities.slice(0, 5).map((o, i) => <tr key={i} onClick={() => setActive("opportunities")}><td><span className={styles.cellTitle}>{L(o.account)}</span><span className={styles.cellSub}>{L(o.title)}</span></td><td><span className={`${styles.score} ${(o.score ?? 0) >= 85 ? styles.scoreHigh : ""}`}>{num(o.score ?? 0)}</span></td><td>{L(o.stage)}</td><td>{money(o.value ?? 0)}</td></tr>)}</tbody></table></article>
            <article className={styles.aiCard}><small>{t.management}</small><h2>{t.attention}</h2><p>{aiBrief}</p><div className={styles.quickPrompts}><button onClick={() => notify(t.generated)}>{t.priorities}</button><button onClick={() => notify(t.generated)}>{t.risk}</button><button onClick={() => notify(t.generated)}>{t.forecast}</button></div></article>
          </section>
        </>}

        {active === "accounts" && <><SectionHead eyebrow={t.command} heading={t.accounts} copy={lang === "ar" ? "رؤية الحسابات والقيمة والملكية ومؤشر الصحة في مكان واحد." : "See account value, ownership and commercial health in one place."}/><div className={styles.accountGrid}>{accounts.map((a, i) => <article className={styles.accountCard} key={i}><div className={styles.accountTop}><div><h3>{L(a.name)}</h3><p>{L(a.type)} · {L(a.region)}</p></div><span className={`${styles.score} ${(a.health ?? 0) >= 85 ? styles.scoreHigh : ""}`}>{num(a.health ?? 0)}</span></div><p>{L(a.division)}</p><div className={styles.accountMeta}><span>{t.value}<strong>{money(a.value ?? 0)}</strong></span><span>{lang === "ar" ? "المالك" : "Owner"}<strong>{L(a.owner)}</strong></span><span>{t.contacts}<strong>{num(a.contacts ?? 0)}</strong></span></div></article>)}</div></>}

        {active === "opportunities" && <><SectionHead eyebrow={t.pipeline} heading={t.opportunities}/><div className={styles.panel}><table className={styles.table}><thead><tr><th>{t.account}</th><th>{lang === "ar" ? "الفرصة" : "Opportunity"}</th><th>{t.ai}</th><th>{t.stage}</th><th>{t.value}</th></tr></thead><tbody>{opportunities.map((o, i) => <tr key={i}><td>{L(o.account)}</td><td><span className={styles.cellTitle}>{L(o.title)}</span><span className={styles.cellSub}>{L(o.division)}</span></td><td><span className={`${styles.score} ${(o.score ?? 0) >= 85 ? styles.scoreHigh : ""}`}>{num(o.score ?? 0)}</span></td><td>{L(o.stage)}</td><td>{money(o.value ?? 0)}</td></tr>)}</tbody></table></div></>}

        {active === "contacts" && <><SectionHead eyebrow={t.command} heading={t.contactTitle} copy={lang === "ar" ? "عدة صناع قرار ومؤثرين لكل حساب بدلاً من الاعتماد على جهة اتصال واحدة." : "Multiple decision-makers and influencers per account instead of relying on one contact."}/><div className={styles.contactGrid}>{contacts.map((c, i) => <article className={styles.contactCard} key={i}><div className={styles.avatar}>{L(c.name).split(" ").map((p) => p[0]).join("").slice(0, 2)}</div><h3>{L(c.name)}</h3><p>{L(c.role)}</p><small>{L(c.account)}</small><small><span className={styles.statusDot}></span>{L(c.decision)}</small>{c.email ? <div className={styles.contactActions}><button onClick={() => navigator.clipboard?.writeText(c.email ?? "")}>✉ {c.email}</button></div> : null}</article>)}</div></>}

        {active === "quotes" && <><SectionHead eyebrow={t.command} heading={t.quotes}/><GenericRows rows={quotes} kind="quote"/></>}
        {active === "tenders" && <><SectionHead eyebrow={t.command} heading={t.tenders}/><GenericRows rows={tenders} kind="tender"/></>}
        {active === "tasks" && <><SectionHead eyebrow={t.command} heading={t.tasks}/><GenericRows rows={tasks} kind="task"/></>}
        {active === "email" && <><SectionHead eyebrow={t.command} heading={t.emails} copy={lang === "ar" ? "مسودات متابعة، تذكيرات، وتسلسلات تتوقف عند استلام رد." : "Follow-up drafts, reminders and sequences that stop when a reply arrives."}/><GenericRows rows={emails} kind="mail"/></>}

        {active === "automation" && <><SectionHead eyebrow={t.command} heading={t.automation}/><div className={styles.grid2}><article className={styles.panel}>{workflows.map((w, i) => <div className={styles.activityItem} key={i}><i>↯</i><div><strong>{L(w.name)}</strong><p>{L(w.detail)}</p><small>{workflowState[i] ? t.enabled : t.paused}</small></div><button className={styles.secondary} onClick={() => setWorkflowState((v) => ({ ...v, [i]: !v[i] }))}>{workflowState[i] ? t.enabled : t.paused}</button></div>)}</article><article className={styles.aiCard}><small>{t.management}</small><h2>{lang === "ar" ? "الأتمتة تعمل مع بوابة بشرية" : "Automation with a human gate"}</h2><p>{lang === "ar" ? "النظام يمكنه تجهيز التصنيف والمتابعة والمسودات والتنبيهات تلقائياً، بينما تبقى القرارات الحساسة والإرسال النهائي تحت مراجعة بشرية." : "The system can prepare scoring, follow-up, drafts and alerts automatically while sensitive decisions and final sending remain human-reviewed."}</p></article></div></>}

        {active === "team" && <><SectionHead eyebrow={t.command} heading={t.team}/><div className={styles.panel}><table className={styles.table}><thead><tr><th>{lang === "ar" ? "الفريق" : "Team"}</th><th>{lang === "ar" ? "المنطقة" : "Region"}</th><th>{t.pipeline}</th><th>{t.followups}</th><th>{t.response}</th></tr></thead><tbody>{team.map((r, i) => <tr key={i}><td className={styles.cellTitle}>{L(r.name)}</td><td>{L(r.region)}</td><td>{money(r.pipeline ?? 0)}</td><td>{num(r.followups ?? 0)}</td><td>{num(r.rate ?? 0)}{lang === "ar" ? "٪" : "%"}</td></tr>)}</tbody></table></div></>}
        {active === "documents" && <><SectionHead eyebrow={t.command} heading={t.documents}/><GenericRows rows={documents} kind="doc"/></>}

        {active === "reports" && <><SectionHead eyebrow={t.command} heading={t.reports}/><section className={styles.metricGrid}><article className={styles.metric}><span>{t.openValue}</span><strong>{money(metrics.openValue)}</strong><small>{t.pipeline}</small></article><article className={styles.metric}><span>{t.highFit}</span><strong>{num(metrics.highFit)}</strong><small>AI ≥ {num(85)}</small></article><article className={styles.metric}><span>{t.contacts}</span><strong>{num(metrics.contacts)}</strong><small>{t.illustrative}</small></article><article className={styles.metric}><span>{t.response}</span><strong>{lang === "ar" ? "٤٦٪" : "46%"}</strong><small>{t.illustrative}</small></article></section><section className={styles.grid2}><article className={styles.panel}><div className={styles.panelHead}><div><small>{t.reports}</small><h2>{lang === "ar" ? "ملخص الإدارة" : "Management summary"}</h2></div></div><p>{L(config.reportSummary) || (lang === "ar" ? "يوحد النظام رؤية الحسابات والفرص والمتابعات والمنافسات وأداء الفريق، ويبرز ما يحتاج تدخلاً قبل فقد الزخم التجاري." : "The system unifies account, opportunity, follow-up, tender and team visibility, surfacing what needs intervention before commercial momentum is lost.")}</p></article><article className={styles.aiCard}><small>{t.management}</small><h2>{t.attention}</h2><p>{aiBrief}</p><button className={styles.primary} onClick={() => notify(t.generated)}>{t.generate} ↗</button></article></section></>}

        {active === "ai" && <><SectionHead eyebrow={t.command} heading={t.aiCenter} copy={lang === "ar" ? "اسأل النظام عن الأولويات والمخاطر والحسابات والمتابعات والتوقعات." : "Ask the system about priorities, risks, accounts, follow-ups and forecasts."}/><section className={styles.grid2}><article className={styles.aiCard}><small>{t.management}</small><h2>{t.attention}</h2><p>{aiBrief}</p><div className={styles.quickPrompts}><button onClick={() => notify(t.generated)}>{t.priorities}</button><button onClick={() => notify(t.generated)}>{t.risk}</button><button onClick={() => notify(t.generated)}>{t.forecast}</button><button onClick={() => notify(t.generated)}>{lang === "ar" ? "اكتب متابعة" : "Draft follow-up"}</button></div></article><article className={styles.panel}><div className={styles.panelHead}><div><small>{t.ready}</small><h2>{lang === "ar" ? "مثال على سؤال إداري" : "Example management question"}</h2></div></div><p>{lang === "ar" ? "أي الفرص عالية القيمة معرضة للتأخير هذا الأسبوع، ولماذا؟" : "Which high-value opportunities are at risk of delay this week, and why?"}</p><button className={styles.primary} onClick={() => notify(t.generated)}>{t.ask} ✦</button></article></section></>}
      </div>
    </section>
    {toast ? <div style={{ position: "fixed", bottom: 22, right: lang === "ar" ? "auto" : 22, left: lang === "ar" ? 22 : "auto", zIndex: 40, background: "#18231d", color: "white", padding: "10px 14px", borderRadius: 10, fontSize: 12 }}>{toast}</div> : null}
  </main>;
}
