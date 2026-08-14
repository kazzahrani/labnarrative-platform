"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type Lang = "en" | "ar";
type Theme = "dark" | "light";
type Stage = "New" | "Qualified" | "Proposal" | "Won";
type View = "Overview" | "Leads" | "Automation" | "Reports";
type BiText = { en: string; ar: string };

type Lead = {
  id: number;
  company: string;
  contact: string;
  email: string;
  source: "Website" | "Referral" | "LinkedIn" | "Campaign";
  value: number;
  score: number;
  stage: Stage;
  reason: BiText;
  next: BiText;
};

const initialLeads: Lead[] = [
  { id: 1, company: "Northstar Bio", contact: "Maya Chen", email: "maya@northstar.example", source: "Website", value: 18000, score: 92, stage: "Qualified", reason: { en: "Strong fit, clear buying intent and high-value service need.", ar: "توافق قوي مع الخدمة، ونية شراء واضحة، واحتياج ذو قيمة مرتفعة." }, next: { en: "Send tailored discovery email", ar: "إرسال رسالة تعريفية مخصصة" } },
  { id: 2, company: "Atlas Consulting", contact: "Omar Rahman", email: "omar@atlas.example", source: "Referral", value: 9500, score: 81, stage: "Proposal", reason: { en: "Warm referral with an active operations project and near-term timeline.", ar: "إحالة دافئة مرتبطة بمشروع عمليات قائم وجدول زمني قريب." }, next: { en: "Follow up on proposal", ar: "متابعة العرض المرسل" } },
  { id: 3, company: "Nexa Health", contact: "Sarah Miller", email: "sarah@nexa.example", source: "LinkedIn", value: 14000, score: 74, stage: "New", reason: { en: "Relevant company profile, but buying urgency still needs qualification.", ar: "الشركة مناسبة، لكن درجة الاستعجال للشراء ما زالت تحتاج إلى تأهيل." }, next: { en: "Ask 3 qualification questions", ar: "طرح 3 أسئلة للتأهيل" } },
  { id: 4, company: "Vertex Labs", contact: "Daniel Park", email: "daniel@vertex.example", source: "Website", value: 22000, score: 88, stage: "Qualified", reason: { en: "High-value account with multiple workflow pain points and executive engagement.", ar: "حساب مرتفع القيمة مع عدة نقاط تعطل في سير العمل وتفاعل من الإدارة." }, next: { en: "Book workflow mapping call", ar: "حجز اجتماع لرسم سير العمل" } },
  { id: 5, company: "Meridian Group", contact: "Lina Haddad", email: "lina@meridian.example", source: "Campaign", value: 7200, score: 67, stage: "New", reason: { en: "Good fit but limited engagement so far.", ar: "التوافق جيد، لكن التفاعل ما زال محدوداً." }, next: { en: "Send case-study follow-up", ar: "إرسال متابعة مع دراسة حالة" } },
  { id: 6, company: "Axiom Research", contact: "Thomas Reed", email: "thomas@axiom.example", source: "Referral", value: 16500, score: 95, stage: "Won", reason: { en: "Excellent fit, urgent need and decision-maker involvement.", ar: "توافق ممتاز، واحتياج عاجل، ومشاركة مباشرة من صاحب القرار." }, next: { en: "Kickoff scheduled", ar: "تم تحديد اجتماع بدء المشروع" } },
];

const stages: Stage[] = ["New", "Qualified", "Proposal", "Won"];
const views: View[] = ["Overview", "Leads", "Automation", "Reports"];

