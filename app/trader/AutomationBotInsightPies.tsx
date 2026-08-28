"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./automation-bot-insight-pies.module.css";

type ExitReason = { reason: string; trades: number; pnl: number };
type BotStats = {
  id: string;
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  realizedRoi: number | null;
  exitReasons: ExitReason[];
};
type AnalyticsPayload = { ok?: boolean; automations?: BotStats[]; error?: string };
type Props = { accountId: string; botId: string };

const COLORS = ["#5ee2a0", "#ff7d8a", "#e8b862", "#7ea7ff", "#b98cff", "#61c8d6", "#ec8ccc"];

function donut(parts: Array<{ value: number; color: string }>) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  if (!total) return "conic-gradient(#303030 0deg 360deg)";
  let cursor = 0;
  return `conic-gradient(${parts.map((part) => {
    const start = cursor / total * 360;
    cursor += Math.max(0, part.value);
    return `${part.color} ${start}deg ${cursor / total * 360}deg`;
  }).join(",")})`;
}
function percent(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}
function signedPercent(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export default function AutomationBotInsightPies({ accountId, botId }: Props) {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("trader-analytics", { body: { accountId, range: "all" } });
      if (cancelled) return;
      if (invokeError) {
        setError(invokeError.message || "Unable to load bot analytics.");
        setStats(null);
      } else {
        const payload = (data ?? {}) as AnalyticsPayload;
        const found = (payload.automations ?? []).find((item) => item.id === botId) ?? null;
        if (payload.ok !== true) setError(payload.error || "Unable to load bot analytics.");
        setStats(found);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [accountId, botId]);

  const exits = useMemo(() => {
    if (!stats) return [] as Array<ExitReason & { color: string }>;
    const ordered = [...(stats.exitReasons ?? [])].sort((a, b) => b.trades - a.trades);
    const top = ordered.slice(0, 5).map((item, index) => ({ ...item, color: COLORS[index % COLORS.length] }));
    const remainder = ordered.slice(5);
    if (remainder.length) top.push({ reason: "Other", trades: remainder.reduce((sum, item) => sum + item.trades, 0), pnl: remainder.reduce((sum, item) => sum + item.pnl, 0), color: "#727272" });
    return top;
  }, [stats]);

  if (loading) return <section className={styles.loading}>Loading performance mix…</section>;
  if (error && !stats) return <section className={styles.loading}>{error}</section>;
  if (!stats) return <section className={styles.loading}>No bot performance history yet.</section>;

  const outcomeGradient = donut([
    { value: stats.wins, color: COLORS[0] },
    { value: stats.losses, color: COLORS[1] },
    { value: stats.breakeven, color: "#777" },
  ]);
  const exitGradient = donut(exits.map((item) => ({ value: item.trades, color: item.color })));
  const exitTotal = exits.reduce((sum, item) => sum + item.trades, 0);

  return <section className={styles.grid} aria-label="Bot performance outcome charts">
    <article className={styles.card}>
      <header><small>OUTCOME MIX</small><div><span>Win rate</span><strong>{percent(stats.winRate)}</strong></div></header>
      <div className={styles.body}>
        <div className={styles.donut} style={{ background: outcomeGradient }}><i><b>{stats.closedTrades}</b><span>closed</span></i></div>
        <div className={styles.legend}>
          <p><i style={{ background: COLORS[0] }}/><span>Wins</span><b>{stats.wins}</b></p>
          <p><i style={{ background: COLORS[1] }}/><span>Losses</span><b>{stats.losses}</b></p>
          <p><i style={{ background: "#777" }}/><span>Breakeven</span><b>{stats.breakeven}</b></p>
          <div className={styles.roi}><span>Realized ROI</span><strong className={(stats.realizedRoi ?? 0) >= 0 ? styles.positive : styles.negative}>{signedPercent(stats.realizedRoi)}</strong></div>
        </div>
      </div>
    </article>

    <article className={styles.card}>
      <header><small>EXIT DISTRIBUTION</small></header>
      <div className={styles.body}>
        <div className={styles.donut} style={{ background: exitGradient }}><i><b>{exitTotal}</b><span>exits</span></i></div>
        <div className={styles.legend}>
          {exits.map((item) => <p key={item.reason} title={`${item.reason}: ${item.trades} exits`}><i style={{ background: item.color }}/><span>{item.reason}</span><b>{item.trades}</b></p>)}
          {!exits.length && <p><span>No exits yet</span></p>}
        </div>
      </div>
    </article>
  </section>;
}
