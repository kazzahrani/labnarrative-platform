"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./document-lab.module.css";

type Language = "en" | "ar";
type MatchType = "exact" | "equivalent" | "missing";

type CatalogItem = {
  id: string;
  sku: string | null;
  name_en: string;
  name_ar: string | null;
  tags: string[];
};

type AnalysisItem = {
  line_number: number;
  item_code: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  raw_text: string;
  extraction_confidence: number;
  source_page?: number | null;
  source_sheet?: string | null;
  match_type: MatchType;
  match_score: number;
  matched_catalog_item: CatalogItem | null;
  rationale: string;
};

type Analysis = {
  document: {
    filename: string;
    mime_type: string | null;
    file_size_bytes: number;
    parser: string;
    pages?: number | null;
    sheets?: string[];
  };
  summary: {
    total_items: number;
    exact_matches: number;
    possible_equivalents: number;
    missing_items: number;
    achievable_coverage: number;
    confirmed_coverage: number;
    extraction_quality: number;
    recommendation: "BID" | "REVIEW" | "NO BID";
  };
  items: AnalysisItem[];
  caveat: string;
};

const copy = {
  en: {
    eyebrow: "DOCUMENT / BOQ INTELLIGENCE",
    title: "Upload the tender. See what you can actually supply.",
    subtitle: "PDF, Excel, CSV or text → line items → catalog matching → Bid / Review / No-Bid. Every match remains auditable.",
    dropTitle: "Analyze tender document",
    dropCopy: "Choose a text-based PDF or exported BoQ spreadsheet. Maximum 4 MB in this MVP.",
    choose: "Choose file",
    analyze: "Analyze BoQ",
    analyzing: "Analyzing document…",
    accepted: "PDF · XLSX · CSV · TSV · TXT",
    noFile: "Choose a tender document first.",
    summary: "Document decision",
    items: "items extracted",
    exact: "Exact matches",
    equivalents: "Possible equivalents",
    missing: "Missing",
    achievable: "Achievable coverage",
    confirmed: "Confirmed coverage",
    quality: "Extraction quality",
    recommendation: "Recommendation",
    resultTitle: "Line-item coverage",
    resultCopy: "Exact matches are strong lexical/catalog matches. Possible equivalents still require technical confirmation.",
    line: "Line",
    requested: "Requested item",
    qty: "Qty",
    catalog: "Catalog result",
    match: "Match",
    confidence: "Extraction",
    exactLabel: "Exact",
    equivalentLabel: "Possible equivalent",
    missingLabel: "Missing",
    noCatalog: "No catalog match",
    source: "Source",
    demoNote: "This first engine is deterministic: no AI-generated product claims. It is designed to create a trustworthy baseline before AI enrichment is added.",
  },
  ar: {
    eyebrow: "ذكاء مستندات المناقصات وجداول الكميات",
    title: "ارفع ملف المنافسة واعرف فعليًا ما الذي تستطيع توريده.",
    subtitle: "PDF أو Excel أو CSV أو نص ← استخراج البنود ← مطابقة الكتالوج ← ادخل / راجع / لا تدخل. كل مطابقة قابلة للمراجعة.",
    dropTitle: "تحليل مستند المنافسة",
    dropCopy: "اختر PDF نصيًا أو ملف Excel لجدول الكميات. الحد الأقصى 4 MB في النسخة الحالية.",
    choose: "اختيار ملف",
    analyze: "تحليل جدول الكميات",
    analyzing: "جاري تحليل المستند…",
    accepted: "PDF · XLSX · CSV · TSV · TXT",
    noFile: "اختر ملف المنافسة أولًا.",
    summary: "قرار المستند",
    items: "بند مستخرج",
    exact: "مطابقات مؤكدة",
    equivalents: "بدائل محتملة",
    missing: "بنود ناقصة",
    achievable: "التغطية الممكنة",
    confirmed: "التغطية المؤكدة",
    quality: "جودة الاستخراج",
    recommendation: "التوصية",
    resultTitle: "تغطية البنود",
    resultCopy: "المطابقة المؤكدة تعتمد على تطابق قوي مع الكتالوج. البدائل المحتملة تحتاج تأكيدًا فنيًا قبل التسعير.",
    line: "السطر",
    requested: "البند المطلوب",
    qty: "الكمية",
    catalog: "نتيجة الكتالوج",
    match: "المطابقة",
    confidence: "الاستخراج",
    exactLabel: "مطابق",
    equivalentLabel: "بديل محتمل",
    missingLabel: "ناقص",
    noCatalog: "لا يوجد مطابق في الكتالوج",
    source: "المصدر",
    demoNote: "المحرك الأول حتمي ولا ينشئ ادعاءات منتجات بالذكاء الاصطناعي. الهدف هو بناء خط أساس موثوق قبل إضافة طبقة الذكاء الاصطناعي.",
  },
};

function recommendationLabel(value: Analysis["summary"]["recommendation"], language: Language) {
  if (language === "en") return value;
  if (value === "BID") return "ادخل";
  if (value === "REVIEW") return "راجع";
  return "لا تدخل";
}

function matchLabel(value: MatchType, language: Language) {
  const t = copy[language];
  if (value === "exact") return t.exactLabel;
  if (value === "equivalent") return t.equivalentLabel;
  return t.missingLabel;
}

