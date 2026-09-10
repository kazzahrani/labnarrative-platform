import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const symbolFor = (pair: string) => pair.replace("/", "");

async function priceFor(pair: string) {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbolFor(pair))}`);
  if (!r.ok) throw new Error(`market_price_${r.status}`);
  const data = await r.json();
  const price = num(data?.price);
  if (!(price > 0)) throw new Error("invalid_market_price");
  return price;
}

function cumulativeDeviation(base: number, stepScale: number, safetyIndex: number) {
  let total = 0;
  for (let i = 0; i < safetyIndex; i++) total += base * Math.pow(stepScale, i);
  return total;
}

async function refreshStats(bot: any, equity: number, maxDrawdownPct: number) {
  const { data: closed } = await db
    .from("arena_trades")
    .select("realized_pnl")
    .eq("bot_id", bot.id)
    .eq("status", "closed");

  const values = (closed || []).map((r: any) => num(r.realized_pnl));
  const total = values.length;
  const wins = values.filter((v) => v > 0).length;
  const losses = values.filter((v) => v < 0).length;
  const grossProfit = values.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(values.filter((v) => v < 0).reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : null;
  const returnPct = ((equity - num(bot.starting_capital, 10000)) / num(bot.starting_capital, 10000)) * 100;
  const rawScore = total >= 5
    ? 50 + returnPct * 1.4 - maxDrawdownPct * 1.6 + (pf == null ? 0 : clamp((pf - 1) * 8, -10, 18))
    : null;

  return {
    total,
    wins,
    losses,
    pf,
    returnPct,
    lnScore: rawScore == null ? null : clamp(rawScore, 0, 100),
    realizedPnl: values.reduce((a, b) => a + b, 0),
  };
}

async function snapshot(botId: string, equity: number, cash: number, positionValue: number, returnPct: number) {
  const minute = new Date().getUTCMinutes();
  if (minute % 5 !== 0) return;
  await db.from("arena_equity_snapshots").insert({
    bot_id: botId,
    equity,
    cash,
    position_value: positionValue,
    return_pct: returnPct,
  });
}

async function closeTrade(
  bot: any,
  trade: any,
  price: number,
  reason: string,
  peakEquity: number,
  maxDrawdownPct: number,
) {
  const qty = num(trade.quantity);
  const invested = num(trade.invested_quote);
  const proceeds = qty * price;
  const realized = proceeds - invested;
  const cashAfter = num(bot.cash_balance) + proceeds;
  const equity = cashAfter;
  const peak = Math.max(peakEquity, equity);
  const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
  const maxDd = Math.max(maxDrawdownPct, dd);

  await db.from("arena_trades").update({
    status: "closed",
    closed_at: new Date().toISOString(),
    exit_price: price,
    realized_pnl: realized,
    exit_reason: reason,
  }).eq("id", trade.id);

  await db.from("arena_fills").insert({
    bot_id: bot.id,
    trade_id: trade.id,
    fill_type: "exit",
    price,
    quantity: qty,
    quote_value: proceeds,
  });

  const stats = await refreshStats(bot, equity, maxDd);
  await db.from("arena_bots").update({
    cash_balance: cashAfter,
    current_equity: equity,
    current_position_value: 0,
    peak_equity: peak,
    realized_pnl: stats.realizedPnl,
    return_pct: stats.returnPct,
    max_drawdown_pct: maxDd,
    profit_factor: stats.pf,
    ln_score: stats.lnScore,
    total_trades: stats.total,
    wins: stats.wins,
    losses: stats.losses,
    last_price: price,
    last_tick_at: new Date().toISOString(),
    last_trade_closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", bot.id);

  await snapshot(bot.id, equity, cashAfter, 0, stats.returnPct);
}

async function processBot(bot: any, price: number) {
  const cfg = bot.config || {};
  const baseOrder = num(cfg.baseOrder, 100);
  const safetyOrder = num(cfg.safetyOrder, 100);
  const maxSafety = Math.max(0, Math.floor(num(cfg.maxSafetyOrders, 5)));
  const deviation = num(cfg.deviation, 1);
  const stepScale = num(cfg.stepScale, 1.2);
  const volumeScale = num(cfg.volumeScale, 1.2);
  const tp = num(cfg.takeProfit, 1.5);
  const trailingTP = Boolean(cfg.trailingTakeProfit);
  const trailingDeviation = num(cfg.trailingDeviation, 0.3);
  const stopEnabled = Boolean(cfg.stopEnabled);
  const stopPct = num(cfg.stopPct, 15);
  const trailingStop = Boolean(cfg.trailingStop);
  const cooldown = Math.max(0, Math.floor(num(cfg.cooldownMinutes, 5)));

  const { data: openTrade } = await db
    .from("arena_trades")
    .select("*")
    .eq("bot_id", bot.id)
    .eq("status", "open")
    .maybeSingle();

  const now = Date.now();
  let cash = num(bot.cash_balance, 10000);
  let peakEquity = Math.max(num(bot.peak_equity, 10000), num(bot.current_equity, 10000));
  let maxDd = num(bot.max_drawdown_pct, 0);

  if (!openTrade) {
    const lastClosed = bot.last_trade_closed_at ? new Date(bot.last_trade_closed_at).getTime() : 0;
    if (lastClosed && now - lastClosed < cooldown * 60_000) {
      await db.from("arena_bots").update({
        last_price: price,
        last_tick_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", bot.id);
      return;
    }

    if (cash < baseOrder) {
      await db.from("arena_bots").update({
        status: "paused",
        last_price: price,
        last_tick_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", bot.id);
      return;
    }

    const qty = baseOrder / price;
    const { data: created, error } = await db.from("arena_trades").insert({
      bot_id: bot.id,
      first_entry_price: price,
      avg_entry: price,
      quantity: qty,
      invested_quote: baseOrder,
      stop_peak: price,
    }).select("*").single();
    if (error || !created) return;

    await db.from("arena_fills").insert({
      bot_id: bot.id,
      trade_id: created.id,
      fill_type: "base",
      price,
      quantity: qty,
      quote_value: baseOrder,
    });

    cash -= baseOrder;
    const positionValue = qty * price;
    const equity = cash + positionValue;
    peakEquity = Math.max(peakEquity, equity);
    const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    maxDd = Math.max(maxDd, dd);
    const returnPct = ((equity - num(bot.starting_capital, 10000)) / num(bot.starting_capital, 10000)) * 100;

    await db.from("arena_bots").update({
      cash_balance: cash,
      current_position_value: positionValue,
      current_equity: equity,
      peak_equity: peakEquity,
      max_drawdown_pct: maxDd,
      return_pct: returnPct,
      last_price: price,
      last_tick_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", bot.id);

    await snapshot(bot.id, equity, cash, positionValue, returnPct);
    return;
  }

  let trade = { ...openTrade };
  let qty = num(trade.quantity);
  let invested = num(trade.invested_quote);
  let filled = Math.max(0, Math.floor(num(trade.safety_orders_filled, 0)));

  while (filled < maxSafety) {
    const nextIndex = filled + 1;
    const threshold = num(trade.first_entry_price) *
      (1 - cumulativeDeviation(deviation, stepScale, nextIndex) / 100);
    if (price > threshold) break;

    const orderQuote = safetyOrder * Math.pow(volumeScale, nextIndex - 1);
    if (cash < orderQuote) break;

    const addQty = orderQuote / price;
    qty += addQty;
    invested += orderQuote;
    cash -= orderQuote;
    filled = nextIndex;
    const avg = invested / qty;

    await db.from("arena_fills").insert({
      bot_id: bot.id,
      trade_id: trade.id,
      fill_type: "safety",
      safety_index: nextIndex,
      price,
      quantity: addQty,
      quote_value: orderQuote,
    });

    await db.from("arena_trades").update({
      quantity: qty,
      invested_quote: invested,
      avg_entry: avg,
      safety_orders_filled: filled,
    }).eq("id", trade.id);

    trade.quantity = qty;
    trade.invested_quote = invested;
    trade.avg_entry = avg;
    trade.safety_orders_filled = filled;
  }

  const avg = num(trade.avg_entry);
  const stopPeak = Math.max(num(trade.stop_peak, avg), price);
  let trailingPeak = trade.trailing_peak == null ? null : num(trade.trailing_peak);
  let trailingActive = Boolean(trade.trailing_tp_active);

  if (stopEnabled) {
    const stopBase = trailingStop ? stopPeak : avg;
    const stopLevel = stopBase * (1 - stopPct / 100);
    if (price <= stopLevel) {
      return await closeTrade(
        { ...bot, cash_balance: cash },
        trade,
        price,
        trailingStop ? "trailing_stop" : "stop_loss",
        peakEquity,
        maxDd,
      );
    }
  }

  const tpTrigger = avg * (1 + tp / 100);
  if (!trailingTP && price >= tpTrigger) {
    return await closeTrade({ ...bot, cash_balance: cash }, trade, price, "take_profit", peakEquity, maxDd);
  }

  if (trailingTP) {
    if (!trailingActive && price >= tpTrigger) {
      trailingActive = true;
      trailingPeak = price;
    }
    if (trailingActive) {
      trailingPeak = Math.max(trailingPeak || price, price);
      if (price <= trailingPeak * (1 - trailingDeviation / 100)) {
        return await closeTrade(
          { ...bot, cash_balance: cash },
          trade,
          price,
          "trailing_take_profit",
          peakEquity,
          maxDd,
        );
      }
    }
  }

  await db.from("arena_trades").update({
    stop_peak: stopPeak,
    trailing_tp_active: trailingActive,
    trailing_peak: trailingPeak,
  }).eq("id", trade.id);

  const positionValue = qty * price;
  const equity = cash + positionValue;
  peakEquity = Math.max(peakEquity, equity);
  const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
  maxDd = Math.max(maxDd, dd);
  const stats = await refreshStats(bot, equity, maxDd);

  await db.from("arena_bots").update({
    cash_balance: cash,
    current_position_value: positionValue,
    current_equity: equity,
    peak_equity: peakEquity,
    max_drawdown_pct: maxDd,
    return_pct: stats.returnPct,
    realized_pnl: stats.realizedPnl,
    profit_factor: stats.pf,
    ln_score: stats.lnScore,
    total_trades: stats.total,
    wins: stats.wins,
    losses: stats.losses,
    last_price: price,
    last_tick_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", bot.id);

  await snapshot(bot.id, equity, cash, positionValue, stats.returnPct);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const supplied = req.headers.get("x-arena-worker") || "";
  const { data: settings } = await db
    .from("arena_runtime_settings")
    .select("worker_token")
    .eq("id", true)
    .maybeSingle();

  if (!settings?.worker_token || supplied !== settings.worker_token) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const { data: bots, error } = await db
    .from("arena_bots")
    .select("*")
    .eq("status", "running")
    .limit(250);

  if (error) return json({ ok: false, error: error.message }, 500);

  const uniquePairs = [...new Set((bots || []).map((b: any) => b.pair))];
  const prices = new Map<string, number>();
  await Promise.all(uniquePairs.map(async (pair) => {
    try {
      prices.set(pair, await priceFor(pair));
    } catch {
      // A market that cannot be priced skips this tick without stopping other bots.
    }
  }));

  let processed = 0;
  for (const bot of bots || []) {
    const price = prices.get(bot.pair);
    if (!price) continue;
    try {
      await processBot(bot, price);
      processed++;
    } catch (error) {
      console.error("arena bot tick", bot.id, error);
    }
  }

  return json({ ok: true, processed, pairs: prices.size, at: new Date().toISOString() });
});
