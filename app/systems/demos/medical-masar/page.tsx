"use client";

import { useMemo, useState } from "react";
import styles from "../../demo/page.module.css";

type Lang = "en" | "ar";
type Theme = "dark" | "light";
type Stage = "New" | "Technical review" | "Quotation" | "Tender" | "Won";
type View = "Overview" | "Opportunities" | "Automation" | "Reports";
type BiText = { en: string; ar: string };

type Opportunity = {
  id: number;
  account: BiText;
  contact: string;
  region: "Riyadh" | "Jeddah" | "Dammam";
  division: BiText;
  value: number;
  score: number;
  stage: Stage;
  reason: BiText;
  next: BiText;
};

const initialOpportunities: Opportunity[] = [
  { id: 1, account: { en: "University Research Lab", ar: "مختبر أبحاث جامعي" }, contact: "Dr. Sara A.", region: "Riyadh", division: { en: "Molecular Diagnostics & Life Science", ar: "التشخيص الجزيئي وعلوم الحياة" }, value: 128000, score: 94, stage: "Quotation", reason: { en: "Detailed PCR workflow enquiry, clear product category, active purchasing window and strong research-lab fit.", ar: "استفسار مفصل عن سير عمل PCR، وفئة منتج واضحة، وفترة شراء نشطة، وتوافق قوي مع مختبر بحثي." }, next: { en: "Send quotation follow-up with application note", ar: "إرسال متابعة للعرض مع مذكرة تطبيقية" } },
  { id: 2, account: { en: "Regional Diagnostic Center", ar: "مركز تشخيص إقليمي" }, contact: "Mr. Faisal M.", region: "Jeddah", division: { en: "Hematology & Blood Banks", ar: "أمراض الدم وبنوك الدم" }, value: 215000, score: 89, stage: "Technical review", reason: { en: "High-value analyzer requirement with defined throughput and implementation timeline.", ar: "احتياج مرتفع القيمة لجهاز تحليلي مع سعة تشغيل وجدول تنفيذ محددين." }, next: { en: "Assign application specialist and schedule technical call", ar: "تعيين أخصائي تطبيقات وجدولة مكالمة فنية" } },
  { id: 3, account: { en: "Specialist Hospital Lab", ar: "مختبر مستشفى تخصصي" }, contact: "Dr. Huda K.", region: "Riyadh", division: { en: "Immunohistochemistry", ar: "الكيمياء النسيجية المناعية" }, value: 176000, score: 86, stage: "Tender", reason: { en: "Institutional opportunity with strong category fit and an active procurement process.", ar: "فرصة مؤسسية ذات توافق قوي مع الفئة ووجود عملية شراء نشطة." }, next: { en: "Track tender deadline and prepare required documents", ar: "متابعة موعد إغلاق المنافسة وتجهيز المستندات المطلوبة" } },
  { id: 4, account: { en: "Eastern Clinical Laboratory", ar: "مختبر سريري بالمنطقة الشرقية" }, contact: "Mr. Omar N.", region: "Dammam", division: { en: "Microbiology & Parasitology", ar: "الأحياء الدقيقة والطفيليات" }, value: 74000, score: 78, stage: "New", reason: { en: "Relevant product enquiry but specifications and decision timeline still require qualification.", ar: "استفسار مناسب عن المنتج، لكن المواصفات والجدول الزمني للقرار ما زالا بحاجة إلى تأهيل." }, next: { en: "Ask technical qualification questions", ar: "طرح أسئلة التأهيل الفني" } },
  { id: 5, account: { en: "Forensic Sciences Unit", ar: "وحدة علوم الأدلة الجنائية" }, contact: "Dr. Maha R.", region: "Jeddah", division: { en: "Toxicology & Forensic", ar: "السموم والأدلة الجنائية" }, value: 98000, score: 83, stage: "Quotation", reason: { en: "Strong application fit with a defined analytical use case and multiple requested items.", ar: "توافق قوي مع التطبيق ووجود استخدام تحليلي محدد وعدة أصناف مطلوبة." }, next: { en: "Follow up on quotation and implementation timing", ar: "متابعة العرض وتوقيت التنفيذ" } },
  { id: 6, account: { en: "Private Medical Group", ar: "مجموعة طبية خاصة" }, contact: "Mr. Khalid S.", region: "Riyadh", division: { en: "Molecular Diagnostics & Life Science", ar: "التشخيص الجزيئي وعلوم الحياة" }, value: 162000, score: 96, stage: "Won", reason: { en: "High-fit account with decision-maker engagement and completed commercial approval.", ar: "حساب عالي التوافق مع مشاركة صاحب القرار واكتمال الموافقة التجارية." }, next: { en: "Coordinate delivery, installation and training", ar: "تنسيق التوريد والتركيب والتدريب" } },
];

