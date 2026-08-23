"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase-browser";
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

type PortfolioPayload = {
  mode: "quick" | "statement";
  fileName?: string;
  holdings: Array<{
    name: string;
    type: string;
    value: number;
    confidence?: string;
    source?: string;
  }>;
  total: number;
};

const PENDING_KEY = "tharwa:pending:awaed";

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

function assetType(type: string) {
  if (type === "سهم") return "saudi_stock";
  if (type === "صندوق") return "fund";
  if (type === "مرابحة") return "murabaha";
  if (type === "نقد") return "cash";
  if (type === "صك") return "sukuk";
  return "other";
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AwaedImportClient() {
  const [mode, setMode] = useState<"quick" | "statement">("statement");
  const [values, setValues] = useState<Values>(emptyValues);
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [signedInEmail, setSignedInEmail] = useState("");

  const total = useMemo(
    () => Object.values(values).reduce((sum, value) => sum + numberFrom(value), 0),
    [values],
  );

  const reviewedHoldings = result?.holdings ?? [];
  const reviewedTotal = useMemo(
    () => reviewedHoldings.filter((holding) => holding.included !== false).reduce((sum, holding) => sum + holding.value, 0),
    [reviewedHoldings],
  );

  async function persistPortfolio(payload: PortfolioPayload) {
    const { data: sessionData, error: sessionError } = await browserSupabase.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session) {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
      window.location.href = "/wealth/login?next=%2Fwealth%2Fconnect%2Fawaed";
      return false;
    }

    const userId = session.user.id;
    setSignedInEmail(session.user.email ?? "");

    const { error: profileError } = await browserSupabase.from("wealth_profiles").upsert({
      user_id: userId,
      display_name: session.user.user_metadata?.full_name ?? null,
      base_currency: "SAR",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (profileError) throw profileError;

    const { data: existingAccount, error: accountLookupError } = await browserSupabase
      .from("wealth_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "Awaed")
      .neq("status", "archived")
      .limit(1)
      .maybeSingle();
    if (accountLookupError) throw accountLookupError;

    let accountId = existingAccount?.id as string | undefined;
    if (!accountId) {
      const { data: createdAccount, error: accountError } = await browserSupabase
        .from("wealth_accounts")
        .insert({
          user_id: userId,
          provider: "Awaed",
          account_name: "محفظة عوائد",
          account_type: "investment",
          connection_mode: payload.mode === "statement" ? "statement" : "manual",
          status: "active",
          currency: "SAR",
          metadata: { read_only: true },
        })
        .select("id")
        .single();
      if (accountError) throw accountError;
      accountId = createdAccount.id as string;
    } else {
      const { error: accountUpdateError } = await browserSupabase
        .from("wealth_accounts")
        .update({
          connection_mode: payload.mode === "statement" ? "statement" : "manual",
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);
      if (accountUpdateError) throw accountUpdateError;
    }

    const { data: oldHoldings, error: oldHoldingsError } = await browserSupabase
      .from("wealth_holdings")
      .select("id")
      .eq("account_id", accountId);
    if (oldHoldingsError) throw oldHoldingsError;

    const categorySummary = payload.holdings.reduce<Record<string, number>>((summary, holding) => {
      summary[holding.type] = (summary[holding.type] ?? 0) + holding.value;
      return summary;
    }, {});

    const { data: importRow, error: importError } = await browserSupabase
      .from("wealth_imports")
      .insert({
        user_id: userId,
        account_id: accountId,
        source: "Awaed",
        file_name: payload.fileName ?? null,
        file_type: payload.fileName?.split(".").pop()?.toLowerCase() ?? null,
        parse_status: "reviewed",
        detected_count: payload.holdings.length,
        total_value: payload.total,
        currency: "SAR",
        parser_version: payload.mode === "statement" ? "awaed-v1" : "manual-v1",
        summary: { categories: categorySummary, mode: payload.mode },
      })
      .select("id")
      .single();
    if (importError) throw importError;

    const rows = payload.holdings
      .filter((holding) => holding.value > 0)
      .map((holding) => ({
        user_id: userId,
        account_id: accountId,
        import_id: importRow.id,
        asset_name: holding.name,
        asset_type: assetType(holding.type),
        market_value: holding.value,
        currency: "SAR",
        as_of_date: localDate(),
        metadata: {
          parser_type: holding.type,
          confidence: holding.confidence ?? null,
          source_line: holding.source ?? null,
          needs_market_classification: holding.type === "سهم",
        },
      }));

    if (rows.length) {
      const { error: holdingsError } = await browserSupabase.from("wealth_holdings").insert(rows);
      if (holdingsError) throw holdingsError;
    }

    const oldIds = (oldHoldings ?? []).map((holding) => holding.id as string).filter(Boolean);
    if (oldIds.length) {
      const { error: deleteError } = await browserSupabase.from("wealth_holdings").delete().in("id", oldIds);
      if (deleteError) throw deleteError;
    }

    const { data: allHoldings, error: totalError } = await browserSupabase
      .from("wealth_holdings")
      .select("market_value,asset_type")
      .eq("user_id", userId);
    if (totalError) throw totalError;

    const allocation: Record<string, number> = {};
    let netWorth = 0;
    let liquidAssets = 0;
    for (const holding of allHoldings ?? []) {
      const value = Number(holding.market_value) || 0;
      const type = String(holding.asset_type || "other");
      netWorth += value;
      allocation[type] = (allocation[type] ?? 0) + value;
      if (type !== "real_estate" && type !== "private_asset") liquidAssets += value;
    }

    const { error: snapshotError } = await browserSupabase.from("wealth_snapshots").upsert({
      user_id: userId,
      snapshot_date: localDate(),
      net_worth: netWorth,
      liquid_assets: liquidAssets,
      annual_income_estimate: 0,
      currency: "SAR",
      allocation,
      metadata: { last_source: "Awaed" },
    }, { onConflict: "user_id,snapshot_date" });
    if (snapshotError) throw snapshotError;

    const { error: importUpdateError } = await browserSupabase
      .from("wealth_imports")
      .update({ parse_status: "saved", updated_at: new Date().toISOString() })
      .eq("id", importRow.id);
    if (importUpdateError) throw importUpdateError;

    window.localStorage.setItem("tharwa:awaed", JSON.stringify({ ...payload, source: "Awaed", updatedAt: new Date().toISOString() }));
    window.localStorage.removeItem(PENDING_KEY);
    setSaved(true);
    return true;
  }

  async function savePortfolio(payload: PortfolioPayload) {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      await persistPortfolio(payload);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "تعذر حفظ المحفظة.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void browserSupabase.auth.getSession().then(async ({ data }) => {
      if (data.session) setSignedInEmail(data.session.user.email ?? "");
      const pending = window.localStorage.getItem(PENDING_KEY);
      if (!data.session || !pending) return;
      try {
        const payload = JSON.parse(pending) as PortfolioPayload;
        setSaving(true);
        await persistPortfolio(payload);
      } catch (reason) {
        setSaveError(reason instanceof Error ? reason.message : "تعذر إكمال الحفظ بعد تسجيل الدخول.");
      } finally {
        setSaving(false);
      }
    });
  }, []);

  const update = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const saveQuick = async () => {
    const holdings = [
      { name: "عوائد — الأسهم", type: "سهم", value: numberFrom(values.stocks), source: "إدخال سريع" },
      { name: "عوائد — الصناديق الاستثمارية", type: "صندوق", value: numberFrom(values.funds), source: "إدخال سريع" },
      { name: "عوائد — المرابحات", type: "مرابحة", value: numberFrom(values.murabaha), source: "إدخال سريع" },
      { name: "عوائد — النقد المتاح", type: "نقد", value: numberFrom(values.cash), source: "إدخال سريع" },
    ].filter((holding) => holding.value > 0);
    await savePortfolio({ mode: "quick", holdings, total });
  };

  const chooseFile = (selected: File | undefined) => {
    setFile(selected ?? null);
    setResult(null);
    setError("");
    setSaveError("");
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

  const saveParsed = async () => {
    if (!result) return;
    const holdings = result.holdings
      .filter((holding) => holding.included !== false)
      .map((holding) => ({
        name: holding.name,
        type: holding.type,
        value: holding.value,
        confidence: holding.confidence,
        source: holding.source,
      }));
    await savePortfolio({
      mode: "statement",
      fileName: result.fileName,
      holdings,
      total: reviewedTotal,
    });
  };

  return (
    <section className={styles.importCard}>
      <div className={styles.accountBar}>
        <div>
          <span>{signedInEmail ? "الحفظ السحابي مفعّل" : "الحفظ الآمن"}</span>
          <strong>{signedInEmail || "سجّل الدخول عند اعتماد المحفظة"}</strong>
        </div>
        {signedInEmail ? <span className={styles.connected}>متصل</span> : <Link href="/wealth/login?next=%2Fwealth%2Fconnect%2Fawaed">تسجيل الدخول</Link>}
      </div>

      <div className={styles.modeBar}>
        <button type="button" className={mode === "statement" ? styles.modeActive : ""} onClick={() => setMode("statement")}>رفع كشف وتحليله</button>
        <button type="button" className={mode === "quick" ? styles.modeActive : ""} onClick={() => setMode("quick")}>إدخال سريع</button>
      </div>

      {mode === "quick" ? (
        <div className={styles.quickGrid}>
          <div className={styles.formSide}>
            <div className={styles.sectionHeading}>
              <span>بديل سريع</span>
              <h2>أدخل قيمة استثماراتك الحالية في عوائد.</h2>
              <p>استخدم هذا الخيار إذا لم يتوفر لديك كشف مناسب الآن.</p>
            </div>
            <label className={styles.field}><span>الأسهم</span><div><input inputMode="decimal" placeholder="مثال: 120000" value={values.stocks} onChange={(e) => update("stocks", e.target.value)} /><b>ر.س</b></div></label>
            <label className={styles.field}><span>الصناديق الاستثمارية</span><div><input inputMode="decimal" placeholder="مثال: 80000" value={values.funds} onChange={(e) => update("funds", e.target.value)} /><b>ر.س</b></div></label>
            <label className={styles.field}><span>المرابحات</span><div><input inputMode="decimal" placeholder="مثال: 50000" value={values.murabaha} onChange={(e) => update("murabaha", e.target.value)} /><b>ر.س</b></div></label>
            <label className={styles.field}><span>النقد المتاح</span><div><input inputMode="decimal" placeholder="مثال: 10000" value={values.cash} onChange={(e) => update("cash", e.target.value)} /><b>ر.س</b></div></label>
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
            <button type="button" className={styles.primary} onClick={() => void saveQuick()} disabled={total <= 0 || saving}>{saving ? "جاري الحفظ…" : "إضافة إلى ثروتي"}</button>
            {saved && <div className={styles.savedState}><span>تم حفظ محفظة عوائد بأمان في حسابك.</span><Link href="/wealth">العودة إلى لوحة الثروة</Link></div>}
            {saveError && <div className={styles.errorState}>{saveError}</div>}
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
            <input type="file" accept=".pdf,.csv,.xlsx" onChange={(event) => chooseFile(event.target.files?.[0])} />
            <span>{file ? "تم اختيار الملف" : "اسحب الملف هنا أو اضغط للاختيار"}</span>
            <strong>{file?.name || "PDF · XLSX · CSV — حتى 10 MB"}</strong>
          </label>

          {file && !result && <div className={styles.fileReady}><div><span>الملف جاهز.</span><p>سنستخرج الأصول والقيم فقط للمراجعة؛ لا توجد أي صلاحية تداول أو دخول إلى حساب عوائد.</p></div><button type="button" className={styles.primary} onClick={analyzeStatement} disabled={processing}>{processing ? "جاري تحليل الكشف…" : "تحليل الكشف الآن"}</button></div>}
          {error && <div className={styles.errorState}>{error}</div>}

          {result && (
            <div className={styles.analysisResult}>
              <div className={styles.resultHeader}>
                <div><span>الخطوة ٢ · راجع قبل الاعتماد</span><h3>{result.count ? `اكتشفنا ${new Intl.NumberFormat("ar-SA").format(result.count)} عنصرًا` : "لم نكتشف أصولًا بعد"}</h3><p>{result.warning}</p></div>
                <div className={styles.resultTotal}><small>الإجمالي المختار</small><strong>{formatSar(reviewedTotal)} <em>ر.س</em></strong></div>
              </div>

              {result.holdings.length > 0 && <div className={styles.detectedList}>
                <div className={styles.detectedHead}><span>اعتماد</span><span>الأصل</span><span>النوع</span><span>القيمة</span><span>الثقة</span></div>
                {result.holdings.map((holding, index) => <label className={`${styles.detectedRow} ${holding.included === false ? styles.excludedRow : ""}`} key={`${holding.name}-${index}`}><input type="checkbox" checked={holding.included !== false} onChange={() => toggleHolding(index)} /><span className={styles.detectedName}>{holding.name}</span><span>{holding.type}</span><strong>{formatSar(holding.value)} ر.س</strong><small>{holding.confidence}</small></label>)}
              </div>}

              <div className={styles.resultActions}>
                <button type="button" className={styles.secondaryAction} onClick={() => { setResult(null); setFile(null); setSaved(false); setSaveError(""); }}>اختيار ملف آخر</button>
                <button type="button" className={styles.primary} disabled={reviewedTotal <= 0 || saving} onClick={() => void saveParsed()}>{saving ? "جاري الحفظ…" : "إضافة المختار إلى ثروتي"}</button>
              </div>
              {saved && <div className={styles.savedState}><span>تم اعتماد محفظة عوائد وحفظها بأمان في حسابك.</span><Link href="/wealth">مشاهدة لوحة الثروة</Link></div>}
              {saveError && <div className={styles.errorState}>{saveError}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
