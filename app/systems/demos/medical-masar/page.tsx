"use client";

import { useMemo, useState } from "react";
import styles from "./v2.module.css";

type Lang = "en" | "ar";
type Theme = "light" | "dark";
type View = "overview" | "tenders" | "quotes" | "orders" | "warehouse" | "supply" | "invoices" | "collection" | "management" | "accounts" | "automation" | "ai";
type Bi = { en: string; ar: string };
const B = (en: string, ar: string): Bi => ({ en, ar });

const nav: Array<{ id: View; icon: string; label: Bi; core?: boolean }> = [
  { id: "overview", icon: "◫", label: B("Overview", "نظرة عامة") },
  { id: "tenders", icon: "◇", label: B("Tenders", "المناقصات"), core: true },
  { id: "quotes", icon: "▤", label: B("Quotations", "عروض الأسعار"), core: true },
  { id: "orders", icon: "▦", label: B("Orders", "الطلبات"), core: true },
  { id: "warehouse", icon: "▧", label: B("Warehouse", "المستودع"), core: true },
  { id: "supply", icon: "↗", label: B("Supply", "التوريد"), core: true },
  { id: "invoices", icon: "▱", label: B("Invoices", "الفواتير"), core: true },
  { id: "collection", icon: "◉", label: B("Collection", "التحصيل"), core: true },
  { id: "management", icon: "▥", label: B("Management", "لوحة الإدارة") },
  { id: "accounts", icon: "◎", label: B("Customers", "العملاء") },
  { id: "automation", icon: "↯", label: B("Automation", "الأتمتة") },
  { id: "ai", icon: "✦", label: B("AI Command Center", "مركز الذكاء الاصطناعي") },
];

const customers = [
  { id: 1, name: B("Specialist Hospital Lab", "مختبر مستشفى تخصصي"), city: B("Riyadh", "الرياض"), segment: B("Hospital laboratory", "مختبر مستشفى"), open: 176000, outstanding: 86000 },
  { id: 2, name: B("Regional Diagnostic Center", "مركز تشخيص إقليمي"), city: B("Jeddah", "جدة"), segment: B("Diagnostic laboratory", "مختبر تشخيصي"), open: 310000, outstanding: 215000 },
  { id: 3, name: B("University Research Lab", "مختبر أبحاث جامعي"), city: B("Riyadh", "الرياض"), segment: B("Academic research", "بحث أكاديمي"), open: 128000, outstanding: 128000 },
  { id: 4, name: B("Forensic Sciences Unit", "وحدة علوم الأدلة الجنائية"), city: B("Jeddah", "جدة"), segment: B("Government laboratory", "مختبر حكومي"), open: 142000, outstanding: 74000 },
];

const tenders = [
  { id: "TND-2608-014", customerId: 1, title: B("IHC reagents & detection systems", "كواشف وأنظمة كشف IHC"), value: 176000, items: 24, deadline: B("22 Aug 2026", "22 أغسطس 2026"), daysLeft: 8, readiness: 83, missing: 2, owner: B("Tender Team", "فريق المناقصات"), status: B("Documents in progress", "المستندات قيد التجهيز") },
  { id: "TND-2608-019", customerId: 2, title: B("Hematology analyzer framework", "إطار توريد جهاز أمراض الدم"), value: 310000, items: 41, deadline: B("31 Aug 2026", "31 أغسطس 2026"), daysLeft: 17, readiness: 68, missing: 5, owner: B("Applications + Sales", "التطبيقات + المبيعات"), status: B("Technical review", "مراجعة فنية") },
  { id: "TND-2609-003", customerId: 4, title: B("Forensic toxicology consumables", "مستهلكات السموم الجنائية"), value: 142000, items: 18, deadline: B("7 Sep 2026", "7 سبتمبر 2026"), daysLeft: 24, readiness: 52, missing: 4, owner: B("Western Sales", "مبيعات الغربية"), status: B("Preparing", "قيد التحضير") },
];

const quotes = [
  { id: "Q-2026-084", customerId: 3, value: 128000, items: 24, verified: 24, errors: 0, status: B("Viewed by customer", "شاهده العميل"), next: B("Follow up today", "متابعة اليوم") },
  { id: "Q-2026-079", customerId: 4, value: 98000, items: 18, verified: 18, errors: 0, status: B("Sent", "مرسل"), next: B("Follow up in 2 days", "متابعة بعد يومين") },
  { id: "Q-2026-071", customerId: 2, value: 215000, items: 32, verified: 31, errors: 1, status: B("Technical revision", "مراجعة فنية"), next: B("Resolve one line mismatch", "حل اختلاف في بند واحد") },
];

const orders = [
  { id: "SO-2026-041", customerId: 1, source: "TND-2608-014", value: 176000, items: 24, ready: 21, missing: 3, due: B("19 Aug 2026", "19 أغسطس 2026"), status: B("At risk · incomplete", "معرض للخطر · غير مكتمل") },
  { id: "SO-2026-038", customerId: 2, source: "Q-2026-071", value: 215000, items: 32, ready: 32, missing: 0, due: B("18 Aug 2026", "18 أغسطس 2026"), status: B("Ready to dispatch", "جاهز للشحن") },
  { id: "SO-2026-034", customerId: 4, source: "Q-2026-079", value: 98000, items: 18, ready: 18, missing: 0, due: B("Delivered 12 Aug", "تم التسليم 12 أغسطس"), status: B("Delivered", "تم التسليم") },
];

