"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./workspace.module.css";

type Language = "en" | "ar";
type View = "overview" | "catalog" | "opportunities";
type Decision = "BID" | "REVIEW" | "NO BID";

type CatalogItem = {
  id: string;
  name: string;
  nameAr?: string;
  tags: string[];
};

type Requirement = {
  name: string;
  nameAr: string;
  tags: string[];
};

type Tender = {
  id: string;
  title: string;
  titleAr: string;
  buyer: string;
  buyerAr: string;
  value: number;
  deadlineDays: number;
  capabilityFit: number;
  requirements: Requirement[];
};

type TenderAnalysis = Tender & {
  matched: Array<{ requirement: Requirement; item?: CatalogItem }>;
  matchedCount: number;
  coverage: number;
  score: number;
  decision: Decision;
};

const initialCatalog: CatalogItem[] = [
  { id: "c1", name: "PCR thermal cycler", nameAr: "جهاز PCR حراري", tags: ["pcr", "thermal", "cycler"] },
  { id: "c2", name: "Benchtop centrifuge", nameAr: "جهاز طرد مركزي مكتبي", tags: ["centrifuge", "benchtop"] },
  { id: "c3", name: "Micropipette set", nameAr: "مجموعة ماصات دقيقة", tags: ["micropipette", "pipette"] },
  { id: "c4", name: "DNA extraction kit", nameAr: "عدة استخلاص DNA", tags: ["dna", "extraction", "kit"] },
  { id: "c5", name: "Class II biosafety cabinet", nameAr: "خزانة سلامة حيوية فئة II", tags: ["biosafety", "cabinet", "class ii"] },
  { id: "c6", name: "Analytical balance", nameAr: "ميزان تحليلي", tags: ["analytical", "balance"] },
  { id: "c7", name: "Laboratory freezer", nameAr: "فريزر مختبري", tags: ["laboratory", "freezer", "-20"] },
  { id: "c8", name: "ELISA kits", nameAr: "أطقم ELISA", tags: ["elisa", "kit"] },
  { id: "c9", name: "HPLC solvent filters", nameAr: "مرشحات مذيبات HPLC", tags: ["hplc", "filter", "solvent"] },
  { id: "c10", name: "General chemical reagents", nameAr: "كواشف كيميائية عامة", tags: ["chemical", "reagent", "reagents"] },
  { id: "c11", name: "Laboratory workbench", nameAr: "طاولة مختبر", tags: ["laboratory", "workbench", "furniture"] },
];

