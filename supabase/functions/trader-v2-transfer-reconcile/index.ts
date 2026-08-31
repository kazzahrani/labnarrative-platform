import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { LaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { fetchExchangeTransferHistory, type NormalizedTransferMovement } from "../_shared/trader-v2-transfer-history.ts";

const SUPPORTED: LaunchExchangeProvider[] = ["binance", "bybit", "okx", "kucoin"];
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60_000 - 60_000;
const FALLBACK_MAX_DELTA_MS = 6 * 60 * 60_000;
const FALLBACK_CONFIDENCE = 0.92;
const USD_STABLES = new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI"]);
type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
type ProviderResult = { provider: LaunchExchangeProvider; ok: boolean; imported: number; durationMs: number; error?: string };
type LedgerRow = {
  id: string;
  event_key: string;
  event_type: string;
  provider: string | null;
  counterparty_provider: string | null;
  asset: string;
  quantity_delta: number | string;
  fee_asset: string | null;
  fee_quantity: number | string;
  usd_value: number | string | null;
  occurred_at: string;
  external_id: string | null;
  transfer_group_id: string | null;
  metadata: Json;
};

type Match = { withdrawal: LedgerRow; deposit: LedgerRow; confidence: number; reason: "txid" | "amount_time_network"; matchKey: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function text(value: unknown) { return String(value ?? "").trim(); }
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function clean(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message.slice(0, 400);
}
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function normTx(value: unknown) { return text(value).toLowerCase().replace(/^0x/, ""); }
function normNetwork(value: unknown) {
  const raw = text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return "";
  if (["TRX", "TRON", "TRC20"].some((token) => raw.includes(token))) return "TRX";
  if (["ETH", "ETHEREUM", "ERC20"].some((token) => raw.includes(token))) return "ETH";
  if (["BSC", "BEP20", "BNBSMARTCHAIN"].some((token) => raw.includes(token))) return "BSC";
  if (["SOL", "SOLANA"].some((token) => raw.includes(token))) return "SOL";
  if (["ARB", "ARBITRUM", "ARBITRUMONE"].some((token) => raw.includes(token))) return "ARB";
  if (["OP", "OPTIMISM"].some((token) => raw.includes(token))) return "OP";
  if (["POLYGON", "MATIC"].some((token) => raw.includes(token))) return "POLYGON";
  if (raw.includes("BASE")) return "BASE";
  return raw.slice(0, 40);
}
function approx(a: number, b: number) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) <= Math.max(1e-10, scale * 0.001);
}
async function verify(db: Db, value: string) {
  if (!value) return false;
  const { data, error } = await db.from("trader_worker_secrets").select("secret").eq("name", "paper_worker").maybeSingle();
  return !error && data?.secret === value;
}

async function connectedProviders(db: Db, accountId: string) {
  const connected = new Set<LaunchExchangeProvider>();
  const [{ data: binance, error: binanceError }, { data: rows, error: otherError }] = await Promise.all([
    db.from("trader_binance_connections").select("status,environment,permission_read").eq("account_id", accountId).maybeSingle(),
    db.from("trader_exchange_connections").select("provider,status,environment,permission_read").eq("account_id", accountId),
  ]);
  if (binanceError) throw binanceError;
  if (otherError) throw otherError;
  if (binance?.status === "connected" && binance.environment === "mainnet" && binance.permission_read === true) connected.add("binance");
  for (const row of rows ?? []) {
    const provider = text(row.provider).toLowerCase();
    if (row.status === "connected" && row.environment === "mainnet" && row.permission_read === true && (SUPPORTED as string[]).includes(provider)) {
      connected.add(provider as LaunchExchangeProvider);
    }
  }
  return SUPPORTED.filter((provider) => connected.has(provider));
}

