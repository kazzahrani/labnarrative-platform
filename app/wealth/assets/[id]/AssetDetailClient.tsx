"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./detail.module.css";

type Holding = {
  id: string;
  account_id: string;
  asset_name: string;
  symbol: string | null;
  asset_type: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  market_value: number | string | null;
  cost_basis: number | string | null;
  currency: string | null;
  as_of_date: string | null;
};

type Account = {
  id: string;
  provider: string | null;
  account_name: string | null;
  connection_mode: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  saudi_stock: "الأسهم السعودية",
  global_stock: "الأسهم العالمية",
  reit: "الريت",
  fund: "الصناديق",
  sukuk: "الصكوك",
  murabaha: "المرابحات",
  cash: "النقد",
  crypto: "الأصول الرقمية",
  real_estate: "العقار",
  private_asset: "الاستثمارات الخاصة",
  other: "أخرى",
};

const TYPE_COLORS: Record<string, string> = {
  saudi_stock: "#38bdf8",
  global_stock: "#6366f1",
  reit: "#f59e0b",
  fund: "#8b5cf6",
  sukuk: "#14b8a6",
  murabaha: "#06b6d4",
  cash: "#94a3b8",
  crypto: "#ec4899",
  real_estate: "#fb923c",
  private_asset: "#a78bfa",
  other: "#64748b",
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", { maximumFractionDigits: digits }).format(value);
}