const tenders: Tender[] = [
  {
    id: "T-2401",
    title: "Molecular biology and general laboratory equipment",
    titleAr: "توريد أجهزة الأحياء الجزيئية ومعدات المختبر العامة",
    buyer: "King Saud University",
    buyerAr: "جامعة الملك سعود",
    value: 1850000,
    deadlineDays: 11,
    capabilityFit: 0.95,
    requirements: [
      { name: "PCR thermal cycler", nameAr: "جهاز PCR حراري", tags: ["pcr", "thermal", "cycler"] },
      { name: "Benchtop centrifuge", nameAr: "جهاز طرد مركزي مكتبي", tags: ["centrifuge", "benchtop"] },
      { name: "Micropipette sets", nameAr: "مجموعات ماصات دقيقة", tags: ["micropipette", "pipette"] },
      { name: "DNA extraction kits", nameAr: "أطقم استخلاص DNA", tags: ["dna", "extraction"] },
      { name: "Class II biosafety cabinet", nameAr: "خزانة سلامة حيوية فئة II", tags: ["biosafety", "cabinet"] },
      { name: "CO₂ incubator", nameAr: "حاضنة CO₂", tags: ["co2", "incubator"] },
    ],
  },
  {
    id: "T-2402",
    title: "Clinical laboratory reagents and ELISA supplies",
    titleAr: "توريد كواشف المختبر السريري ومستلزمات ELISA",
    buyer: "Specialist Hospital Research Center",
    buyerAr: "مركز أبحاث بمستشفى تخصصي",
    value: 960000,
    deadlineDays: 7,
    capabilityFit: 0.9,
    requirements: [
      { name: "ELISA kits", nameAr: "أطقم ELISA", tags: ["elisa", "kit"] },
      { name: "General chemical reagents", nameAr: "كواشف كيميائية عامة", tags: ["chemical", "reagent"] },
      { name: "Laboratory freezer", nameAr: "فريزر مختبري", tags: ["laboratory", "freezer"] },
      { name: "Microplate reader", nameAr: "قارئ صفائح مخبرية", tags: ["microplate", "reader"] },
      { name: "Automated washer", nameAr: "جهاز غسيل آلي", tags: ["automated", "washer"] },
    ],
  },
  {
    id: "T-2403",
    title: "Analytical chemistry laboratory upgrade",
    titleAr: "تطوير مختبر الكيمياء التحليلية",
    buyer: "Eastern Province University",
    buyerAr: "جامعة بالمنطقة الشرقية",
    value: 2750000,
    deadlineDays: 16,
    capabilityFit: 0.82,
    requirements: [
      { name: "HPLC system", nameAr: "جهاز HPLC", tags: ["hplc", "system"] },
      { name: "HPLC solvent filters", nameAr: "مرشحات مذيبات HPLC", tags: ["hplc", "filter"] },
      { name: "Analytical balance", nameAr: "ميزان تحليلي", tags: ["analytical", "balance"] },
      { name: "Chemical reagents", nameAr: "كواشف كيميائية", tags: ["chemical", "reagent"] },
      { name: "Autosampler", nameAr: "جهاز أخذ عينات آلي", tags: ["autosampler"] },
      { name: "UPS power system", nameAr: "نظام طاقة UPS", tags: ["ups", "power"] },
    ],
  },
  {
    id: "T-2404",
    title: "Laboratory furniture and safety refurbishment",
    titleAr: "تجديد أثاث المختبر وتجهيزات السلامة",
    buyer: "Public Health Institute",
    buyerAr: "معهد للصحة العامة",
    value: 610000,
    deadlineDays: 4,
    capabilityFit: 0.68,
    requirements: [
      { name: "Laboratory workbenches", nameAr: "طاولات مختبر", tags: ["laboratory", "workbench", "furniture"] },
      { name: "Fume hood", nameAr: "خزانة شفط أبخرة", tags: ["fume", "hood"] },
      { name: "Chemical storage cabinet", nameAr: "خزانة تخزين مواد كيميائية", tags: ["chemical", "cabinet", "storage"] },
      { name: "Emergency shower", nameAr: "دش طوارئ", tags: ["emergency", "shower"] },
      { name: "Installation service", nameAr: "خدمة تركيب", tags: ["installation", "service"] },
    ],
  },
];

const copy = {
  en: {
    overview: "Overview",
    catalog: "Product catalog",
    opportunities: "Opportunities",
    company: "Riyadh Scientific Supply Co.",
    demo: "Illustrative MVP · not live Etimad data",
    title: "Tender intelligence workspace",
    subtitle: "Your catalog drives every opportunity score below.",
    scanned: "Tenders scanned",
    matches: "Potential matches",
    high: "High priority",
    value: "High-priority value",
    today: "Priority opportunities",
    score: "Score",
    days: "days left",
    matched: "items matched",
    view: "Open analysis",
    catalogTitle: "Company catalog",
    catalogCopy: "Add or remove products and watch the opportunity scores update instantly.",
    placeholder: "Add a product, e.g. CO2 incubator",
    add: "Add product",
    reset: "Reset catalog",
    items: "catalog items",
    opportunityTitle: "All opportunities",
    opportunityCopy: "Ranked against this company's current catalog and capability profile.",
    requirements: "Required items",
    recommendation: "Recommendation",
    coverage: "Catalog coverage",
    preparation: "Preparation window",
    capability: "Capability fit",
    reasonBid: "Strong catalog coverage and enough preparation time make this worth active pursuit.",
    reasonReview: "There is meaningful fit, but missing items or timing should be reviewed before committing resources.",
    reasonNo: "Coverage or execution fit is currently too weak to justify a full bid effort.",
    matchedProduct: "Matched product",
    missing: "Missing from catalog",
    illustrative: "Scores are generated in-browser from the illustrative company catalog. Live Saudi tender ingestion is the next data layer.",
  },
  ar: {
    overview: "نظرة عامة",
    catalog: "كتالوج المنتجات",
    opportunities: "الفرص",
    company: "شركة الرياض للتوريدات العلمية",
    demo: "نسخة تجريبية توضيحية · ليست بيانات مباشرة من اعتماد",
    title: "مساحة ذكاء المناقصات",
    subtitle: "كتالوج شركتك هو الذي يحدد درجة كل فرصة أدناه.",
    scanned: "مناقصة تم فحصها",
    matches: "فرص محتملة",
    high: "أولوية عالية",
    value: "قيمة الفرص عالية الأولوية",
    today: "أهم الفرص",
    score: "الدرجة",
    days: "يوم متبقٍ",
    matched: "بند مطابق",
    view: "فتح التحليل",
    catalogTitle: "كتالوج الشركة",
    catalogCopy: "أضف أو احذف منتجات وشاهد درجات الفرص تتغير مباشرة.",
    placeholder: "أضف منتجًا، مثال: CO2 incubator",
    add: "إضافة منتج",
    reset: "إعادة الكتالوج",
    items: "منتج في الكتالوج",
    opportunityTitle: "جميع الفرص",
    opportunityCopy: "مرتبة بناءً على كتالوج الشركة الحالي وقدراتها.",
    requirements: "البنود المطلوبة",
    recommendation: "التوصية",
    coverage: "تغطية الكتالوج",
    preparation: "مدة التحضير",
    capability: "تطابق قدرات الشركة",
    reasonBid: "تغطية قوية للكتالوج مع وقت تحضير مناسب تجعل هذه الفرصة جديرة بالدخول.",
    reasonReview: "يوجد تطابق جيد، لكن يجب مراجعة البنود الناقصة أو الوقت قبل تخصيص موارد كاملة.",
    reasonNo: "التغطية أو قابلية التنفيذ الحالية لا تبرر بذل جهد كامل على العرض.",
    matchedProduct: "المنتج المطابق",
    missing: "غير موجود في الكتالوج",
    illustrative: "الدرجات محسوبة داخل النسخة التجريبية من كتالوج توضيحي. ربط مصدر المناقصات السعودي المباشر هو طبقة البيانات التالية.",
  },
};

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
}

