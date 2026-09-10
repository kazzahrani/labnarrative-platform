"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./arena.module.css";

type ArenaBot = {
  id: string;
  slug: string;
  owner_guest_id: string | null;
  parent_bot_id: string | null;
  owner_alias: string;
  name: string;
  pair: string;
  strategy_type: string;
  status: "running" | "paused" | "closed";
  is_official: boolean;
  starting_capital: number | string;
  cash_balance: number | string;
  current_equity: number | string;
  current_position_value: number | string;
  realized_pnl: number | string;
  return_pct: number | string;
  max_drawdown_pct: number | string;
  profit_factor: number | string | null;
  ln_score: number | string | null;
  total_trades: number;
  wins: number;
  losses: number;
  clone_count: number;
  view_count: number;
  last_price: number | string | null;
  config: ArenaConfig;
  launched_at: string;
  last_tick_at: string | null;
  created_at: string;
};

type ArenaTrade = {
  id: string;
  bot_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  avg_entry: number | string;
  invested_quote: number | string;
  safety_orders_filled: number;
  realized_pnl: number | string | null;
  exit_price: number | string | null;
  exit_reason: string | null;
};

type Snapshot = {
  id: number;
  bot_id: string;
  equity: number | string;
  cash: number | string;
  position_value: number | string;
  return_pct: number | string;
  captured_at: string;
};

type ArenaConfig = {
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  activeSafetyOrders: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfit: number;
  trailingTakeProfit: boolean;
  trailingDeviation: number;
  stopEnabled: boolean;
  stopPct: number;
  trailingStop: boolean;
  cooldownMinutes: number;
  entryMode?: string;
};

type DetailTab = "overview" | "analytics" | "configuration" | "trades";
type SortMode = "score" | "return" | "drawdown" | "clones" | "newest" | "longest";

const DEFAULT_CONFIG: ArenaConfig = {
  baseOrder: 100,
  safetyOrder: 100,
  maxSafetyOrders: 5,
  activeSafetyOrders: 3,
  deviation: 1,
  stepScale: 1.2,
  volumeScale: 1.2,
  takeProfit: 1.5,
  trailingTakeProfit: false,
  trailingDeviation: 0.3,
  stopEnabled: true,
  stopPct: 15,
  trailingStop: false,
  cooldownMinutes: 5,
};

const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "POL/USDT"];

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function ensureGuestKey() {
  const key = "labnarrative-arena-guest-key-v1";
  const existing = window.localStorage.getItem(key);
  if (existing && existing.length >= 40) return existing;
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  window.localStorage.setItem(key, token);
  return token;
}

function money(value: unknown, digits = 0) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(n(value));
}