const stages: Stage[] = ["New", "Technical review", "Quotation", "Tender", "Won"];
const views: View[] = ["Overview", "Opportunities", "Automation", "Reports"];

const ui = {
  en: {
    overview: "Overview", opportunities: "Opportunities", automation: "Automation", reports: "Reports", workspace: "Private concept · Medical Masar",
    prepared: "Prepared for Medical Masar Al Shefaa", illustrative: "Illustrative sales & quotation workflow", discuss: "Discuss this concept ↗",
    concept: "Medical Masar Al Shefaa · concept", live: "Automation live", simulate: "+ Simulate new enquiry", light: "Light", dark: "Dark",
    openValue: "Open opportunity value", across: "Across", activeOpps: "active opportunities", highFit: "High-fit opportunities", score85: "AI score ≥ 85", wonMonth: "Won this month", converted: "Illustrative converted account", followups: "Follow-ups due", quotationFollowups: "3 quotation follow-ups",
    commercialPipeline: "Commercial pipeline", priority: "Priority opportunities", viewAll: "View all →", account: "Account", aiFit: "AI fit", stage: "Stage", value: "Value", today: "Today", activity: "Automation activity",
    routed: "Enquiry routed", routedCopy: "Molecular diagnostics enquiry assigned to Riyadh sales.", qFollow: "Quotation follow-up prepared", qFollowCopy: "University Research Lab follow-up is ready for review.", specialist: "Technical specialist assigned", specialistCopy: "Hematology opportunity routed to application support.", stopped: "Sequence stopped", stoppedCopy: "Private Medical Group replied and moved to Won.", yesterday: "Yesterday",
    pipeline: "Pipeline", funnel: "Commercial funnel", aiRanked: "AI-ranked", list: "Opportunity list", accounts: "accounts", opportunity: "Opportunity", potential: "Potential value", division: "Division", currentStage: "Current stage", qualification: "AI qualification", why: "Why this opportunity matters", next: "Recommended next action", prepare: "Prepare with AI ↗", move: "Move stage",
    suggested: "Suggested workflow", workflowTitle: "Enquiry → right team → quotation → follow-up", workflowIntro: "A concept for connecting inbound demand, regional sales, technical specialists, quotations and follow-up in one operating system.", enabled: "Enabled", paused: "Paused",
    performance: "Commercial performance", managementSummary: "Management summary", generate: "Generate report ↗", newEnquiries: "New enquiries", threeRegions: "Across three regions", qualifiedRate: "Qualified rate", conceptKpi: "Illustrative concept KPI", quotationValue: "Quotation value", openCommercial: "Open commercial value", responseRate: "Response rate", sequences: "Across follow-up sequences",
    region: "Region", distribution: "Opportunity distribution", aiManagement: "AI management summary", attention: "What deserves attention",
    summary1: "High-value opportunities are concentrated in molecular diagnostics, hematology and institutional procurement. Several quotations have strong fit scores but need timely follow-up to prevent commercial momentum from being lost.", summaryLabel: "Suggested focus:", summary2: "unify enquiry capture, make ownership visible across regions, automate quotation follow-up and surface tender deadlines in one management view.",
    newToast: "Enquiry captured, routed and scored automatically", moved: "Moved to", preparedToast: "Context-aware follow-up prepared", reportToast: "Concept report generated",
  },
  ar: {
    overview: "نظرة عامة", opportunities: "الفرص", automation: "الأتمتة", reports: "التقارير", workspace: "تصور خاص · مسار الشفاء الطبية",
    prepared: "أُعد خصيصاً لشركة مسار الشفاء الطبية", illustrative: "تصور توضيحي لسير المبيعات وعروض الأسعار", discuss: "ناقش هذا التصور ↗",
    concept: "مسار الشفاء الطبية · تصور مخصص", live: "الأتمتة مفعلة", simulate: "+ محاكاة استفسار جديد", light: "فاتح", dark: "داكن",
    openValue: "قيمة الفرص المفتوحة", across: "ضمن", activeOpps: "فرص نشطة", highFit: "فرص عالية التوافق", score85: "تقييم الذكاء الاصطناعي ≥ 85", wonMonth: "المبيعات المحققة هذا الشهر", converted: "حساب توضيحي تم تحويله", followups: "المتابعات المستحقة", quotationFollowups: "3 متابعات لعروض أسعار",
    commercialPipeline: "مسار المبيعات", priority: "الفرص ذات الأولوية", viewAll: "عرض الكل ←", account: "الحساب", aiFit: "توافق AI", stage: "المرحلة", value: "القيمة", today: "اليوم", activity: "نشاط الأتمتة",
    routed: "تم توجيه الاستفسار", routedCopy: "تم تعيين استفسار التشخيص الجزيئي لفريق مبيعات الرياض.", qFollow: "تم إعداد متابعة العرض", qFollowCopy: "متابعة عرض مختبر الأبحاث الجامعي جاهزة للمراجعة.", specialist: "تم تعيين أخصائي فني", specialistCopy: "تم توجيه فرصة أمراض الدم إلى دعم التطبيقات.", stopped: "تم إيقاف التسلسل", stoppedCopy: "ردت المجموعة الطبية الخاصة وانتقلت إلى مرحلة تم الفوز.", yesterday: "أمس",
    pipeline: "المسار", funnel: "قمع المبيعات", aiRanked: "مرتبة بالذكاء الاصطناعي", list: "قائمة الفرص", accounts: "حسابات", opportunity: "الفرصة", potential: "القيمة المتوقعة", division: "القسم", currentStage: "المرحلة الحالية", qualification: "تأهيل بالذكاء الاصطناعي", why: "لماذا تستحق هذه الفرصة الاهتمام", next: "الإجراء التالي المقترح", prepare: "إعداد بالذكاء الاصطناعي ↗", move: "نقل المرحلة",
    suggested: "سير العمل المقترح", workflowTitle: "استفسار ← الفريق المناسب ← عرض السعر ← المتابعة", workflowIntro: "تصور يربط الطلبات الواردة بالمبيعات الإقليمية والمتخصصين الفنيين وعروض الأسعار والمتابعة داخل نظام تشغيلي واحد.", enabled: "مفعّل", paused: "متوقف",
    performance: "الأداء التجاري", managementSummary: "ملخص الإدارة", generate: "إنشاء التقرير ↗", newEnquiries: "استفسارات جديدة", threeRegions: "عبر ثلاث مناطق", qualifiedRate: "نسبة التأهيل", conceptKpi: "مؤشر توضيحي للتصور", quotationValue: "قيمة عروض الأسعار", openCommercial: "القيمة التجارية المفتوحة", responseRate: "نسبة الرد", sequences: "عبر تسلسلات المتابعة",
    region: "المنطقة", distribution: "توزيع الفرص", aiManagement: "ملخص الإدارة بالذكاء الاصطناعي", attention: "ما الذي يستحق الاهتمام",
    summary1: "تتركز الفرص مرتفعة القيمة في التشخيص الجزيئي وأمراض الدم والمشتريات المؤسسية. توجد عدة عروض أسعار بتقييم توافق قوي لكنها تحتاج إلى متابعة سريعة للحفاظ على الزخم التجاري.", summaryLabel: "التركيز المقترح:", summary2: "توحيد استقبال الاستفسارات، وإظهار المسؤول عن كل فرصة بين المناطق، وأتمتة متابعة عروض الأسعار، وإبراز مواعيد المنافسات في شاشة إدارية واحدة.",
    newToast: "تم تسجيل الاستفسار وتوجيهه وتقييمه تلقائياً", moved: "تم النقل إلى", preparedToast: "تم إعداد متابعة مناسبة للسياق", reportToast: "تم إنشاء تقرير التصور",
  },
} as const;