function tagsFromName(value: string) {
  return normalise(value)
    .split(" ")
    .filter((part) => part.length > 2);
}

function findMatch(requirement: Requirement, catalog: CatalogItem[]) {
  const requirementTags = requirement.tags.map(normalise);
  return catalog.find((item) => {
    const itemTags = item.tags.map(normalise);
    return requirementTags.some((tag) => itemTags.some((itemTag) => itemTag === tag || itemTag.includes(tag) || tag.includes(itemTag)));
  });
}

function analyseTender(tender: Tender, catalog: CatalogItem[]): TenderAnalysis {
  const matched = tender.requirements.map((requirement) => ({
    requirement,
    item: findMatch(requirement, catalog),
  }));
  const matchedCount = matched.filter((entry) => Boolean(entry.item)).length;
  const coverage = tender.requirements.length ? matchedCount / tender.requirements.length : 0;
  const timing = tender.deadlineDays >= 10 ? 1 : tender.deadlineDays >= 6 ? 0.72 : 0.35;
  const score = Math.round(coverage * 65 + tender.capabilityFit * 20 + timing * 15);
  const decision: Decision = score >= 75 ? "BID" : score >= 55 ? "REVIEW" : "NO BID";
  return { ...tender, matched, matchedCount, coverage, score, decision };
}