export default function TenderDocumentLab() {
  const [language, setLanguage] = useState<Language>("en");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | MatchType>("all");
  const t = copy[language];
  const rtl = language === "ar";

  const visibleItems = useMemo(() => {
    if (!analysis) return [];
    if (filter === "all") return analysis.items;
    return analysis.items.filter((item) => item.match_type === filter);
  }, [analysis, filter]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError(t.noFile);
      return;
    }
    setLoading(true);
    setError("");
    setAnalysis(null);
    setFilter("all");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/tenders/boq-analyze", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Document analysis failed.");
      setAnalysis(payload as Analysis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Document analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.wrap} dir={rtl ? "rtl" : "ltr"}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{t.eyebrow}</span>
          <h2>{t.title}</h2>
          <p>{t.subtitle}</p>
        </div>
        <div className={styles.languageSwitch}>
          <button className={language === "en" ? styles.activeLanguage : ""} onClick={() => setLanguage("en")}>EN</button>
          <button className={language === "ar" ? styles.activeLanguage : ""} onClick={() => setLanguage("ar")}>AR</button>
        </div>
      </header>

      <form className={styles.uploader} onSubmit={submit}>
        <div className={styles.uploadCopy}>
          <span>01</span>
          <div>
            <h3>{t.dropTitle}</h3>
            <p>{t.dropCopy}</p>
            <small>{t.accepted}</small>
          </div>
        </div>
        <label className={styles.fileButton}>
          <input
            type="file"
            accept=".pdf,.xlsx,.csv,.tsv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setAnalysis(null);
              setError("");
            }}
          />
          <span>{file ? file.name : t.choose}</span>
          {file && <small>{(file.size / 1024).toFixed(0)} KB</small>}
        </label>
        <button className={styles.analyzeButton} type="submit" disabled={loading || !file}>
          {loading ? t.analyzing : t.analyze}
        </button>
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {analysis && (
        <>
          <section className={styles.decisionPanel}>
            <div className={styles.decisionLead}>
              <span>{t.summary}</span>
              <strong className={styles[`decision${analysis.summary.recommendation.replace(" ", "")}`]}>
                {recommendationLabel(analysis.summary.recommendation, language)}
              </strong>
              <small>{analysis.document.filename} · {analysis.summary.total_items} {t.items}</small>
            </div>
            <div className={styles.metrics}>
              <article><span>{t.exact}</span><strong>{analysis.summary.exact_matches}</strong></article>
              <article><span>{t.equivalents}</span><strong>{analysis.summary.possible_equivalents}</strong></article>
              <article><span>{t.missing}</span><strong>{analysis.summary.missing_items}</strong></article>
              <article><span>{t.achievable}</span><strong>{analysis.summary.achievable_coverage}%</strong></article>
              <article><span>{t.confirmed}</span><strong>{analysis.summary.confirmed_coverage}%</strong></article>
              <article><span>{t.quality}</span><strong>{analysis.summary.extraction_quality}%</strong></article>
            </div>
          </section>

          <section className={styles.results}>
            <div className={styles.resultsHead}>
              <div>
                <span>02</span>
                <div><h3>{t.resultTitle}</h3><p>{t.resultCopy}</p></div>
              </div>
              <div className={styles.filters}>
                <button className={filter === "all" ? styles.filterActive : ""} onClick={() => setFilter("all")}>All {analysis.summary.total_items}</button>
                <button className={filter === "exact" ? styles.filterActive : ""} onClick={() => setFilter("exact")}>{t.exactLabel} {analysis.summary.exact_matches}</button>
                <button className={filter === "equivalent" ? styles.filterActive : ""} onClick={() => setFilter("equivalent")}>{t.equivalentLabel} {analysis.summary.possible_equivalents}</button>
                <button className={filter === "missing" ? styles.filterActive : ""} onClick={() => setFilter("missing")}>{t.missingLabel} {analysis.summary.missing_items}</button>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>{t.line}</th>
                    <th>{t.requested}</th>
                    <th>{t.qty}</th>
                    <th>{t.catalog}</th>
                    <th>{t.match}</th>
                    <th>{t.confidence}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item, index) => (
                    <tr key={`${item.line_number}-${index}`}>
                      <td className={styles.lineCell}>{item.line_number}</td>
                      <td>
                        <strong>{item.description}</strong>
                        <small>{item.item_code ? `#${item.item_code} · ` : ""}{item.source_sheet ? `${t.source}: ${item.source_sheet}` : ""}</small>
                      </td>
                      <td>{item.quantity ?? "—"}{item.unit ? ` ${item.unit}` : ""}</td>
                      <td>
                        {item.matched_catalog_item ? (
                          <><strong>{rtl ? item.matched_catalog_item.name_ar ?? item.matched_catalog_item.name_en : item.matched_catalog_item.name_en}</strong><small>{item.matched_catalog_item.sku ?? ""}</small></>
                        ) : <span className={styles.muted}>{t.noCatalog}</span>}
                      </td>
                      <td><span className={`${styles.matchBadge} ${styles[item.match_type]}`}>{matchLabel(item.match_type, language)} · {Math.round(item.match_score * 100)}%</span></td>
                      <td><span className={styles.confidence}>{Math.round(item.extraction_confidence * 100)}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.caveat}>{analysis.caveat}</p>
          </section>
        </>
      )}

      <footer className={styles.footer}>{t.demoNote}</footer>
    </section>
  );
}