async function priceMap(db: Db, assets: string[]) {
  const map = new Map<string, number>();
  for (const asset of USD_STABLES) map.set(asset, 1);
  const needed = unique(assets.map((asset) => asset.toUpperCase()).filter((asset) => !USD_STABLES.has(asset)));
  if (!needed.length) return map;
  const { data, error } = await db.from("trader_v2_asset_price_latest").select("asset,price_usd").eq("quote_asset", "USDT").in("asset", needed);
  if (error) throw error;
  for (const row of data ?? []) {
    const price = n(row.price_usd);
    if (price > 0) map.set(text(row.asset).toUpperCase(), price);
  }
  return map;
}

async function importProvider(db: Db, accountId: string, provider: LaunchExchangeProvider, startMs: number, endMs: number): Promise<ProviderResult> {
  const started = Date.now();
  const { data: run, error: runError } = await db.from("trader_v2_sync_runs").insert({
    account_id: accountId,
    provider,
    sync_kind: "transfers",
    status: "running",
    metadata: { shadow: true, windowStart: new Date(startMs).toISOString(), windowEnd: new Date(endMs).toISOString() },
  }).select("id").single();
  if (runError || !run) return { provider, ok: false, imported: 0, durationMs: Date.now() - started, error: clean(runError || "sync_run_insert_failed") };

  try {
    const movements = await fetchExchangeTransferHistory(db, accountId, provider, startMs, endMs);
    const prices = await priceMap(db, movements.map((movement) => movement.asset));
    if (movements.length) {
      const rows = movements.map((movement: NormalizedTransferMovement) => {
        const signedQty = movement.direction === "deposit" ? movement.amount : -movement.sourceDebit;
        const price = prices.get(movement.asset) ?? 0;
        return {
          account_id: accountId,
          event_key: movement.eventKey,
          event_type: movement.direction,
          provider,
          asset: movement.asset,
          quantity_delta: signedQty,
          fee_asset: movement.feeAsset,
          fee_quantity: movement.fee,
          usd_value: price > 0 ? signedQty * price : null,
          occurred_at: movement.occurredAt,
          external_id: movement.externalId,
          source: "exchange_history",
          metadata: {
            ...movement.metadata,
            shadow: true,
            txId: movement.txId,
            network: movement.network,
            sentAmount: movement.amount,
            sourceDebit: movement.sourceDebit,
            completedAt: movement.completedAt,
          },
        };
      });
      const { error: ledgerError } = await db.from("trader_v2_ledger_entries").upsert(rows, { onConflict: "account_id,event_key" });
      if (ledgerError) throw ledgerError;
    }
    const durationMs = Date.now() - started;
    await db.from("trader_v2_sync_runs").update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      asset_count: movements.length,
      error_code: null,
      metadata: { shadow: true, imported: movements.length, windowStart: new Date(startMs).toISOString(), windowEnd: new Date(endMs).toISOString() },
    }).eq("id", run.id);
    return { provider, ok: true, imported: movements.length, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = clean(error);
    await db.from("trader_v2_sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), duration_ms: durationMs, error_code: message }).eq("id", run.id);
    return { provider, ok: false, imported: 0, durationMs, error: message };
  }
}

function metadataValue(row: LedgerRow, key: string) { return obj(row.metadata)[key]; }
function sentAmount(row: LedgerRow) { return Math.max(0, n(metadataValue(row, "sentAmount"), Math.abs(n(row.quantity_delta)))); }
function rowTx(row: LedgerRow) { return normTx(metadataValue(row, "txId")); }
function rowNetwork(row: LedgerRow) { return normNetwork(metadataValue(row, "network")); }

