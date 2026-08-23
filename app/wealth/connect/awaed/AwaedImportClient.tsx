"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./awaed.module.css";

type Values = {
  stocks: string;
  funds: string;
  murabaha: string;
  cash: string;
};

type ParsedHolding = {
  name: string;
  type: string;
  value: number;
  confidence: string;
  source: string;
  included?: boolean;
};

type ParseResponse = {
  fileName: string;
  count: number;
  holdings: ParsedHolding[];
  total: number;
  categories: Record<string, number>;
  warning: string;
  error?: string;
};

const emptyValues: Values = {
  stocks: "",
  funds: "",
  murabaha: "",
  cash: "",
};

const numberFrom = (value: string) => {
  const normalized = value.replace(/,/g, "").replace(/\s/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatSar = (value: number) => new Intl.NumberFormat("ar-SA", {
  maximumFractionDigits: 0,
}).format(value);

export default function AwaedImportClient() {
  const [mode, setMode] = useState<"quick" | "statement">("statement");
  const [values, setValues] = useState<Values>(emptyValues);
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ParseResponse | null>(null);

  const total = useMemo(
    () => Object.values(values).reduce((sum, value) => sum + numberFrom(value), 0),
    [values],
  );

  const reviewedHoldings = result?.holdings ?? [];
  const reviewedTotal = useMemo(
    () => reviewedHoldings.filter((holding) => holding.included !== false).reduce((sum, holding) => sum + holding.value, 0),
    [reviewedHoldings],
  );

  const update = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const saveLocal = () => {
    const payload = {
      source: "Awaed",
      mode: "quick",
      updatedAt: new Date().toISOString(),
      values: {
        stocks: numberFrom(values.stocks),
        funds: numberFrom(values.funds),
        murabaha: numberFrom(values.murabaha),
        cash: numberFrom(values.cash),
      },
      total,
    };
    window.localStorage.setItem("tharwa:awaed", JSON.stringify(payload));
    setSaved(true);
  };

  const chooseFile = (selected: File | undefined) => {
    setFile(selected ?? null);
    setResult(null);
    setError("");
    setSaved(false);
  };

  const analyzeStatement = async () => {
    if (!file) return;
    setProcessing(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/wealth/awaed/parse", { method: "POST", body: form });
      const data = await response.json() as ParseResponse;
      if (!response.ok) throw new Error(data.error || "تعذر تحليل الملف.");
      setResult({
        ...data,
        holdings: data.holdings.map((holding) => ({ ...holding, included: true })),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحليل الملف.");
    } finally {
      setProcessing(false);
    }
  };

  const toggleHolding = (index: number) => {
    setResult((current) => current ? {
      ...current,
      holdings: current.holdings.map((holding, holdingIndex) => holdingIndex === index
        ? { ...holding, included: holding.included === false }
        : holding),
    } : current);
    setSaved(false);
  };

  const saveParsed = () => {
    if (!result) return;
    const holdings = result.holdings.filter((holding) => holding.included !== false);
    const categories = holdings.reduce<Record<string, number>>((summary, holding) => {
      summary[holding.type] = (summary[holding.type] ?? 0) + holding.value;
      return summary;
    }, {});
    window.localStorage.setItem("tharwa:awaed", JSON.stringify({
      source: "Awaed",
      mode: "statement",
      updatedAt: new Date().toISOString(),
      fileName: result.fileName,
      holdings,
      categories,
      total: reviewedTotal,
    }));
    setSaved(true);
  };

  return (
    <section className={styles.importCard}>
      <div className={styles.modeBar}>
        <button
          type="button"
          className={mode === "statement" ? styles.modeActive : ""}
          onClick={() => setMode("statement")}
        >
          رفع كشف وتحليله
        </button>
        <button
          type="button"
          className={mode === "quick" ? styles.modeActive : ""}
          onClick={() => setMode("quick")}
        >
          إدخال سريع
        </button>
      </div>

      {mode === "quick" ? (
        <div className={styles.quickGrid}>
          <div className={styles.formSide}>
            <div className={styles.sectionHeading}>
              <span>بديل سريع</span>
              <h2>أدخل قيمة استثماراتك الحالية في عوائد.</h2>
              <p>استخدم هذا الخيار إذا لم يتوفر لديك كشف مناسب الآن.</p>
            </div>

            <label className={styles.field}>
              <span>الأسهم</span>
              <div><input inputMode="decimal" placeholder="مثال: 120000" value={values.stocks} onChange={(e) => update("stocks", e.target.value)} /><b>ر.س</b></div>
            </label>
            <label className={styles.field}>
              <span>الصناديق الاستثمارية</span>
              <div><input inputMode="decimal" placeholder="مثال: 80000" value={values.funds} onChange={(e) => update("funds", e.target.value)} /><b>ر.س</b></div>
            </label>
            <label className={styles.field}>
              <span>المرابحات</span>
              <div><input inputMode="decimal" placeholder="مثال: 50000" value={values.murabaha} onChange={(e) => update("murabaha", e.target.value)} /><b>ر.س</b></div>
            </label>
            <label className={styles.field}>
              <span>النقد المتاح</span>
              <div><input inputMode="decimal" placeholder="مثال: 10000" value={values.cash} onChange={(e) => update("cash", e.target.value)} /><b>ر.س</b></div>
            </label>
          </div>

          <aside className={styles.previewSide}>
            <span className={styles.previewLabel}>معاينة محفظة عوائد</span>
            <strong className={styles.total}>{formatSar(total)} <small>ر.س</small></strong>
            <div className={styles.previewRows}>
              <div><span>الأسهم</span><b>{formatSar(numberFrom(values.stocks))} ر.س</b></div>
              <div><span>الصناديق</span><b>{formatSar(numberFrom(values.funds))} ر.س</b></div>
              <div><span>المرابحات</span><b>{formatSar(numberFrom(values.murabaha))} ر.س</b></div>
              <div><span>النقد</span><b>{formatSar(numberFrom(values.cash))} ر.س</b></div>
            </div>
            <button type="button" className={styles.primary} onClick={saveLocal} disabled={total <= 0}>
              إضافة إلى ثروتي
            </button>
            {saved && (
              <div className={styles.savedState}>
                <span>تم حفظ محفظة عوائد على هذا الجهاز.</span>
                <Link href="/wealth">العودة إلى لوحة الثروة</Link>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className={styles.statementMode}>
          <div className={styles.sectionHeading}>
            <span>الخطوة ١</span>
            <h2>ارفع أحدث كشف متاح من عوائد.</h2>
            <p>المنصة تقرأ الآن PDF وExcel XLSX وCSV فعليًا، ثم تعرض ما اكتشفته لك قبل الحفظ.</p>
          </div>

          <label className={styles.uploadBox}>
            <input
              type="file"
              accept=".pdf,.csv,.xlsx"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <span>{file ? "تم اختيار الملف" : "اسحب الملف هنا أو اضغط للاختيار"}</span>
            <strong>{file?.name || "PDF · XLSX · CSV — حتى 10 MB"}</strong>
          </label>

          {file && !result && (
            <div className={styles.fileReady}>
              <div>
                <span>الملف جاهز.</span>
                <p>سنستخرج الأصول والقيم فقط للمراجعة؛ لا توجد أي صلاحية تداول أو دخول إلى حساب عوائد.</p>
              </div>
              <button type="button" className={styles.primary} onClick={analyzeStatement} disabled={processing}>
                {processing ? "جاري تحليل الكشف…" : "تحليل الكشف الآن"}
              </button>
            </div>
          )}

          {error && <div className={styles.errorState}>{error}</div>}

          {result && (
            <div className={styles.analysisResult}>
              <div className={styles.resultHeader}>
                <div>
                  <span>الخطوة ٢ · راجع قبل الاعتماد</span>
                  <h3>{result.count ? `اكتشفنا ${new Intl.NumberFormat("ar-SA").format(result.count)} عنصرًا` : "لم نكتشف أصولًا بعد"}</h3>
                  <p>{result.warning}</p>
                </div>
                <div className={styles.resultTotal}>
                  <small>الإجمالي المختار</small>
                  <strong>{formatSar(reviewedTotal)} <em>ر.س</em></strong>
                </div>
              </div>

              {result.holdings.length > 0 && (
                <div className={styles.detectedList}>
                  <div className={styles.detectedHead}><span>اعتماد</span><span>الأصل</span><span>النوع</span><span>القيمة</span><span>الثقة</span></div>
                  {result.holdings.map((holding, index) => (
                    <label className={`${styles.detectedRow} ${holding.included === false ? styles.excludedRow : ""}`} key={`${holding.name}-${index}`}>
                      <input type="checkbox" checked={holding.included !== false} onChange={() => toggleHolding(index)} />
                      <span className={styles.detectedName}>{holding.name}</span>
                      <span>{holding.type}</span>
                      <strong>{formatSar(holding.value)} ر.س</strong>
                      <small>{holding.confidence}</small>
                    </label>
                  ))}
                </div>
              )}

              <div className={styles.resultActions}>
                <button type="button" className={styles.secondaryAction} onClick={() => { setResult(null); setFile(null); setSaved(false); }}>
                  اختيار ملف آخر
                </button>
                <button type="button" className={styles.primary} disabled={reviewedTotal <= 0} onClick={saveParsed}>
                  إضافة المختار إلى ثروتي
                </button>
              </div>

              {saved && (
                <div className={styles.savedState}>
                  <span>تم اعتماد محفظة عوائد على هذا الجهاز.</span>
                  <Link href="/wealth">مشاهدة لوحة الثروة</Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
