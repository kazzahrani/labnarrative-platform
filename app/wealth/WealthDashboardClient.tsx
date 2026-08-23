"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./wealth.module.css";
import visuals from "./wealth-visuals.module.css";

type WealthAccount = {
  id: string;
  provider: string | null;
  account_name: string | null;
  account_type: string | null;
  connection_mode: string | null;
  status: string | null;
  currency: string | null;
  created_at: string;
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

type WealthSnapshot = {
  snapshot_date: string;
  net_worth: number | string | null;
  currency: string | null;
};

type DonutItem = {
  key: string;
  name: string;
  value: number;
  color: string;
};

const typeLabels: Record<string, string> = {
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

const typeColors: Record<string, string> = {
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

const accountColors = ["#38bdf8", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#6366f1", "#14b8a6"];
const PROFIT = "#22c55e";
const LOSS = "#ef4444";

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, maxFractionDigits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

function formatSar(value: number) {
  return `${formatNumber(value)} ر.س`;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}٪`;
}

function pnlTone(value: number | null) {
  if (value === null || value === 0) return visuals.neutral;
  return value > 0 ? visuals.profit : visuals.loss;
}

function DonutChart({
  items,
  centerLabel,
  centerValue,
}: {
  items: DonutItem[];
  centerLabel: string;
  centerValue: string;
}) {
  const positiveItems = items.filter((item) => item.value > 0);
  const total = positiveItems.reduce((sum, item) => sum + item.value, 0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeItem = positiveItems.find((item) => item.key === activeKey) ?? positiveItems[0];

  if (!positiveItems.length || total <= 0) {
    return <div className={visuals.emptyChart}>لا توجد بيانات كافية للرسم بعد.</div>;
  }

  let cursor = 0;
  const segments = positiveItems.map((item) => {
    const share = (item.value / total) * 100;
    const segment = { ...item, share, offset: cursor };
    cursor += share;
    return segment;
  });

  const activeShare = activeItem ? (activeItem.value / total) * 100 : 0;

  return (
    <div className={visuals.donutLayout}>
      <div className={visuals.donutWrap}>
        <svg className={visuals.donut} viewBox="0 0 120 120" role="img" aria-label={centerLabel}>
          <circle className={visuals.donutTrack} cx="60" cy="60" r="46" pathLength="100" />
          {segments.map((segment) => (
            <circle
              key={segment.key}
              className={`${visuals.donutSegment} ${activeKey && activeKey !== segment.key ? visuals.donutDim : ""}`}
              cx="60"
              cy="60"
              r="46"
              pathLength="100"
              stroke={segment.color}
              strokeDasharray={`${Math.max(segment.share - 0.8, 0.5)} ${100 - Math.max(segment.share - 0.8, 0.5)}`}
              strokeDashoffset={-segment.offset}
              onMouseEnter={() => setActiveKey(segment.key)}
              onMouseLeave={() => setActiveKey(null)}
            />
          ))}
        </svg>
        <div className={visuals.donutCenter}>
          <small>{activeItem ? activeItem.name : centerLabel}</small>
          <strong>{activeItem ? formatSar(activeItem.value) : centerValue}</strong>
          <span>{activeItem ? `${formatNumber(activeShare, 1)}٪` : centerLabel}</span>
        </div>
      </div>

      <div className={visuals.legend}>
        {segments.map((segment) => (
          <button
            type="button"
            key={segment.key}
            className={`${visuals.legendItem} ${activeKey === segment.key ? visuals.legendActive : ""}`}
            onMouseEnter={() => setActiveKey(segment.key)}
            onMouseLeave={() => setActiveKey(null)}
            onFocus={() => setActiveKey(segment.key)}
            onBlur={() => setActiveKey(null)}
          >
            <i style={{ background: segment.color }} />
            <span><strong>{segment.name}</strong><small>{formatNumber(segment.share, 1)}٪</small></span>
            <b>{formatSar(segment.value)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function WealthDashboardClient() {
  const [accounts, setAccounts] = useState<WealthAccount[]>([]);
  const [holdings, setHoldings] = useState<WealthHolding[]>([]);
  const [snapshots, setSnapshots] = useState<WealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data: userData, error: userError } = await browserSupabase.auth.getUser();
        if (userError || !userData.user) {
          window.location.replace("/wealth/login?next=%2Fwealth");
          return;
        }

        const userId = userData.user.id;
        const [accountResult, holdingResult, snapshotResult] = await Promise.all([
          browserSupabase
            .from("wealth_accounts")
            .select("id,provider,account_name,account_type,connection_mode,status,currency,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: true }),
          browserSupabase
            .from("wealth_holdings")
            .select("id,account_id,asset_name,symbol,asset_type,quantity,unit_price,market_value,cost_basis,currency")
            .eq("user_id", userId)
            .order("created_at", { ascending: true }),
          browserSupabase
            .from("wealth_snapshots")
            .select("snapshot_date,net_worth,currency")
            .eq("user_id", userId)
            .order("snapshot_date", { ascending: true }),
        ]);

        if (accountResult.error) throw accountResult.error;
        if (holdingResult.error) throw holdingResult.error;
        if (snapshotResult.error) throw snapshotResult.error;

        if (!active) return;
        setAccounts((accountResult.data ?? []) as WealthAccount[]);
        setHoldings((holdingResult.data ?? []) as WealthHolding[]);
        setSnapshots((snapshotResult.data ?? []) as WealthSnapshot[]);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "تعذر تحميل بيانات الثروة.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const totalMarket = holdings.reduce((sum, holding) => sum + numeric(holding.market_value), 0);
    const totalCost = holdings.reduce((sum, holding) => sum + numeric(holding.cost_basis), 0);
    const completeCost = holdings.length > 0 && holdings.every((holding) => holding.cost_basis !== null);
    const pnl = completeCost ? totalMarket - totalCost : null;
    const pnlPercent = pnl !== null && totalCost > 0 ? (pnl / totalCost) * 100 : null;
    const liquidity = holdings
      .filter((holding) => holding.asset_type === "cash")
      .reduce((sum, holding) => sum + numeric(holding.market_value), 0);

    const allocationMap = new Map<string, number>();
    for (const holding of holdings) {
      const key = holding.asset_type || "other";
      allocationMap.set(key, (allocationMap.get(key) ?? 0) + numeric(holding.market_value));
    }

    const allocation = Array.from(allocationMap.entries())
      .map(([type, value]) => ({
        type,
        name: typeLabels[type] ?? "أخرى",
        value,
        share: totalMarket > 0 ? (value / totalMarket) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const accountTotals = new Map<string, number>();
    for (const holding of holdings) {
      accountTotals.set(holding.account_id, (accountTotals.get(holding.account_id) ?? 0) + numeric(holding.market_value));
    }

    const holdingPerformance = holdings.map((holding) => {
      const market = numeric(holding.market_value);
      const cost = holding.cost_basis === null ? null : numeric(holding.cost_basis);
      const holdingPnl = cost === null ? null : market - cost;
      const holdingPnlPercent = holdingPnl !== null && cost !== null && cost > 0 ? (holdingPnl / cost) * 100 : null;
      return { holding, market, cost, pnl: holdingPnl, pnlPercent: holdingPnlPercent };
    });

    const profitableValue = holdingPerformance
      .filter((item) => item.pnl !== null && item.pnl >= 0)
      .reduce((sum, item) => sum + item.market, 0);
    const losingValue = holdingPerformance
      .filter((item) => item.pnl !== null && item.pnl < 0)
      .reduce((sum, item) => sum + item.market, 0);

    return {
      totalMarket,
      totalCost,
      pnl,
      pnlPercent,
      liquidity,
      allocation,
      accountTotals,
      holdingPerformance,
      profitableValue,
      losingValue,
    };
  }, [holdings]);

  const allocationItems: DonutItem[] = metrics.allocation.map((item) => ({
    key: item.type,
    name: item.name,
    value: item.value,
    color: typeColors[item.type] ?? typeColors.other,
  }));

  const accountItems: DonutItem[] = accounts.map((account, index) => ({
    key: account.id,
    name: account.provider || account.account_name || "حساب",
    value: metrics.accountTotals.get(account.id) ?? 0,
    color: accountColors[index % accountColors.length],
  }));

  const performanceItems: DonutItem[] = [
    { key: "profit", name: "مراكز رابحة", value: metrics.profitableValue, color: PROFIT },
    { key: "loss", name: "مراكز خاسرة", value: metrics.losingValue, color: LOSS },
  ];

  const today = new Intl.DateTimeFormat("ar-SA-u-nu-arab", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const latestSnapshot = snapshots.at(-1);
  const largestAllocation = metrics.allocation[0];

  if (loading) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.loadingState}>جاري تحميل ثروتك…</section>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.loadingState}>
          <strong>تعذر تحميل البيانات.</strong>
          <span>{error}</span>
          <a href="/wealth/login?next=%2Fwealth">العودة إلى تسجيل الدخول</a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} dir="rtl">
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>ثروة</div>
          <div className={styles.brandSub}>إدارة الثروة</div>
        </div>
        <nav className={styles.nav}>
          <div className={`${styles.navItem} ${styles.active}`}>نظرة عامة</div>
          <div className={styles.navItem}>الأصول</div>
          <div className={styles.navItem}>الدخل</div>
          <div className={styles.navItem}>التحليلات</div>
          <div className={styles.navItem}>الالتزام الشرعي</div>
          <div className={styles.navItem}>الحسابات</div>
        </nav>
        <div className={styles.profile}>
          <span className={styles.avatar}>ث</span>
          <span><strong>حساب المستثمر</strong><small>بياناتك محفوظة بأمان</small></span>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{today}</p>
            <h1>نظرة عامة</h1>
          </div>
          <div className={styles.topActions}>
            <a href="/wealth/connect/awaed" className={styles.ghostButton}>تحديث عوائد</a>
            <a href="/wealth/connect" className={styles.primaryButton}>إضافة أصل أو حساب</a>
          </div>
        </header>

        <div className={styles.content}>
          {holdings.length === 0 ? (
            <section className={styles.emptyPortfolio}>
              <small>ابدأ من هنا</small>
              <h2>لا توجد أصول محفوظة بعد.</h2>
              <p>أضف محفظة عوائد أو أي أصل آخر لتبدأ لوحة ثروتك بالحساب تلقائيًا.</p>
              <a href="/wealth/connect">إضافة أصل أو حساب</a>
            </section>
          ) : (
            <>
              <section className={styles.heroGrid}>
                <article className={styles.netWorthCard}>
                  <div className={styles.cardHeader}>
                    <span>صافي الثروة المسجّلة</span>
                    <small>{accounts.length} حساب · {holdings.length} استثمار</small>
                  </div>
                  <div className={styles.netWorth}>{formatNumber(metrics.totalMarket)} <span>ر.س</span></div>
                  <div className={`${styles.growth} ${pnlTone(metrics.pnl)}`}>
                    {metrics.pnl !== null ? (
                      <>
                        {metrics.pnl >= 0 ? "↑" : "↓"} {formatSar(Math.abs(metrics.pnl))}
                        <span className={pnlTone(metrics.pnl)}>{formatPercent(metrics.pnlPercent ?? 0)} غير محققة</span>
                      </>
                    ) : (
                      <span>أضف متوسط التكلفة لإظهار الربح والخسارة</span>
                    )}
                  </div>
                  <div className={styles.snapshotArea}>
                    <span className={styles.snapshotDot} />
                    <div>
                      <strong>نقطة البداية</strong>
                      <small>
                        {latestSnapshot
                          ? `بدأ سجل صافي الثروة في ${new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${latestSnapshot.snapshot_date}T12:00:00`))}`
                          : "سيبدأ سجل صافي الثروة مع أول حفظ للمحفظة"}
                      </small>
                    </div>
                  </div>
                  <div className={styles.ranges}><span className={styles.selectedRange}>الآن</span><span>التاريخ يتكوّن مع التحديثات القادمة</span></div>
                </article>

                <div className={styles.metricStack}>
                  <article className={styles.metric}>
                    <p>الربح / الخسارة غير المحققة</p>
                    <strong className={pnlTone(metrics.pnl)}>{metrics.pnl !== null ? formatSar(metrics.pnl) : "—"}</strong>
                    <small className={pnlTone(metrics.pnl)}>{metrics.pnlPercent !== null ? formatPercent(metrics.pnlPercent) : "أدخل التكلفة لجميع الأصول"}</small>
                  </article>
                  <article className={styles.metric}>
                    <p>عدد الاستثمارات</p>
                    <strong>{formatNumber(holdings.length, 0)}</strong>
                    <small>عبر {formatNumber(accounts.length, 0)} حساب مضاف</small>
                  </article>
                  <article className={styles.metric}>
                    <p>السيولة المسجّلة</p>
                    <strong>{formatSar(metrics.liquidity)}</strong>
                    <small>النقد الذي أضفته صراحة إلى المنصة</small>
                  </article>
                </div>
              </section>

              <section className={visuals.visualGrid}>
                <article className={visuals.chartCard}>
                  <div className={visuals.chartTitle}><div><small>توزيع الأصول</small><h2>أين توجد ثروتك؟</h2></div><span className={visuals.liveBadge}>LIVE</span></div>
                  <DonutChart items={allocationItems} centerLabel="إجمالي الأصول" centerValue={formatSar(metrics.totalMarket)} />
                </article>

                <article className={visuals.chartCard}>
                  <div className={visuals.chartTitle}><div><small>الحسابات والمحافظ</small><h2>توزيع الثروة حسب المصدر</h2></div><span className={visuals.liveBadge}>LIVE</span></div>
                  <DonutChart items={accountItems} centerLabel="كل الحسابات" centerValue={formatSar(metrics.totalMarket)} />
                </article>

                <article className={visuals.chartCard}>
                  <div className={visuals.chartTitle}><div><small>حالة المراكز</small><h2>رابح مقابل خاسر</h2></div><span className={visuals.liveBadge}>P&L</span></div>
                  <DonutChart items={performanceItems} centerLabel="المراكز" centerValue={metrics.pnl !== null ? formatSar(metrics.pnl) : "—"} />
                </article>
              </section>

              <section className={styles.gridTwo}>
                <article className={styles.panel}>
                  <div className={styles.panelTitle}><div><h2>أداء الاستثمارات</h2><p>الأرباح بالأخضر والخسائر بالأحمر</p></div></div>
                  <div className={visuals.performanceRows}>
                    {metrics.holdingPerformance.map((item) => (
                      <div className={visuals.performanceRow} key={item.holding.id}>
                        <div className={visuals.assetIdentity}>
                          <i style={{ background: typeColors[item.holding.asset_type || "other"] ?? typeColors.other }} />
                          <span><strong>{item.holding.asset_name}</strong><small>{item.holding.symbol || typeLabels[item.holding.asset_type || "other"] || "أصل"}</small></span>
                        </div>
                        <div className={visuals.marketValue}><small>القيمة</small><strong>{formatSar(item.market)}</strong></div>
                        <div className={`${visuals.pnlValue} ${pnlTone(item.pnl)}`}>
                          <small>الربح / الخسارة</small>
                          <strong>{item.pnl === null ? "—" : `${item.pnl >= 0 ? "+" : ""}${formatSar(item.pnl)}`}</strong>
                          <span>{item.pnlPercent === null ? "" : formatPercent(item.pnlPercent)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className={styles.panel}>
                  <div className={styles.panelTitle}><div><h2>مؤشرات تستحق الانتباه</h2><p>مبنية على بياناتك الحقيقية الحالية</p></div></div>
                  <div className={styles.insights}>
                    <div><span>٠١</span><section><strong>{largestAllocation ? `أكبر تركّز حاليًا: ${largestAllocation.name}` : "توزيع المحفظة"}</strong><p>{largestAllocation ? `${formatPercent(largestAllocation.share).replace("+", "")} من الثروة المسجّلة موجودة في هذه الفئة.` : "أضف أصولًا لبدء التحليل."}</p></section></div>
                    <div><span>٠٢</span><section><strong>وضع التكلفة والربحية</strong><p>{metrics.pnl !== null ? `القيمة الحالية ${formatSar(metrics.totalMarket)} مقابل تكلفة مسجّلة ${formatSar(metrics.totalCost)}.` : "بعض الأصول لا تحتوي على تكلفة شراء، لذلك لن نخمن الربحية."}</p></section></div>
                    <div><span>٠٣</span><section><strong>صورة الثروة ما زالت جزئية</strong><p>هذه الأرقام تشمل الحسابات التي أضفتها فقط. أضف البنوك، الوسطاء، العقار أو أي أصول أخرى للحصول على صافي ثروة كامل.</p></section></div>
                  </div>
                </article>
              </section>

              <section className={styles.gridTwoBottom}>
                <article className={styles.panel}>
                  <div className={styles.panelTitle}><div><h2>الحسابات والمحافظ</h2><p>مصادر البيانات المضافة إلى ثروتك</p></div><a href="/wealth/connect">إدارة</a></div>
                  <div className={styles.accountRows}>
                    {accounts.map((account) => (
                      <div className={styles.accountRow} key={account.id}>
                        <div className={styles.accountLogo}>{(account.provider || account.account_name || "ح").slice(0, 1)}</div>
                        <div className={styles.accountName}><strong>{account.provider || account.account_name || "حساب"}</strong><small>{account.account_name || "محفظة استثمارية"}</small></div>
                        <div className={styles.accountValue}>{formatSar(metrics.accountTotals.get(account.id) ?? 0)}</div>
                        <div className={styles.accountStatus}><i />{account.connection_mode === "manual" ? "مضاف يدويًا" : "متصل"}</div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className={styles.askPanel}>
                  <small>ذكاء الثروة · قريبًا</small>
                  <h2>اسأل عن ثروتك</h2>
                  <p>سنربط هذه المساحة ببياناتك الفعلية حتى تسأل عن الربحية، التركّز، الدخل والمخاطر دون الاعتماد على أرقام تجريبية.</p>
                  <div className={styles.question}>ما أكبر تركّز في محفظتي؟</div>
                  <div className={styles.question}>كم ربحي غير المحقق حاليًا؟</div>
                  <div className={styles.question}>كيف يتغير التوزيع إذا أضفت حسابًا جديدًا؟</div>
                  <div className={styles.searchBox}><span>قريبًا: اكتب سؤالك عن ثروتك...</span><b>←</b></div>
                </article>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