function findMatches(rows: LedgerRow[]) {
  const withdrawals = rows.filter((row) => row.event_type === "withdrawal" && !row.transfer_group_id && row.provider).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const deposits = rows.filter((row) => row.event_type === "deposit" && !row.transfer_group_id && row.provider).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const usedDeposits = new Set<string>();
  const matches: Match[] = [];

  // Primary: exact blockchain transaction ID across two different connected providers.
  for (const withdrawal of withdrawals) {
    const tx = rowTx(withdrawal);
    if (!tx) continue;
    const candidates = deposits.filter((deposit) => !usedDeposits.has(deposit.id)
      && deposit.provider !== withdrawal.provider
      && deposit.asset === withdrawal.asset
      && rowTx(deposit) === tx);
    if (candidates.length !== 1) continue;
    const deposit = candidates[0];
    usedDeposits.add(deposit.id);
    matches.push({ withdrawal, deposit, confidence: 1, reason: "txid", matchKey: `tx:${withdrawal.asset}:${tx}` });
  }

  const alreadyMatchedWithdrawals = new Set(matches.map((match) => match.withdrawal.id));
  // Fallback: same asset + normalized network + near-identical sent/received amount + <=6h.
  // It is accepted only when exactly one candidate exists, keeping confidence above 0.90.
  for (const withdrawal of withdrawals) {
    if (alreadyMatchedWithdrawals.has(withdrawal.id)) continue;
    const network = rowNetwork(withdrawal);
    if (!network) continue;
    const sent = sentAmount(withdrawal);
    if (!(sent > 0)) continue;
    const withdrawAt = Date.parse(withdrawal.occurred_at);
    const candidates = deposits.filter((deposit) => {
      if (usedDeposits.has(deposit.id) || deposit.provider === withdrawal.provider || deposit.asset !== withdrawal.asset) return false;
      if (rowNetwork(deposit) !== network) return false;
      const depositAt = Date.parse(deposit.occurred_at);
      const delta = depositAt - withdrawAt;
      if (!Number.isFinite(delta) || delta < -10 * 60_000 || delta > FALLBACK_MAX_DELTA_MS) return false;
      return approx(sent, Math.max(0, n(deposit.quantity_delta)));
    });
    if (candidates.length !== 1) continue;
    const deposit = candidates[0];
    usedDeposits.add(deposit.id);
    matches.push({
      withdrawal,
      deposit,
      confidence: FALLBACK_CONFIDENCE,
      reason: "amount_time_network",
      matchKey: `pair:${withdrawal.event_key}|${deposit.event_key}`,
    });
  }
  return matches;
}

async function persistMatch(db: Db, accountId: string, match: Match) {
  const gross = Math.abs(n(match.withdrawal.quantity_delta));
  const net = Math.max(0, n(match.deposit.quantity_delta));
  if (!(gross > 0) || !(net > 0)) return false;
  const fee = Math.max(0, gross - net);
  const tx = rowTx(match.withdrawal) || rowTx(match.deposit) || null;

  const { data: existing, error: existingError } = await db.from("trader_v2_internal_transfers")
    .select("id")
    .eq("account_id", accountId)
    .eq("match_key", match.matchKey)
    .maybeSingle();
  if (existingError) throw existingError;

  let transferId = existing?.id ? String(existing.id) : "";
  if (!transferId) {
    const { data: inserted, error: insertError } = await db.from("trader_v2_internal_transfers").insert({
      account_id: accountId,
      match_key: match.matchKey,
      source_provider: match.withdrawal.provider,
      destination_provider: match.deposit.provider,
      asset: match.withdrawal.asset,
      gross_quantity: gross,
      fee_quantity: fee,
      net_quantity: net,
      withdrawal_external_id: match.withdrawal.external_id,
      deposit_external_id: match.deposit.external_id,
      initiated_at: match.withdrawal.occurred_at,
      completed_at: match.deposit.occurred_at,
      status: "matched",
      confidence: match.confidence,
      metadata: { shadow: true, reason: match.reason, txId: tx, sourceEventKey: match.withdrawal.event_key, destinationEventKey: match.deposit.event_key },
    }).select("id").single();
    if (insertError || !inserted) throw insertError || new Error("internal_transfer_insert_failed");
    transferId = String(inserted.id);
  }

  const [{ error: withdrawalError }, { error: depositError }] = await Promise.all([
    db.from("trader_v2_ledger_entries").update({ transfer_group_id: transferId, counterparty_provider: match.deposit.provider }).eq("id", match.withdrawal.id).is("transfer_group_id", null),
    db.from("trader_v2_ledger_entries").update({ transfer_group_id: transferId, counterparty_provider: match.withdrawal.provider }).eq("id", match.deposit.id).is("transfer_group_id", null),
  ]);
  if (withdrawalError) throw withdrawalError;
  if (depositError) throw depositError;
  return true;
}

