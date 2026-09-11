const SUPABASE_FUNCTION_URL = "https://tksxauosaswshylbaayf.supabase.co/functions/v1/paper-bot-share";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tqhr6-YB7dXxdcogjPVAiw_RVlSYbZt";

type SharedTrade = {
  status?: string | null;
  realized_pnl?: number | string | null;
  opened_at?: string | null;
  closed_at?: string | null;
};

export type SharedBotPayload = {
  ok: boolean;
  share?: { slug?: string; sharedAt?: string; views?: number; clones?: number };
  bot?: {
    name?: string;
    status?: string;
    strategyType?: string;
    market?: string;
    pairs?: string[];
    allPairs?: boolean;
    createdAt?: string | null;
  };
  trades?: SharedTrade[];
  message?: string;
};

export type SharedBotSummary = {
  name: string;
  status: string;
  pairCount: number;
  marketLabel: string;
  closedTrades: number;
  winners: number;
  losers: number;
  breakeven: number;
  realizedPnl: number;
  maxRealizedDrawdown: number;
  startedAt: string | null;
};

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchSharedBot(slug: string): Promise<SharedBotPayload | null> {
  if (!slug) return null;
  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "get", slug, countView: false }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as SharedBotPayload;
    return payload?.ok ? payload : null;
  } catch {
    return null;
  }
}

export function summarizeSharedBot(payload: SharedBotPayload | null): SharedBotSummary {
  const bot = payload?.bot;
  const trades = Array.isArray(payload?.trades) ? payload!.trades! : [];
  const closed = trades
    .filter((trade) => String(trade.status || "").toLowerCase() === "closed")
    .sort((a, b) => Date.parse(a.closed_at || "") - Date.parse(b.closed_at || ""));

  let realizedPnl = 0;
  let winners = 0;
  let losers = 0;
  let breakeven = 0;
  let cumulative = 0;
  let peak = 0;
  let maxRealizedDrawdown = 0;

  for (const trade of closed) {
    const pnl = number(trade.realized_pnl);
    realizedPnl += pnl;
    if (pnl > 0) winners += 1;
    else if (pnl < 0) losers += 1;
    else breakeven += 1;
    cumulative += pnl;
    peak = Math.max(peak, cumulative);
    maxRealizedDrawdown = Math.max(maxRealizedDrawdown, peak - cumulative);
  }

  const pairs = Array.isArray(bot?.pairs) ? bot!.pairs! : [];
  const firstTrade = trades
    .map((trade) => trade.opened_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null;
  const startedAt = bot?.createdAt || firstTrade || null;
  const pairCount = pairs.length;
  const marketLabel = bot?.allPairs
    ? "All USDT Spot pairs"
    : pairCount === 1
      ? pairs[0]
      : pairCount > 1
        ? `${pairCount} USDT Spot pairs`
        : "USDT Spot";

  return {
    name: String(bot?.name || "Public Paper Bot"),
    status: String(bot?.status || "unknown"),
    pairCount,
    marketLabel,
    closedTrades: closed.length,
    winners,
    losers,
    breakeven,
    realizedPnl,
    maxRealizedDrawdown,
    startedAt,
  };
}

export function signedMoney(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}
