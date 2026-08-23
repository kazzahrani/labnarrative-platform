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
  const [mode, setMode] = useState<"quick" | "statement">("quick");
  const [values, setValues] = useState<Values>(emptyValues);
  const [fileName, setFileName] = useState("");
  const [saved, setSaved] = useState(false);

  const total = useMemo(
    () => Object.values(values).reduce((sum, value) => sum + numberFrom(value), 0),
    [values],
  );

  const update = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const saveLocal = () => {
    const payload = {
      source: "Awaed",
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

  return (
    <section className={styles.importCard}>
      <div className={styles.modeBar}>
        <button
          type="button"
          className={mode === "quick" ? styles.modeActive : ""}
          onClick={() => setMode("quick")}
        >
          إدخال سريع
        </button>
        <button
          type="button"
          className={mode === "statement" ? styles.modeActive : ""}
          onClick={() => setMode("statement")}
        >
          رفع كشف
        </button>
      </div>

      {mode === "quick" ? (
        <div className={styles.quickGrid}>
          <div className={styles.formSide}>
            <div className={styles.sectionHeading}>
              <span>الخطوة ١</span>
              <h2>أدخل قيمة استثماراتك الحالية في عوائد.</h2>
              <p>يكفي الإجمالي لكل فئة الآن. سنضيف التفاصيل على مستوى كل أصل في المرحلة التالية.</p>
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
              حفظ المحفظة مؤقتًا
            </button>
            {saved && (
              <div className={styles.savedState}>
                <span>تم الحفظ على هذا الجهاز.</span>
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
            <p>سنستخدم الملف لاحقًا لاستخراج الأصول والقيم تلقائيًا. لا نطلب بيانات دخول حسابك.</p>
          </div>
          <label className={styles.uploadBox}>
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,image/*"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
            <span>{fileName ? "تم اختيار الملف" : "اسحب الملف هنا أو اضغط للاختيار"}</span>
            <strong>{fileName || "PDF · Excel · CSV · صورة"}</strong>
          </label>
          {fileName && (
            <div className={styles.fileReady}>
              <span>الملف جاهز للمعالجة.</span>
              <p>المعالجة الآلية والتخزين المشفر سيتم ربطهما بالـ backend المالي المنفصل في الخطوة التالية.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