async function reconcileAccount(db: Db, accountId: string) {
  const providers = await connectedProviders(db, accountId);
  const endMs = Date.now();
  const startMs = endMs - HISTORY_WINDOW_MS;
  const providerResults = await Promise.all(providers.map((provider) => importProvider(db, accountId, provider, startMs, endMs)));
  const imported = providerResults.reduce((sum, result) => sum + result.imported, 0);

  const { data: ledger, error: ledgerError } = await db.from("trader_v2_ledger_entries")
    .select("id,event_key,event_type,provider,counterparty_provider,asset,quantity_delta,fee_asset,fee_quantity,usd_value,occurred_at,external_id,transfer_group_id,metadata")
    .eq("account_id", accountId)
    .eq("source", "exchange_history")
    .gte("occurred_at", new Date(startMs).toISOString())
    .in("event_type", ["deposit", "withdrawal"])
    .order("occurred_at", { ascending: true });
  if (ledgerError) throw ledgerError;

  const matches = findMatches((ledger ?? []) as LedgerRow[]);
  let matched = 0;
  for (const match of matches) if (await persistMatch(db, accountId, match)) matched += 1;
  const failedProviders = providerResults.filter((result) => !result.ok);
  return {
    accountId,
    shadow: true,
    providers,
    providerResults,
    imported,
    matched,
    status: failedProviders.length ? (failedProviders.length === providerResults.length ? "failed" : "partial") : "succeeded",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_configuration_missing" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const secret = text(req.headers.get("x-trader-worker-secret"));
  if (!await verify(db, secret)) return json({ error: "unauthorized" }, 401);

  const { data: accounts, error } = await db.from("trader_accounts").select("id").eq("account_kind", "real").eq("status", "active").eq("mode", "live");
  if (error) return json({ error: clean(error) }, 500);

  const results = [];
  for (const row of accounts ?? []) {
    const accountId = String(row.id);
    const lockId = crypto.randomUUID();
    let claimed = false;
    let releaseStatus = "failed", imported = 0, matched = 0, releaseError: string | null = null;
    try {
      const { data: ok, error: claimError } = await db.rpc("trader_v2_claim_transfer_sync", { p_account_id: accountId, p_lock_id: lockId, p_lease_seconds: 120 });
      if (claimError) throw claimError;
      if (ok !== true) {
        results.push({ ok: true, accountId, skipped: true, reason: "transfer_sync_already_running" });
        continue;
      }
      claimed = true;
      const result = await reconcileAccount(db, accountId);
      releaseStatus = result.status;
      imported = result.imported;
      matched = result.matched;
      releaseError = result.providerResults.filter((provider) => !provider.ok).map((provider) => `${provider.provider}:${provider.error || "failed"}`).join(" | ") || null;
      results.push({ ok: result.status !== "failed", ...result });
    } catch (error) {
      releaseError = clean(error);
      results.push({ ok: false, accountId, error: releaseError });
    } finally {
      if (claimed) {
        const { error: releaseRpcError } = await db.rpc("trader_v2_release_transfer_sync", {
          p_account_id: accountId,
          p_lock_id: lockId,
          p_status: releaseStatus,
          p_imported_count: imported,
          p_matched_count: matched,
          p_error: releaseError,
        });
        if (releaseRpcError) console.error("transfer_sync_release_failed", clean(releaseRpcError));
      }
    }
  }
  return json({ ok: true, shadow: true, results });
});
