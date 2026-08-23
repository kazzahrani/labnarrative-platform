"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./manual-awaed.module.css";

type Row = {
  id: string;
  name: string;
  type: "سهم" | "صندوق" | "مرابحة" | "صك" | "ريت" | "نقد" | "أخرى";
  symbol: string;
  value: string;
  quantity: string;
  averageCost: string;
};

type SavedHolding = {
  name: string;
  type: Row["type"];
  symbol?: string;
  value: number;
  quantity?: number;
  averageCost?: number;
};

type PortfolioPayload = {
  mode: "manual_detail";
  holdings: SavedHolding[];
  total: number;
};

const PENDING_KEY = "tharwa:pending:awaed";

function newRow(): Row {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "صندوق",
    symbol: "",
    value: "",
    quantity: "",
    averageCost: "",
  };
}

function numberFrom(value: string) {
  const normalized = value.replace(/[٬,\s]/g, "").replace("٫", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSar(value: number) {
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value);
}

function assetType(type: Row["type"]) {
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

export default function ManualAwaedClient() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");

  const validRows = useMemo(
    () => rows.filter((row) => row.name.trim() && numberFrom(row.value) > 0),
    [rows],
  );

  const total = useMemo(
    () => validRows.reduce((sum, row) => sum + numberFrom(row.value), 0),
    [validRows],
  );

  const estimatedCost = useMemo(
    () => validRows.reduce((sum, row) => {
      const quantity = numberFrom(row.quantity);
      const avg = numberFrom(row.averageCost);
      return sum + (quantity > 0 && avg > 0 ? quantity * avg : 0);
    }, 0),
    [validRows],
  );

  const payloadFromRows = (): PortfolioPayload => ({
    mode: "manual_detail",
    holdings: validRows.map((row) => ({
      name: row.name.trim(),
      type: row.type,
      symbol: row.symbol.trim() || undefined,
      value: numberFrom(row.value),
      quantity: numberFrom(row.quantity) || undefined,
      averageCost: numberFrom(row.averageCost) || undefined,
    })),
    total,
  });

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
          connection_mode: "manual",
          status: "active",
          currency: "SAR",
          metadata: { read_only: true, manual_detail: true },
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
          metadata: { read_only: true, manual_detail: true },
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
        parse_status: "reviewed",
        detected_count: payload.holdings.length,
        total_value: payload.total,
        currency: "SAR",
        parser_version: "manual-detail-v1",
        summary: { categories: categorySummary, mode: payload.mode },
      })
      .select("id")
      .single();
    if (importError) throw importError;

    const holdingRows = payload.holdings.map((holding) => {
      const quantity = holding.quantity ?? null;
      const averageCost = holding.averageCost ?? null;
      const costBasis = quantity && averageCost ? quantity * averageCost : null;
      const unitPrice = quantity ? holding.value / quantity : null;
      return {
        user_id: userId,
        account_id: accountId,
        import_id: importRow.id,
        asset_name: holding.name,
        symbol: holding.symbol ?? null,
        asset_type: assetType(holding.type),
        quantity,
        unit_price: unitPrice,
        market_value: holding.value,
        cost_basis: costBasis,
        currency: "SAR",
        as_of_date: localDate(),
        metadata: {
          source: "manual_awaed",
          entered_type: holding.type,
          average_cost: averageCost,
          read_only: true,
        },
      };
    });

    if (holdingRows.length) {
      const { error: holdingsError } = await browserSupabase.from("wealth_holdings").insert(holdingRows);
      if (holdingsError) throw holdingsError;
    }

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
      metadata: { last_source: "Awaed", entry_mode: "manual_detail" },
    }, { onConflict: "user_id,snapshot_date" });
    if (snapshotError) throw snapshotError;

    const { error: importUpdateError } = await browserSupabase
      .from("wealth_imports")
      .update({ parse_status: "saved", updated_at: new Date().toISOString() })
      .eq("id", importRow.id);
    if (importUpdateError) throw importUpdateError;

    window.localStorage.setItem("tharwa:awaed", JSON.stringify({
      ...payload,
      source: "Awaed",
      updatedAt: new Date().toISOString(),
    }));
    window.localStorage.removeItem(PENDING_KEY);
    setSaved(true);
    return true;
  }

  async function save() {
    if (!validRows.length) return;
    setSaving(true);
    setSaved(false);
    setError("");
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
        const parsed = JSON.parse(pending) as PortfolioPayload;
        if (parsed.mode !== "manual_detail") return;
        setSaving(true);
        await persistPortfolio(parsed);
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
  }

  function removeRow(id: string) {
    setRows((current) => current.length === 1 ? [newRow()] : current.filter((row) => row.id !== id));
    setSaved(false);
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
        <p>انقل الاسم والنوع والقيمة الحالية من تطبيق عوائد. الكمية ومتوسط التكلفة والرمز اختيارية.</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.headerRow}>
          <span>الاستثمار</span>
          <span>النوع</span>
          <span>القيمة الحالية</span>
          <span>الكمية</span>
          <span>متوسط التكلفة</span>
          <span>الرمز</span>
          <span />
        </div>

        <div className={styles.rows}>
          {rows.map((row, index) => (
            <div className={styles.row} key={row.id}>
              <label className={styles.nameField}>
                <span className={styles.mobileLabel}>الاستثمار</span>
                <input
                  value={row.name}
                  onChange={(event) => updateRow(row.id, { name: event.target.value })}
                  placeholder={index === 0 ? "مثال: صندوق عوائد للأسهم السعودية" : "اسم الاستثمار"}
                />
              </label>

              <label>
                <span className={styles.mobileLabel}>النوع</span>
                <select value={row.type} onChange={(event) => updateRow(row.id, { type: event.target.value as Row["type"] })}>
                  <option>صندوق</option>
                  <option>سهم</option>
                  <option>مرابحة</option>
                  <option>صك</option>
                  <option>ريت</option>
                  <option>نقد</option>
                  <option>أخرى</option>
                </select>
              </label>

              <label>
                <span className={styles.mobileLabel}>القيمة الحالية</span>
                <div className={styles.moneyInput}>
                  <input inputMode="decimal" value={row.value} onChange={(event) => updateRow(row.id, { value: event.target.value })} placeholder="0" />
                  <small>ر.س</small>
                </div>
              </label>

              <label>
                <span className={styles.mobileLabel}>الكمية</span>
                <input inputMode="decimal" value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: event.target.value })} placeholder="اختياري" />
              </label>

              <label>
                <span className={styles.mobileLabel}>متوسط التكلفة</span>
                <div className={styles.moneyInput}>
                  <input inputMode="decimal" value={row.averageCost} onChange={(event) => updateRow(row.id, { averageCost: event.target.value })} placeholder="اختياري" />
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

      <button type="button" className={styles.addRow} onClick={() => setRows((current) => [...current, newRow()])}>
        + إضافة استثمار آخر
      </button>

      <div className={styles.summary}>
        <div>
          <span>عدد الاستثمارات</span>
          <strong>{validRows.length}</strong>
        </div>
        <div className={styles.totalBox}>
          <span>إجمالي محفظة عوائد</span>
          <strong>{formatSar(total)} <small>ر.س</small></strong>
        </div>
        <div>
          <span>التكلفة المحسوبة</span>
          <strong>{estimatedCost > 0 ? `${formatSar(estimatedCost)} ر.س` : "—"}</strong>
        </div>
      </div>

      <div className={styles.footer}>
        <p>لا تحتاج لإدخال الكمية أو متوسط التكلفة الآن. يكفي الاسم والقيمة الحالية لإضافة الاستثمار إلى صافي ثروتك.</p>
        <button type="button" className={styles.primary} onClick={save} disabled={!validRows.length || saving}>
          {saving ? "جارٍ الحفظ…" : "حفظ محفظة عوائد في ثروتي"}
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {saved ? (
        <div className={styles.saved}>
          <span>تم حفظ محفظة عوائد بنجاح.</span>
          <Link href="/wealth">عرض ثروتي</Link>
        </div>
      ) : null}
    </section>
  );
}
