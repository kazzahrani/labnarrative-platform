"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";

type Props = {
  tradeId: string;
  fallback: number;
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

export default function TradeInvestedValue({ tradeId, fallback }: Props) {
  const [value, setValue] = useState(Number(fallback || 0));

  useEffect(() => {
    let alive = true;
    setValue(Number(fallback || 0));

    const refresh = async () => {
      const { data, error } = await browserSupabase.rpc("trader_trade_total_invested", { p_trade_client_id: tradeId });
      if (!alive || error) return;
      const next = Number(data);
      if (Number.isFinite(next)) setValue((current) => Math.max(current, next));
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [tradeId]);

  return <>{money(value)}</>;
}
