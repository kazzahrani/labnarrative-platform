"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./assets.module.css";

type WealthAccount = {
  id: string;
  provider: string | null;
  account_name: string | null;
  connection_mode: string | null;
};

type WealthHolding = {
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
};

type AllocationItem = {
  key: string;
  name: string;
  value: number;
  color: string;
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
  return new Intl.NumberFormat("ar-SA-u-nu-arab", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatSar(value: number) {
  return `${formatNumber(value)} ر.س`;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}٪`;
}

function AllocationDonut({ items, total }: { items: AllocationItem[]; total: number }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const positive = items.filter((item) => item.value > 0);
  const active = positive.find((item) => item.key === activeKey) ?? positive[0];
  let cursor = 0;

  return (
    <div className={styles.donutLayout}>
      <div className={styles.donutWrap}>
        <svg viewBox="0 0 120 120" className={styles.donut} aria-label="توزيع الأصول">
          <circle cx="60" cy="60" r="46" pathLength="100" className={styles.track} />
          {positive.map((item) => {
            const share = total > 0 ? (item.value / total) * 100 : 0;
            const offset = cursor;
            cursor += share;
            return (
              <circle
                key={item.key}
                cx="60"
                cy="60"
                r="46"
                pathLength="100"
                stroke={item.color}
                strokeDasharray={`${Math.max(share - 0.7, 0.5)} ${100 - Math.max(share - 0.7, 0.5)}`}
                strokeDashoffset={-offset}
                className={`${styles.segment} ${activeKey && activeKey !== item.key ? styles.dimmed : ""}`}
                onMouseEnter={() => setActiveKey(item.key)}
                onMouseLeave={() => setActiveKey(null)}
              />
            );
          })}
        </svg>
        <div className={styles.donutCenter}>
          <small>{active?.name ?? "إجمالي الأصول"}</small>
          <strong>{active ? formatSar(active.value) : formatSar(total)}</strong>
          <span>{active && total > 0 ? `${formatNumber((active.value / total) * 100, 1)}٪` : "100٪"}</span>
        </div>
      </div>
      <div className={styles.legend}>
        {positive.map((item) => {
          const share = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <button
              type="button"
              key={item.key}
              onMouseEnter={() => setActiveKey(item.key)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(item.key)}
              onBlur={() => setActiveKey(null)}
            >
              <i style={{ background: item.color }} />
              <span><b>{item.name}</b><small>{formatNumber(share, 1)}٪</small></span>
              <strong>{formatSar(item.value)}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AssetsClient() {
  const [accounts, setAccounts] = useState<WealthAccount[]>([]);
  const [holdings, setHoldings] = useState<WealthHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [performanceFilter, setPerformanceFilter] = useState("all");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: userData, error: userError } = await browserSupabase.auth.getUser();
        if (userError || !userData.user) {
          window.location.replace("/wealth/login?next=%2Fwealth%2Fassets");
          return;
        }
        const userId = userData.user.id;
        const [accountsResult, holdingsResult] = await Promise.all([
          browserSupabase
            .from("wealth_accounts")
            .select("id,provider,account_name,connection_mode")
            .eq("user_id", userId)
            .order("created_at", { ascending: true }),
          browserSupabase
            .from("wealth_holdings")
            .select("id,account_id,asset_name,symbol,asset_type,quantity,unit_price,market_value,cost_basis,currency")
            .eq("user_id", userId)
            .order("market_value", { ascending: false }),
        ]);
        if (accountsResult.error) throw accountsResult.error;
        if (holdingsResult.error) throw holdingsResult.error;
        if (!active) return;
        setAccounts((accountsResult.data ?? []) as WealthAccount[]);
        setHoldings((holdingsResult.data ?? []) as WealthHolding[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "تعذر تحميل الأصول.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const metrics = useMemo(() => {
    const totalMarket = holdings.reduce((sum, holding) => sum + numeric(holding.market_value), 0);
    const knownCostHoldings = holdings.filter((holding) => holding.cost_basis !== null);
    const knownMarket = knownCostHoldings.reduce((sum, holding) => sum + numeric(holding.market_value), 0);
    const knownCost = knownCostHoldings.reduce((sum, holding) => sum + numeric(holding.cost_basis), 0);
    const pnl = knownMarket - knownCost;
    const pnlPercent = knownCost > 0 ? (pnl / knownCost) * 100 : 0;
    const winners = knownCostHoldings.filter((holding) => numeric(holding.market_value) - numeric(holding.cost_basis) > 0).length;
    const losers = knownCostHoldings.filter((holding) => numeric(holding.market_value) - numeric(holding.cost_basis) < 0).length;

    const allocationMap = new Map<string, number>();
    for (const holding of holdings) {
      const key = holding.asset_type || "other";
      allocationMap.set(key, (allocationMap.get(key) ?? 0) + numeric(holding.market_value));
    }
    const allocation = Array.from(allocationMap.entries())
      .map(([key, value]) => ({
        key,
        name: TYPE_LABELS[key] ?? "أخرى",
        value,
        color: TYPE_COLORS[key] ?? TYPE_COLORS.other,
      }))
      .sort((a, b) => b.value - a.value);

    return { totalMarket, knownMarket, knownCost, pnl, pnlPercent, winners, losers, allocation };
  }, [holdings]);

  const types = useMemo(() => Array.from(new Set(holdings.map((holding) => holding.asset_type || "other"))), [holdings]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return holdings.filter((holding) => {
      const pnl = holding.cost_basis === null ? null : numeric(holding.market_value) - numeric(holding.cost_basis);
      const matchesSearch = !query || holding.asset_name.toLowerCase().includes(query) || (holding.symbol || "").toLowerCase().includes(query);
      const matchesType = typeFilter === "all" || (holding.asset_type || "other") === typeFilter;
      const matchesAccount = accountFilter === "all" || holding.account_id === accountFilter;
      const matchesPerformance = performanceFilter === "all"
        || (performanceFilter === "profit" && pnl !== null && pnl > 0)
        || (performanceFilter === "loss" && pnl !== null && pnl < 0)
        || (performanceFilter === "no_cost" && pnl === null);
      return matchesSearch && matchesType && matchesAccount && matchesPerformance;
    });
  }, [holdings, search, typeFilter, accountFilter, performanceFilter]);

  if (loading) return <main className={styles.page}><div className={styles.state}>جاري تحميل الأصول…</div></main>;
  if (error) return <main className={styles.page}><div className={styles.state}><strong>تعذر تحميل الأصول.</strong><span>{error}</span></div></main>;

  return (
    <main className={styles.page} dir="rtl">
      <aside className={styles.sidebar}>
        <div><div className={styles.brand}>ثروة</div><div className={styles.brandSub}>إدارة الثروة</div></div>
        <nav className={styles.nav}>
          <Link href="/wealth" className={styles.navItem}>نظرة عامة</Link>
          <Link href="/wealth/assets" className={`${styles.navItem} ${styles.active}`}>الأصول</Link>
          <span className={styles.navItem}>الدخل</span>
          <span className={styles.navItem}>التحليلات</span>
          <span className={styles.navItem}>الالتزام الشرعي</span>
          <span className={styles.navItem}>الحسابات</span>
        </nav>
        <div className={styles.profile}><span className={styles.avatar}>ث</span><span><strong>حساب المستثمر</strong><small>{holdings.length} أصل محفوظ</small></span></div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>جميع استثماراتك في مكان واحد</p><h1>الأصول</h1></div>
          <div className={styles.actions}><Link href="/wealth/connect/awaed" className={styles.ghost}>تحديث عوائد</Link><Link href="/wealth/connect" className={styles.primary}>إضافة أصل</Link></div>
        </header>

        <div className={styles.content}>
          <section className={styles.metricGrid}>
            <article><small>القيمة الحالية</small><strong>{formatSar(metrics.totalMarket)}</strong><span>{holdings.length} أصل</span></article>
            <article><small>الربح / الخسارة المعروفة</small><strong className={metrics.pnl > 0 ? styles.profit : metrics.pnl < 0 ? styles.loss : ""}>{formatSar(metrics.pnl)}</strong><span className={metrics.pnl > 0 ? styles.profit : metrics.pnl < 0 ? styles.loss : ""}>{formatPercent(metrics.pnlPercent)}</span></article>
            <article><small>المراكز الرابحة</small><strong className={styles.profit}>{formatNumber(metrics.winners, 0)}</strong><span>من الأصول ذات تكلفة مسجلة</span></article>
            <article><small>المراكز الخاسرة</small><strong className={styles.loss}>{formatNumber(metrics.losers, 0)}</strong><span>تحتاج متابعة</span></article>
          </section>

          <section className={styles.visualGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHead}><div><h2>توزيع الأصول</h2><p>تفاعلي حسب القيمة الحالية</p></div></div>
              <AllocationDonut items={metrics.allocation} total={metrics.totalMarket} />
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHead}><div><h2>مقارنة التكلفة بالقيمة</h2><p>لا نعرض تاريخًا سعريًا غير موجود؛ هذه مقارنة فعلية من بياناتك</p></div></div>
              <div className={styles.compareList}>
                {holdings.map((holding) => {
                  const market = numeric(holding.market_value);
                  const cost = holding.cost_basis === null ? null : numeric(holding.cost_basis);
                  const pnl = cost === null ? null : market - cost;
                  const max = Math.max(market, cost ?? 0, 1);
                  return (
                    <Link href={`/wealth/assets/${holding.id}`} className={styles.compareRow} key={holding.id}>
                      <div className={styles.compareMeta}><strong>{holding.asset_name}</strong><span>{holding.symbol || TYPE_LABELS[holding.asset_type || "other"] || "أصل"}</span></div>
                      <div className={styles.miniChart}>
                        <div><span>التكلفة</span><i style={{ width: `${cost === null ? 0 : Math.max((cost / max) * 100, 3)}%` }} /></div>
                        <div><span>الآن</span><i className={pnl !== null && pnl < 0 ? styles.lossBar : styles.profitBar} style={{ width: `${Math.max((market / max) * 100, 3)}%` }} /></div>
                      </div>
                      <b className={pnl === null ? styles.neutral : pnl >= 0 ? styles.profit : styles.loss}>{pnl === null ? "—" : formatSar(pnl)}</b>
                    </Link>
                  );
                })}
              </div>
            </article>
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.tableHeader}>
              <div><h2>كل الأصول</h2><p>{filtered.length} نتيجة من {holdings.length}</p></div>
              <div className={styles.filters}>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الرمز..." />
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">كل الأنواع</option>{types.map((type) => <option key={type} value={type}>{TYPE_LABELS[type] ?? "أخرى"}</option>)}</select>
                <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">كل الحسابات</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.provider || account.account_name || "حساب"}</option>)}</select>
                <select value={performanceFilter} onChange={(event) => setPerformanceFilter(event.target.value)}><option value="all">كل الأداء</option><option value="profit">رابح</option><option value="loss">خاسر</option><option value="no_cost">بدون تكلفة</option></select>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <div className={`${styles.row} ${styles.headRow}`}><span>الأصل</span><span>الحساب</span><span>الكمية</span><span>سعر الوحدة</span><span>التكلفة</span><span>القيمة الحالية</span><span>الربح / الخسارة</span><span>الوزن</span></div>
              {filtered.map((holding) => {
                const market = numeric(holding.market_value);
                const cost = holding.cost_basis === null ? null : numeric(holding.cost_basis);
                const pnl = cost === null ? null : market - cost;
                const pnlPct = pnl !== null && cost !== null && cost > 0 ? (pnl / cost) * 100 : null;
                const account = accountMap.get(holding.account_id);
                const weight = metrics.totalMarket > 0 ? (market / metrics.totalMarket) * 100 : 0;
                return (
                  <Link href={`/wealth/assets/${holding.id}`} className={styles.row} key={holding.id}>
                    <span className={styles.assetCell}><i style={{ background: TYPE_COLORS[holding.asset_type || "other"] ?? TYPE_COLORS.other }} /><b>{holding.asset_name}</b><small>{holding.symbol || TYPE_LABELS[holding.asset_type || "other"] || "أصل"}</small></span>
                    <span>{account?.provider || account?.account_name || "—"}</span>
                    <span>{formatNumber(numeric(holding.quantity))}</span>
                    <span>{formatSar(numeric(holding.unit_price))}</span>
                    <span>{cost === null ? "—" : formatSar(cost)}</span>
                    <span><b>{formatSar(market)}</b></span>
                    <span className={pnl === null ? styles.neutral : pnl >= 0 ? styles.profit : styles.loss}><b>{pnl === null ? "—" : formatSar(pnl)}</b><small>{pnlPct === null ? "" : formatPercent(pnlPct)}</small></span>
                    <span>{formatNumber(weight, 1)}٪</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
