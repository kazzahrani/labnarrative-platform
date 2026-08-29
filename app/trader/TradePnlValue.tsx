"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trade-pnl-value.module.css";

type Props = {
  tradeId: string;
  pnl: number;
  active: boolean;
};

function money(value: number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function pct(value: number) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

export default function TradePnlValue({ tradeId, pnl, active }: Props) {
  const [lifetimeInvested, setLifetimeInvested] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { data, error } = await browserSupabase.rpc("trader_trade_total_invested", { p_trade_client_id: tradeId });
      if (!alive || error) return;
      const next = Number(data);
      if (Number.isFinite(next) && next > 0) setLifetimeInvested(next);
    };

    void refresh();
    if (!active) return () => { alive = false; };
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [tradeId, active]);

  const percentage = lifetimeInvested && lifetimeInvested > 0 ? Number(pnl || 0) / lifetimeInvested * 100 : null;
  return <span className={styles.value}><span className={styles.amount}>{money(pnl)}</span><strong className={styles.percent}>{percentage == null ? "—" : pct(percentage)}</strong></span>;
}