const stageLabels: Record<Lang, Record<Stage, string>> = {
  en: { New: "New", "Technical review": "Technical review", Quotation: "Quotation", Tender: "Tender", Won: "Won" },
  ar: { New: "جديد", "Technical review": "مراجعة فنية", Quotation: "عرض سعر", Tender: "منافسة", Won: "تم الفوز" },
};

const regionLabels: Record<Lang, Record<Opportunity["region"], string>> = {
  en: { Riyadh: "Riyadh", Jeddah: "Jeddah", Dammam: "Dammam" },
  ar: { Riyadh: "الرياض", Jeddah: "جدة", Dammam: "الدمام" },
};

const workflow: Array<[string, BiText, BiText, BiText]> = [
  ["01", { en: "Enquiry captured", ar: "تسجيل الاستفسار" }, { en: "Website, email or rep-created enquiry enters one opportunity record.", ar: "يدخل استفسار الموقع أو البريد أو مندوب المبيعات في سجل فرصة موحد." }, { en: "Instant", ar: "فوري" }],
  ["02", { en: "Product division detected", ar: "تحديد قسم المنتج" }, { en: "AI classifies the request into molecular diagnostics, microbiology, hematology, IHC or toxicology.", ar: "يصنف الذكاء الاصطناعي الطلب إلى التشخيص الجزيئي أو الأحياء الدقيقة أو أمراض الدم أو IHC أو السموم." }, { en: "Instant", ar: "فوري" }],
  ["03", { en: "Region & owner assigned", ar: "تعيين المنطقة والمسؤول" }, { en: "The opportunity is routed to Riyadh, Jeddah or Dammam with a responsible sales owner.", ar: "تُوجّه الفرصة إلى الرياض أو جدة أو الدمام مع تحديد مسؤول المبيعات." }, { en: "Automatic", ar: "تلقائي" }],
  ["04", { en: "Technical review", ar: "المراجعة الفنية" }, { en: "Application support is added when specifications or workflow design are required.", ar: "تتم إضافة دعم التطبيقات عندما تكون المواصفات أو تصميم سير العمل مطلوبة." }, { en: "When needed", ar: "عند الحاجة" }],
  ["05", { en: "Quotation follow-up", ar: "متابعة عرض السعر" }, { en: "A context-aware follow-up is prepared and scheduled if the customer has not replied.", ar: "يتم إعداد وجدولة متابعة مناسبة للسياق إذا لم يرد العميل." }, { en: "+2–3 days", ar: "+2–3 أيام" }],
  ["06", { en: "Reply / tender detected", ar: "اكتشاف رد أو منافسة" }, { en: "Human replies stop automation; tender opportunities surface deadlines and required actions.", ar: "الردود البشرية توقف الأتمتة، بينما تُظهر فرص المنافسات المواعيد والإجراءات المطلوبة." }, { en: "Automatic", ar: "تلقائي" }],
];