const warehouse = [
  { sku: "RGT-IHC-112", name: B("IHC Detection Kit", "طقم كشف IHC"), stock: 9, reserved: 8, needed: 8, available: 1, status: B("Ready", "جاهز") },
  { sku: "BUF-ANT-204", name: B("Antigen Retrieval Buffer", "محلول استرجاع المستضد"), stock: 4, reserved: 4, needed: 4, available: 0, status: B("Ready", "جاهز") },
  { sku: "AB-PDL1-37", name: B("PD-L1 Primary Antibody", "جسم مضاد أولي PD-L1"), stock: 1, reserved: 1, needed: 2, available: 0, status: B("1 unit missing", "وحدة واحدة ناقصة") },
  { sku: "SLD-CHR-082", name: B("Charged Slides", "شرائح مشحونة"), stock: 12, reserved: 10, needed: 10, available: 2, status: B("Ready", "جاهز") },
  { sku: "RGT-DAB-051", name: B("DAB Chromogen", "كروموجين DAB"), stock: 0, reserved: 0, needed: 2, available: 0, status: B("2 units missing", "وحدتان ناقصتان") },
];

const supplyLines = [
  { no: 1, sku: "RGT-IHC-112", item: B("IHC Detection Kit", "طقم كشف IHC"), qty: 8, allocated: 8, source: B("Riyadh warehouse", "مستودع الرياض"), status: B("Ready", "جاهز") },
  { no: 2, sku: "BUF-ANT-204", item: B("Antigen Retrieval Buffer", "محلول استرجاع المستضد"), qty: 4, allocated: 4, source: B("Riyadh warehouse", "مستودع الرياض"), status: B("Ready", "جاهز") },
  { no: 3, sku: "AB-PDL1-37", item: B("PD-L1 Primary Antibody", "جسم مضاد أولي PD-L1"), qty: 2, allocated: 1, source: B("Supplier PO pending", "طلب المورد قيد الانتظار"), status: B("Missing 1", "ناقص 1") },
  { no: 4, sku: "SLD-CHR-082", item: B("Charged Slides", "شرائح مشحونة"), qty: 10, allocated: 10, source: B("Jeddah warehouse", "مستودع جدة"), status: B("Ready", "جاهز") },
  { no: 5, sku: "RGT-DAB-051", item: B("DAB Chromogen", "كروموجين DAB"), qty: 2, allocated: 0, source: B("Supplier ETA 17 Aug", "وصول المورد 17 أغسطس"), status: B("Missing 2", "ناقص 2") },
  { no: 6, sku: "CTR-IHC-008", item: B("IHC Positive Control", "ضابط موجب IHC"), qty: 3, allocated: 3, source: B("Riyadh warehouse", "مستودع الرياض"), status: B("Ready", "جاهز") },
];

const invoices = [
  { id: "INV-260811", customerId: 2, order: "SO-2026-038", amount: 215000, issued: B("11 Aug 2026", "11 أغسطس 2026"), due: B("29 Aug 2026", "29 أغسطس 2026"), paid: 0, status: B("Issued", "صادرة") },
  { id: "INV-260804", customerId: 4, order: "SO-2026-034", amount: 98000, issued: B("4 Aug 2026", "4 أغسطس 2026"), due: B("18 Aug 2026", "18 أغسطس 2026"), paid: 24000, status: B("Partially paid", "مدفوعة جزئيًا") },
  { id: "INV-260715", customerId: 1, order: "SO-2026-027", amount: 86000, issued: B("15 Jul 2026", "15 يوليو 2026"), due: B("30 Jul 2026", "30 يوليو 2026"), paid: 0, status: B("Overdue", "متأخرة") },
  { id: "INV-260703", customerId: 3, order: "SO-2026-023", amount: 128000, issued: B("3 Jul 2026", "3 يوليو 2026"), due: B("3 Aug 2026", "3 أغسطس 2026"), paid: 0, status: B("Overdue", "متأخرة") },
];

const collectionActions = [
  { invoice: "INV-260715", customerId: 1, amount: 86000, overdue: 15, owner: B("Riyadh Finance", "مالية الرياض"), action: B("Call procurement + resend statement", "الاتصال بالمشتريات + إعادة إرسال كشف الحساب"), status: B("Escalated", "تم التصعيد") },
  { invoice: "INV-260703", customerId: 3, amount: 128000, overdue: 11, owner: B("Collection Team", "فريق التحصيل"), action: B("Finance manager follow-up today", "متابعة مدير المالية اليوم"), status: B("Due today", "مستحق اليوم") },
  { invoice: "INV-260804", customerId: 4, amount: 74000, overdue: 0, owner: B("Western Finance", "مالية الغربية"), action: B("Balance reminder before due date", "تذكير بالرصيد قبل الاستحقاق"), status: B("Scheduled", "مجدول") },
];

const automations = [
  B("Tender deadline countdown & escalation", "العد التنازلي للمناقصات والتصعيد"),
  B("Quotation line validation before send", "التحقق من بنود عرض السعر قبل الإرسال"),
  B("Order completeness gate before dispatch", "بوابة اكتمال الطلب قبل الشحن"),
  B("Warehouse shortage & supplier alert", "تنبيه نقص المستودع والمورد"),
  B("Invoice due-date reminders", "تذكيرات استحقاق الفواتير"),
  B("Collection escalation for overdue balances", "تصعيد التحصيل للمبالغ المتأخرة"),
];

function CustomerName({ id, lang }: { id: number; lang: Lang }) {
  const c = customers.find((x) => x.id === id);
  return <>{c ? c.name[lang] : "—"}</>;
}

function money(v: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(v);
}
function num(v: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(v);
}
function localizeId(v: string, lang: Lang) {
  if (lang !== "ar") return v;
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return v.replace(/\d/g, (d) => ar[Number(d)]);
}
function pct(v: number, lang: Lang) {
  return `${num(v, lang)}٪`;
}

