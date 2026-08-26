"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trade-level-bar.module.css";

type ActiveOrder = {
  id: string;
  kind: string;
  side: string;
  status: string;
  sequence: number;
  price: number | null;
  amount: number;
};
type SnapshotTrade = {
  takeProfitPrice?: number | null;
  takeProfitTargets?: Array<{ index: number; profitPct: number; allocationPct: number; price: number }>;
  stopLossPrice?: number | null;
  stopLossTimeoutSeconds?: number;
};
type Snapshot = {
  ok?: boolean;
  trade?: SnapshotTrade;
  activeOrders?: ActiveOrder[];
  error?: string;
};
type Props = {
  accountId: string;
  tradeId: string;
  averagePrice: number;
  livePrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  active: boolean;
};
type MarkerKind = "sl" | "dca" | "avg" | "live" | "tp";
type Marker = {
  key: string;
  kind: MarkerKind;
  label: string;
  price: number;
  amount?: number;
};

function finitePositive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function priceLabel(value: number) {
  const digits = value >= 1000 ? 2 : value >= 100 ? 3 : value >= 1 ? 4 : value >= .1 ? 5 : value >= .01 ? 6 : 8;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
async function exactSnapshot(accountId: string, tradeId: string) {
  const { data, error } = await browserSupabase.functions.invoke("trader-chart-control", { body: { accountId, tradeId } });
  if (error) throw error;
  const result = (data ?? {}) as Snapshot;
  if (result.ok !== true || result.error) throw new Error(result.error || "trade_levels_failed");
  return result;
}

export default function TradeLevelBar({ accountId, tradeId, averagePrice, livePrice, stopLossPrice, takeProfitPrice, active }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({});

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await exactSnapshot(accountId, tradeId);
        if (alive) setSnapshot(next);
      } catch {
        // Keep the last exact ledger snapshot. The workspace's live price keeps moving independently.
      }
    };
    void refresh();
    if (!active) return () => { alive = false; };
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [accountId, tradeId, active]);

  const { markers, avgPosition, livePosition } = useMemo(() => {
    const orders = snapshot.activeOrders ?? [];
    const exactTrade = snapshot.trade;
    const activeDcas = orders
      .filter((order) => order.side.toUpperCase() === "BUY" && order.kind.toLowerCase().includes("averag") && finitePositive(order.price) != null)
      .sort((a, b) => a.sequence - b.sequence);
    const activeTps = orders
      .filter((order) => order.side.toUpperCase() === "SELL" && finitePositive(order.price) != null && (order.kind.toLowerCase().includes("take") || order.kind.toLowerCase().includes("profit")))
      .sort((a, b) => a.sequence - b.sequence);
    const configuredTps = (exactTrade?.takeProfitTargets ?? [])
      .filter((target) => finitePositive(target.price) != null)
      .sort((a, b) => a.index - b.index);

    const raw: Marker[] = [];
    const sl = finitePositive(exactTrade?.stopLossPrice) ?? finitePositive(stopLossPrice);
    const avg = finitePositive(averagePrice);
    const live = finitePositive(livePrice);
    if (sl) raw.push({ key: "sl", kind: "sl", label: "SL", price: sl });
    activeDcas.forEach((order, index) => raw.push({ key: `dca-${order.id}`, kind: "dca", label: `D${order.sequence || index + 1}`, price: Number(order.price), amount: order.amount }));
    if (avg) raw.push({ key: "avg", kind: "avg", label: "AVG", price: avg });
    if (live) raw.push({ key: "live", kind: "live", label: active ? "NOW" : "EXIT", price: live });
    if (activeTps.length) {
      activeTps.forEach((order, index) => raw.push({ key: `tp-${order.id}`, kind: "tp", label: activeTps.length > 1 ? `T${index + 1}` : "TP", price: Number(order.price), amount: order.amount }));
    } else if (configuredTps.length) {
      configuredTps.forEach((target) => raw.push({ key: `tp-config-${target.index}`, kind: "tp", label: configuredTps.length > 1 ? `T${target.index}` : "TP", price: target.price }));
    } else {
      const tp = finitePositive(exactTrade?.takeProfitPrice) ?? finitePositive(takeProfitPrice);
      if (tp) raw.push({ key: "tp-derived", kind: "tp", label: "TP", price: tp });
    }

    const prices = raw.map((marker) => marker.price);
    const fallback = avg || live || 1;
    let min = prices.length ? Math.min(...prices) : fallback * .98;
    let max = prices.length ? Math.max(...prices) : fallback * 1.02;
    if (max <= min) { min = fallback * .99; max = fallback * 1.01; }
    const span = Math.max(max - min, fallback * .002, 1e-12);
    min -= span * .08;
    max += span * .08;
    const position = (price: number) => Math.max(2, Math.min(98, (price - min) / (max - min) * 100));
    const plotted = raw.map((marker) => ({ ...marker, position: position(marker.price) }));
    return {
      markers: plotted,
      avgPosition: avg ? position(avg) : 50,
      livePosition: live ? position(live) : avg ? position(avg) : 50,
    };
  }, [snapshot, averagePrice, livePrice, stopLossPrice, takeProfitPrice, active]);

  const positive = livePosition >= avgPosition;
  const fillLeft = Math.min(avgPosition, livePosition);
  const fillWidth = Math.max(1.5, Math.abs(livePosition - avgPosition));

  return <div className={styles.wrap} aria-label="Live trade levels">
    <div className={styles.track}>
      <span className={`${styles.pnlFill} ${positive ? styles.positive : styles.negative}`} style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}/>
      {markers.map((marker, index) => <span
        key={marker.key}
        className={`${styles.marker} ${styles[marker.kind]} ${index % 2 ? styles.lower : styles.upper}`}
        style={{ left: `${marker.position}%` }}
        title={`${marker.label} ${priceLabel(marker.price)}${marker.amount ? ` · $${marker.amount.toFixed(2)}` : ""}`}
      ><i/><em>{marker.label}</em></span>)}
    </div>
  </div>;
}