function money(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(value);
}

export default function MedicalMasarConceptPage() {
  const [active, setActive] = useState<View>("Overview");
  const [items, setItems] = useState(initialOpportunities);
  const [selectedId, setSelectedId] = useState(1);
  const [sequenceEnabled, setSequenceEnabled] = useState(true);
  const [toast, setToast] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("dark");

  const t = ui[lang];
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const openValue = items.filter((item) => item.stage !== "Won").reduce((sum, item) => sum + item.value, 0);
  const highFit = items.filter((item) => item.score >= 85 && item.stage !== "Won").length;
  const wonValue = items.filter((item) => item.stage === "Won").reduce((sum, item) => sum + item.value, 0);
  const stageCounts = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, items.filter((item) => item.stage === stage).length])) as Record<Stage, number>, [items]);

  const viewLabel = (view: View) => view === "Overview" ? t.overview : view === "Opportunities" ? t.opportunities : view === "Automation" ? t.automation : t.reports;

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1900);
  }

  function moveOpportunity(id: number, stage: Stage) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, stage } : item));
    notify(`${t.moved} ${stageLabels[lang][stage]}`);
  }

  function simulateEnquiry() {
    const id = Math.max(...items.map((item) => item.id)) + 1;
    setItems((current) => [{ id, account: { en: "New Hospital Laboratory", ar: "مختبر مستشفى جديد" }, contact: "Dr. Reem A.", region: "Riyadh", division: { en: "Molecular Diagnostics & Life Science", ar: "التشخيص الجزيئي وعلوم الحياة" }, value: 84000, score: 91, stage: "New", reason: { en: "The system matched the enquiry to molecular diagnostics, detected an institutional buyer and identified clear purchasing intent.", ar: "طابق النظام الاستفسار مع التشخيص الجزيئي، واكتشف مشترياً مؤسسياً، وحدد نية شراء واضحة." }, next: { en: "Assign Riyadh rep and prepare first response", ar: "تعيين مندوب الرياض وإعداد الرد الأول" } }, ...current]);
    setSelectedId(id);
    setActive("Opportunities");
    notify(t.newToast);
  }

  return (
    <main className={styles.page} data-theme={theme} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      {toast ? <div className={styles.toast}>{toast}</div> : null}

      <aside className={styles.sidebar}>
        <a href="/systems" className={styles.brand}><span>Lab</span>Narrative <b>Systems</b></a>
        <div className={styles.workspaceLabel}>{t.workspace}</div>
        <nav>{views.map((item) => <button key={item} className={active === item ? styles.activeNav : ""} onClick={() => setActive(item)}><span>{item === "Overview" ? "◫" : item === "Opportunities" ? "◎" : item === "Automation" ? "↯" : "↗"}</span>{viewLabel(item)}</button>)}</nav>
        <div className={styles.sidebarBottom}><span>{t.prepared}</span><small>{t.illustrative}</small><a href="mailto:hello@labnarrative.com?subject=Medical%20Masar%20Systems%20concept">{t.discuss}</a></div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div><span className={styles.kicker}>{t.concept}</span><h1>{viewLabel(active)}</h1></div>
          <div className={styles.topActions}>
            <div className={styles.controlBar} aria-label="Language"><button className={lang === "en" ? styles.controlActive : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button><button className={lang === "ar" ? styles.controlActive : ""} aria-pressed={lang === "ar"} onClick={() => setLang("ar")}>عربي</button></div>
            <div className={styles.controlBar} aria-label="Theme"><button className={theme === "light" ? styles.controlActive : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>☀ {t.light}</button><button className={theme === "dark" ? styles.controlActive : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>☾ {t.dark}</button></div>
            <span className={styles.live}><i /> {t.live}</span><button className={styles.actionButton} onClick={simulateEnquiry}>{t.simulate}</button>
          </div>
        </header>

        {active === "Overview" ? (
          <div className={styles.content}>
            <section className={styles.metrics}><article><span>{t.openValue}</span><strong>{money(openValue, lang)}</strong><small>{t.across} {items.filter((x) => x.stage !== "Won").length} {t.activeOpps}</small></article><article><span>{t.highFit}</span><strong>{highFit}</strong><small>{t.score85}</small></article><article><span>{t.wonMonth}</span><strong>{money(wonValue, lang)}</strong><small>{t.converted}</small></article><article><span>{t.followups}</span><strong>6</strong><small>{t.quotationFollowups}</small></article></section>

            <section className={styles.twoCol}>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>{t.commercialPipeline}</span><h2>{t.priority}</h2></div><button onClick={() => setActive("Opportunities")}>{t.viewAll}</button></div><div className={styles.tableHead}><span>{t.account}</span><span>{t.aiFit}</span><span>{t.stage}</span><span>{t.value}</span></div>{items.slice(0,5).map((item) => <button className={styles.tableRow} key={item.id} onClick={() => { setSelectedId(item.id); setActive("Opportunities"); }}><div><strong>{item.account[lang]}</strong><small>{regionLabels[lang][item.region]} · {item.division[lang]}</small></div><b className={item.score >= 85 ? styles.highScore : ""}>{item.score}</b><em>{stageLabels[lang][item.stage]}</em><span>{money(item.value, lang)}</span></button>)}</article>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>{t.today}</span><h2>{t.activity}</h2></div></div><div className={styles.activity}><i>✓</i><div><strong>{t.routed}</strong><p>{t.routedCopy}</p><small>09:21</small></div></div><div className={styles.activity}><i>↗</i><div><strong>{t.qFollow}</strong><p>{t.qFollowCopy}</p><small>08:47</small></div></div><div className={styles.activity}><i>◎</i><div><strong>{t.specialist}</strong><p>{t.specialistCopy}</p><small>{t.yesterday}</small></div></div><div className={styles.activity}><i>✓</i><div><strong>{t.stopped}</strong><p>{t.stoppedCopy}</p><small>{t.yesterday}</small></div></div></article>
            </section>

            <section className={styles.panel} style={{ marginTop: 14 }}><div className={styles.panelHead}><div><span>{t.pipeline}</span><h2>{t.funnel}</h2></div></div><div className={styles.funnel}>{stages.slice(0,4).map((stage,index) => <div key={stage}><span>{stageLabels[lang][stage]}</span><strong>{stageCounts[stage]}</strong><div style={{width:`${100-index*15}%`}} /></div>)}</div></section>
          </div>
        ) : null}

        {active === "Opportunities" ? (
          <div className={styles.content}><section className={styles.leadLayout}>
            <div className={styles.panel}><div className={styles.panelHead}><div><span>{t.aiRanked}</span><h2>{t.list}</h2></div><small>{items.length} {t.accounts}</small></div><div className={styles.leadList}>{items.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={selectedId === item.id ? styles.selectedLead : ""}><div><strong>{item.account[lang]}</strong><small>{regionLabels[lang][item.region]} · {item.division[lang]}</small></div><b className={item.score >= 85 ? styles.highScore : ""}>{item.score}</b></button>)}</div></div>
            <div className={styles.detailPanel}><div className={styles.detailTop}><div><span>{t.opportunity}</span><h2>{selected.account[lang]}</h2><p>{selected.contact} · {regionLabels[lang][selected.region]}</p></div><div className={styles.bigScore}><small>{t.aiFit}</small><strong>{selected.score}</strong></div></div><div className={styles.detailGrid}><div><span>{t.potential}</span><strong>{money(selected.value, lang)}</strong></div><div><span>{t.division}</span><strong>{selected.division[lang]}</strong></div><div><span>{t.currentStage}</span><strong>{stageLabels[lang][selected.stage]}</strong></div></div><div className={styles.aiBox}><span>{t.qualification}</span><h3>{t.why}</h3><p>{selected.reason[lang]}</p></div><div className={styles.nextAction}><span>{t.next}</span><strong>{selected.next[lang]}</strong><button onClick={() => notify(t.preparedToast)}>{t.prepare}</button></div><div className={styles.stageControls}><span>{t.move}</span><div>{stages.map((stage) => <button key={stage} className={selected.stage === stage ? styles.stageActive : ""} onClick={() => moveOpportunity(selected.id, stage)}>{stageLabels[lang][stage]}</button>)}</div></div></div>
          </section></div>
        ) : null}

        {active === "Automation" ? (
          <div className={styles.content}><section className={styles.automationHero}><div><span>{t.suggested}</span><h2>{t.workflowTitle}</h2><p>{t.workflowIntro}</p></div><button className={sequenceEnabled ? styles.toggleOn : styles.toggleOff} onClick={() => setSequenceEnabled(!sequenceEnabled)}><i />{sequenceEnabled ? t.enabled : t.paused}</button></section><section className={styles.workflow}>{workflow.map(([n,title,copy,timing]) => <article key={n}><span>{n}</span><div><h3>{title[lang]}</h3><p>{copy[lang]}</p></div><em>{timing[lang]}</em><i>✓</i></article>)}</section></div>
        ) : null}

        {active === "Reports" ? (
          <div className={styles.content}><section className={styles.reportHeader}><div><span>{t.performance}</span><h2>{t.managementSummary}</h2></div><button onClick={() => notify(t.reportToast)}>{t.generate}</button></section><section className={styles.metrics}><article><span>{t.newEnquiries}</span><strong>26</strong><small>{t.threeRegions}</small></article><article><span>{t.qualifiedRate}</span><strong>61%</strong><small>{t.conceptKpi}</small></article><article><span>{t.quotationValue}</span><strong>{lang === "ar" ? "٦٩١ ألف ر.س" : "SAR 691k"}</strong><small>{t.openCommercial}</small></article><article><span>{t.responseRate}</span><strong>47%</strong><small>{t.sequences}</small></article></section><section className={styles.twoCol}><article className={styles.panel}><div className={styles.panelHead}><div><span>{t.region}</span><h2>{t.distribution}</h2></div></div><div className={styles.barList}>{[[regionLabels[lang].Riyadh,92],[regionLabels[lang].Jeddah,74],[regionLabels[lang].Dammam,48]].map(([name,value]) => <div key={name}><span>{name}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}</strong></div>)}</div></article><article className={styles.panel}><div className={styles.panelHead}><div><span>{t.aiManagement}</span><h2>{t.attention}</h2></div></div><div className={styles.summaryBox}><p>{t.summary1}</p><p><strong>{t.summaryLabel}</strong> {t.summary2}</p></div></article></section></div>
        ) : null}
      </section>
    </main>
  );
}
