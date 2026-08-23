"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./shariah.module.css";

type PortfolioKind = "real" | "paper";
type Status = "likely_compliant" | "review_required" | "likely_non_compliant" | "unknown";
type Holding = {
  id: string;
  account_id: string;
  asset_name: string;
  symbol: string | null;
  asset_type: string | null;
  market_value: number | string | null;
};
type Account = { id: string; provider: string | null; account_name: string | null };
type Assessment = {
  holding_id: string;
  status: Status;
  confidence: string;
  reason: string | null;
  purification_rate: number | string | null;
  methodology: string;
};
type ViewRow = Holding & Assessment;
type Slice = { key: Status; label: string; value: number; color: string };

const STATUS_META: Record<Status, { label: string; color: string; short: string }> = {
  likely_compliant: { label: "متوافق مبدئيًا", color: "#22c55e", short: "متوافق" },
  review_required: { label: "يحتاج مراجعة", color: "#f59e0b", short: "مراجعة" },
  likely_non_compliant: { label: "غير متوافق مبدئيًا", color: "#ef4444", short: "غير متوافق" },
  unknown: { label: "غير مصنف", color: "#94a3b8", short: "غير مصنف" },
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function fmt(value: number, digits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", { maximumFractionDigits: digits }).format(value);
}
function sar(value: number) { return `${fmt(value)} ر.س`; }

function preliminaryAssessment(holding: Holding, account: Account | undefined): Omit<Assessment, "holding_id"> {
  const symbol = (holding.symbol || "").toUpperCase();
  const name = holding.asset_name.trim();
  const provider = `${account?.provider || ""} ${account?.account_name || ""}`;

  if (symbol === "SPY") return {
    status: "likely_non_compliant", confidence: "preliminary",
    reason: "صندوق مؤشري عام غير مفلتر شرعيًا؛ قد يضم قطاعات وشركات غير متوافقة.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (symbol === "1120") return {
    status: "likely_compliant", confidence: "preliminary",
    reason: "مصرف إسلامي؛ يبقى الاعتماد النهائي على آخر تصنيف شرعي معتمد للسهم.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (name.includes("صندوق الراجحي للأسهم السعودية")) return {
    status: "likely_compliant", confidence: "preliminary",
    reason: "صندوق مصمم للاستثمار في الأسهم السعودية وفق ضوابط شرعية؛ يلزم التحقق من أحدث مستنداته وهيئته الشرعية.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (holding.asset_type === "murabaha") return {
    status: "likely_compliant", confidence: "preliminary",
    reason: "مرابحة؛ التصنيف يفترض أن العقد والجهة المنفذة يلتزمان بالضوابط الشرعية.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (holding.asset_type === "cash" && provider.includes("الراجحي")) return {
    status: "likely_compliant", confidence: "preliminary",
    reason: "سيولة لدى مصرف إسلامي؛ يفترض أن الرصيد غير مرتبط بعائد ربوي.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (["BTC", "ETH"].includes(symbol)) return {
    status: "review_required", confidence: "preliminary",
    reason: "الأصول الرقمية محل اختلاف في المعالجة الشرعية؛ ثروة لا تصدر حكمًا نهائيًا عليها آليًا.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (["AAPL", "NVDA", "2222", "2082", "4342", "4344"].includes(symbol)) return {
    status: "review_required", confidence: "preliminary",
    reason: "النشاط الأساسي لا يكفي وحده؛ يلزم فحص الإيرادات غير المباحة والنسب المالية وفق منهجية شرعية محدثة.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (holding.asset_type === "real_estate") return {
    status: "review_required", confidence: "preliminary",
    reason: "العقار قد يكون متوافقًا، لكن يلزم التحقق من التمويل وطبيعة الاستخدام والمستأجرين.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  if (name.includes("ذهب") || holding.asset_type === "gold") return {
    status: "review_required", confidence: "preliminary",
    reason: "الذهب يتطلب تحققًا من الملكية والقبض وطريقة التسوية، وليس مجرد طبيعة الأصل.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
  return {
    status: "unknown", confidence: "preliminary",
    reason: "لا توجد بيانات كافية لإصدار فحص مبدئي موثوق لهذا الأصل.", purification_rate: null, methodology: "tharwa_preliminary_v1",
  };
}

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const positive = slices.filter((slice) => slice.value > 0);
  const [activeKey, setActiveKey] = useState<Status | null>(null);
  const active = positive.find((slice) => slice.key === activeKey) || positive[0];
  let cursor = 0;
  if (!positive.length) return <div className={styles.empty}>لا توجد بيانات.</div>;
  return <div className={styles.donutLayout}>
    <div className={styles.donutBox}>
      <svg viewBox="0 0 120 120" className={styles.donut}>
        <circle cx="60" cy="60" r="46" pathLength="100" className={styles.track} />
        {positive.map((slice) => {
          const share = total > 0 ? slice.value / total * 100 : 0;
          const offset = cursor; cursor += share;
          return <circle key={slice.key} cx="60" cy="60" r="46" pathLength="100" className={styles.segment} stroke={slice.color} strokeDasharray={`${Math.max(share - .8, .5)} ${100 - Math.max(share - .8, .5)}`} strokeDashoffset={-offset} onMouseEnter={() => setActiveKey(slice.key)} onMouseLeave={() => setActiveKey(null)} />;
        })}
      </svg>
      <div className={styles.center}><small>{active?.label}</small><strong>{active && total > 0 ? `${fmt(active.value / total * 100, 1)}٪` : "—"}</strong><span>{active ? sar(active.value) : ""}</span></div>
    </div>
    <div className={styles.legend}>{positive.map((slice) => <button type="button" key={slice.key} onMouseEnter={() => setActiveKey(slice.key)} onMouseLeave={() => setActiveKey(null)}><i style={{ background: slice.color }} /><span><b>{slice.label}</b><small>{total > 0 ? `${fmt(slice.value / total * 100, 1)}٪` : "0٪"}</small></span><strong>{sar(slice.value)}</strong></button>)}</div>
  </div>;
}

export default function ShariahClient() {
  const [kind, setKind] = useState<PortfolioKind>("real");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [loading, setLoading] = useState(true);
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
        const [h, a, s] = await Promise.all([
          browserSupabase.from("wealth_holdings").select("id,account_id,asset_name,symbol,asset_type,market_value").eq("user_id", uid).eq("portfolio_kind", mode).order("market_value", { ascending: false }),
          browserSupabase.from("wealth_accounts").select("id,provider,account_name").eq("user_id", uid).eq("portfolio_kind", mode),
          browserSupabase.from("wealth_shariah_assessments").select("holding_id,status,confidence,reason,purification_rate,methodology").eq("user_id", uid).eq("portfolio_kind", mode),
        ]);
        if (h.error) throw h.error; if (a.error) throw a.error; if (s.error) throw s.error;
        const holdingRows = (h.data || []) as Holding[];
        const accountRows = (a.data || []) as Account[];
        const existing = (s.data || []) as Assessment[];
        const existingIds = new Set(existing.map((row) => row.holding_id));
        const accountMap = new Map(accountRows.map((row) => [row.id, row]));
        const missing = holdingRows.filter((row) => !existingIds.has(row.id)).map((row) => ({
          user_id: uid, holding_id: row.id, portfolio_kind: mode, ...preliminaryAssessment(row, accountMap.get(row.account_id)),
        }));
        if (missing.length) {
          const { error: upsertError } = await browserSupabase.from("wealth_shariah_assessments").upsert(missing, { onConflict: "user_id,holding_id,portfolio_kind" });
          if (upsertError) throw upsertError;
        }
        const { data: finalData, error: finalError } = await browserSupabase.from("wealth_shariah_assessments").select("holding_id,status,confidence,reason,purification_rate,methodology").eq("user_id", uid).eq("portfolio_kind", mode);
        if (finalError) throw finalError;
        if (!active) return;
        setHoldings(holdingRows); setAccounts(accountRows); setAssessments((finalData || []) as Assessment[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "تعذر تحميل الفحص الشرعي.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const accountMap = useMemo(() => new Map(accounts.map((row) => [row.id, row])), [accounts]);
  const rows = useMemo<ViewRow[]>(() => {
    const map = new Map(assessments.map((row) => [row.holding_id, row]));
    return holdings.map((holding) => ({ ...holding, ...(map.get(holding.id) || { holding_id: holding.id, status: "unknown" as Status, confidence: "preliminary", reason: "غير مصنف بعد.", purification_rate: null, methodology: "tharwa_preliminary_v1" }) }));
  }, [holdings, assessments]);

  const metrics = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + numeric(row.market_value), 0);
    const byStatus = new Map<Status, number>();
    rows.forEach((row) => byStatus.set(row.status, (byStatus.get(row.status) || 0) + numeric(row.market_value)));
    const slices = (Object.keys(STATUS_META) as Status[]).map((status) => ({ key: status, label: STATUS_META[status].label, color: STATUS_META[status].color, value: byStatus.get(status) || 0 }));
    const compliant = byStatus.get("likely_compliant") || 0;
    const review = byStatus.get("review_required") || 0;
    const nonCompliant = byStatus.get("likely_non_compliant") || 0;
    const purification = rows.reduce((sum, row) => sum + numeric(row.market_value) * Math.max(numeric(row.purification_rate), 0) / 100, 0);
    return { total, slices, compliant, review, nonCompliant, purification };
  }, [rows]);

  const visible = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const paper = kind === "paper";
  const suffix = paper ? "?portfolio=paper" : "";

  if (loading) return <main className={styles.page}><div className={styles.state}>جاري بناء الفحص الشرعي المبدئي…</div></main>;
  if (error) return <main className={styles.page}><div className={styles.state}><strong>تعذر تحميل الفحص.</strong><span>{error}</span></div></main>;

  return <main className={styles.page} dir="rtl">
    <aside className={styles.sidebar}>
      <div><div className={styles.brand}>ثروة</div><div className={styles.brandSub}>{paper ? "محفظة تجريبية" : "إدارة الثروة"}</div></div>
      <nav className={styles.nav}><Link href={`/wealth${suffix}`} className={styles.navItem}>نظرة عامة</Link><Link href={`/wealth/assets${suffix}`} className={styles.navItem}>الأصول</Link><Link href={`/wealth/income${suffix}`} className={styles.navItem}>الدخل</Link><Link href={`/wealth/analytics${suffix}`} className={styles.navItem}>التحليلات</Link><Link href={`/wealth/shariah${suffix}`} className={`${styles.navItem} ${styles.active}`}>الالتزام الشرعي</Link><span className={styles.navItem}>الحسابات</span></nav>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}><div><p>{paper ? "بيئة الاختبار" : "المحفظة الحقيقية"}</p><h1>الالتزام الشرعي</h1></div><div className={styles.actions}><Link href={paper ? "/wealth/shariah" : "/wealth/shariah?portfolio=paper"} className={styles.ghost}>{paper ? "محفظتي الحقيقية" : "محفظة تجريبية"}</Link><Link href={paper ? "/wealth/assets?portfolio=paper&manage=1" : "/wealth/assets?manage=1"} className={styles.primary}>إدارة الأصول</Link></div></header>
      <div className={styles.content}>
        <div className={styles.notice}><b>فحص مبدئي، وليس فتوى.</b> التصنيف الآلي يساعد على اكتشاف ما يحتاج مراجعة. الاعتماد النهائي يجب أن يستند إلى منهجية شرعية محددة وبيانات مالية محدثة ومراجعة جهة مؤهلة.</div>
        <section className={styles.metrics}>
          <article><small>متوافق مبدئيًا</small><strong className={styles.profit}>{metrics.total ? `${fmt(metrics.compliant / metrics.total * 100, 1)}٪` : "—"}</strong><span>{sar(metrics.compliant)}</span></article>
          <article><small>يحتاج مراجعة</small><strong className={styles.review}>{metrics.total ? `${fmt(metrics.review / metrics.total * 100, 1)}٪` : "—"}</strong><span>{sar(metrics.review)}</span></article>
          <article><small>غير متوافق مبدئيًا</small><strong className={styles.loss}>{metrics.total ? `${fmt(metrics.nonCompliant / metrics.total * 100, 1)}٪` : "—"}</strong><span>{sar(metrics.nonCompliant)}</span></article>
          <article><small>تنقية محسوبة</small><strong>{metrics.purification > 0 ? sar(metrics.purification) : "—"}</strong><span>{metrics.purification > 0 ? "حسب المعدلات المسجلة" : "تحتاج بيانات دخل غير متوافق"}</span></article>
        </section>

        <section className={styles.overviewGrid}>
          <article className={styles.panel}><div className={styles.panelHead}><div><small>المحفظة</small><h2>توزيع الحالة الشرعية</h2></div></div><Donut slices={metrics.slices} total={metrics.total} /></article>
          <article className={styles.panel}><div className={styles.panelHead}><div><small>المنهجية الحالية</small><h2>كيف يتم الفحص؟</h2></div></div><div className={styles.methodList}><div><span>1</span><b>طبيعة الأصل والنشاط</b><small>استبعاد أو تنبيه المنتجات والأنشطة الواضحة غير المفلترة شرعيًا.</small></div><div><span>2</span><b>النسب المالية</b><small>الأسهم تحتاج لاحقًا بيانات مالية محدثة وفحصًا وفق معيار شرعي مختار.</small></div><div><span>3</span><b>الدخل غير المباح والتنقية</b><small>لا نحسب مبلغ تنقية قبل توفر نسبة موثوقة لكل أصل.</small></div><div><span>4</span><b>مراجعة بشرية</b><small>يمكن لاحقًا تثبيت قرار هيئة أو مزود شرعي بدل التقييم الآلي.</small></div></div></article>
        </section>

        <section className={styles.tablePanel}>
          <div className={styles.tableHead}><div><small>تفاصيل الأصول</small><h2>الفحص لكل أصل</h2></div><div className={styles.filters}><button className={filter === "all" ? styles.filterActive : ""} onClick={() => setFilter("all")}>الكل</button>{(Object.keys(STATUS_META) as Status[]).map((status) => <button key={status} className={filter === status ? styles.filterActive : ""} onClick={() => setFilter(status)}>{STATUS_META[status].short}</button>)}</div></div>
          <div className={styles.table}><div className={`${styles.row} ${styles.headRow}`}><span>الأصل</span><span>الحساب</span><span>القيمة</span><span>الحالة</span><span>سبب التصنيف</span></div>{visible.map((row) => { const meta = STATUS_META[row.status]; return <div className={styles.row} key={row.id}><span><b>{row.asset_name}</b><small>{row.symbol || row.asset_type || "—"}</small></span><span>{accountMap.get(row.account_id)?.provider || accountMap.get(row.account_id)?.account_name || "—"}</span><span><b>{sar(numeric(row.market_value))}</b></span><span><i className={styles.statusDot} style={{ background: meta.color }} /><b style={{ color: meta.color }}>{meta.label}</b></span><span className={styles.reason}>{row.reason || "—"}</span></div>; })}</div>
        </section>

        <div className={styles.footerNote}>لا نستخدم عبارة «متوافق شرعيًا» كاعتماد نهائي في النسخة الحالية. عند ربط مزود شرعي أو اعتماد هيئة محددة سنفصل بوضوح بين التصنيف الآلي، المراجعة البشرية، والاعتماد الرسمي.</div>
      </div>
    </section>
  </main>;
}
