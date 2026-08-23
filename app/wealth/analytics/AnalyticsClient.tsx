"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./analytics.module.css";

type PortfolioKind = "real" | "paper";
type Holding = {
  id: string;
  account_id: string;
  asset_name: string;
  symbol: string | null;
  asset_type: string | null;
  market_value: number | string | null;
};
type Account = { id: string; provider: string | null; account_name: string | null };
type SeriesPoint = { date: string; value: number };
type Benchmark = { key: string; name: string; ticker: string; points: SeriesPoint[] };
type AssetReturn = { id: string; name: string; symbol: string; assetType: string | null; returnPercent: number };
type AnalyticsPayload = {
  range: string;
  methodology: string;
  commonStart: string | null;
  source: string;
  isDelayed: boolean;
  fixedValue: number;
  pricedAssets: number;
  portfolio: SeriesPoint[];
  benchmarks: Benchmark[];
  assetReturns: AssetReturn[];
  metrics: { returnPercent: number; maxDrawdownPercent: number; annualizedVolatilityPercent: number };
};

type Slice = { key: string; label: string; value: number; color: string };

const RANGE_LABELS: Record<string, string> = { "1m": "شهر", "3m": "3 أشهر", "1y": "سنة", "5y": "5 سنوات" };
const COLORS = { portfolio: "#14b8a6", tasi: "#8b5cf6", sp500: "#3b82f6", bitcoin: "#f59e0b" };
const GEO_COLORS = ["#14b8a6", "#3b82f6", "#f59e0b"];
const SECTOR_COLORS = ["#38bdf8", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6"];

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function fmt(value: number, digits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", { maximumFractionDigits: digits }).format(value);
}
function sar(value: number) { return `${fmt(value)} ر.س`; }
function pct(value: number) { return `${value > 0 ? "+" : ""}${fmt(value, 1)}٪`; }
function sectorOf(holding: Holding) {
  const symbol = (holding.symbol || "").toUpperCase();
  if (["2222"].includes(symbol)) return "الطاقة";
  if (["1120"].includes(symbol)) return "القطاع المالي";
  if (["2082"].includes(symbol)) return "المرافق";
  if (["4342", "4344"].includes(symbol)) return "العقار والريت";
  if (["AAPL", "NVDA"].includes(symbol)) return "التقنية";
  if (["SPY"].includes(symbol)) return "متنوع عالمي";
  if (["BTC", "ETH"].includes(symbol)) return "الأصول الرقمية";
  if (holding.asset_type === "fund") return "صندوق متنوع";
  if (holding.asset_type === "murabaha" || holding.asset_type === "cash") return "نقد وأدوات قصيرة";
  if (holding.asset_type === "real_estate") return "عقار";
  return "أخرى";
}
function geographyOf(holding: Holding) {
  if (holding.asset_type === "global_stock") return "عالمي";
  if (holding.asset_type === "crypto") return "كريبتو";
  return "السعودية / محلي";
}

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const positive = slices.filter((slice) => slice.value > 0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = positive.find((slice) => slice.key === activeKey) || positive[0];
  let cursor = 0;
  if (!positive.length) return <div className={styles.empty}>لا توجد بيانات.</div>;
  return <div className={styles.donutWrap}>
    <div className={styles.donutBox}>
      <svg viewBox="0 0 120 120" className={styles.donut}>
        <circle cx="60" cy="60" r="46" pathLength="100" className={styles.track} />
        {positive.map((slice) => {
          const share = total > 0 ? slice.value / total * 100 : 0;
          const offset = cursor;
          cursor += share;
          return <circle key={slice.key} cx="60" cy="60" r="46" pathLength="100" className={styles.segment} stroke={slice.color} strokeDasharray={`${Math.max(share - .7, .4)} ${100 - Math.max(share - .7, .4)}`} strokeDashoffset={-offset} onMouseEnter={() => setActiveKey(slice.key)} onMouseLeave={() => setActiveKey(null)} />;
        })}
      </svg>
      <div className={styles.donutCenter}><small>{active?.label}</small><strong>{active ? fmt(active.value / total * 100, 1) : 0}٪</strong><span>{active ? sar(active.value) : ""}</span></div>
    </div>
    <div className={styles.legend}>{positive.map((slice) => <button type="button" key={slice.key} onMouseEnter={() => setActiveKey(slice.key)} onMouseLeave={() => setActiveKey(null)}><i style={{ background: slice.color }} /><span><b>{slice.label}</b><small>{fmt(slice.value / total * 100, 1)}٪</small></span><strong>{sar(slice.value)}</strong></button>)}</div>
  </div>;
}

function PerformanceChart({ portfolio, benchmarks }: { portfolio: SeriesPoint[]; benchmarks: Benchmark[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = [portfolio, ...benchmarks.map((b) => b.points)].filter((series) => series.length);
  if (!portfolio.length || !all.length) return <div className={styles.empty}>لا توجد بيانات تاريخية كافية لهذه الفترة.</div>;
  const width = 920, height = 320, padX = 30, padY = 24;
  const values = all.flatMap((series) => series.map((point) => point.value));
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = Math.max(max - min, 1);
  const x = (index: number, length: number) => padX + (index / Math.max(length - 1, 1)) * (width - padX * 2);
  const y = (value: number) => padY + ((max - value) / span) * (height - padY * 2);
  const path = (series: SeriesPoint[]) => series.map((point, index) => `${index === 0 ? "M" : "L"}${x(index, series.length).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  const hoverIndex = hover === null ? portfolio.length - 1 : Math.min(Math.max(hover, 0), portfolio.length - 1);
  const selectedDate = portfolio[hoverIndex]?.date;
  const selectedPortfolio = portfolio[hoverIndex]?.value;
  const selectedBenchmark = (benchmark: Benchmark) => {
    if (!selectedDate || !benchmark.points.length) return null;
    let best = benchmark.points[0];
    for (const point of benchmark.points) { if (point.date <= selectedDate) best = point; else break; }
    return best.value;
  };
  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setHover(Math.round(ratio * (portfolio.length - 1)));
  };
  return <div>
    <div className={styles.chartReadout}><span>{selectedDate ? new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`)) : "—"}</span><b style={{ color: COLORS.portfolio }}>المحفظة {selectedPortfolio !== undefined ? pct(selectedPortfolio) : "—"}</b>{benchmarks.map((benchmark) => { const value = selectedBenchmark(benchmark); return <b key={benchmark.key} style={{ color: COLORS[benchmark.key as keyof typeof COLORS] || "#aaa" }}>{benchmark.name} {value !== null ? pct(value) : "—"}</b>; })}</div>
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.performanceChart} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {[0, .25, .5, .75, 1].map((fraction) => <line key={fraction} x1={padX} x2={width - padX} y1={padY + fraction * (height - padY * 2)} y2={padY + fraction * (height - padY * 2)} className={styles.gridLine} />)}
      <line x1={padX} x2={width - padX} y1={y(0)} y2={y(0)} className={styles.gridLine} style={{ opacity: .8, strokeWidth: 1.5 }} />
      <path d={path(portfolio)} className={styles.portfolioLine} />
      {benchmarks.map((benchmark) => benchmark.points.length > 1 && <path key={benchmark.key} d={path(benchmark.points)} className={styles.benchmarkLine} style={{ stroke: COLORS[benchmark.key as keyof typeof COLORS] || "#999" }} />)}
      {hover !== null && <line x1={x(hoverIndex, portfolio.length)} x2={x(hoverIndex, portfolio.length)} y1={padY} y2={height - padY} className={styles.cursorLine} />}
    </svg>
    <div className={styles.chartLegend}><span><i style={{ background: COLORS.portfolio }} />المحفظة</span>{benchmarks.map((benchmark) => <span key={benchmark.key}><i style={{ background: COLORS[benchmark.key as keyof typeof COLORS] || "#999" }} />{benchmark.name}</span>)}</div>
  </div>;
}