const ui = {
  en: {
    overview: "Overview", leads: "Leads", automation: "Automation", reports: "Reports",
    workspace: "Demo workspace", flagship: "Flagship demo", system: "Sales & follow-up system", build: "Build a system like this ↗",
    automationLive: "Automation live", simulate: "+ Simulate new lead", light: "Light", dark: "Dark",
    openPipeline: "Open pipeline", across: "Across", opportunities: "opportunities", highFit: "High-fit leads", score80: "AI score ≥ 80",
    wonMonth: "Won this month", converted: "1 converted account", followups: "Follow-ups due", priority: "2 high priority",
    pipeline: "Pipeline", priorityOpps: "Priority opportunities", viewAll: "View all →", account: "Account", aiFit: "AI fit", stage: "Stage", value: "Value",
    today: "Today", activity: "Automation activity", funnel: "Funnel", currentPipeline: "Current pipeline",
    leadQualified: "Lead qualified", leadQualifiedCopy: "Northstar Bio scored 92/100.", followupPrepared: "Follow-up prepared", followupPreparedCopy: "Atlas Consulting proposal follow-up is ready.",
    sequenceStopped: "Sequence stopped", sequenceStoppedCopy: "Axiom Research replied and moved to Won.", enquiryCaptured: "New enquiry captured", enquiryCapturedCopy: "Nexa Health added from website form.", yesterday: "Yesterday",
    aiRanked: "AI-ranked", opportunityList: "Opportunity list", accounts: "accounts", opportunity: "Opportunity", potentialValue: "Potential value", source: "Source", currentStage: "Current stage",
    aiQualification: "AI qualification", whyMatters: "Why this lead matters", nextAction: "Recommended next action", prepareAI: "Prepare with AI ↗", moveStage: "Move stage",
    activeWorkflow: "Active workflow", workflowTitle: "Inbound lead → qualified opportunity", workflowIntro: "This demo shows how one enquiry can move through qualification and follow-up without disappearing into an inbox.",
    enabled: "Enabled", paused: "Paused", salesPerformance: "Sales performance", august: "August operating summary", generate: "Generate report ↗",
    newOpps: "New opportunities", vsJuly: "+28% vs July", qualifiedRate: "Qualified rate", ptsJuly: "+9 pts vs July", proposalValue: "Proposal value", openProposals: "Current open proposals", responseRate: "Response rate", sequences: "Across automated sequences",
    sourceQuality: "Source quality", bestLeads: "Where the best leads came from", management: "Management summary", interpretation: "AI-generated interpretation",
    summary1: "Pipeline quality improved this month, driven primarily by referrals and website enquiries. High-fit opportunities are moving into proposal faster, while campaign-sourced leads require more qualification.",
    summary2Label: "Recommended focus:", summary2: "prioritise referral partnerships, shorten response time for website leads and review the campaign targeting criteria before increasing volume.",
    newLeadToast: "New lead captured and scored automatically", moved: "Moved to", aiPrepared: "Personalised follow-up prepared", reportGenerated: "Demo report generated",
  },
  ar: {
    overview: "نظرة عامة", leads: "العملاء المحتملون", automation: "الأتمتة", reports: "التقارير",
    workspace: "مساحة العرض التجريبي", flagship: "العرض الرئيسي", system: "نظام المبيعات والمتابعة", build: "ابنِ نظاماً مشابهاً ↗",
    automationLive: "الأتمتة مفعلة", simulate: "+ محاكاة عميل جديد", light: "فاتح", dark: "داكن",
    openPipeline: "قيمة الفرص المفتوحة", across: "ضمن", opportunities: "فرص", highFit: "فرص عالية التوافق", score80: "تقييم الذكاء الاصطناعي ≥ 80",
    wonMonth: "المبيعات المحققة هذا الشهر", converted: "حساب واحد تم تحويله", followups: "المتابعات المستحقة", priority: "2 أولوية مرتفعة",
    pipeline: "مسار المبيعات", priorityOpps: "الفرص ذات الأولوية", viewAll: "عرض الكل ←", account: "الحساب", aiFit: "توافق AI", stage: "المرحلة", value: "القيمة",
    today: "اليوم", activity: "نشاط الأتمتة", funnel: "قمع المبيعات", currentPipeline: "المسار الحالي",
    leadQualified: "تم تأهيل العميل", leadQualifiedCopy: "حصل Northstar Bio على تقييم 92/100.", followupPrepared: "تم إعداد المتابعة", followupPreparedCopy: "متابعة عرض Atlas Consulting جاهزة للمراجعة.",
    sequenceStopped: "تم إيقاف التسلسل", sequenceStoppedCopy: "رد Axiom Research وانتقل إلى مرحلة تم الفوز.", enquiryCaptured: "تم تسجيل استفسار جديد", enquiryCapturedCopy: "أُضيف Nexa Health من نموذج الموقع.", yesterday: "أمس",
    aiRanked: "مرتبة بالذكاء الاصطناعي", opportunityList: "قائمة الفرص", accounts: "حسابات", opportunity: "الفرصة", potentialValue: "القيمة المتوقعة", source: "المصدر", currentStage: "المرحلة الحالية",
    aiQualification: "تأهيل بالذكاء الاصطناعي", whyMatters: "لماذا تستحق هذه الفرصة الاهتمام", nextAction: "الإجراء التالي المقترح", prepareAI: "إعداد بالذكاء الاصطناعي ↗", moveStage: "نقل المرحلة",
    activeWorkflow: "سير العمل النشط", workflowTitle: "عميل وارد ← فرصة مؤهلة", workflowIntro: "يوضح هذا العرض كيف ينتقل الاستفسار من التسجيل إلى التأهيل والمتابعة دون أن يضيع داخل البريد الإلكتروني.",
    enabled: "مفعّل", paused: "متوقف", salesPerformance: "أداء المبيعات", august: "ملخص أداء أغسطس", generate: "إنشاء التقرير ↗",
    newOpps: "فرص جديدة", vsJuly: "+28% مقارنة بيوليو", qualifiedRate: "نسبة التأهيل", ptsJuly: "+9 نقاط مقارنة بيوليو", proposalValue: "قيمة العروض", openProposals: "العروض المفتوحة حالياً", responseRate: "نسبة الرد", sequences: "عبر تسلسلات المتابعة الآلية",
    sourceQuality: "جودة المصدر", bestLeads: "مصادر أفضل العملاء", management: "ملخص الإدارة", interpretation: "تفسير مولد بالذكاء الاصطناعي",
    summary1: "تحسنت جودة مسار المبيعات هذا الشهر، مدفوعة بشكل أساسي بالإحالات واستفسارات الموقع. تنتقل الفرص عالية التوافق إلى مرحلة العرض بسرعة أكبر، بينما تحتاج الفرص القادمة من الحملات إلى تأهيل إضافي.",
    summary2Label: "التركيز المقترح:", summary2: "إعطاء أولوية لشراكات الإحالة، وتقليل زمن الرد على استفسارات الموقع، ومراجعة معايير استهداف الحملات قبل زيادة حجمها.",
    newLeadToast: "تم تسجيل العميل الجديد وتقييمه تلقائياً", moved: "تم النقل إلى", aiPrepared: "تم إعداد متابعة مخصصة", reportGenerated: "تم إنشاء التقرير التجريبي",
  },
} as const;

