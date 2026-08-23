"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./manual-awaed.module.css";

type AssetKind = "سهم" | "صندوق" | "مرابحة" | "صك" | "ريت" | "نقد" | "أخرى";

type Row = {
  id: string;
  name: string;
  type: AssetKind;
  symbol: string;
  value: string;
  quantity: string;
  averageCost: string;
};

type HoldingPayload = {
  name: string;
  type: AssetKind;
  symbol?: string;
  value: number;
  quantity?: number;
  averageCost?: number;
};

type PortfolioPayload = {
  mode: "manual_detail_v2";
  holdings: HoldingPayload[];
  total: number;
};

const PENDING_KEY = "tharwa:pending:awaed:v2";

function makeRow(id: string): Row {
  return {
    id,
    name: "",
    type: "صندوق",
    symbol: "",
    value: "",
    quantity: "",
    averageCost: "",
  };
}

function normalizeNumericInput(input: string) {
  const eastern = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  let value = input
    .replace(/[٠-٩]/g, (digit) => String(eastern.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/[٬,\s\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/[^0-9.\-]/g, "");

  const negative = value.startsWith("-");
  value = value.replace(/-/g, "");
  const [whole = "", ...decimals] = value.split(".");
  const decimal = decimals.join("");
  const normalized = decimals.length ? `${whole}.${decimal}` : whole;
  return `${negative ? "-" : ""}${normalized}`;
}

function numberFrom(value: string) {
  const normalized = normalizeNumericInput(value);
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSar(value: number) {
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value);
}

function assetType(type: AssetKind) {
  if (type === "سهم") return "saudi_stock";
  if (type === "صندوق") return "fund";
  if (type === "مرابحة") return "murabaha";
  if (type === "صك") return "sukuk";
  if (type === "ريت") return "reit";
  if (type === "نقد") return "cash";
  return "other";
}

function localDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function ManualAwaedClientV2() {
  const nextRowId = useRef(2);
  const [rows, setRows] = useState<Row[]>([makeRow("row-1")]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");

  const touchedRows = useMemo(
    () => rows.filter((row) => row.name.trim() || row.value.trim() || row.quantity.trim() || row.averageCost.trim() || row.symbol.trim()),
    [rows],
  );

  const validRows = useMemo(
    () => rows.filter((row) => row.name.trim().length > 0 && numberFrom(row.value) > 0),
    [rows],
  );

  const invalidRows = useMemo(
    () => touchedRows.filter((row) => !row.name.trim() || numberFrom(row.value) <= 0),
    [touchedRows],
  );

  const total = useMemo(
    () => validRows.reduce((sum, row) => sum + numberFrom(row.value), 0),
    [validRows],
  );

  const estimatedCost = useMemo(
    () => validRows.reduce((sum, row) => {
      const quantity = numberFrom(row.quantity);
      const averageCost = numberFrom(row.averageCost);
      return sum + (quantity > 0 && averageCost > 0 ? quantity * averageCost : 0);
    }, 0),
    [validRows],
  );

  function payloadFromRows(): PortfolioPayload {
    return {
      mode: "manual_detail_v2",
      holdings: validRows.map((row) => ({
        name: row.name.trim(),
        type: row.type,
        symbol: row.symbol.trim() || undefined,
        value: numberFrom(row.value),
        quantity: numberFrom(row.quantity) || undefined,
        averageCost: numberFrom(row.averageCost) || undefined,
      })),
      total,
    };
  }

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

    const { data: existingAccount, error: lookupError } = await browserSupabase
      .from("wealth_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "Awaed")
      .neq("status", "archived")
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    let accountId = existingAccount?.id as string | undefined;
    if (!accountId) {
      const { data: createdAccount, error: accountError } = await browserSupabase
        .from("wealth_accounts")
        .insert({
          user_id: userId,
          provider: "Awaed",
          account_name: "محفظة عوائد",
          account_type: "investment",
          connection_mode: "manual",
          status: "active",
          currency: "SAR",
          metadata: { read_only: true, manual_detail: true, version: 2 },
        })
        .select("id")
        .single();
      if (accountError) throw accountError;
      accountId = createdAccount.id as string;
    } else {
      const { error: accountUpdateError } = await browserSupabase
        .from("wealth_accounts")
        .update({
          connection_mode: "manual",
          status: "active",
          metadata: { read_only: true, manual_detail: true, version: 2 },
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);
      if (accountUpdateError) throw accountUpdateError;
    }

    const { data: oldHoldings, error: oldError } = await browserSupabase
      .from("wealth_holdings")
      .select("id")
      .eq("account_id", accountId);
    if (oldError) throw oldError;

    const categories = payload.holdings.reduce<Record<string, number>>((summary, holding) => {
      summary[holding.type] = (summary[holding.type] ?? 0) + holding.value;
      return summary;
    }, {});

    const { data: importRow, error: importError } = await browserSupabase
      .from("wealth_imports")
      .insert({
        user_id: userId,
        account_id: accountId,
        source: "Awaed",
        parse_status: "reviewed",
        detected_count: payload.holdings.length,
        total_value: payload.total,
        currency: "SAR",
        parser_version: "manual-detail-v2",
        summary: { categories, mode: payload.mode },
      })
      .select("id")
      .single();
    if (importError) throw importError;

    const holdingRows = payload.holdings.map((holding) => {
      const quantity = holding.quantity ?? null;
      const averageCost = holding.averageCost ?? null;
      return {
        user_id: userId,
        account_id: accountId,
        import_id: importRow.id,
        asset_name: holding.name,
        symbol: holding.symbol ?? null,
        asset_type: assetType(holding.type),
        quantity,
        unit_price: quantity ? holding.value / quantity : null,
        market_value: holding.value,
        cost_basis: quantity && averageCost ? quantity * averageCost : null,
        currency: "SAR",
        as_of_date: localDate(),
        metadata: {
          source: "manual_awaed_v2",
          entered_type: holding.type,
          average_cost: averageCost,
          read_only: true,
        },
      };
    });

    const { error: insertError } = await browserSupabase.from("wealth_holdings").insert(holdingRows);
    if (insertError) throw insertError;

    const oldIds = (oldHoldings ?? []).map((holding) => holding.id as string).filter(Boolean);
    if (oldIds.length) {
      const { error: deleteError } = await browserSupabase.from("wealth_holdings").delete().in("id", oldIds);
      if (deleteError) throw deleteError;
    }

    const { data: allHoldings, error: allError } = await browserSupabase
      .from("wealth_holdings")
      .select("market_value,asset_type")
      .eq("user_id", userId);
    if (allError) throw allError;

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
      metadata: { last_source: "Awaed", entry_mode: "manual_detail_v2" },
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

  async function save() {
    setSaved(false);
    setError("");

    if (!touchedRows.length) {
      setError("أدخل استثمارًا واحدًا على الأقل.");
      return;
    }
    if (invalidRows.length) {
      setError("يوجد صف غير مكتمل. تأكد أن كل استثمار يحتوي على اسم وقيمة حالية أكبر من صفر.");
      return;
    }
    if (!validRows.length) {
      setError("لم أتمكن من قراءة أي قيمة. جرّب كتابة القيمة مثل 36.4 أو ٣٦٫٤.");
      return;
    }

    setSaving(true);
    try {
      await persistPortfolio(payloadFromRows());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ المحفظة.");
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
        if (payload.mode !== "manual_detail_v2") return;
        setSaving(true);
        await persistPortfolio(payload);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "تعذر إكمال الحفظ بعد تسجيل الدخول.");
      } finally {
        setSaving(false);
      }
    });
  }, []);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setSaved(false);
    setError("");
  }

  function updateNumber(id: string, field: "value" | "quantity" | "averageCost", value: string) {
    updateRow(id, { [field]: normalizeNumericInput(value) } as Pick<Row, typeof field>);
  }

  function addRow() {
    const id = `row-${nextRowId.current++}`;
    setRows((current) => [...current, makeRow(id)]);
  }

  function removeRow(id: string) {
    setRows((current) => current.length === 1 ? [makeRow("row-1")] : current.filter((row) => row.id !== id));
    setSaved(false);
    setError("");
  }

  return (
    <section className={styles.card}>
      <div className={styles.accountBar}>
        <div>
          <span>{signedInEmail ? "الحفظ السحابي مفعّل" : "الحفظ الآمن"}</span>
          <strong>{signedInEmail || "سجّل الدخول فقط عند الحفظ"}</strong>
        </div>
        {signedInEmail
          ? <span className={styles.connected}>متصل</span>
          : <Link href="/wealth/login?next=%2Fwealth%2Fconnect%2Fawaed">تسجيل الدخول</Link>}
      </div>

      <div className={styles.heading}>
        <span>إدخال يدوي</span>
        <h2>أدخل استثمارات عوائد واحدًا واحدًا.</h2>
        <p>المطلوب فقط اسم الاستثمار والقيمة الحالية الإجمالية. الكمية ومتوسط التكلفة والرمز اختيارية.</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.headerRow}>
          <span>الاستثمار</span><span>النوع</span><span>القيمة الحالية</span><span>الكمية</span><span>متوسط التكلفة</span><span>الرمز</span><span />
        </div>
        <div className={styles.rows}>
          {rows.map((row, index) => (
            <div className={styles.row} key={row.id}>
              <label className={styles.nameField}>
                <span className={styles.mobileLabel}>الاستثمار</span>
                <input value={row.name} onChange={(event) => updateRow(row.id, { name: event.target.value })} placeholder={index === 0 ? "مثال: أرامكو" : "اسم الاستثمار"} />
              </label>
              <label>
                <span className={styles.mobileLabel}>النوع</span>
                <select value={row.type} onChange={(event) => updateRow(row.id, { type: event.target.value as AssetKind })}>
                  <option>صندوق</option><option>سهم</option><option>مرابحة</option><option>صك</option><option>ريت</option><option>نقد</option><option>أخرى</option>
                </select>
              </label>
              <label>
                <span className={styles.mobileLabel}>القيمة الحالية</span>
                <div className={styles.moneyInput}>
                  <input inputMode="decimal" value={row.value} onChange={(event) => updateNumber(row.id, "value", event.target.value)} placeholder="مثال 36.4" dir="ltr" />
                  <small>ر.س</small>
                </div>
              </label>
              <label>
                <span className={styles.mobileLabel}>الكمية</span>
                <input inputMode="decimal" value={row.quantity} onChange={(event) => updateNumber(row.id, "quantity", event.target.value)} placeholder="اختياري" dir="ltr" />
              </label>
              <label>
                <span className={styles.mobileLabel}>متوسط التكلفة</span>
                <div className={styles.moneyInput}>
                  <input inputMode="decimal" value={row.averageCost} onChange={(event) => updateNumber(row.id, "averageCost", event.target.value)} placeholder="اختياري" dir="ltr" />
                  <small>ر.س</small>
                </div>
              </label>
              <label>
                <span className={styles.mobileLabel}>الرمز</span>
                <input value={row.symbol} onChange={(event) => updateRow(row.id, { symbol: event.target.value })} placeholder="اختياري" dir="ltr" />
              </label>
              <button type="button" className={styles.remove} onClick={() => removeRow(row.id)} aria-label="حذف الاستثمار">×</button>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className={styles.addRow} onClick={addRow}>+ إضافة استثمار آخر</button>

      <div className={styles.summary}>
        <div><span>جاهز للحفظ</span><strong>{validRows.length}</strong></div>
        <div className={styles.totalBox}><span>إجمالي محفظة عوائد</span><strong>{formatSar(total)} <small>ر.س</small></strong></div>
        <div><span>التكلفة المحسوبة</span><strong>{estimatedCost > 0 ? `${formatSar(estimatedCost)} ر.س` : "—"}</strong></div>
      </div>

      <div className={styles.footer}>
        <p>{invalidRows.length ? `يوجد ${invalidRows.length} صف يحتاج اسمًا وقيمة صحيحة قبل الحفظ.` : "القيمة الحالية هي القيمة الإجمالية الظاهرة للاستثمار، وليست بالضرورة سعر الوحدة."}</p>
        <button type="button" className={styles.primary} onClick={save} disabled={saving || touchedRows.length === 0}>
          {saving ? "جارٍ الحفظ…" : "حفظ محفظة عوائد في ثروتي"}
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {saved ? <div className={styles.saved}><span>تم حفظ محفظة عوائد بنجاح.</span><Link href="/wealth">عرض ثروتي</Link></div> : null}
    </section>
  );
}