function pct(value: unknown, digits = 1, signed = true) {
  const valueNumber = n(value);
  const sign = signed && valueNumber > 0 ? "+" : "";
  return `${sign}${valueNumber.toFixed(digits)}%`;
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function ageLabel(date: string) {
  const ms = Math.max(0, Date.now() - new Date(date).getTime());
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

function asset(pair: string) {
  return pair.split("/")[0] || "BOT";
}

function assetGlyph(pair: string) {
  const a = asset(pair);
  if (a === "BTC") return "₿";
  if (a === "ETH") return "◆";
  if (a === "SOL") return "≋";
  if (a === "BNB") return "◇";
  if (a === "XRP") return "✕";
  return a.slice(0, 1);
}

function coinClass(pair: string) {
  const a = asset(pair);
  if (a === "BTC") return styles.coinBtc;
  if (a === "ETH") return styles.coinEth;
  if (a === "SOL") return styles.coinSol;
  if (a === "BNB") return styles.coinBnb;
  if (a === "XRP") return styles.coinXrp;
  if (a === "ADA") return styles.coinAda;
  if (a === "DOGE") return styles.coinDoge;
  if (a === "AVAX") return styles.coinAvax;
  return styles.coinOther;
}

function statusLabel(status: ArenaBot["status"]) {
  return status === "running" ? "Running" : status === "paused" ? "Paused" : "Closed";
}

function EquityCurve({ snapshots, currentReturn }: { snapshots: Snapshot[]; currentReturn: number }) {
  const values = snapshots.length > 1 ? snapshots.map((s) => n(s.return_pct)) : [0, currentReturn];
  const width = 640;
  const height = 205;
  const padX = 10;
  const padY = 24;
  const minRaw = Math.min(...values, 0);
  const maxRaw = Math.max(...values, 0);
  const span = Math.max(1, maxRaw - minRaw);
  const min = minRaw - span * 0.18;
  const max = maxRaw + span * 0.18;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  const points = values.map((v, i) => {
    const x = padX + (values.length === 1 ? 0 : (i / (values.length - 1)) * usableW);
    const y = padY + ((max - v) / (max - min || 1)) * usableH;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points.at(-1)?.[0] ?? width},${height - 8} L${points[0]?.[0] ?? 0},${height - 8} Z`;
  const zeroY = padY + ((max - 0) / (max - min || 1)) * usableH;

  return (
    <div className={styles.curveWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Equity curve">
        <defs>
          <linearGradient id="arenaCurveFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3ceaa0" stopOpacity=".28" />
            <stop offset="100%" stopColor="#3ceaa0" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="arenaCurveStroke" x1="0" x2="1">
            <stop offset="0%" stopColor="#3debb2" />
            <stop offset="60%" stopColor="#43e8a1" />
            <stop offset="100%" stopColor="#7cf0c3" />
          </linearGradient>
        </defs>
        {[44, 84, 124, 164].map((y) => <line key={y} x1="0" x2={width} y1={y} y2={y} className={styles.gridLine} />)}
        <line x1="0" x2={width} y1={zeroY} y2={zeroY} className={styles.zeroLine} />
        <path d={area} fill="url(#arenaCurveFill)" />
        <path d={line} fill="none" stroke="url(#arenaCurveStroke)" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.curveBadge}>{pct(currentReturn)}</span>
    </div>
  );
}

function Donut({ value, label, tone = "green" }: { value: number; label: string; tone?: "green" | "blue" | "violet" }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone === "green" ? "#39e69d" : tone === "blue" ? "#48b9ff" : "#8d6cff";
  return (
    <div className={styles.donut} style={{ background: `conic-gradient(${color} 0 ${v}%, #26313d ${v}% 100%)` }}>
      <div><strong>{Math.round(v)}%</strong><small>{label}</small></div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button type="button" className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`} onClick={() => onChange(!checked)} aria-pressed={checked}><i />{label}</button>;
}

function CreateBotModal({ open, onClose, onCreate, busy }: { open: boolean; onClose: () => void; onCreate: (name: string, pair: string, config: ArenaConfig) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState("My DCA Bot");
  const [pair, setPair] = useState("BTC/USDT");
  const [config, setConfig] = useState<ArenaConfig>(DEFAULT_CONFIG);
  if (!open) return null;
  const setNumber = (key: keyof ArenaConfig, value: string) => setConfig((current) => ({ ...current, [key]: Number(value) }));

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <section className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}><div><span className={styles.eyebrow}>NEW ARENA EXPERIMENT</span><h2>Create DCA Bot</h2><p>$10,000 virtual capital · public forward test · real market prices</p></div><button className={styles.iconButton} onClick={onClose}>×</button></div>
        <div className={styles.formGrid}>
          <label className={styles.fieldWide}><span>Bot name</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
          <label><span>Pair</span><select value={pair} onChange={(e) => setPair(e.target.value)}>{PAIRS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label><span>Base order (USDT)</span><input type="number" min="10" value={config.baseOrder} onChange={(e) => setNumber("baseOrder", e.target.value)} /></label>
          <label><span>DCA order (USDT)</span><input type="number" min="10" value={config.safetyOrder} onChange={(e) => setNumber("safetyOrder", e.target.value)} /></label>
          <label><span>Max DCA orders</span><input type="number" min="0" max="20" value={config.maxSafetyOrders} onChange={(e) => setNumber("maxSafetyOrders", e.target.value)} /></label>
          <label><span>Active DCA orders</span><input type="number" min="0" max="20" value={config.activeSafetyOrders} onChange={(e) => setNumber("activeSafetyOrders", e.target.value)} /></label>
          <label><span>Initial deviation</span><div className={styles.inputSuffix}><input type="number" step="0.1" value={config.deviation} onChange={(e) => setNumber("deviation", e.target.value)} /><b>%</b></div></label>
          <label><span>Step scale</span><input type="number" step="0.05" value={config.stepScale} onChange={(e) => setNumber("stepScale", e.target.value)} /></label>
          <label><span>Volume scale</span><input type="number" step="0.05" value={config.volumeScale} onChange={(e) => setNumber("volumeScale", e.target.value)} /></label>
          <label><span>Take profit</span><div className={styles.inputSuffix}><input type="number" step="0.1" value={config.takeProfit} onChange={(e) => setNumber("takeProfit", e.target.value)} /><b>%</b></div></label>
          <label><span>Cooldown after deal</span><div className={styles.inputSuffix}><input type="number" min="0" value={config.cooldownMinutes} onChange={(e) => setNumber("cooldownMinutes", e.target.value)} /><b>min</b></div></label>
        </div>
        <div className={styles.switchRows}>
          <div><Toggle checked={config.trailingTakeProfit} onChange={(value) => setConfig((c) => ({ ...c, trailingTakeProfit: value }))} label="Trailing take profit" />{config.trailingTakeProfit ? <label className={styles.inlineField}><span>Deviation</span><input type="number" step="0.05" value={config.trailingDeviation} onChange={(e) => setNumber("trailingDeviation", e.target.value)} /><b>%</b></label> : null}</div>
          <div><Toggle checked={config.stopEnabled} onChange={(value) => setConfig((c) => ({ ...c, stopEnabled: value }))} label="Stop loss" />{config.stopEnabled ? <label className={styles.inlineField}><span>Distance</span><input type="number" step="0.5" value={config.stopPct} onChange={(e) => setNumber("stopPct", e.target.value)} /><b>%</b></label> : null}<Toggle checked={config.trailingStop} onChange={(value) => setConfig((c) => ({ ...c, trailingStop: value }))} label="Trailing" /></div>
        </div>
        <div className={styles.modalNotice}><span>◎</span><div><strong>Forward results stay attached to this configuration.</strong><p>To test different settings later, clone the bot into a new Arena experiment instead of rewriting its history.</p></div></div>
        <div className={styles.modalActions}><button className={styles.secondaryButton} onClick={onClose}>Cancel</button><button className={styles.primaryButton} disabled={busy} onClick={() => void onCreate(name, pair, config)}>{busy ? "Launching…" : "Launch Public Bot →"}</button></div>
      </section>
    </div>
  );
}

function CompareModal({ bot, bots, open, onClose }: { bot: ArenaBot; bots: ArenaBot[]; open: boolean; onClose: () => void }) {
  const alternatives = bots.filter((b) => b.id !== bot.id);
  const [otherId, setOtherId] = useState(alternatives[0]?.id || "");
  useEffect(() => { if (open && alternatives.length && !alternatives.some((b) => b.id === otherId)) setOtherId(alternatives[0].id); }, [open, alternatives, otherId]);
  if (!open) return null;
  const other = alternatives.find((b) => b.id === otherId) || alternatives[0];
  if (!other) return null;
  const rows = [
    ["Return", pct(bot.return_pct), pct(other.return_pct)],
    ["Max drawdown", pct(-Math.abs(n(bot.max_drawdown_pct)), 1, false), pct(-Math.abs(n(other.max_drawdown_pct)), 1, false)],
    ["Closed trades", String(bot.total_trades), String(other.total_trades)],
    ["Profit factor", bot.profit_factor == null ? "—" : n(bot.profit_factor).toFixed(2), other.profit_factor == null ? "—" : n(other.profit_factor).toFixed(2)],
    ["Base order", money(bot.config.baseOrder), money(other.config.baseOrder)],
    ["DCA order", money(bot.config.safetyOrder), money(other.config.safetyOrder)],
    ["Max DCA orders", String(bot.config.maxSafetyOrders), String(other.config.maxSafetyOrders)],
    ["Deviation", pct(bot.config.deviation, 1, false), pct(other.config.deviation, 1, false)],
    ["Volume scale", `${bot.config.volumeScale.toFixed(2)}×`, `${other.config.volumeScale.toFixed(2)}×`],
    ["Take profit", pct(bot.config.takeProfit, 1, false), pct(other.config.takeProfit, 1, false)],
  ];
  return <div className={styles.modalBackdrop} onMouseDown={onClose}><section className={`${styles.modal} ${styles.compareModal}`} onMouseDown={(e) => e.stopPropagation()}><div className={styles.modalHead}><div><span className={styles.eyebrow}>STRATEGY COMPARISON</span><h2>Compare bots</h2><p>Performance and configuration side by side.</p></div><button className={styles.iconButton} onClick={onClose}>×</button></div><div className={styles.comparePicker}><span>Compare with</span><select value={other.id} onChange={(e) => setOtherId(e.target.value)}>{alternatives.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.pair}</option>)}</select></div><div className={styles.compareGrid}><div className={styles.compareHead}><span>Metric</span><strong>{bot.name}</strong><strong>{other.name}</strong></div>{rows.map(([label, a, b]) => <div className={styles.compareRow} key={label}><span>{label}</span><b>{a}</b><b>{b}</b></div>)}</div></section></div>;
}

export default function ArenaClient() {
  const [bots, setBots] = useState<ArenaBot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trades, setTrades] = useState<ArenaTrade[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [guestToken, setGuestToken] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestAlias, setGuestAlias] = useState("Arena guest");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");
  const [pairFilter, setPairFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortMode>("score");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const deepLinked = useRef(false);

  const loadBots = useCallback(async () => {
    const { data, error } = await browserSupabase.from("arena_bots").select("*").order("created_at", { ascending: false });
    if (!error && data) setBots(data as ArenaBot[]);
  }, []);

  useEffect(() => {
    let live = true;
    async function start() {
      const token = ensureGuestKey();
      setGuestToken(token);
      const { data } = await browserSupabase.rpc("arena_touch_guest", { p_token: token });
      if (!live) return;
      if (data && typeof data === "object") {
        const value = data as { id?: string; alias?: string };
        setGuestId(value.id || null);
        setGuestAlias(value.alias || "Arena guest");
      }
      await loadBots();
    }
    void start();
    const timer = window.setInterval(() => void loadBots(), 30_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [loadBots]);

  useEffect(() => {
    if (!bots.length) return;
    if (!deepLinked.current) {
      deepLinked.current = true;
      const slug = new URLSearchParams(window.location.search).get("bot");
      const match = slug ? bots.find((b) => b.slug === slug) : null;
      setSelectedId(match?.id || bots[0].id);
      return;
    }
    if (!selectedId || !bots.some((b) => b.id === selectedId)) setSelectedId(bots[0].id);
  }, [bots, selectedId]);

  const selected = useMemo(() => bots.find((b) => b.id === selectedId) || null, [bots, selectedId]);

  useEffect(() => {
    if (!selected) { setTrades([]); setSnapshots([]); return; }
    let live = true;
    async function detail() {
      const [tradeResult, snapshotResult] = await Promise.all([
        browserSupabase.from("arena_trades").select("*").eq("bot_id", selected!.id).order("opened_at", { ascending: false }).limit(80),
        browserSupabase.from("arena_equity_snapshots").select("*").eq("bot_id", selected!.id).order("captured_at", { ascending: false }).limit(180),
      ]);
      if (!live) return;
      setTrades((tradeResult.data || []) as ArenaTrade[]);
      setSnapshots(((snapshotResult.data || []) as Snapshot[]).reverse());
    }
    void browserSupabase.rpc("arena_increment_view", { p_slug: selected.slug });
    void detail();
    return () => { live = false; };
  }, [selected?.id, selected?.slug]);

  const filtered = useMemo(() => {
    let rows = bots.filter((bot) => scope === "all" || (guestId && bot.owner_guest_id === guestId));
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((bot) => `${bot.name} ${bot.pair} ${bot.owner_alias}`.toLowerCase().includes(q));
    if (pairFilter !== "all") rows = rows.filter((bot) => bot.pair === pairFilter);
    if (statusFilter !== "all") rows = rows.filter((bot) => bot.status === statusFilter);
    return [...rows].sort((a, b) => {
      if (sort === "return") return n(b.return_pct) - n(a.return_pct);
      if (sort === "drawdown") return n(a.max_drawdown_pct) - n(b.max_drawdown_pct);
      if (sort === "clones") return b.clone_count - a.clone_count;
      if (sort === "newest") return +new Date(b.launched_at) - +new Date(a.launched_at);
      if (sort === "longest") return +new Date(a.launched_at) - +new Date(b.launched_at);
      const aQualified = a.total_trades >= 5 && a.ln_score != null;
      const bQualified = b.total_trades >= 5 && b.ln_score != null;
      if (aQualified !== bQualified) return bQualified ? 1 : -1;
      return n(b.ln_score, -1) - n(a.ln_score, -1) || n(b.return_pct) - n(a.return_pct);
    });
  }, [bots, guestId, pairFilter, scope, search, sort, statusFilter]);

  const stats = useMemo(() => {
    const active = bots.filter((b) => b.status === "running").length;
    const tradesCount = bots.reduce((sum, b) => sum + b.total_trades, 0);
    const clones = bots.reduce((sum, b) => sum + b.clone_count, 0);
    const top = bots.length ? Math.max(...bots.map((b) => n(b.return_pct))) : 0;
    return { active, tradesCount, clones, top, capital: bots.length * 10_000 };
  }, [bots]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function createBot(name: string, pair: string, config: ArenaConfig) {
    setBusy(true);
    try {
      const token = guestToken || ensureGuestKey();
      const { data, error } = await browserSupabase.rpc("arena_create_bot", { p_token: token, p_name: name, p_pair: pair, p_config: config });
      if (error) throw error;
      await loadBots();
      const id = (data as { id?: string } | null)?.id;
      if (id) setSelectedId(id);
      setScope("mine"); setCreateOpen(false); notify("Bot launched. Forward testing has started.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(message.includes("arena_active_bot_limit") ? "Arena guests can run up to 3 active bots. Close one to launch another." : "Could not launch this bot. Please check the settings and try again.");
    } finally { setBusy(false); }
  }

  async function cloneBot() {
    if (!selected) return;
    setBusy(true);
    try {
      const token = guestToken || ensureGuestKey();
      const { data, error } = await browserSupabase.rpc("arena_clone_bot", { p_token: token, p_slug: selected.slug });
      if (error) throw error;
      await loadBots();
      const id = (data as { id?: string } | null)?.id;
      if (id) setSelectedId(id);
      setScope("mine"); notify("Fork created. It now has its own $10,000 forward-test history.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(message.includes("arena_active_bot_limit") ? "You already have 3 active Arena bots." : "Could not clone this bot.");
    } finally { setBusy(false); }
  }

  async function setBotStatus(next: "running" | "paused" | "closed") {
    if (!selected) return;
    setBusy(true);
    const { error } = await browserSupabase.rpc("arena_set_bot_status", { p_token: guestToken || ensureGuestKey(), p_slug: selected.slug, p_status: next });
    if (!error) { await loadBots(); notify(next === "running" ? "Bot resumed." : next === "paused" ? "Bot paused." : "Bot closed. Its public history remains visible."); }
    else notify("Could not update this bot.");
    setBusy(false);
  }

  async function shareBot() {
    if (!selected) return;
    const url = `${window.location.origin}/arena?bot=${selected.slug}`;
    await navigator.clipboard.writeText(url);
    notify("Public bot link copied.");
  }

  const ownSelected = Boolean(selected && guestId && selected.owner_guest_id === guestId);
  const winRate = selected && selected.total_trades ? (selected.wins / selected.total_trades) * 100 : 0;
  const usedCapital = selected ? (n(selected.current_position_value) / Math.max(1, n(selected.current_equity, 10_000))) * 100 : 0;
  const closedTrades = trades.filter((t) => t.status === "closed");
  const barTrades = closedTrades.slice(0, 14).reverse();
  const barMax = Math.max(1, ...barTrades.map((t) => Math.abs(n(t.realized_pnl))));

  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}><img src="/labnarrative-mark.svg" alt=""/><strong>LabNarrative</strong></a>
      <nav><a href="/">Home</a><a href="/#product">Product</a><a href="/arena" className={styles.navActive}>Bot Arena</a><a href="/pricing">Pricing</a><a href="/crypto-paper-trading">Resources</a></nav>
      <div className={styles.headerActions}><span className={styles.guestChip}>◉ {guestAlias}</span><a href="https://app.labnarrative.com" className={styles.getStarted}>Get Started</a></div>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroCopy}><div className={styles.titleLine}><h1>Bot Arena</h1><span>BETA</span></div><p>Build trading bots with virtual money. Watch them trade forward on real market prices. Compare performance. Clone what works.</p><div className={styles.heroPills}><span>◈ 100% Free</span><span>▣ No account required</span><span>▤ $10,000 virtual capital</span><span>⌁ Real market data</span><span>◎ Public leaderboard</span></div></div>
      <div className={styles.heroArt} aria-hidden="true"><i/><i/><i/><i/><div><strong>Ideas</strong><strong>Strategies</strong><strong>Real Results</strong><span/></div></div>
    </section>

    <section className={styles.kpis}>
      <article><span className={styles.kpiIcon}>◉</span><div><strong>{compact(stats.active)}</strong><small>Active Bots</small></div></article>
      <article><span className={styles.kpiIcon}>▥</span><div><strong>{compact(stats.tradesCount)}</strong><small>Closed Trades</small></div></article>
      <article><span className={styles.kpiIcon}>◍</span><div><strong>{money(stats.capital)}</strong><small>Virtual Capital</small></div></article>
      <article><span className={`${styles.kpiIcon} ${styles.green}`}>↗</span><div><strong className={stats.top >= 0 ? styles.goodText : styles.badText}>{pct(stats.top)}</strong><small>Top Return</small></div></article>
      <article><span className={`${styles.kpiIcon} ${styles.violet}`}>⌘</span><div><strong>{compact(stats.clones)}</strong><small>Total Clones</small></div></article>
      <button className={styles.createHero} onClick={() => setCreateOpen(true)}><strong>＋ Create Bot — Free</strong><small>Start with $10,000 virtual USDT</small></button>
    </section>

    <section className={styles.explorer}>
      <div className={styles.scopeTabs}><button className={scope === "all" ? styles.scopeActive : ""} onClick={() => setScope("all")}>Explore Bots</button><button className={scope === "mine" ? styles.scopeActive : ""} onClick={() => setScope("mine")}>My Bots <span>{bots.filter((b) => guestId && b.owner_guest_id === guestId).length}</span></button></div>
      <div className={styles.filters}><label className={styles.search}>⌕<input placeholder="Search bots, pairs or creators…" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select value={pairFilter} onChange={(e) => setPairFilter(e.target.value)}><option value="all">All Pairs</option>{PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All Status</option><option value="running">Running</option><option value="paused">Paused</option><option value="closed">Closed</option></select><select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}><option value="score">Sort: LN Score</option><option value="return">Return</option><option value="drawdown">Lowest Drawdown</option><option value="clones">Most Cloned</option><option value="newest">Newest</option><option value="longest">Longest Running</option></select></div>

      <div className={styles.workspace}>
        <div className={styles.leaderboard}>
          <div className={styles.tableHead}><span>#</span><span>Bot</span><span>Pair</span><span>Return</span><span>Max DD</span><span>Trades</span><span>LN Score</span><span>Clones</span></div>
          <div className={styles.rows}>{filtered.length ? filtered.map((bot, index) => {
            const chosen = bot.id === selectedId;
            const qualified = bot.total_trades >= 5 && bot.ln_score != null;
            return <button className={`${styles.botRow} ${chosen ? styles.rowActive : ""}`} key={bot.id} onClick={() => { setSelectedId(bot.id); setDetailTab("overview"); }}><span className={styles.rank}>{index + 1}</span><span className={styles.botIdentity}><i className={`${styles.coin} ${coinClass(bot.pair)}`}>{assetGlyph(bot.pair)}</i><span><strong>{bot.name}</strong><small>{bot.owner_alias}{bot.is_official ? " · Official" : ""}</small></span></span><span>{bot.pair}</span><b className={n(bot.return_pct) >= 0 ? styles.goodText : styles.badText}>{pct(bot.return_pct)}</b><b className={styles.badText}>{pct(-Math.abs(n(bot.max_drawdown_pct)), 1, false)}</b><span>{bot.total_trades}</span><span className={qualified ? styles.score : styles.unranked}>{qualified ? Math.round(n(bot.ln_score)) : bot.total_trades ? `${bot.total_trades}/5` : "New"}</span><span>{bot.clone_count}</span></button>;
          }) : <div className={styles.empty}><strong>{scope === "mine" ? "No Arena bots on this device yet." : "No bots match these filters."}</strong><p>{scope === "mine" ? "Create one free or clone a strategy from Explore Bots." : "Clear a filter to see more experiments."}</p>{scope === "mine" ? <button className={styles.primaryButton} onClick={() => setCreateOpen(true)}>＋ Create Bot</button> : null}</div>}</div>
        </div>

        <aside className={styles.detail}>{selected ? <>
          <div className={styles.detailHead}><div className={styles.detailIdentity}><i className={`${styles.coin} ${styles.coinLarge} ${coinClass(selected.pair)}`}>{assetGlyph(selected.pair)}</i><div><h2>{selected.name}</h2><p>{selected.owner_alias} <span>•</span> {ageLabel(selected.launched_at)} running <span>•</span> {selected.is_official ? "Official bot" : "Public bot"}</p></div></div><div className={styles.detailActions}><button className={styles.whiteButton} disabled={busy} onClick={() => void cloneBot()}>Clone</button><button onClick={() => setCompareOpen(true)}>Compare</button><button onClick={() => void shareBot()}>Share</button>{ownSelected ? <button className={styles.moreButton} onClick={() => void setBotStatus(selected.status === "running" ? "paused" : "running")}>{selected.status === "running" ? "Pause" : "Resume"}</button> : null}</div></div>
          <div className={styles.detailTabs}>{(["overview","analytics","configuration","trades"] as DetailTab[]).map((tab) => <button key={tab} onClick={() => setDetailTab(tab)} className={detailTab === tab ? styles.detailTabActive : ""}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>

          {detailTab === "overview" ? <div className={styles.detailBody}>
            <div className={styles.metricStrip}><article><strong className={n(selected.return_pct) >= 0 ? styles.goodText : styles.badText}>{pct(selected.return_pct)}</strong><small>Total Return</small></article><article><strong className={styles.badText}>{pct(-Math.abs(n(selected.max_drawdown_pct)), 1, false)}</strong><small>Max Drawdown</small></article><article><strong>{selected.profit_factor == null ? "—" : n(selected.profit_factor).toFixed(2)}</strong><small>Profit Factor</small></article><article><strong>{Math.round(winRate)}%</strong><small>Win Rate</small></article><article><strong>{selected.total_trades}</strong><small>Total Trades</small></article></div>
            <article className={styles.chartCard}><div className={styles.cardTitle}><strong>Equity Curve</strong><span>Forward paper performance</span></div><EquityCurve snapshots={snapshots} currentReturn={n(selected.return_pct)} /></article>
            <div className={styles.miniCharts}>
              <article><div className={styles.cardTitle}><strong>Trade Results</strong><span>{selected.total_trades} closed</span></div><div className={styles.donutRow}><Donut value={winRate} label="win rate"/><div className={styles.legend}><span><i className={styles.dotGreen}/>Winning <b>{selected.wins}</b></span><span><i className={styles.dotRed}/>Losing <b>{selected.losses}</b></span></div></div></article>
              <article><div className={styles.cardTitle}><strong>Capital Usage</strong><span>{money(selected.current_position_value)}</span></div><div className={styles.donutRow}><Donut value={usedCapital} label="deployed" tone="blue"/><div className={styles.legend}><span><i className={styles.dotBlue}/>In position <b>{money(selected.current_position_value)}</b></span><span><i className={styles.dotGray}/>Available <b>{money(selected.cash_balance)}</b></span></div></div></article>
              <article><div className={styles.cardTitle}><strong>Profit vs Loss</strong><span>USDT</span></div><div className={styles.pnlBars}>{barTrades.length ? barTrades.map((trade) => { const value=n(trade.realized_pnl); return <i key={trade.id} className={value >= 0 ? styles.pnlPositive : styles.pnlNegative} style={{ height: `${18 + Math.abs(value) / barMax * 62}%` }} title={money(value,2)} />; }) : <span className={styles.noData}>Waiting for closed trades</span>}</div><div className={styles.pnlTotals}><b className={styles.goodText}>{money(closedTrades.filter((t)=>n(t.realized_pnl)>0).reduce((s,t)=>s+n(t.realized_pnl),0),2)}</b><b className={styles.badText}>{money(closedTrades.filter((t)=>n(t.realized_pnl)<0).reduce((s,t)=>s+n(t.realized_pnl),0),2)}</b></div></article>
            </div>
            <div className={styles.cloneBanner}><span>ϟ</span><div><strong>Like this strategy?</strong><p>Clone it and run your own independent version with $10,000 virtual capital.</p></div><button className={styles.whiteButton} disabled={busy} onClick={() => void cloneBot()}>Clone & Run</button></div>
          </div> : null}

          {detailTab === "analytics" ? <div className={styles.detailBody}><article className={styles.chartCard}><div className={styles.cardTitle}><strong>Forward Performance</strong><span>Real market prices · virtual execution</span></div><EquityCurve snapshots={snapshots} currentReturn={n(selected.return_pct)} /></article><div className={styles.analyticsCards}><article><small>Current equity</small><strong>{money(selected.current_equity,2)}</strong><span>Started at $10,000</span></article><article><small>Realized PnL</small><strong className={n(selected.realized_pnl)>=0?styles.goodText:styles.badText}>{money(selected.realized_pnl,2)}</strong><span>{selected.total_trades} closed trades</span></article><article><small>Current price</small><strong>{selected.last_price == null ? "Waiting…" : money(selected.last_price, asset(selected.pair)==="BTC"?0:4)}</strong><span>{selected.pair}</span></article><article><small>LN Score</small><strong>{selected.total_trades >= 5 && selected.ln_score != null ? Math.round(n(selected.ln_score)) : "Unranked"}</strong><span>{selected.total_trades >= 5 ? "Risk-adjusted beta score" : `${selected.total_trades}/5 trades required`}</span></article></div></div> : null}

          {detailTab === "configuration" ? <div className={styles.detailBody}><div className={styles.configIntro}><div><span className={styles.eyebrow}>FROZEN STRATEGY VERSION</span><h3>{selected.pair} · Spot Long DCA</h3></div><span className={styles.statusPill}>{statusLabel(selected.status)}</span></div><div className={styles.configGrid}>{[
            ["Base order", money(selected.config.baseOrder)], ["DCA order", money(selected.config.safetyOrder)], ["Max DCA orders", selected.config.maxSafetyOrders], ["Active DCA orders", selected.config.activeSafetyOrders], ["Initial deviation", pct(selected.config.deviation,1,false)], ["Step scale", `${selected.config.stepScale.toFixed(2)}×`], ["Volume scale", `${selected.config.volumeScale.toFixed(2)}×`], ["Take profit", pct(selected.config.takeProfit,1,false)], ["Trailing TP", selected.config.trailingTakeProfit ? `On · ${selected.config.trailingDeviation}%` : "Off"], ["Stop loss", selected.config.stopEnabled ? `${selected.config.stopPct}%` : "Off"], ["Trailing stop", selected.config.trailingStop ? "On" : "Off"], ["Deal cooldown", `${selected.config.cooldownMinutes} min`]
          ].map(([label,value]) => <article key={String(label)}><small>{label}</small><strong>{value}</strong></article>)}</div><div className={styles.configNote}>This configuration is the public record for this bot. Changes are tested by creating a fork, keeping every result attributable to the settings that produced it.</div></div> : null}

          {detailTab === "trades" ? <div className={styles.detailBody}><div className={styles.tradesHead}><strong>Trade history</strong><span>{trades.length} recent deals</span></div><div className={styles.tradeTable}><div className={styles.tradeHeader}><span>Opened</span><span>Avg entry</span><span>Invested</span><span>DCA</span><span>Status / Exit</span><span>PnL</span></div>{trades.length ? trades.map((trade) => <div className={styles.tradeRow} key={trade.id}><span>{new Date(trade.opened_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span><span>{money(trade.avg_entry,4)}</span><span>{money(trade.invested_quote,2)}</span><span>{trade.safety_orders_filled}</span><span>{trade.status === "open" ? "Open" : (trade.exit_reason || "Closed").replaceAll("_"," ")}</span><b className={n(trade.realized_pnl)>=0?styles.goodText:styles.badText}>{trade.status === "open" ? "—" : money(trade.realized_pnl,2)}</b></div>) : <div className={styles.noTrades}>This bot has just entered the Arena. Trades will appear here as the forward test runs.</div>}</div></div> : null}
        </> : <div className={styles.selectPrompt}>Select a bot to inspect its live Arena record.</div>}</aside>
      </div>
    </section>

    <footer className={styles.footer}><div><strong>LabNarrative Bot Arena</strong><span>Forward simulation using virtual funds. Public results are not investment advice and do not represent live-money execution.</span></div><a href="https://app.labnarrative.com">Open LabNarrative Trading →</a></footer>

    <CreateBotModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createBot} busy={busy} />
    {selected ? <CompareModal bot={selected} bots={bots} open={compareOpen} onClose={() => setCompareOpen(false)} /> : null}
    {toast ? <div className={styles.toast}>{toast}</div> : null}
  </main>;
}