export default function Page() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [active, setActive] = useState<View>("overview");
  const [selectedOrder, setSelectedOrder] = useState("SO-2026-041");
  const [toast, setToast] = useState("");
  const [automationState, setAutomationState] = useState<Record<number, boolean>>(() => Object.fromEntries(automations.map((_, i) => [i, true])));
  const [aiText, setAiText] = useState<Bi>(B(
    "Do not dispatch SO-2026-041 yet. Three units across two supply lines are still missing. Resolve AB-PDL1-37 and RGT-DAB-051 first, then release the order.",
    "لا تشحن الطلب SO-2026-041 الآن. ما زالت ٣ وحدات ضمن بندين ناقصة. عالج AB-PDL1-37 وRGT-DAB-051 أولًا ثم اسمح بخروج الطلب."
  ));

  const L = (v: Bi | string) => (typeof v === "string" ? v : v[lang]);
  const title = nav.find((n) => n.id === active)?.label ?? nav[0].label;
  const openTenderValue = tenders.reduce((s, t) => s + t.value, 0);
  const activeSupply = orders.filter((o) => !L(o.status).includes(lang === "ar" ? "تم التسليم" : "Delivered")).length;
  const shortageLines = orders.reduce((s, o) => s + o.missing, 0);
  const totalInvoiced = invoices.reduce((s, x) => s + x.amount, 0);
  const outstanding = invoices.reduce((s, x) => s + (x.amount - x.paid), 0);
  const overdue = invoices.filter((x) => x.status.en === "Overdue").reduce((s, x) => s + (x.amount - x.paid), 0);
  const selected = useMemo(() => orders.find((o) => o.id === selectedOrder) ?? orders[0], [selectedOrder]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const ask = (key: "risk" | "cash" | "tender" | "supply") => {
    const map: Record<typeof key, Bi> = {
      risk: B("The immediate operational risk is SO-2026-041: 21 of 24 items are ready, but three units across two lines are missing. The system should block dispatch until all lines are complete.", "الخطر التشغيلي المباشر هو الطلب SO-2026-041: تم تجهيز ٢١ من ٢٤ بندًا، لكن ما زالت ٣ وحدات ضمن بندين ناقصة. يجب أن يمنع النظام الشحن حتى يكتمل كل شيء."),
      cash: B(`Outstanding receivables are ${money(outstanding, "en")}, including ${money(overdue, "en")} overdue. Prioritise the two overdue invoices today and keep the partial-payment balance on schedule.`, `إجمالي المبالغ غير المحصلة ${money(outstanding, "ar")} منها ${money(overdue, "ar")} متأخرة. أعطِ الأولوية اليوم للفاتورتين المتأخرتين واستمر بمتابعة الرصيد المدفوع جزئيًا.`),
      tender: B("TND-2608-014 closes in 8 days and is 83% ready with two documents missing. It should be the first tender escalation today.", "المناقصة TND-2608-014 تغلق خلال ٨ أيام وجاهزيتها ٨٣٪ مع نقص مستندين. يجب أن تكون أول مناقصة يتم تصعيدها اليوم."),
      supply: B("The IHC order is the clearest supply exception: one PD-L1 antibody and two DAB Chromogen units remain unavailable. Supplier follow-up should be tied directly to the order lines.", "طلب IHC هو أوضح استثناء في التوريد: ينقص جسم مضاد PD-L1 واحد ووحدتان من DAB Chromogen. يجب ربط متابعة المورد مباشرة ببنود الطلب."),
    };
    setAiText(map[key]);
    notify(lang === "ar" ? "تم تحديث تحليل الذكاء الاصطناعي" : "AI analysis updated");
  };

  const Head = ({ eyebrow, heading, copy }: { eyebrow: Bi; heading: Bi; copy: Bi }) => (
    <div className={styles.sectionHeader}>
      <div>
        <small>{L(eyebrow)}</small>
        <h2>{L(heading)}</h2>
        <p>{L(copy)}</p>
      </div>
    </div>
  );

  const flow = (
    <div className={styles.flowRail}>
      {[
        ["tenders", "◇", B("Tenders", "المناقصات")],
        ["quotes", "▤", B("Quotations", "عروض الأسعار")],
        ["orders", "▦", B("Orders", "الطلبات")],
        ["warehouse", "▧", B("Warehouse", "المستودع")],
        ["supply", "↗", B("Supply", "التوريد")],
        ["invoices", "▱", B("Invoices", "الفواتير")],
        ["collection", "◉", B("Collection", "التحصيل")],
        ["management", "▥", B("Management", "الإدارة")],
      ].map(([id, icon, label], i) => (
        <div key={id as string} className={styles.flowStepWrap}>
          <button className={styles.flowStep} onClick={() => setActive(id as View)}>
            <i>{icon as string}</i>
            <strong>{L(label as Bi)}</strong>
          </button>
          {i < 7 && <span className={styles.flowArrow}>{lang === "ar" ? "←" : "→"}</span>}
        </div>
      ))}
    </div>
  );

  const overview = (
    <>
      <section className={styles.heroStrip}>
        <div>
          <span>{lang === "ar" ? "نظام تشغيل مخصص لموزع مختبرات" : "Laboratory distributor operating system"}</span>
          <h2>{lang === "ar" ? "من المناقصة إلى التحصيل — بدون فقدان بند واحد" : "From tender to collection — without losing a single line item"}</h2>
          <p>{lang === "ar" ? "تصور يربط المناقصات، عروض الأسعار، الطلبات، المستودع، التوريد، الفواتير والتحصيل في رحلة واحدة أمام الفريق والإدارة." : "A tailored concept connecting tenders, quotations, orders, warehouse, supply, invoicing and collections in one continuous workflow for teams and management."}</p>
        </div>
        <button className={styles.primary} onClick={() => setActive("supply")}>{lang === "ar" ? "شاهد طلبًا فيه نواقص" : "See an incomplete order"}</button>
      </section>
      {flow}
      <section className={styles.metricGrid}>
        <Metric a={lang === "ar" ? "المناقصات المفتوحة" : "Open tenders"} b={num(tenders.length, lang)} c={money(openTenderValue, lang)} />
        <Metric a={lang === "ar" ? "طلبات تحت التوريد" : "Orders in supply"} b={num(activeSupply, lang)} c={lang === "ar" ? "متابعة مباشرة لكل بند" : "Line-by-line tracking"} />
        <Metric a={lang === "ar" ? "وحدات ناقصة" : "Missing units"} b={num(shortageLines, lang)} c={lang === "ar" ? "يمنع الشحن حتى الحل" : "Dispatch blocked until resolved"} danger />
        <Metric a={lang === "ar" ? "مبالغ غير محصلة" : "Outstanding receivables"} b={money(outstanding, lang)} c={`${money(overdue, lang)} ${lang === "ar" ? "متأخرة" : "overdue"}`} />
      </section>
      <section className={styles.grid2}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><small>{lang === "ar" ? "استثناء تشغيلي" : "OPERATING EXCEPTION"}</small><h2>{lang === "ar" ? "طلب لا يجب أن يخرج ناقصًا" : "An order that must not leave incomplete"}</h2></div>
            <button onClick={() => { setSelectedOrder("SO-2026-041"); setActive("supply"); }}>{lang === "ar" ? "فتح الطلب" : "Open order"}</button>
          </div>
          <div className={styles.exceptionCard}>
            <div className={styles.exceptionTop}>
              <div><strong>{localizeId("SO-2026-041", lang)}</strong><p><CustomerName id={1} lang={lang} /> · {money(176000, lang)}</p></div>
              <span className={styles.badgeDanger}>{lang === "ar" ? "لا تشحن" : "DO NOT DISPATCH"}</span>
            </div>
            <div className={styles.bigProgress}><i style={{ width: `${(21 / 24) * 100}%` }} /></div>
            <div className={styles.progressMeta}><span>{lang === "ar" ? `${num(21, lang)} من ${num(24, lang)} بند جاهز` : "21 of 24 items ready"}</span><strong>{lang === "ar" ? `${num(3, lang)} وحدات ناقصة` : "3 units missing"}</strong></div>
            <div className={styles.shortages}><span>AB-PDL1-37 · {lang === "ar" ? "ناقص ١" : "missing 1"}</span><span>RGT-DAB-051 · {lang === "ar" ? "ناقص ٢" : "missing 2"}</span></div>
          </div>
        </article>
        <article className={styles.aiCard}>
          <small>{lang === "ar" ? "ملخص الإدارة بالذكاء الاصطناعي" : "AI MANAGEMENT BRIEF"}</small>
          <h2>{lang === "ar" ? "ما الذي يحتاج تدخل اليوم؟" : "What needs intervention today?"}</h2>
          <p>{L(aiText)}</p>
          <div className={styles.quickPrompts}>
            <button onClick={() => ask("risk")}>{lang === "ar" ? "مخاطر التشغيل" : "Operational risk"}</button>
            <button onClick={() => ask("tender")}>{lang === "ar" ? "المناقصات" : "Tenders"}</button>
            <button onClick={() => ask("cash")}>{lang === "ar" ? "التحصيل" : "Collections"}</button>
          </div>
        </article>
      </section>
    </>
  );

  const tendersView = (
    <>
      <Head eyebrow={B("Replace spreadsheet tracking", "بديل متابعة الإكسل")} heading={B("Tenders", "المناقصات")} copy={B("One shared tender board with countdowns, owners, readiness, missing work and management visibility.", "لوحة مشتركة تعرض الوقت المتبقي والمسؤول ونسبة الجاهزية والنواقص أمام الفريق والإدارة.")} />
      <section className={styles.tenderGrid}>
        {tenders.map((t) => (
          <article className={styles.tenderCard} key={t.id}>
            <header><div><small>{localizeId(t.id, lang)}</small><h3>{L(t.title)}</h3><p><CustomerName id={t.customerId} lang={lang} /></p></div><div className={styles.countdown}><strong>{num(t.daysLeft, lang)}</strong><span>{lang === "ar" ? "يوم متبقي" : "days left"}</span></div></header>
            <div className={styles.tenderStats}>
              <div><span>{lang === "ar" ? "القيمة" : "Value"}</span><strong>{money(t.value, lang)}</strong></div>
              <div><span>{lang === "ar" ? "البنود" : "Items"}</span><strong>{num(t.items, lang)}</strong></div>
              <div><span>{lang === "ar" ? "النواقص" : "Missing"}</span><strong className={t.missing ? styles.textDanger : ""}>{num(t.missing, lang)}</strong></div>
            </div>
            <div className={styles.readiness}><div><span>{lang === "ar" ? "الجاهزية" : "Readiness"}</span><strong>{pct(t.readiness, lang)}</strong></div><div className={styles.progress}><i style={{ width: `${t.readiness}%` }} /></div></div>
            <footer><div><span>{L(t.deadline)}</span><small>{L(t.owner)}</small></div><button className={styles.secondary} onClick={() => notify(lang === "ar" ? "تم فتح قائمة النواقص للمناقصة" : "Tender checklist opened")}>{lang === "ar" ? "قائمة النواقص" : "Checklist"}</button></footer>
          </article>
        ))}
      </section>
    </>
  );

  const quotesView = (
    <>
      <Head eyebrow={B("Error prevention before send", "منع الخطأ قبل الإرسال")} heading={B("Quotations", "عروض الأسعار")} copy={B("Validate every requested line, quantity and commercial value before a quotation reaches the customer.", "التحقق من كل بند وكمية وقيمة تجارية قبل وصول عرض السعر للعميل.")} />
      <article className={styles.panel}>
        {quotes.map((q) => (
          <div className={styles.dataRow} key={q.id}>
            <div className={styles.rowTitle}><strong>{localizeId(q.id, lang)}</strong><small><CustomerName id={q.customerId} lang={lang} /></small></div>
            <div className={styles.rowCell}><span>{lang === "ar" ? "القيمة" : "Value"}</span><strong>{money(q.value, lang)}</strong></div>
            <div className={styles.rowCell}><span>{lang === "ar" ? "البنود" : "Lines"}</span><strong>{num(q.items, lang)}</strong></div>
            <div className={styles.rowCell}><span>{lang === "ar" ? "تم التحقق" : "Verified"}</span><strong>{num(q.verified, lang)}/{num(q.items, lang)}</strong></div>
            <div className={styles.rowCell}><span>{lang === "ar" ? "الأخطاء" : "Errors"}</span><strong className={q.errors ? styles.textDanger : styles.textGood}>{num(q.errors, lang)}</strong></div>
            <div className={styles.rowCell}><span>{lang === "ar" ? "الحالة" : "Status"}</span><strong>{L(q.status)}</strong><small>{L(q.next)}</small></div>
          </div>
        ))}
      </article>
    </>
  );

  const ordersView = (
    <>
      <Head eyebrow={B("Won work becomes execution", "تحويل الفوز إلى تنفيذ")} heading={B("Orders", "الطلبات")} copy={B("Every won tender or accepted quotation becomes a controlled fulfilment record with item-level completeness.", "كل مناقصة فائزة أو عرض مقبول يتحول إلى سجل تنفيذ مضبوط مع متابعة اكتمال كل بند.")} />
      <div className={styles.orderGrid}>
        {orders.map((o) => (
          <button key={o.id} className={`${styles.orderCard} ${o.missing ? styles.orderRisk : ""}`} onClick={() => { setSelectedOrder(o.id); setActive("supply"); }}>
            <header><div><small>{localizeId(o.source, lang)} →</small><h3>{localizeId(o.id, lang)}</h3><p><CustomerName id={o.customerId} lang={lang} /></p></div><span className={o.missing ? styles.badgeDanger : styles.badgeGood}>{L(o.status)}</span></header>
            <div className={styles.orderValue}>{money(o.value, lang)}</div>
            <div className={styles.bigProgress}><i style={{ width: `${(o.ready / o.items) * 100}%` }} /></div>
            <footer><span>{lang === "ar" ? `${num(o.ready, lang)} / ${num(o.items, lang)} بند جاهز` : `${o.ready} / ${o.items} items ready`}</span><strong className={o.missing ? styles.textDanger : styles.textGood}>{o.missing ? `${num(o.missing, lang)} ${lang === "ar" ? "ناقص" : "missing"}` : (lang === "ar" ? "مكتمل" : "Complete")}</strong></footer>
          </button>
        ))}
      </div>
    </>
  );

  const warehouseView = (
    <>
      <Head eyebrow={B("Stock connected to customer commitments", "المخزون مرتبط بالتزامات العملاء")} heading={B("Warehouse", "المستودع")} copy={B("See what is physically available, what is reserved, and which order line will fail before the dispatch date.", "اعرف ما هو متوفر فعليًا وما هو محجوز وأي بند سيسبب مشكلة قبل موعد الشحن.")} />
      <article className={styles.panel}>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>SKU</th><th>{lang === "ar" ? "الصنف" : "Item"}</th><th>{lang === "ar" ? "المخزون" : "Stock"}</th><th>{lang === "ar" ? "محجوز" : "Reserved"}</th><th>{lang === "ar" ? "مطلوب" : "Needed"}</th><th>{lang === "ar" ? "متاح" : "Available"}</th><th>{lang === "ar" ? "الحالة" : "Status"}</th></tr></thead><tbody>{warehouse.map((w) => <tr key={w.sku}><td><strong>{localizeId(w.sku, lang)}</strong></td><td>{L(w.name)}</td><td>{num(w.stock, lang)}</td><td>{num(w.reserved, lang)}</td><td>{num(w.needed, lang)}</td><td>{num(w.available, lang)}</td><td><span className={w.status.en === "Ready" ? styles.badgeGood : styles.badgeDanger}>{L(w.status)}</span></td></tr>)}</tbody></table></div>
      </article>
    </>
  );

  const supplyView = (
    <>
      <Head eyebrow={B("No incomplete delivery", "لا توريد ناقص")} heading={B("Supply & fulfilment", "التوريد والتنفيذ")} copy={B("Track every line until the complete customer order is ready. Missing lines stay visible and can block dispatch.", "متابعة كل بند حتى يكتمل طلب العميل بالكامل. البنود الناقصة تبقى ظاهرة ويمكنها منع الشحن.")} />
      <section className={styles.supplyHero}>
        <div><small>{lang === "ar" ? "الطلب المحدد" : "SELECTED ORDER"}</small><h2>{localizeId(selected.id, lang)}</h2><p><CustomerName id={selected.customerId} lang={lang} /> · {money(selected.value, lang)} · {L(selected.due)}</p></div>
        <div className={styles.completionBox}><strong>{pct(Math.round((selected.ready / selected.items) * 100), lang)}</strong><span>{lang === "ar" ? `${num(selected.ready, lang)} من ${num(selected.items, lang)} بند جاهز` : `${selected.ready} of ${selected.items} items ready`}</span></div>
        <div className={selected.missing ? styles.dispatchBlocked : styles.dispatchReady}><strong>{selected.missing ? (lang === "ar" ? "الشحن محظور" : "DISPATCH BLOCKED") : (lang === "ar" ? "جاهز للشحن" : "READY TO DISPATCH")}</strong><span>{selected.missing ? (lang === "ar" ? `${num(selected.missing, lang)} وحدات ناقصة` : `${selected.missing} units missing`) : (lang === "ar" ? "كل البنود مكتملة" : "All lines complete")}</span></div>
      </section>
      {selected.id === "SO-2026-041" ? <article className={styles.panel}><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>#</th><th>SKU</th><th>{lang === "ar" ? "البند" : "Line item"}</th><th>{lang === "ar" ? "الكمية" : "Qty"}</th><th>{lang === "ar" ? "المخصص" : "Allocated"}</th><th>{lang === "ar" ? "المصدر" : "Source"}</th><th>{lang === "ar" ? "الحالة" : "Status"}</th></tr></thead><tbody>{supplyLines.map((x) => <tr key={x.no} className={x.allocated < x.qty ? styles.riskRow : ""}><td>{num(x.no, lang)}</td><td><strong>{localizeId(x.sku, lang)}</strong></td><td>{L(x.item)}</td><td>{num(x.qty, lang)}</td><td>{num(x.allocated, lang)}</td><td>{L(x.source)}</td><td><span className={x.allocated < x.qty ? styles.badgeDanger : styles.badgeGood}>{L(x.status)}</span></td></tr>)}</tbody></table></div><div className={styles.tableNote}>{lang === "ar" ? "يعرض النموذج أول ٦ بنود من أصل ٢٤ بندًا. النظام الفعلي يتابع كل بند حتى اكتماله." : "The demo shows the first 6 of 24 lines. A production system tracks every line until completion."}</div></article> : <article className={styles.successPanel}><strong>✓</strong><h3>{lang === "ar" ? "كل البنود مكتملة" : "All order lines are complete"}</h3><p>{lang === "ar" ? "يمكن تحرير الطلب للشحن بعد مراجعة المستخدم المخول." : "The order can be released for dispatch after authorised human review."}</p></article>}
    </>
  );

  const invoicesView = (
    <>
      <Head eyebrow={B("Billing tied to fulfilment", "الفوترة مرتبطة بالتنفيذ")} heading={B("Invoices", "الفواتير")} copy={B("Every invoice remains connected to the customer and source order so finance can trace what was supplied and what is due.", "كل فاتورة تبقى مرتبطة بالعميل والطلب الأصلي حتى تستطيع المالية معرفة ما تم توريده وما هو مستحق.")} />
      <article className={styles.panel}>{invoices.map((x) => <div className={styles.invoiceRow} key={x.id}><div className={styles.rowTitle}><strong>{localizeId(x.id, lang)}</strong><small><CustomerName id={x.customerId} lang={lang} /> · {localizeId(x.order, lang)}</small></div><div className={styles.rowCell}><span>{lang === "ar" ? "المبلغ" : "Amount"}</span><strong>{money(x.amount, lang)}</strong></div><div className={styles.rowCell}><span>{lang === "ar" ? "تاريخ الإصدار" : "Issued"}</span><strong>{L(x.issued)}</strong></div><div className={styles.rowCell}><span>{lang === "ar" ? "الاستحقاق" : "Due"}</span><strong>{L(x.due)}</strong></div><div className={styles.rowCell}><span>{lang === "ar" ? "تم دفع" : "Paid"}</span><strong>{money(x.paid, lang)}</strong></div><span className={x.status.en === "Overdue" ? styles.badgeDanger : styles.badgeNeutral}>{L(x.status)}</span></div>)}</article>
    </>
  );

  const collectionView = (
    <>
      <Head eyebrow={B("Cash follow-up", "متابعة النقد")} heading={B("Collection", "التحصيل")} copy={B("A live receivables queue showing who owes what, what is overdue, who owns the follow-up and the next action.", "قائمة مباشرة توضح من عليه مبلغ وكم قيمته وما المتأخر ومن المسؤول وما الإجراء التالي.")} />
      <section className={styles.metricGrid}>
        <Metric a={lang === "ar" ? "إجمالي غير المحصل" : "Total outstanding"} b={money(outstanding, lang)} c={lang === "ar" ? "رصيد فواتير مفتوحة" : "Open invoice balance"} />
        <Metric a={lang === "ar" ? "متأخر" : "Overdue"} b={money(overdue, lang)} c={lang === "ar" ? "يحتاج تدخل" : "Needs intervention"} danger />
        <Metric a={lang === "ar" ? "مدفوع جزئيًا" : "Partial balance"} b={money(74000, lang)} c={localizeId("INV-260804", lang)} />
        <Metric a={lang === "ar" ? "إجراءات اليوم" : "Actions today"} b={num(2, lang)} c={lang === "ar" ? "مالية + تحصيل" : "Finance + collection"} />
      </section>
      <article className={styles.panel} style={{ marginTop: 12 }}>{collectionActions.map((x) => <div className={styles.collectionRow} key={x.invoice}><div className={styles.rowTitle}><strong>{localizeId(x.invoice, lang)}</strong><small><CustomerName id={x.customerId} lang={lang} /></small></div><div className={styles.rowCell}><span>{lang === "ar" ? "المبلغ" : "Balance"}</span><strong>{money(x.amount, lang)}</strong></div><div className={styles.rowCell}><span>{lang === "ar" ? "التأخير" : "Overdue"}</span><strong>{x.overdue ? `${num(x.overdue, lang)} ${lang === "ar" ? "يوم" : "days"}` : "—"}</strong></div><div className={styles.rowCell}><span>{lang === "ar" ? "المسؤول" : "Owner"}</span><strong>{L(x.owner)}</strong></div><div className={styles.rowCell}><span>{lang === "ar" ? "الإجراء التالي" : "Next action"}</span><strong>{L(x.action)}</strong></div><span className={x.overdue ? styles.badgeDanger : styles.badgeNeutral}>{L(x.status)}</span></div>)}</article>
    </>
  );

  const managementView = (
    <>
      <Head eyebrow={B("One view for leadership", "شاشة واحدة للإدارة العليا")} heading={B("Management Dashboard", "لوحة الإدارة")} copy={B("Leadership can see tenders, fulfilment risk, warehouse shortages, invoicing and collections without asking every department for an update.", "تستطيع الإدارة رؤية المناقصات ومخاطر التوريد ونواقص المستودع والفواتير والتحصيل دون سؤال كل قسم عن آخر تحديث.")} />
      <section className={styles.reportGrid}>
        <Report a={lang === "ar" ? "مناقصات مفتوحة" : "Open tenders"} b={num(3, lang)} c={money(openTenderValue, lang)} />
        <Report a={lang === "ar" ? "عروض قيد المتابعة" : "Quotes in follow-up"} b={num(3, lang)} c={money(441000, lang)} />
        <Report a={lang === "ar" ? "طلبات نشطة" : "Active orders"} b={num(3, lang)} c={money(489000, lang)} />
        <Report a={lang === "ar" ? "نواقص توريد" : "Supply shortages"} b={num(3, lang)} c={lang === "ar" ? "وحدات في طلب واحد" : "units in one order"} danger />
        <Report a={lang === "ar" ? "إجمالي الفوترة" : "Total invoiced"} b={money(totalInvoiced, lang)} c={lang === "ar" ? "في هذا النموذج" : "in this demo view"} />
        <Report a={lang === "ar" ? "غير محصل" : "Outstanding"} b={money(outstanding, lang)} c={`${money(overdue, lang)} ${lang === "ar" ? "متأخرة" : "overdue"}`} danger />
      </section>
      <section className={styles.grid2}>
        <article className={styles.panel}><div className={styles.panelHead}><div><small>{lang === "ar" ? "مؤشرات التشغيل" : "OPERATING KPIs"}</small><h2>{lang === "ar" ? "الصورة التشغيلية اليوم" : "Today’s operating picture"}</h2></div></div><Kpi label={lang === "ar" ? "جاهزية أقرب مناقصة" : "Nearest tender readiness"} value={83} lang={lang} /><Kpi label={lang === "ar" ? "اكتمال الطلبات" : "Order completeness"} value={96} lang={lang} /><Kpi label={lang === "ar" ? "توفر البنود الحرجة" : "Critical item availability"} value={88} lang={lang} /><Kpi label={lang === "ar" ? "التحصيل في الموعد" : "On-time collection"} value={72} lang={lang} /></article>
        <article className={styles.aiCard}><small>{lang === "ar" ? "تفسير الإدارة" : "EXECUTIVE INTERPRETATION"}</small><h2>{lang === "ar" ? "ما الذي يجب أن تعرفه الإدارة؟" : "What should management know?"}</h2><p>{lang === "ar" ? "التشغيل مستقر عمومًا، لكن هناك استثناءان واضحان: طلب IHC لا يزال ناقصًا ويجب منع شحنه، والتحصيل يحتوي على فاتورتين متأخرتين بقيمة كبيرة. المناقصة الأقرب تحتاج أيضًا استكمال مستندين خلال ٨ أيام." : "Operations are broadly stable, but two exceptions need attention: the IHC order is still incomplete and should remain blocked from dispatch, while collections contain two material overdue invoices. The nearest tender also needs two missing documents completed within 8 days."}</p></article>
      </section>
    </>
  );

  const accountsView = (
    <>
      <Head eyebrow={B("Customer context", "سياق العميل")} heading={B("Customers", "العملاء")} copy={B("Commercial activity, current commitments and receivables connected to each customer.", "النشاط التجاري والالتزامات الحالية والمبالغ المستحقة مرتبطة بكل عميل.")} />
      <div className={styles.customerGrid}>{customers.map((c) => <article className={styles.customerCard} key={c.id}><small>{L(c.segment)} · {L(c.city)}</small><h3>{L(c.name)}</h3><div><span>{lang === "ar" ? "فرص والتزامات" : "Pipeline & commitments"}</span><strong>{money(c.open, lang)}</strong></div><div><span>{lang === "ar" ? "مبالغ مستحقة" : "Outstanding"}</span><strong>{money(c.outstanding, lang)}</strong></div></article>)}</div>
    </>
  );

  const automationView = (
    <>
      <Head eyebrow={B("Controlled workflow automation", "أتمتة سير العمل بضوابط")} heading={B("Automation", "الأتمتة")} copy={B("Business rules reduce manual follow-up while keeping critical commercial and dispatch decisions visible to humans.", "قواعد العمل تقلل المتابعة اليدوية مع إبقاء القرارات التجارية وقرارات الشحن الحرجة واضحة للمستخدمين.")} />
      <div className={styles.automationGrid}>{automations.map((x, i) => <article className={styles.automationCard} key={i}><header><div><h3>{L(x)}</h3><p>{lang === "ar" ? "قاعدة تشغيلية توضيحية تربط الحدث بالتنبيه أو الإجراء المناسب." : "Illustrative operating rule connecting an event to the right alert or action."}</p></div><button className={`${styles.switch} ${automationState[i] ? styles.switchOn : ""}`} onClick={() => setAutomationState((v) => ({ ...v, [i]: !v[i] }))}>{automationState[i] ? (lang === "ar" ? "مفعّل" : "ON") : (lang === "ar" ? "متوقف" : "OFF")}</button></header><div className={styles.miniFlow}><span>{lang === "ar" ? "حدث" : "Event"}</span><b>{lang === "ar" ? "←" : "→"}</b><span>AI / Rule</span><b>{lang === "ar" ? "←" : "→"}</b><span>{lang === "ar" ? "إجراء" : "Action"}</span></div></article>)}</div>
    </>
  );

  const aiView = (
    <>
      <Head eyebrow={B("Ask across the whole operation", "اسأل عن كامل العملية")} heading={B("AI Command Center", "مركز الذكاء الاصطناعي")} copy={B("Ask what is late, incomplete, at risk or unpaid across tenders, supply and finance.", "اسأل عما هو متأخر أو ناقص أو معرض للخطر أو غير محصل عبر المناقصات والتوريد والمالية.")} />
      <div className={styles.aiWorkspace}>
        <article className={styles.aiChat}><h2>{lang === "ar" ? "مساعد العمليات والإدارة" : "Operations & management assistant"}</h2><p>{lang === "ar" ? "بيانات العرض توضيحية وليست سجلات حقيقية للشركة." : "Demo data is illustrative and does not represent actual company records."}</p><div className={styles.bubble}>{lang === "ar" ? "ما أهم شيء يحتاج تدخل الآن؟" : "What needs intervention right now?"}</div><div className={`${styles.bubble} ${styles.bubbleAI}`}>{L(aiText)}</div><div className={styles.quickPrompts}><button onClick={() => ask("risk")}>{lang === "ar" ? "المخاطر" : "Risk"}</button><button onClick={() => ask("tender")}>{lang === "ar" ? "المناقصة الأقرب" : "Nearest tender"}</button><button onClick={() => ask("supply")}>{lang === "ar" ? "نواقص التوريد" : "Supply shortages"}</button><button onClick={() => ask("cash")}>{lang === "ar" ? "التحصيل" : "Collections"}</button></div><div className={styles.aiInput}><div>{lang === "ar" ? "اسأل عن مناقصة أو طلب أو فاتورة..." : "Ask about a tender, order or invoice..."}</div><button className={styles.primary} onClick={() => ask("risk")}>✦</button></div></article>
        <aside className={styles.panel}><div className={styles.panelHead}><div><small>{lang === "ar" ? "تنبيهات استباقية" : "PROACTIVE ALERTS"}</small><h2>{lang === "ar" ? "استثناءات تحتاج اهتمام" : "Exceptions needing attention"}</h2></div></div><Alert icon="◇" title={lang === "ar" ? "مناقصة خلال ٨ أيام" : "Tender closes in 8 days"} sub={lang === "ar" ? "نقص مستندين في TND-2608-014." : "Two documents missing in TND-2608-014."} /><Alert icon="↗" title={lang === "ar" ? "منع شحن طلب ناقص" : "Incomplete order blocked"} sub={lang === "ar" ? "SO-2026-041 ما زال ينقصه ٣ وحدات." : "SO-2026-041 is still missing 3 units."} /><Alert icon="◉" title={lang === "ar" ? "تحصيل متأخر" : "Overdue collections"} sub={lang === "ar" ? "فاتورتان متأخرتان بإجمالي ٢١٤ ألف ريال." : "Two invoices are overdue for SAR 214k."} /></aside>
      </div>
    </>
  );

  const views: Record<View, React.ReactNode> = { overview, tenders: tendersView, quotes: quotesView, orders: ordersView, warehouse: warehouseView, supply: supplyView, invoices: invoicesView, collection: collectionView, management: managementView, accounts: accountsView, automation: automationView, ai: aiView };

  return (
    <main className={styles.page} data-theme={theme} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="/systems"><span>Lab</span>Narrative<b>Systems</b></a>
        <div className={styles.conceptTag}>{lang === "ar" ? "تصور خاص · مسار الشفاء الطبية" : "Private concept · Medical Masar"}</div>
        <nav className={styles.nav}>{nav.map((n) => <button key={n.id} className={`${active === n.id ? styles.active : ""} ${n.core ? styles.coreNav : ""}`} onClick={() => setActive(n.id)}><i>{n.icon}</i>{L(n.label)}</button>)}</nav>
        <div className={styles.sidebarFoot}><strong>{lang === "ar" ? "مصمم حول المناقصات والتوريد والتحصيل" : "Built around tenders, fulfilment and collections"}</strong><p>{lang === "ar" ? "الأسماء والقيم توضيحية. الفكرة هي توحيد رحلة العمل وربطها مع Odoo أو Zoho بدل استبدالها." : "Names and values are illustrative. The concept unifies the operating workflow and can connect with Odoo or Zoho rather than replacing them."}</p><a href="mailto:hello@labnarrative.com?subject=Medical%20Masar%20Systems%20concept">{lang === "ar" ? "ناقش هذا التصور ↗" : "Discuss this concept ↗"}</a></div>
      </aside>
      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.titleBlock}><small>{lang === "ar" ? "مسار الشفاء الطبية · نظام تشغيلي توضيحي" : "Medical Masar · operating system concept"}</small><h1>{L(title)}</h1></div>
          <div className={styles.topActions}>
            <div className={styles.seg}><button className={lang === "en" ? styles.selected : ""} onClick={() => setLang("en")}>EN</button><button className={lang === "ar" ? styles.selected : ""} onClick={() => setLang("ar")}>عربي</button></div>
            <div className={styles.seg}><button className={theme === "light" ? styles.selected : ""} onClick={() => setTheme("light")}>☀ {lang === "ar" ? "فاتح" : "Light"}</button><button className={theme === "dark" ? styles.selected : ""} onClick={() => setTheme("dark")}>☾ {lang === "ar" ? "داكن" : "Dark"}</button></div>
            <span className={styles.live}><i />{lang === "ar" ? "الأتمتة مفعلة" : "Automation live"}</span>
            <button className={styles.primary} onClick={() => setActive("management")}>{lang === "ar" ? "لوحة الإدارة" : "Management view"}</button>
          </div>
        </header>
        <div className={styles.content}>{views[active]}</div>
      </section>
    </main>
  );
}

function Metric({ a, b, c, danger = false }: { a: string; b: string; c: string; danger?: boolean }) { return <article className={`${styles.metric} ${danger ? styles.metricDanger : ""}`}><span>{a}</span><strong>{b}</strong><small>{c}</small></article>; }
function Report({ a, b, c, danger = false }: { a: string; b: string; c: string; danger?: boolean }) { return <article className={`${styles.reportCard} ${danger ? styles.metricDanger : ""}`}><span>{a}</span><strong>{b}</strong><small>{c}</small></article>; }
function Kpi({ label, value, lang }: { label: string; value: number; lang: Lang }) { return <div className={styles.kpi}><div><span>{label}</span><strong>{new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US").format(value)}٪</strong></div><div className={styles.progress}><i style={{ width: `${value}%` }} /></div></div>; }
function Alert({ icon, title, sub }: { icon: string; title: string; sub: string }) { return <div className={styles.activityItem}><i>{icon}</i><div><strong>{title}</strong><p>{sub}</p></div></div>; }