const stageLabels: Record<Lang, Record<Stage, string>> = {
  en: { New: "New", Qualified: "Qualified", Proposal: "Proposal", Won: "Won" },
  ar: { New: "جديد", Qualified: "مؤهل", Proposal: "عرض", Won: "تم الفوز" },
};

const sourceLabels: Record<Lang, Record<Lead["source"], string>> = {
  en: { Website: "Website", Referral: "Referral", LinkedIn: "LinkedIn", Campaign: "Campaign" },
  ar: { Website: "الموقع", Referral: "إحالة", LinkedIn: "لينكدإن", Campaign: "حملة" },
};

const workflow: Array<[string, BiText, BiText, BiText]> = [
  ["01", { en: "Lead captured", ar: "تسجيل العميل" }, { en: "Website form creates the contact and opportunity record.", ar: "ينشئ نموذج الموقع سجل جهة الاتصال والفرصة تلقائياً." }, { en: "Instant", ar: "فوري" }],
  ["02", { en: "AI qualification", ar: "التأهيل بالذكاء الاصطناعي" }, { en: "The system scores fit, intent, value and urgency from the enquiry.", ar: "يقيّم النظام مدى التوافق والنية والقيمة ودرجة الاستعجال من الاستفسار." }, { en: "Instant", ar: "فوري" }],
  ["03", { en: "Human review", ar: "مراجعة بشرية" }, { en: "High-fit leads are surfaced with reasoning and the recommended next action.", ar: "تظهر الفرص الأعلى توافقاً مع سبب التقييم والإجراء التالي المقترح." }, { en: "If score ≥ 75", ar: "إذا كان التقييم ≥ 75" }],
  ["04", { en: "Personalised outreach", ar: "تواصل مخصص" }, { en: "A tailored first response is prepared using the lead context.", ar: "يتم إعداد رد أول مخصص اعتماداً على سياق العميل." }, { en: "After approval", ar: "بعد الموافقة" }],
  ["05", { en: "Follow-up", ar: "المتابعة" }, { en: "If there is no reply, the next touch is scheduled automatically.", ar: "عند عدم وجود رد، يتم جدولة المتابعة التالية تلقائياً." }, { en: "+3 days", ar: "+3 أيام" }],
  ["06", { en: "Reply detected", ar: "اكتشاف الرد" }, { en: "A genuine reply stops the sequence and returns the opportunity to a human.", ar: "الرد الحقيقي يوقف التسلسل ويعيد الفرصة إلى المسؤول البشري." }, { en: "Automatic", ar: "تلقائي" }],
];

