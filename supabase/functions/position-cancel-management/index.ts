import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ACTIVE = ["open", "submitted", "partially_filled", "unknown"];
const TERMINAL = new Set(["filled", "cancelled", "rejected"]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function getEnvKeySet(name: string): string {
  const raw = Deno.env.get(name);
  if (!raw) throw new Error(`Missing ${name}`);
  const parsed = JSON.parse(raw);
  if (!parsed?.default) throw new Error(`Missing default key in ${name}`);
  return String(parsed.default);
}
async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { message: text.slice(0, 500) }; }
}
function n(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function compact(pair: string) { return pair.replace("/", ""); }
function dashed(pair: string) { return pair.replace("/", "-"); }
async function currentMarketPrice(provider: string, pair: string) {
  if (provider === "binance") {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(compact(pair))}`, { signal: AbortSignal.timeout(7000) });
    const body = await readJsonSafe(res); const price = n(body?.price);
    if (!res.ok || !(price > 0)) throw new Error("binance_mark_unavailable");
    return price;
  }
  if (provider === "bybit") {
    const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(compact(pair))}`, { signal: AbortSignal.timeout(7000) });
    const body = await readJsonSafe(res); const price = n(body?.result?.list?.[0]?.lastPrice);
    if (!res.ok || body?.retCode !== 0 || !(price > 0)) throw new Error("bybit_mark_unavailable");
    return price;
  }
  if (provider === "okx") {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(dashed(pair))}`, { signal: AbortSignal.timeout(7000) });
    const body = await readJsonSafe(res); const price = n(body?.data?.[0]?.last);
    if (!res.ok || body?.code !== "0" || !(price > 0)) throw new Error("okx_mark_unavailable");
    return price;
  }
  if (provider === "kucoin") {
    const res = await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${encodeURIComponent(dashed(pair))}`, { signal: AbortSignal.timeout(7000) });
    const body = await readJsonSafe(res); const price = n(body?.data?.price);
    if (!res.ok || body?.code !== "200000" || !(price > 0)) throw new Error("kucoin_mark_unavailable");
    return price;
  }
  if (provider === "kraken") {
    const [base, quote] = pair.split("/");
    const krakenBase = base === "BTC" ? "XBT" : base;
    const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(`${krakenBase}${quote}`)}`, { signal: AbortSignal.timeout(7000) });
    const body = await readJsonSafe(res);
    const first = body?.result && typeof body.result === "object" ? Object.values(body.result)[0] as any : null;
    const price = n(first?.c?.[0]);
    if (!res.ok || (Array.isArray(body?.error) && body.error.length) || !(price > 0)) throw new Error("kraken_mark_unavailable");
    return price;
  }
  throw new Error("provider_mark_unavailable");
}
function friendlyDb(message: string) {
  if (message.includes("live_unmanage_order_in_progress")) return "Another live entry/exit order is still being reconciled. Wait for it to finish, then cancel management.";
  if (message.includes("live_unmanage_position_not_filled")) return "This position has not finished opening yet. Wait for the entry fill before cancelling management.";
  if (message.includes("live_unmanage_trade_not_active")) return "This position is no longer active.";
  if (message.includes("live_unmanage_orders_still_active")) return "One or more exchange DCA orders are still being cancelled. Retry Cancel trade in a moment; no sell order has been sent.";
  return message.replaceAll("_", " ");
}

async function reconcile(url: string, secret: string, workerKey: string, orderId: string) {
  try {
    await fetch(`${url}/functions/v1/live-order-reconciler`, {
      method: "POST",
      headers: { apikey: secret, "Content-Type": "application/json", "x-ln-worker-key": workerKey },
      body: JSON.stringify({ orderId }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {}
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = getEnvKeySet("SUPABASE_PUBLISHABLE_KEYS");
    const secretKey = getEnvKeySet("SUPABASE_SECRET_KEYS");
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: authHeader },
    });
    const user = await readJsonSafe(authRes);
    if (!authRes.ok || !user?.id) return json({ ok: false, error: "unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const tradeId = String(payload?.tradeId ?? "");
    if (!tradeId) return json({ ok: false, error: "trade_id_required", message: "Trade is required." }, 400);

    const service = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: trade, error: tradeError } = await service.from("trading_trades")
      .select("id,user_id,connection_id,execution_mode,status,pair,quantity,invested_quote,strategy_snapshot,exchange_provider,last_price")
      .eq("id", tradeId).eq("user_id", String(user.id)).maybeSingle();
    if (tradeError || !trade) return json({ ok: false, error: "trade_not_found", message: "Trade not found." }, 404);
    if (trade.execution_mode !== "live") return json({ ok: false, error: "not_live_trade", message: "This action is for real positions only." }, 400);
    if (trade.status === "closed" && trade.strategy_snapshot?.holdingUnmanaged === true) {
      return json({ ok: true, alreadyUnmanaged: true, tradeId, message: "This holding is already unmanaged. No sell order was sent." });
    }

    const { data: begun, error: beginError } = await service.rpc("begin_live_position_unmanage", {
      p_user_id: String(user.id), p_trade_id: tradeId,
    });
    if (beginError) return json({ ok: false, error: "cancel_management_blocked", message: friendlyDb(beginError.message || "cancel_management_blocked"), noSellOrderSent: true }, 200);

    const { data: workerKey, error: keyError } = await service.rpc("get_live_router_worker_key");
    if (keyError || !workerKey) {
      return json({ ok: false, error: "worker_key_unavailable", managementPaused: true, noSellOrderSent: true, message: "Position management is paused safely, but the exchange DCA cancellation service is temporarily unavailable. Retry Cancel trade; no sell order was sent." }, 200);
    }

    const { data: orders, error: orderError } = await service.from("trading_orders")
      .select("id,status,kind,order_type,external_order_id,sequence_no")
      .eq("trade_id", tradeId).eq("execution_mode", "live")
      .in("status", ACTIVE)
      .order("sequence_no", { ascending: true, nullsFirst: false });
    if (orderError) throw orderError;

    const failures: { orderId: string; status: string | null; error: string | null }[] = [];
    for (const initial of orders || []) {
      let current: any = initial;
      if (TERMINAL.has(String(current.status))) continue;
      if (current.kind !== "averaging" || current.order_type !== "limit" || !current.external_order_id) {
        failures.push({ orderId: String(current.id), status: String(current.status || ""), error: "order_not_safe_to_cancel_here" });
        continue;
      }

      const routeRes = await fetch(`${supabaseUrl}/functions/v1/live-order-router`, {
        method: "POST",
        headers: { apikey: publishableKey, "Content-Type": "application/json", "x-ln-worker-key": String(workerKey) },
        body: JSON.stringify({ action: "cancel", orderId: current.id }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      const routeBody = routeRes ? await readJsonSafe(routeRes) : { error: "cancel_request_failed" };

      await new Promise((resolve) => setTimeout(resolve, 220));
      for (let i = 0; i < 2; i++) {
        await reconcile(supabaseUrl, publishableKey, String(workerKey), String(current.id));
        const { data: row } = await service.from("trading_orders").select("id,status").eq("id", current.id).maybeSingle();
        if (row) current = { ...current, ...row };
        if (TERMINAL.has(String(current.status))) break;
        if (i === 0) await new Promise((resolve) => setTimeout(resolve, 350));
      }

      if (!TERMINAL.has(String(current.status))) {
        failures.push({
          orderId: String(current.id),
          status: String(current.status || ""),
          error: String(routeBody?.message || routeBody?.error || (routeRes ? `cancel_http_${routeRes.status}` : "cancel_request_failed")),
        });
      }
    }

    if (failures.length) {
      return json({
        ok: false,
        error: "dca_cancellation_incomplete",
        managementPaused: true,
        noSellOrderSent: true,
        failures,
        message: "LabNarrative has paused TP/SL/DCA management, but one or more exchange DCA orders are still being cancelled. Retry Cancel trade in a moment. The asset has not been sold.",
      }, 200);
    }

    // Performance accounting: crystallize this managed position at the freshest
    // obtainable market mark before LabNarrative releases management. If the
    // public quote is temporarily unavailable, preserve the last verifiable mark.
    let performanceMark = n(trade.last_price);
    try { performanceMark = await currentMarketPrice(String(trade.exchange_provider || ""), String(trade.pair || "")); } catch {}
    if (performanceMark > 0) {
      await service.from("trading_trades").update({ last_price: performanceMark, updated_at: new Date().toISOString() }).eq("id", tradeId).eq("user_id", String(user.id));
      const performanceResult = await service.rpc("performance_crystallize_trade_if_open_internal", {
        p_user_id: String(user.id),
        p_trade_id: tradeId,
        p_mark_price: performanceMark,
        p_closing_reason: "management_cancelled",
      });
      if (performanceResult.error) console.error("performance_cancel_crystallization", performanceResult.error.message);
    }

    const { data: finalized, error: finalizeError } = await service.rpc("finalize_live_position_unmanage", {
      p_user_id: String(user.id), p_trade_id: tradeId,
    });
    if (finalizeError) {
      return json({ ok: false, error: "cancel_management_finalize_failed", managementPaused: true, noSellOrderSent: true, message: friendlyDb(finalizeError.message || "cancel_management_finalize_failed") }, 200);
    }

    return json({
      ok: true,
      tradeId,
      result: finalized,
      noSellOrderSent: true,
      holdingUnmanaged: true,
      message: `${trade.pair} management cancelled. No SELL order was sent. The asset remains in your exchange account as an unmanaged holding.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected cancel management error";
    console.error(message);
    return json({ ok: false, error: "cancel_management_failed", message, noSellOrderSent: true }, 500);
  }
});