export default function AnalyticsClient() {
  const [kind, setKind] = useState<PortfolioKind>("real");
  const [range, setRange] = useState("1y");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const mode: PortfolioKind = new URLSearchParams(window.location.search).get("portfolio") === "paper" ? "paper" : "real";
        setKind(mode);
        const { data: userData, error: userError } = await browserSupabase.auth.getUser();
        if (userError || !userData.user) { window.location.replace(`/wealth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
        if (mode === "paper") { const { error: seedError } = await browserSupabase.rpc("ensure_wealth_paper_portfolio"); if (seedError) throw seedError; }
        const uid = userData.user.id;
        const [h, a] = await Promise.all([
          browserSupabase.from("wealth_holdings").select("id,account_id,asset_name,symbol,asset_type,market_value").eq("user_id", uid).eq("portfolio_kind", mode),
          browserSupabase.from("wealth_accounts").select("id,provider,account_name").eq("user_id", uid).eq("portfolio_kind", mode),
        ]);
        if (h.error) throw h.error; if (a.error) throw a.error;
        if (!active) return;
        setHoldings((h.data || []) as Holding[]);
        setAccounts((a.data || []) as Account[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "تعذر تحميل التحليلات.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!holdings.length) return;
    let active = true;
    async function run() {
      setAnalyticsLoading(true);
      try {
        const response = await fetch("/api/wealth/analytics/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ range, assets: holdings.map((holding) => ({ id: holding.id, name: holding.asset_name, symbol: holding.symbol, assetType: holding.asset_type, currentValue: numeric(holding.market_value) })) }),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("تعذر بناء الأداء التاريخي للمحفظة.");
        const payload = await response.json() as AnalyticsPayload;
        if (active) setAnalytics(payload);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "تعذر بناء الأداء التاريخي."); }
      finally { if (active) setAnalyticsLoading(false); }
    }
    void run();
    return () => { active = false; };
  }, [holdings, range]);

  const metrics = useMemo(() => {
    const total = holdings.reduce((sum, holding) => sum + numeric(holding.market_value), 0);
    const sorted = [...holdings].sort((a, b) => numeric(b.market_value) - numeric(a.market_value));
    const top1 = total > 0 ? numeric(sorted[0]?.market_value) / total * 100 : 0;
    const top3 = total > 0 ? sorted.slice(0, 3).reduce((sum, holding) => sum + numeric(holding.market_value), 0) / total * 100 : 0;
    const geographyMap = new Map<string, number>();
    const sectorMap = new Map<string, number>();
    holdings.forEach((holding) => {
      const value = numeric(holding.market_value);
      const geo = geographyOf(holding); geographyMap.set(geo, (geographyMap.get(geo) || 0) + value);
      const sector = sectorOf(holding); sectorMap.set(sector, (sectorMap.get(sector) || 0) + value);
    });
    const geography: Slice[] = [...geographyMap].map(([key, value], index) => ({ key, label: key, value, color: GEO_COLORS[index % GEO_COLORS.length] })).sort((a, b) => b.value - a.value);
    const sectors: Slice[] = [...sectorMap].map(([key, value], index) => ({ key, label: key, value, color: SECTOR_COLORS[index % SECTOR_COLORS.length] })).sort((a, b) => b.value - a.value);
    const usdLinked = holdings.filter((holding) => ["global_stock", "crypto"].includes(holding.asset_type || "")).reduce((sum, holding) => sum + numeric(holding.market_value), 0);
    return { total, top1, top3, geography, sectors, usdLinked, sarExposure: total - usdLinked, sorted };
  }, [holdings]);

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const paper = kind === "paper";
  const suffix = paper ? "?portfolio=paper" : "";
  const best = analytics?.assetReturns?.[0] || null;
  const worst = analytics?.assetReturns?.at(-1) || null;

  if (loading) return <main className={styles.page}><div className={styles.state}>جاري بناء التحليلات…</div></main>;
  if (error && !analytics) return <main className={styles.page}><div className={styles.state}><strong>تعذر تحميل التحليلات.</strong><span>{error}</span></div></main>;

  return <main className={styles.page} dir="rtl">
    <aside className={styles.sidebar}>
      <div><div className={styles.brand}>ثروة</div><div className={styles.brandSub}>{paper ? "محفظة تجريبية" : "إدارة الثروة"}</div></div>
      <nav className={styles.nav}><Link href={`/wealth${suffix}`} className={styles.navItem}>نظرة عامة</Link><Link href={`/wealth/assets${suffix}`} className={styles.navItem}>الأصول</Link><Link href={`/wealth/income${suffix}`} className={styles.navItem}>الدخل</Link><Link href={`/wealth/analytics${suffix}`} className={`${styles.navItem} ${styles.active}`}>التحليلات</Link><Link href={`/wealth/shariah${suffix}`} className={styles.navItem}>الالتزام الشرعي</Link><span className={styles.navItem}>الحسابات</span></nav>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}><div><p>{paper ? "بيئة الاختبار" : "المحفظة الحقيقية"}</p><h1>التحليلات</h1></div><div className={styles.actions}><Link href={paper ? "/wealth/analytics" : "/wealth/analytics?portfolio=paper"} className={styles.ghost}>{paper ? "محفظتي الحقيقية" : "محفظة تجريبية"}</Link><Link href={paper ? "/wealth/assets?portfolio=paper&manage=1" : "/wealth/assets?manage=1"} className={styles.primary}>إدارة الأصول</Link></div></header>
      <div className={styles.content}>
        {paper && <div className={styles.note}>الأداء التاريخي هنا هو <b>إعادة تشغيل للمراكز الحالية</b> باستخدام أسعار تاريخية فعلية. لا ندّعي أنه سجل تداول فعلي للمحفظة.</div>}
        <section className={styles.metricGrid}>
          <article><small>أداء الفترة</small><strong className={(analytics?.metrics.returnPercent || 0) >= 0 ? styles.profit : styles.loss}>{analytics ? pct(analytics.metrics.returnPercent) : "—"}</strong><span>{RANGE_LABELS[range]}</span></article>
          <article><small>أقصى هبوط</small><strong className={styles.loss}>{analytics ? pct(analytics.metrics.maxDrawdownPercent) : "—"}</strong><span>Max drawdown</span></article>
          <article><small>التقلب السنوي</small><strong>{analytics ? `${fmt(analytics.metrics.annualizedVolatilityPercent, 1)}٪` : "—"}</strong><span>تقريبي من السلسلة اليومية</span></article>
          <article><small>أكبر أصل</small><strong>{fmt(metrics.top1, 1)}٪</strong><span>{metrics.sorted[0]?.asset_name || "—"}</span></article>
          <article><small>أكبر 3 أصول</small><strong>{fmt(metrics.top3, 1)}٪</strong><span>مؤشر التركّز</span></article>
        </section>

        <section className={styles.performancePanel}>
          <div className={styles.panelHead}><div><small>الأداء المقارن</small><h2>المحفظة مقابل السوق</h2></div><div className={styles.ranges}>{Object.keys(RANGE_LABELS).map((key) => <button type="button" key={key} onClick={() => setRange(key)} className={range === key ? styles.rangeActive : ""}>{RANGE_LABELS[key]}</button>)}</div></div>
          {analyticsLoading ? <div className={styles.chartLoading}>جاري جلب الأسعار التاريخية…</div> : analytics ? <PerformanceChart portfolio={analytics.portfolio} benchmarks={analytics.benchmarks} /> : <div className={styles.empty}>لا توجد بيانات.</div>}
          <div className={styles.methodNote}>كل السلاسل تبدأ من 0٪، ثم تعرض نسبة التغير منذ بداية الفترة. المصدر الحالي تاريخ سوقي متأخر لأغراض التطوير.</div>
        </section>

        <section className={styles.visualGrid}>
          <article className={styles.panel}><div className={styles.panelHead}><div><small>الجغرافيا</small><h2>السعودية مقابل العالمي والكريبتو</h2></div></div><Donut slices={metrics.geography} total={metrics.total} /></article>
          <article className={styles.panel}><div className={styles.panelHead}><div><small>القطاعات</small><h2>التوزيع القطاعي</h2></div></div><Donut slices={metrics.sectors} total={metrics.total} /></article>
        </section>

        <section className={styles.twoCol}>
          <article className={styles.panel}><div className={styles.panelHead}><div><small>العملات</small><h2>التعرض للعملات</h2></div></div><div className={styles.exposureRows}><div><span>ريال سعودي / محلي</span><b>{sar(metrics.sarExposure)}</b><strong>{fmt(metrics.total ? metrics.sarExposure / metrics.total * 100 : 0, 1)}٪</strong></div><div><span>دولار أو مرتبط بالدولار</span><b>{sar(metrics.usdLinked)}</b><strong>{fmt(metrics.total ? metrics.usdLinked / metrics.total * 100 : 0, 1)}٪</strong></div></div></article>
          <article className={styles.panel}><div className={styles.panelHead}><div><small>الفترة المحددة</small><h2>أفضل وأسوأ أصل</h2></div></div><div className={styles.bestWorst}><div><small>الأفضل</small><b>{best?.name || "—"}</b><strong className={styles.profit}>{best ? pct(best.returnPercent) : "—"}</strong></div><div><small>الأسوأ</small><b>{worst?.name || "—"}</b><strong className={(worst?.returnPercent || 0) >= 0 ? styles.profit : styles.loss}>{worst ? pct(worst.returnPercent) : "—"}</strong></div></div></article>
        </section>

        <section className={styles.panel}><div className={styles.panelHead}><div><small>التركيز</small><h2>أكبر المراكز</h2></div><span>{holdings.length} أصل</span></div><div className={styles.holdingRows}>{metrics.sorted.slice(0, 8).map((holding, index) => <div key={holding.id}><span>{index + 1}</span><b>{holding.asset_name}<small>{accountMap.get(holding.account_id)?.provider || ""}</small></b><strong>{sar(numeric(holding.market_value))}</strong><em>{fmt(metrics.total ? numeric(holding.market_value) / metrics.total * 100 : 0, 1)}٪</em></div>)}</div></section>

        <div className={styles.sourceNote}>الأصول غير المسعّرة يوميًا مثل العقار والنقد والصناديق اليدوية تُعامل كقيمة ثابتة داخل إعادة التشغيل التاريخية. هذا يمنع اختلاق حركة سعرية غير موجودة.</div>
      </div>
    </section>
  </main>;
}