export default function TenderWorkspace() {
  const [language, setLanguage] = useState<Language>("en");
  const [view, setView] = useState<View>("overview");
  const [catalog, setCatalog] = useState<CatalogItem[]>(initialCatalog);
  const [newProduct, setNewProduct] = useState("");
  const [selectedId, setSelectedId] = useState(tenders[0].id);
  const t = copy[language];
  const rtl = language === "ar";

  const analyses = useMemo(
    () => tenders.map((tender) => analyseTender(tender, catalog)).sort((a, b) => b.score - a.score),
    [catalog],
  );
  const selected = analyses.find((tender) => tender.id === selectedId) ?? analyses[0];
  const highPriority = analyses.filter((tender) => tender.decision === "BID");
  const highValue = highPriority.reduce((sum, tender) => sum + tender.value, 0);

  const formatNumber = (value: number) => new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US").format(value);
  const formatMoney = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M SAR`;
    return `${formatNumber(Math.round(value / 1000))}K SAR`;
  };

  function addProduct(event: FormEvent) {
    event.preventDefault();
    const value = newProduct.trim();
    if (!value) return;
    setCatalog((current) => [
      ...current,
      { id: `custom-${Date.now()}`, name: value, tags: tagsFromName(value) },
    ]);
    setNewProduct("");
  }

  function removeProduct(id: string) {
    setCatalog((current) => current.filter((item) => item.id !== id));
  }

  function chooseTender(id: string) {
    setSelectedId(id);
    setView("opportunities");
  }

  const labelForDecision = (decision: Decision) => {
    if (language === "en") return decision;
    if (decision === "BID") return "ادخل";
    if (decision === "REVIEW") return "راجع";
    return "لا تدخل";
  };

  const reasonForDecision = (decision: Decision) => {
    if (decision === "BID") return t.reasonBid;
    if (decision === "REVIEW") return t.reasonReview;
    return t.reasonNo;
  };

  return (
    <main className={styles.shell} dir={rtl ? "rtl" : "ltr"}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="/tenders">
          <span><b>Lab</b>Narrative</span>
          <strong>Tenders</strong>
        </a>
        <div className={styles.companyBlock}>
          <span>{language === "ar" ? "مساحة الشركة" : "Company workspace"}</span>
          <strong>{t.company}</strong>
          <small>{language === "ar" ? "التوريدات العلمية والمخبرية" : "Scientific & laboratory supply"}</small>
        </div>
        <nav className={styles.sideNav} aria-label="Tender workspace navigation">
          <button className={view === "overview" ? styles.activeNav : ""} onClick={() => setView("overview")}>
            <span>01</span>{t.overview}
          </button>
          <button className={view === "catalog" ? styles.activeNav : ""} onClick={() => setView("catalog")}>
            <span>02</span>{t.catalog}<b>{formatNumber(catalog.length)}</b>
          </button>
          <button className={view === "opportunities" ? styles.activeNav : ""} onClick={() => setView("opportunities")}>
            <span>03</span>{t.opportunities}<b>{formatNumber(analyses.length)}</b>
          </button>
        </nav>
        <div className={styles.sideFooter}>
          <span>{t.demo}</span>
          <a href="/tenders">← {language === "ar" ? "العودة للمنتج" : "Product page"}</a>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>{language === "ar" ? "LabNarrative Tenders · السعودية" : "LabNarrative Tenders · Saudi Arabia"}</span>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div className={styles.languageSwitch} aria-label="Language switcher">
            <button className={language === "en" ? styles.languageActive : ""} onClick={() => setLanguage("en")}>EN</button>
            <button className={language === "ar" ? styles.languageActive : ""} onClick={() => setLanguage("ar")}>AR</button>
          </div>
        </header>

        {view === "overview" && (
          <>
            <section className={styles.metricGrid}>
              <article><span>{t.scanned}</span><strong>{formatNumber(238)}</strong><small>{language === "ar" ? "مجموعة توضيحية" : "illustrative scan set"}</small></article>
              <article><span>{t.matches}</span><strong>{formatNumber(analyses.length)}</strong><small>{language === "ar" ? "بعد مطابقة الكتالوج" : "after catalog matching"}</small></article>
              <article><span>{t.high}</span><strong>{formatNumber(highPriority.length)}</strong><small>{language === "ar" ? "توصية بالدخول" : "Bid recommendation"}</small></article>
              <article><span>{t.value}</span><strong>{formatMoney(highValue)}</strong><small>{language === "ar" ? "قيمة توضيحية" : "illustrative value"}</small></article>
            </section>

            <section className={styles.sectionBlock}>
              <div className={styles.sectionHead}>
                <div><span>{language === "ar" ? "الآن" : "NOW"}</span><h2>{t.today}</h2></div>
                <button onClick={() => setView("opportunities")}>{language === "ar" ? "عرض الكل" : "View all"} →</button>
              </div>
              <div className={styles.opportunityList}>
                {analyses.slice(0, 3).map((tender) => (
                  <button key={tender.id} className={styles.opportunityCard} onClick={() => chooseTender(tender.id)}>
                    <div className={styles.scoreBox}><strong>{formatNumber(tender.score)}</strong><span>{t.score}</span></div>
                    <div className={styles.cardCopy}>
                      <span>{rtl ? tender.buyerAr : tender.buyer}</span>
                      <h3>{rtl ? tender.titleAr : tender.title}</h3>
                      <p>{formatNumber(tender.matchedCount)}/{formatNumber(tender.requirements.length)} {t.matched} · {formatNumber(tender.deadlineDays)} {t.days}</p>
                    </div>
                    <div className={`${styles.decision} ${styles[`decision${tender.decision.replace(" ", "")}`]}`}>{labelForDecision(tender.decision)}</div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {view === "catalog" && (
          <section className={styles.catalogSection}>
            <div className={styles.sectionHead}>
              <div><span>{language === "ar" ? "ملف القدرات" : "CAPABILITY PROFILE"}</span><h2>{t.catalogTitle}</h2><p>{t.catalogCopy}</p></div>
              <button onClick={() => setCatalog(initialCatalog)}>{t.reset}</button>
            </div>
            <form className={styles.addProduct} onSubmit={addProduct}>
              <input value={newProduct} onChange={(event) => setNewProduct(event.target.value)} placeholder={t.placeholder} />
              <button type="submit">{t.add}</button>
            </form>
            <div className={styles.catalogCount}>{formatNumber(catalog.length)} {t.items}</div>
            <div className={styles.catalogGrid}>
              {catalog.map((item, index) => (
                <article key={item.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{rtl ? item.nameAr ?? item.name : item.name}</strong>
                  <small>{item.tags.join(" · ")}</small>
                  <button onClick={() => removeProduct(item.id)} aria-label={`Remove ${item.name}`}>×</button>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "opportunities" && selected && (
          <section className={styles.opportunitiesLayout}>
            <div className={styles.opportunityColumn}>
              <div className={styles.sectionHead}>
                <div><span>{language === "ar" ? "مرتبة آليًا" : "RANKED"}</span><h2>{t.opportunityTitle}</h2><p>{t.opportunityCopy}</p></div>
              </div>
              <div className={styles.compactList}>
                {analyses.map((tender) => (
                  <button key={tender.id} className={selected.id === tender.id ? styles.selectedTender : ""} onClick={() => setSelectedId(tender.id)}>
                    <div><strong>{formatNumber(tender.score)}</strong><span>{labelForDecision(tender.decision)}</span></div>
                    <section><span>{rtl ? tender.buyerAr : tender.buyer}</span><h3>{rtl ? tender.titleAr : tender.title}</h3><p>{formatNumber(tender.matchedCount)}/{formatNumber(tender.requirements.length)} {t.matched} · {formatNumber(tender.deadlineDays)} {t.days}</p></section>
                  </button>
                ))}
              </div>
            </div>

            <aside className={styles.analysisPanel}>
              <div className={styles.analysisTop}>
                <div>
                  <span>{selected.id} · {rtl ? selected.buyerAr : selected.buyer}</span>
                  <h2>{rtl ? selected.titleAr : selected.title}</h2>
                  <p>{formatMoney(selected.value)} · {formatNumber(selected.deadlineDays)} {t.days}</p>
                </div>
                <div className={styles.largeScore}><strong>{formatNumber(selected.score)}</strong><span>/100</span></div>
              </div>

              <div className={styles.analysisMetrics}>
                <article><span>{t.coverage}</span><strong>{formatNumber(Math.round(selected.coverage * 100))}%</strong></article>
                <article><span>{t.preparation}</span><strong>{formatNumber(selected.deadlineDays)}d</strong></article>
                <article><span>{t.capability}</span><strong>{formatNumber(Math.round(selected.capabilityFit * 100))}%</strong></article>
              </div>

              <div className={styles.recommendationPanel}>
                <span>{t.recommendation}</span>
                <div><strong>{labelForDecision(selected.decision)}</strong><p>{reasonForDecision(selected.decision)}</p></div>
              </div>

              <div className={styles.requirementSection}>
                <div className={styles.requirementHead}><h3>{t.requirements}</h3><span>{formatNumber(selected.matchedCount)}/{formatNumber(selected.requirements.length)}</span></div>
                {selected.matched.map(({ requirement, item }) => (
                  <div key={requirement.name} className={styles.requirementRow}>
                    <span className={item ? styles.matchDot : styles.missingDot}>{item ? "✓" : "—"}</span>
                    <div><strong>{rtl ? requirement.nameAr : requirement.name}</strong><small>{item ? `${t.matchedProduct}: ${rtl ? item.nameAr ?? item.name : item.name}` : t.missing}</small></div>
                  </div>
                ))}
              </div>
            </aside>
          </section>
        )}

        <footer className={styles.workspaceFooter}>{t.illustrative}</footer>
      </section>
    </main>
  );
}
