"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./accounts.module.css";

type PortfolioKind = "real" | "paper";
type Account = {
  id: string;
  provider: string;
  account_name: string | null;
  account_type: string;
  connection_mode: "api" | "statement" | "manual";
  status: "active" | "pending" | "disconnected" | "archived";
  currency: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
type Holding = {
  id: string;
  account_id: string;
  asset_name: string;
  symbol: string | null;
  asset_type: string | null;
  market_value: number | string | null;
  cost_basis: number | string | null;
};
type Slice = { key: string; label: string; value: number; color: string };

const ASSET_LABELS: Record<string, string> = {
  saudi_stock: "أسهم سعودية",
  global_stock: "أسهم عالمية",
  etf: "ETF",
  fund: "صناديق",
  sukuk: "صكوك",
  reit: "ريت",
  crypto: "كريبتو",
  cash: "نقد",
  murabaha: "مرابحة",
  real_estate: "عقار",
  gold: "ذهب",
  private_asset: "أصول خاصة",
  other: "أخرى",
};
const COLORS = ["#14b8a6", "#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ec4899", "#6366f1", "#f97316"];
const STATUS_META = {
  active: { label: "نشط", tone: "good" },
  pending: { label: "قيد الإعداد", tone: "review" },
  disconnected: { label: "غير متصل", tone: "bad" },
  archived: { label: "مخفي", tone: "muted" },
} as const;

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function fmt(value: number, digits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", { maximumFractionDigits: digits }).format(value);
}
function sar(value: number) { return `${fmt(value)} ر.س`; }
function pct(value: number) { return `${value > 0 ? "+" : ""}${fmt(value, 1)}٪`; }
function modeLabel(mode: Account["connection_mode"], paper: boolean) {
  if (mode === "api") return paper ? "محاكاة API" : "اتصال API";
  if (mode === "statement") return "كشف حساب";
  return "إدخال يدوي";
}
function typeLabel(value: string) {
  if (value === "cash") return "حساب نقدي";
  if (value === "manual") return "أصول خاصة";
  return "حساب استثماري";
}
function providerGlyph(provider: string) {
  const p = provider.toLowerCase();
  if (p.includes("binance")) return "BN";
  if (p.includes("interactive")) return "IB";
  if (p.includes("عوائد")) return "عو";
  if (p.includes("الراجحي")) return "ر";
  if (p.includes("أصول")) return "أ";
  return provider.slice(0, 2).toUpperCase();
}

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const positive = slices.filter((slice) => slice.value > 0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = positive.find((slice) => slice.key === activeKey) || positive[0];
  let cursor = 0;
  if (!positive.length || total <= 0) return <div className={styles.emptyDonut}>لا توجد أصول</div>;
  return <div className={styles.donutWrap}>
    <div className={styles.donutBox}>
      <svg viewBox="0 0 120 120" className={styles.donut}>
        <circle cx="60" cy="60" r="45" pathLength="100" className={styles.track} />
        {positive.map((slice) => {
          const share = slice.value / total * 100;
          const offset = cursor;
          cursor += share;
          return <circle key={slice.key} cx="60" cy="60" r="45" pathLength="100" className={styles.segment} stroke={slice.color} strokeDasharray={`${Math.max(share - .7, .4)} ${100 - Math.max(share - .7, .4)}`} strokeDashoffset={-offset} onMouseEnter={() => setActiveKey(slice.key)} onMouseLeave={() => setActiveKey(null)} />;
        })}
      </svg>
      <div className={styles.donutCenter}><small>{active?.label}</small><strong>{active ? `${fmt(active.value / total * 100, 1)}٪` : "—"}</strong></div>
    </div>
  </div>;
}

export default function AccountsClient() {
  const [kind, setKind] = useState<PortfolioKind>("real");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const mode: PortfolioKind = new URLSearchParams(window.location.search).get("portfolio") === "paper" ? "paper" : "real";
      setKind(mode);
      const { data: userData, error: userError } = await browserSupabase.auth.getUser();
      if (userError || !userData.user) {
        window.location.replace(`/wealth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      if (mode === "paper") {
        const { error: seedError } = await browserSupabase.rpc("ensure_wealth_paper_portfolio");
        if (seedError) throw seedError;
      }
      const uid = userData.user.id;
      const [a, h] = await Promise.all([
        browserSupabase.from("wealth_accounts").select("id,provider,account_name,account_type,connection_mode,status,currency,metadata,created_at,updated_at").eq("user_id", uid).eq("portfolio_kind", mode).order("created_at"),
        browserSupabase.from("wealth_holdings").select("id,account_id,asset_name,symbol,asset_type,market_value,cost_basis").eq("user_id", uid).eq("portfolio_kind", mode),
      ]);
      if (a.error) throw a.error;
      if (h.error) throw h.error;
      setAccounts((a.data || []) as Account[]);
      setHoldings((h.data || []) as Holding[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الحسابات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Holding[]>();
    holdings.forEach((holding) => map.set(holding.account_id, [...(map.get(holding.account_id) || []), holding]));
    return map;
  }, [holdings]);

  const summary = useMemo(() => {
    const visibleAccounts = accounts.filter((account) => account.status !== "archived");
    const total = visibleAccounts.reduce((sum, account) => sum + (grouped.get(account.id) || []).reduce((s, holding) => s + numeric(holding.market_value), 0), 0);
    const api = visibleAccounts.filter((account) => account.connection_mode === "api").length;
    const manual = visibleAccounts.filter((account) => account.connection_mode !== "api").length;
    return { count: visibleAccounts.length, total, api, manual };
  }, [accounts, grouped]);

  const saveName = async (account: Account) => {
    const name = draftName.trim();
    if (!name) return;
    setSaving(true);
    const { error: updateError } = await browserSupabase.from("wealth_accounts").update({ account_name: name, updated_at: new Date().toISOString() }).eq("id", account.id);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setEditing(null);
    await load();
  };

  const toggleArchive = async (account: Account) => {
    setSaving(true);
    const status = account.status === "archived" ? "active" : "archived";
    const { error: updateError } = await browserSupabase.from("wealth_accounts").update({ status, updated_at: new Date().toISOString() }).eq("id", account.id);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    await load();
  };

  const paper = kind === "paper";
  const suffix = paper ? "?portfolio=paper" : "";

  if (loading) return <main className={styles.page}><div className={styles.state}>جاري تحميل الحسابات…</div></main>;
  if (error && !accounts.length) return <main className={styles.page}><div className={styles.state}><strong>تعذر تحميل الحسابات.</strong><span>{error}</span></div></main>;

  return <main className={styles.page} dir="rtl">
    <aside className={styles.sidebar}>
      <div><div className={styles.brand}>ثروة</div><div className={styles.brandSub}>{paper ? "محفظة تجريبية" : "إدارة الثروة"}</div></div>
      <nav className={styles.nav}><Link href={`/wealth${suffix}`} className={styles.navItem}>نظرة عامة</Link><Link href={`/wealth/assets${suffix}`} className={styles.navItem}>الأصول</Link><Link href={`/wealth/income${suffix}`} className={styles.navItem}>الدخل</Link><Link href={`/wealth/analytics${suffix}`} className={styles.navItem}>التحليلات</Link><Link href={`/wealth/shariah${suffix}`} className={styles.navItem}>الالتزام الشرعي</Link><Link href={`/wealth/accounts${suffix}`} className={`${styles.navItem} ${styles.active}`}>الحسابات</Link></nav>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div><p>{paper ? "بيئة الاختبار" : "المحفظة الحقيقية"}</p><h1>الحسابات</h1></div>
        <div className={styles.actions}><Link href={paper ? "/wealth/accounts" : "/wealth/accounts?portfolio=paper"} className={styles.ghost}>{paper ? "محفظتي الحقيقية" : "محفظة تجريبية"}</Link><Link href={paper ? "/wealth/connect?portfolio=paper" : "/wealth/connect"} className={styles.primary}>إضافة حساب</Link></div>
      </header>

      <div className={styles.content}>
        {paper && <div className={styles.note}>هذه الحسابات تجريبية ومفصولة بالكامل عن حساباتك الحقيقية. سنستخدمها لاختبار تجربة الربط والإدارة قبل توصيل أي حساب فعلي.</div>}
        {error && <div className={styles.error}>{error}</div>}

        <section className={styles.metrics}>
          <article><small>إجمالي الحسابات</small><strong>{fmt(summary.count, 0)}</strong><span>حسابات ظاهرة</span></article>
          <article><small>القيمة عبر الحسابات</small><strong>{sar(summary.total)}</strong><span>بالريال السعودي</span></article>
          <article><small>{paper ? "محاكاة الربط" : "ربط مباشر"}</small><strong>{fmt(summary.api, 0)}</strong><span>حساب API</span></article>
          <article><small>يدوي / كشف حساب</small><strong>{fmt(summary.manual, 0)}</strong><span>حسابات غير API</span></article>
        </section>

        <section className={styles.accountGrid}>
          {accounts.map((account) => {
            const accountHoldings = grouped.get(account.id) || [];
            const value = accountHoldings.reduce((sum, holding) => sum + numeric(holding.market_value), 0);
            const cost = accountHoldings.reduce((sum, holding) => sum + numeric(holding.cost_basis), 0);
            const pnl = cost > 0 ? value - cost : 0;
            const pnlPct = cost > 0 ? pnl / cost * 100 : 0;
            const assetMap = new Map<string, number>();
            accountHoldings.forEach((holding) => {
              const key = holding.asset_type || "other";
              assetMap.set(key, (assetMap.get(key) || 0) + numeric(holding.market_value));
            });
            const slices: Slice[] = [...assetMap].map(([key, sliceValue], index) => ({ key, label: ASSET_LABELS[key] || key, value: sliceValue, color: COLORS[index % COLORS.length] })).sort((a, b) => b.value - a.value);
            const statusMeta = STATUS_META[account.status];
            const isExpanded = expanded === account.id;
            const isEditing = editing === account.id;
            return <article className={`${styles.accountCard} ${account.status === "archived" ? styles.archived : ""}`} key={account.id}>
              <div className={styles.accountMain}>
                <div className={styles.accountIdentity}><div className={styles.glyph}>{providerGlyph(account.provider)}</div><div><div className={styles.nameRow}><h2>{account.provider}</h2><span className={`${styles.status} ${styles[statusMeta.tone]}`}>{statusMeta.label}</span></div><p>{account.account_name || typeLabel(account.account_type)}</p><div className={styles.meta}><span>{modeLabel(account.connection_mode, paper)}</span><span>{typeLabel(account.account_type)}</span><span>آخر تحديث {new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(account.updated_at))}</span></div></div></div>
                <div className={styles.accountValue}><small>قيمة الحساب</small><strong>{sar(value)}</strong>{cost > 0 && <span className={pnl >= 0 ? styles.profit : styles.loss}>{pnl >= 0 ? "+" : ""}{sar(pnl)} · {pct(pnlPct)}</span>}</div>
              </div>

              <div className={styles.accountVisual}><Donut slices={slices} total={value} /><div className={styles.assetSummary}><div><small>عدد الأصول</small><strong>{fmt(accountHoldings.length, 0)}</strong></div><div><small>أكبر فئة</small><strong>{slices[0]?.label || "—"}</strong></div><div><small>العملة المرجعية</small><strong>{account.currency}</strong></div></div></div>

              <div className={styles.cardActions}><button type="button" onClick={() => setExpanded(isExpanded ? null : account.id)}>{isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}</button><button type="button" onClick={() => { setEditing(isEditing ? null : account.id); setDraftName(account.account_name || ""); }}>{isEditing ? "إلغاء" : "إدارة"}</button></div>

              {isExpanded && <div className={styles.details}><div className={styles.detailHead}><span>الأصل</span><span>النوع</span><span>القيمة</span></div>{accountHoldings.length ? accountHoldings.sort((a, b) => numeric(b.market_value) - numeric(a.market_value)).map((holding) => <div className={styles.detailRow} key={holding.id}><span><b>{holding.asset_name}</b><small>{holding.symbol || "—"}</small></span><span>{ASSET_LABELS[holding.asset_type || "other"] || holding.asset_type || "أخرى"}</span><strong>{sar(numeric(holding.market_value))}</strong></div>) : <div className={styles.noAssets}>لا توجد أصول في هذا الحساب.</div>}</div>}

              {isEditing && <div className={styles.managePanel}><label><span>اسم الحساب</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label><div className={styles.manageActions}><button type="button" className={styles.save} disabled={saving || !draftName.trim()} onClick={() => void saveName(account)}>حفظ الاسم</button><button type="button" className={styles.archive} disabled={saving} onClick={() => void toggleArchive(account)}>{account.status === "archived" ? "إظهار الحساب" : "إخفاء الحساب"}</button></div><small>إخفاء الحساب لا يحذف أصوله أو تاريخه؛ يمكن إظهاره لاحقًا.</small></div>}
            </article>;
          })}
        </section>

        {!accounts.length && <div className={styles.emptyState}><h2>لا توجد حسابات بعد</h2><p>أضف أول حساب أو أصل لبدء تجميع ثروتك في مكان واحد.</p><Link href="/wealth/connect">إضافة حساب</Link></div>}
      </div>
    </section>
  </main>;
}
