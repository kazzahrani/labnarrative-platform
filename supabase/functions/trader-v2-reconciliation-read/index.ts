import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;

type SyncHealth = {
  provider?: string;
  syncKind?: string;
  succeeded1h?: number;
  failed1h?: number;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
};

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://app.labnarrative.com"
    || origin === "https://platform.labnarrative.com"
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://app.labnarrative.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return arr(value).map((row) => String(row || "").trim()).filter(Boolean);
}

function clean(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return String(error || "unknown_error");
}

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("account_kind", "real")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return String(data.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(req, { error: "server_configuration_missing" }, 500);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(req, { error: "unauthorized" }, 401);

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);

  try {
    const accountId = await realAccount(db, userData.user.id);
    const { data: row, error } = await db.from("trader_v2_reconciliation_health_latest")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return json(req, { ok: true, shadow: true, readOnly: true, ready: false, message: "v2_reconciliation_pending" });

    const capturedAt = String(row.captured_at || "");
    const capturedMs = Date.parse(capturedAt);
    const ageMs = Number.isFinite(capturedMs) ? Math.max(0, Date.now() - capturedMs) : Number.MAX_SAFE_INTEGER;
    const exchangeTotalUsd = n(row.exchange_total_usd);
    const inTransitUsd = n(row.in_transit_usd);
    const accountingTotalUsd = n(row.accounting_total_usd);
    const equationErrorUsd = Math.abs(accountingTotalUsd - exchangeTotalUsd - inTransitUsd);

    const firstSnapshotMs = Date.parse(String(row.first_snapshot_at || ""));
    const lastSnapshotMs = Date.parse(String(row.last_snapshot_at || ""));
    const evidenceHours = Number.isFinite(firstSnapshotMs) && Number.isFinite(lastSnapshotMs)
      ? Math.max(0, (lastSnapshotMs - firstSnapshotMs) / 3_600_000)
      : 0;

    const transferCompletedMs = Date.parse(String(row.transfer_sync_completed_at || ""));
    const transferSyncAgeMs = Number.isFinite(transferCompletedMs)
      ? Math.max(0, Date.now() - transferCompletedMs)
      : Number.MAX_SAFE_INTEGER;
    const transferSyncStatus = String(row.transfer_sync_status || "never");
    const transferSyncLastError = row.transfer_sync_last_error ? String(row.transfer_sync_last_error) : null;
    const transferCycleHealthy = transferSyncStatus === "succeeded"
      || (transferSyncStatus === "running" && transferSyncAgeMs <= 180_000 && !transferSyncLastError);

    const syncState = obj(row.sync_state);
    const unsupportedProviders = strings(syncState.unsupportedProviders);
    const unpricedAssets = strings(syncState.unpricedAssets);
    const syncHealth = arr(row.sync_health) as SyncHealth[];
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (ageMs > 90_000) blockers.push("portfolio_snapshot_stale");
    if (n(row.stale_provider_count) > 0 || n(row.fresh_provider_count) < n(row.connected_provider_count)) blockers.push("provider_snapshot_stale");
    if (n(row.unsupported_provider_count) > 0) blockers.push("unsupported_connected_provider");
    if (n(row.unpriced_asset_count) > 0) blockers.push("unpriced_assets");
    if (n(row.transfer_invariant_error_count) > 0 || n(row.max_transfer_invariant_error) > 0.00000001) blockers.push("transfer_invariant_error");
    if (equationErrorUsd > 0.01) blockers.push("portfolio_equation_error");
    if (!transferCycleHealthy) blockers.push("transfer_sync_not_healthy");
    if (transferSyncAgeMs > 180_000) blockers.push("transfer_sync_stale");
    if (evidenceHours < 24) blockers.push("insufficient_shadow_history");

    for (const health of syncHealth) {
      const failed = n(health.failed1h);
      const succeeded = n(health.succeeded1h);
      if (failed > 0) warnings.push(`${health.provider || "unknown"}.${health.syncKind || "sync"}:recent_failures:${failed}/${failed + succeeded}`);
    }
    if (inTransitUsd > 0) warnings.push("internal_transfer_in_transit");

    const providers = arr(row.provider_totals).map((raw) => {
      const provider = obj(raw);
      return {
        provider: String(provider.provider || "unknown"),
        totalUsd: n(provider.totalUsd),
        cashUsd: n(provider.cashUsd),
        assetCount: n(provider.assetCount),
        sourceAt: provider.sourceAt || null,
        fresh: provider.fresh === true,
        syncDurationMs: provider.syncDurationMs == null ? null : n(provider.syncDurationMs),
        syncError: provider.syncError || null,
      };
    });

    return json(req, {
      ok: true,
      shadow: true,
      readOnly: true,
      ready: true,
      accountId,
      ageMs,
      portfolio: {
        capturedAt,
        exchangeTotalUsd,
        inTransitUsd,
        accountingTotalUsd,
        equationErrorUsd,
        cashUsd: n(row.cash_usd),
        holdingsUsd: n(row.holdings_usd),
        connectedProviderCount: n(row.connected_provider_count),
        freshProviderCount: n(row.fresh_provider_count),
        staleProviderCount: n(row.stale_provider_count),
        unsupportedProviderCount: n(row.unsupported_provider_count),
        unpricedAssetCount: n(row.unpriced_asset_count),
        providers,
        unsupportedProviders,
        unpricedAssets,
        inTransitCount: arr(row.in_transit_items).length,
      },
      transfers: {
        matchedCount: n(row.matched_transfer_count),
        invariantErrorCount: n(row.transfer_invariant_error_count),
        maxInvariantError: n(row.max_transfer_invariant_error),
        syncStatus: transferSyncStatus,
        syncHealthy: transferCycleHealthy,
        syncStartedAt: row.transfer_sync_started_at || null,
        syncCompletedAt: row.transfer_sync_completed_at || null,
        syncAgeMs: transferSyncAgeMs,
        lastImportedCount: n(row.transfer_sync_imported_count),
        lastMatchedCount: n(row.transfer_sync_matched_count),
        lastError: transferSyncLastError,
      },
      evidence: {
        snapshotCount: n(row.snapshot_count),
        firstSnapshotAt: row.first_snapshot_at || null,
        lastSnapshotAt: row.last_snapshot_at || null,
        hours: Math.round(evidenceHours * 100) / 100,
        minimumRecommendedHours: 24,
      },
      syncHealth,
      cutoverAssessment: {
        ready: blockers.length === 0,
        blockers,
        warnings,
      },
    });
  } catch (error) {
    const code = clean(error);
    if (code === "real_account_required") return json(req, { error: code }, 403);
    console.error("trader-v2-reconciliation-read", code);
    return json(req, { error: "trader_v2_reconciliation_read_failed" }, 500);
  }
});