function money(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function SystemsDemoPage() {
  const [active, setActive] = useState<View>("Overview");
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(1);
  const [sequenceEnabled, setSequenceEnabled] = useState(true);
  const [toast, setToast] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("dark");

  const t = ui[lang];
  const selected = leads.find((lead) => lead.id === selectedId) ?? leads[0];
  const pipelineValue = leads.filter((lead) => lead.stage !== "Won").reduce((sum, lead) => sum + lead.value, 0);
  const qualified = leads.filter((lead) => lead.score >= 80 && lead.stage !== "Won").length;
  const wonValue = leads.filter((lead) => lead.stage === "Won").reduce((sum, lead) => sum + lead.value, 0);
  const stageCounts = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, leads.filter((lead) => lead.stage === stage).length])) as Record<Stage, number>, [leads]);

  const viewLabel = (view: View) => view === "Overview" ? t.overview : view === "Leads" ? t.leads : view === "Automation" ? t.automation : t.reports;

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1900);
  }

  function moveLead(id: number, stage: Stage) {
    setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, stage } : lead));
    notify(`${t.moved} ${stageLabels[lang][stage]}`);
  }

  function simulateLead() {
    const id = Math.max(...leads.map((lead) => lead.id)) + 1;
    setLeads((current) => [{ id, company: "Helix Partners", contact: "Alex Morgan", email: "alex@helix.example", source: "Website", value: 12500, score: 86, stage: "New", reason: { en: "AI detected strong service fit and clear operational pain in the enquiry.", ar: "اكتشف الذكاء الاصطناعي توافقاً قوياً مع الخدمة ومشكلة تشغيلية واضحة في الاستفسار." }, next: { en: "Send personalised introduction", ar: "إرسال مقدمة مخصصة" } }, ...current]);
    setSelectedId(id);
    setActive("Leads");
    notify(t.newLeadToast);
  }

  return (
    <main className={styles.page} data-theme={theme} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      {toast ? <div className={styles.toast}>{toast}</div> : null}

      <aside className={styles.sidebar}>
        <a href="/systems" className={styles.brand}><span>Lab</span>Narrative <b>Systems</b></a>
        <div className={styles.workspaceLabel}>{t.workspace}</div>
        <nav>
          {views.map((item) => (
            <button key={item} className={active === item ? styles.activeNav : ""} onClick={() => setActive(item)}>
              <span>{item === "Overview" ? "◫" : item === "Leads" ? "◎" : item === "Automation" ? "↯" : "↗"}</span>{viewLabel(item)}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <span>{t.flagship}</span>
          <small>{t.system}</small>
          <a href="mailto:hello@labnarrative.com?subject=Build%20a%20system%20like%20this">{t.build}</a>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div><span className={styles.kicker}>Northstar Services</span><h1>{viewLabel(active)}</h1></div>
          <div className={styles.topActions}>
            <div className={styles.controlBar} aria-label="Language">
              <button className={lang === "en" ? styles.controlActive : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
              <button className={lang === "ar" ? styles.controlActive : ""} aria-pressed={lang === "ar"} onClick={() => setLang("ar")}>عربي</button>
            </div>
            <div className={styles.controlBar} aria-label="Theme">
              <button className={theme === "light" ? styles.controlActive : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>☀ {t.light}</button>
              <button className={theme === "dark" ? styles.controlActive : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>☾ {t.dark}</button>
            </div>
            <span className={styles.live}><i /> {t.automationLive}</span>
            <button className={styles.actionButton} onClick={simulateLead}>{t.simulate}</button>
          </div>
        </header>

        {active === "Overview" ? (
          <div className={styles.content}>
            <section className={styles.metrics}>
              <article><span>{t.openPipeline}</span><strong>{money(pipelineValue, lang)}</strong><small>{t.across} {leads.filter((l) => l.stage !== "Won").length} {t.opportunities}</small></article>
              <article><span>{t.highFit}</span><strong>{qualified}</strong><small>{t.score80}</small></article>
              <article><span>{t.wonMonth}</span><strong>{money(wonValue, lang)}</strong><small>{t.converted}</small></article>
              <article><span>{t.followups}</span><strong>4</strong><small>{t.priority}</small></article>
            </section>

            <section className={styles.twoCol}>
              <article className={styles.panel}>
                <div className={styles.panelHead}><div><span>{t.pipeline}</span><h2>{t.priorityOpps}</h2></div><button onClick={() => setActive("Leads")}>{t.viewAll}</button></div>
                <div className={styles.tableHead}><span>{t.account}</span><span>{t.aiFit}</span><span>{t.stage}</span><span>{t.value}</span></div>
                {leads.slice(0, 5).map((lead) => (
                  <button className={styles.tableRow} key={lead.id} onClick={() => { setSelectedId(lead.id); setActive("Leads"); }}>
                    <div><strong>{lead.company}</strong><small>{lead.contact}</small></div><b className={lead.score >= 85 ? styles.highScore : ""}>{lead.score}</b><em>{stageLabels[lang][lead.stage]}</em><span>{money(lead.value, lang)}</span>
                  </button>
                ))}
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHead}><div><span>{t.today}</span><h2>{t.activity}</h2></div></div>
                <div className={styles.activity}><i>✓</i><div><strong>{t.leadQualified}</strong><p>{t.leadQualifiedCopy}</p><small>09:14</small></div></div>
                <div className={styles.activity}><i>↗</i><div><strong>{t.followupPrepared}</strong><p>{t.followupPreparedCopy}</p><small>08:42</small></div></div>
                <div className={styles.activity}><i>✓</i><div><strong>{t.sequenceStopped}</strong><p>{t.sequenceStoppedCopy}</p><small>{t.yesterday}</small></div></div>
                <div className={styles.activity}><i>◎</i><div><strong>{t.enquiryCaptured}</strong><p>{t.enquiryCapturedCopy}</p><small>{t.yesterday}</small></div></div>
              </article>
            </section>

            <section className={styles.panel} style={{ marginTop: 14 }}>
              <div className={styles.panelHead}><div><span>{t.funnel}</span><h2>{t.currentPipeline}</h2></div></div>
              <div className={styles.funnel}>{stages.map((stage, index) => <div key={stage}><span>{stageLabels[lang][stage]}</span><strong>{stageCounts[stage]}</strong><div style={{ width: `${100 - index * 17}%` }} /></div>)}</div>
            </section>
          </div>
        ) : null}

        {active === "Leads" ? (
          <div className={styles.content}>
            <section className={styles.leadLayout}>
              <div className={styles.panel}>
                <div className={styles.panelHead}><div><span>{t.aiRanked}</span><h2>{t.opportunityList}</h2></div><small>{leads.length} {t.accounts}</small></div>
                <div className={styles.leadList}>{leads.map((lead) => <button key={lead.id} onClick={() => setSelectedId(lead.id)} className={selectedId === lead.id ? styles.selectedLead : ""}><div><strong>{lead.company}</strong><small>{lead.contact} · {sourceLabels[lang][lead.source]}</small></div><b className={lead.score >= 85 ? styles.highScore : ""}>{lead.score}</b></button>)}</div>
              </div>

              <div className={styles.detailPanel}>
                <div className={styles.detailTop}><div><span>{t.opportunity}</span><h2>{selected.company}</h2><p>{selected.contact} · {selected.email}</p></div><div className={styles.bigScore}><small>{t.aiFit}</small><strong>{selected.score}</strong></div></div>
                <div className={styles.detailGrid}><div><span>{t.potentialValue}</span><strong>{money(selected.value, lang)}</strong></div><div><span>{t.source}</span><strong>{sourceLabels[lang][selected.source]}</strong></div><div><span>{t.currentStage}</span><strong>{stageLabels[lang][selected.stage]}</strong></div></div>
                <div className={styles.aiBox}><span>{t.aiQualification}</span><h3>{t.whyMatters}</h3><p>{selected.reason[lang]}</p></div>
                <div className={styles.nextAction}><span>{t.nextAction}</span><strong>{selected.next[lang]}</strong><button onClick={() => notify(t.aiPrepared)}>{t.prepareAI}</button></div>
                <div className={styles.stageControls}><span>{t.moveStage}</span><div>{stages.map((stage) => <button key={stage} className={selected.stage === stage ? styles.stageActive : ""} onClick={() => moveLead(selected.id, stage)}>{stageLabels[lang][stage]}</button>)}</div></div>
              </div>
            </section>
          </div>
        ) : null}

        {active === "Automation" ? (
          <div className={styles.content}>
            <section className={styles.automationHero}><div><span>{t.activeWorkflow}</span><h2>{t.workflowTitle}</h2><p>{t.workflowIntro}</p></div><button className={sequenceEnabled ? styles.toggleOn : styles.toggleOff} onClick={() => setSequenceEnabled(!sequenceEnabled)}><i />{sequenceEnabled ? t.enabled : t.paused}</button></section>
            <section className={styles.workflow}>{workflow.map(([n, title, copy, timing]) => <article key={n}><span>{n}</span><div><h3>{title[lang]}</h3><p>{copy[lang]}</p></div><em>{timing[lang]}</em><i>✓</i></article>)}</section>
          </div>
        ) : null}

        {active === "Reports" ? (
          <div className={styles.content}>
            <section className={styles.reportHeader}><div><span>{t.salesPerformance}</span><h2>{t.august}</h2></div><button onClick={() => notify(t.reportGenerated)}>{t.generate}</button></section>
            <section className={styles.metrics}><article><span>{t.newOpps}</span><strong>18</strong><small>{t.vsJuly}</small></article><article><span>{t.qualifiedRate}</span><strong>53%</strong><small>{t.ptsJuly}</small></article><article><span>{t.proposalValue}</span><strong>$71k</strong><small>{t.openProposals}</small></article><article><span>{t.responseRate}</span><strong>41%</strong><small>{t.sequences}</small></article></section>
            <section className={styles.twoCol}>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>{t.sourceQuality}</span><h2>{t.bestLeads}</h2></div></div><div className={styles.barList}>{[[lang === "ar" ? "إحالة" : "Referral",88],[lang === "ar" ? "الموقع" : "Website",82],["LinkedIn",71],[lang === "ar" ? "حملة" : "Campaign",64]].map(([name,value]) => <div key={name}><span>{name}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}</strong></div>)}</div></article>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>{t.management}</span><h2>{t.interpretation}</h2></div></div><div className={styles.summaryBox}><p>{t.summary1}</p><p><strong>{t.summary2Label}</strong> {t.summary2}</p></div></article>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