function formatSar(value: number) {
  return `${formatNumber(value)} ر.س`;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}٪`;
}

export default function AssetDetailClient({ holdingId }: { holdingId: string }) {
  const [holding, setHolding] = useState<Holding | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [portfolioTotal, setPortfolioTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: userData, error: userError } = await browserSupabase.auth.getUser();
        if (userError || !userData.user) {
          window.location.replace(`/wealth/login?next=${encodeURIComponent(`/wealth/assets/${holdingId}`)}`);
          return;
        }
        const userId = userData.user.id;
        const { data: holdingData, error: holdingError } = await browserSupabase
          .from("wealth_holdings")
          .select("id,account_id,asset_name,symbol,asset_type,quantity,unit_price,market_value,cost_basis,currency,as_of_date")
          .eq("id", holdingId)
          .eq("user_id", userId)
          .maybeSingle();
        if (holdingError) throw holdingError;
        if (!holdingData) throw new Error("لم يتم العثور على هذا الأصل ضمن حسابك.");

        const [accountResult, totalResult] = await Promise.all([
          browserSupabase
            .from("wealth_accounts")
            .select("id,provider,account_name,connection_mode")
            .eq("id", holdingData.account_id)
            .eq("user_id", userId)
            .maybeSingle(),
          browserSupabase
            .from("wealth_holdings")
            .select("market_value")
            .eq("user_id", userId),
        ]);
        if (accountResult.error) throw accountResult.error;
        if (totalResult.error) throw totalResult.error;
        if (!active) return;
        setHolding(holdingData as Holding);
        setAccount((accountResult.data ?? null) as Account | null);
        setPortfolioTotal((totalResult.data ?? []).reduce((sum, row) => sum + numeric(row.market_value), 0));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "تعذر تحميل تفاصيل الأصل.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [holdingId]);

  const metrics = useMemo(() => {
    if (!holding) return null;
    const market = numeric(holding.market_value);
    const quantity = numeric(holding.quantity);
    const unitPrice = numeric(holding.unit_price);
    const cost = holding.cost_basis === null ? null : numeric(holding.cost_basis);
    const pnl = cost === null ? null : market - cost;
    const pnlPercent = pnl !== null && cost !== null && cost > 0 ? (pnl / cost) * 100 : null;
    const averageCost = cost !== null && quantity > 0 ? cost / quantity : null;
    const weight = portfolioTotal > 0 ? (market / portfolioTotal) * 100 : 0;
    const max = Math.max(market, cost ?? 0, 1);
    return { market, quantity, unitPrice, cost, pnl, pnlPercent, averageCost, weight, max };
  }, [holding, portfolioTotal]);

  if (loading) return <main className={styles.page}><div className={styles.state}>جاري تحميل الأصل…</div></main>;
  if (error || !holding || !metrics) return <main className={styles.page}><div className={styles.state}><strong>تعذر فتح الأصل.</strong><span>{error}</span><Link href="/wealth/assets">العودة إلى الأصول</Link></div></main>;

  const tone = metrics.pnl === null ? styles.neutral : metrics.pnl >= 0 ? styles.profit : styles.loss;
  const type = holding.asset_type || "other";
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.other;

  return (
    <main className={styles.page} dir="rtl">
      <aside className={styles.sidebar}>
        <div><div className={styles.brand}>ثروة</div><div className={styles.brandSub}>إدارة الثروة</div></div>
        <nav className={styles.nav}>
          <Link href="/wealth" className={styles.navItem}>نظرة عامة</Link>
          <Link href="/wealth/assets" className={`${styles.navItem} ${styles.active}`}>الأصول</Link>
          <span className={styles.navItem}>الدخل</span><span className={styles.navItem}>التحليلات</span><span className={styles.navItem}>الالتزام الشرعي</span><span className={styles.navItem}>الحسابات</span>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><Link href="/wealth/assets">← العودة إلى الأصول</Link><h1>{holding.asset_name}</h1><p>{holding.symbol || TYPE_LABELS[type] || "أصل"}</p></div>
          <span className={styles.typePill} style={{ borderColor: `${color}66`, color }}>{TYPE_LABELS[type] ?? "أخرى"}</span>
        </header>

        <div className={styles.content}>
          <section className={styles.heroGrid}>
            <article className={styles.heroCard}>
              <small>القيمة الحالية</small>
              <strong>{formatSar(metrics.market)}</strong>
              <div className={`${styles.pnl} ${tone}`}>{metrics.pnl === null ? "لا توجد تكلفة شراء مسجلة" : `${metrics.pnl >= 0 ? "↑" : "↓"} ${formatSar(Math.abs(metrics.pnl))} · ${formatPercent(metrics.pnlPercent ?? 0)}`}</div>
              <div className={styles.weightBar}><i style={{ width: `${Math.max(Math.min(metrics.weight, 100), 2)}%`, background: color }} /></div>
              <span>{formatNumber(metrics.weight, 1)}٪ من إجمالي ثروتك المسجلة</span>
            </article>

            <article className={styles.compareCard}>
              <div><h2>التكلفة → الآن</h2><p>مقارنة فعلية، وليست تاريخًا سعريًا تقديريًا</p></div>
              <div className={styles.bigBars}>
                <section><span>التكلفة المسجلة</span><div><i style={{ width: `${metrics.cost === null ? 0 : Math.max((metrics.cost / metrics.max) * 100, 3)}%` }} /></div><b>{metrics.cost === null ? "—" : formatSar(metrics.cost)}</b></section>
                <section><span>القيمة الحالية</span><div><i className={metrics.pnl !== null && metrics.pnl < 0 ? styles.lossBar : styles.profitBar} style={{ width: `${Math.max((metrics.market / metrics.max) * 100, 3)}%` }} /></div><b>{formatSar(metrics.market)}</b></section>
              </div>
            </article>
          </section>

          <section className={styles.metricGrid}>
            <article><small>الكمية</small><strong>{formatNumber(metrics.quantity)}</strong><span>وحدة</span></article>
            <article><small>سعر الوحدة الحالي</small><strong>{formatSar(metrics.unitPrice)}</strong><span>حسب آخر إدخال</span></article>
            <article><small>متوسط تكلفة الوحدة</small><strong>{metrics.averageCost === null ? "—" : formatSar(metrics.averageCost)}</strong><span>من التكلفة والكمية</span></article>
            <article><small>الحساب</small><strong>{account?.provider || account?.account_name || "—"}</strong><span>{account?.connection_mode === "manual" ? "مضاف يدويًا" : "متصل"}</span></article>
          </section>

          <section className={styles.gridTwo}>
            <article className={styles.panel}>
              <div className={styles.panelHead}><h2>ملخص الأصل</h2><p>كل البيانات المسجلة حاليًا</p></div>
              <div className={styles.details}>
                <div><span>الاسم</span><b>{holding.asset_name}</b></div>
                <div><span>الرمز</span><b>{holding.symbol || "—"}</b></div>
                <div><span>النوع</span><b>{TYPE_LABELS[type] ?? "أخرى"}</b></div>
                <div><span>العملة</span><b>{holding.currency || "SAR"}</b></div>
                <div><span>تاريخ القيمة</span><b>{holding.as_of_date || "آخر إدخال"}</b></div>
                <div><span>نسبة الأصل من الثروة</span><b>{formatNumber(metrics.weight, 1)}٪</b></div>
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHead}><h2>قراءة سريعة</h2><p>مبنية فقط على البيانات المتاحة</p></div>
              <div className={styles.insights}>
                <div><i style={{ background: color }} /><span><b>الوزن في المحفظة</b><small>هذا الأصل يمثل {formatNumber(metrics.weight, 1)}٪ من إجمالي الثروة المسجلة.</small></span></div>
                <div><i className={metrics.pnl !== null && metrics.pnl < 0 ? styles.redDot : styles.greenDot} /><span><b>الربحية الحالية</b><small>{metrics.pnl === null ? "لا توجد تكلفة شراء كافية لحساب الربحية." : metrics.pnl >= 0 ? `ربح غير محقق ${formatSar(metrics.pnl)}.` : `خسارة غير محققة ${formatSar(Math.abs(metrics.pnl))}.`}</small></span></div>
                <div><i /><span><b>التاريخ السعري</b><small>سيظهر هنا Sparkline حقيقي عندما نبدأ بحفظ تحديثات أسعار دورية لهذا الأصل.</small></span></div>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
