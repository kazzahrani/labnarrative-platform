"use client";

import styles from "./trade-row-meta-v2.module.css";

type Props = {
  tradeId: string;
  averagingFilled: number;
  activeOrdersLimit: number;
  maxAveraging: number;
  openedAt: string;
  closedAt: string | null;
  active: boolean;
};

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function duration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  if (!Number.isFinite(ms)) return "—";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function TradeRowMetaV2({ tradeId, averagingFilled, activeOrdersLimit, maxAveraging, openedAt, closedAt, active }: Props) {
  const completed = Math.max(0, Math.round(averagingFilled || 0));
  const max = Math.max(completed, Math.round(maxAveraging || 0));
  const remaining = Math.max(0, max - completed);
  const activeOrders = active ? Math.min(remaining, Math.max(0, Math.round(activeOrdersLimit || 0))) : 0;
  return <div className={styles.meta}>
    <div className={styles.dcaLine}><span>DCA</span><b>Completed: {completed}</b><b>Active: {activeOrders}</b><b>Max: {max}</b></div>
    <div className={styles.tradeLine}><span>ID: <b>{tradeId}</b></span><span>Start: <b>{dateTime(openedAt)}</b></span>{!active && <><span>End: <b>{dateTime(closedAt)}</b></span><span>Duration: <b>{duration(openedAt, closedAt)}</b></span></>}</div>
  </div>;
}
