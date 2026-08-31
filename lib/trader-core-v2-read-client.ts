"use client";

import { browserSupabase } from "./supabase-browser";
import type { CoreV2TakeProfitTarget } from "./trader-core-v2-command-client";

export type CoreV2Position = {
  tradeId: string;
  clientId: string | null;
  publicTradeNo: number | null;
  botId: string | null;
  botName: string;
  pair: string;
  provider: string;
  executionMode: string;
  status: string;
  averagePrice: number;
  quantity: number;
  remainingCostBasis: number;
  lastPrice: number | null;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  realizedPnl: number;
  completedDcaOrders: number;
  maxDcaOrders: number;
  activeDcaLimit: number;
  activeDcaOrders: number;
  stopEnabled: boolean;
  stopPct: number;
  takeProfitTargets: CoreV2TakeProfitTarget[];
  takeProfitFilled: unknown[];
  exitStrategyV2: boolean;
  openedAt: string;
  updatedAt: string;
};

export type CoreV2PositionsResponse = {
  ok: true;
  ready: true;
  accountId: string;
  ageMs: number;
  summary: {
    count: number;
    costBasis: number;
    marketValue: number;
    unrealizedPnl: number;
    providerCounts: Record<string, number>;
  };
  positions: CoreV2Position[];
};

export type CoreV2CommandCapability = {
  gateEnabled: boolean;
  available: boolean;
  reason: string | null;
  sendsOrder: boolean;
};

export type CoreV2CapabilitiesResponse = {
  ok: true;
  ready: true;
  account: { id: string; name: string; mode: string; status: string };
  execution: {
    liveExecutionReady: boolean;
    globalLiveEnabled: boolean;
    killSwitch: boolean;
    liveConfirmedAt: string | null;
    liveGeneration: number | null;
  };
  commands: {
    "position.update_exit_plan": CoreV2CommandCapability;
  };
};

type RawPosition = Record<string, unknown>;

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTargets(value: unknown): CoreV2TakeProfitTarget[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => row && typeof row === "object" ? row as Record<string, unknown> : {})
    .map((row) => ({ profitPct: n(row.profitPct), allocationPct: n(row.allocationPct) }))
    .filter((row) => row.profitPct > 0 && row.allocationPct > 0);
}

async function invokeRead<T>(functionName: string): Promise<T> {
  const { data, error } = await browserSupabase.functions.invoke(functionName, { body: {} });
  if (error) {
    let message = error.message || `${functionName}_failed`;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as { ok?: boolean; error?: string } & T;
  if (result.error || result.ok !== true) throw new Error(result.error || `${functionName}_failed`);
  return result as T;
}

export async function loadCoreV2Positions(): Promise<CoreV2PositionsResponse> {
  const raw = await invokeRead<{
    ok: true;
    ready: true;
    accountId: string;
    ageMs: number;
    summary: CoreV2PositionsResponse["summary"];
    positions: RawPosition[];
  }>("trader-v2-positions-read");

  return {
    ...raw,
    positions: (raw.positions ?? []).map((row) => ({
      tradeId: String(row.trade_id || ""),
      clientId: row.client_id ? String(row.client_id) : null,
      publicTradeNo: nullableNumber(row.public_trade_no),
      botId: row.bot_id ? String(row.bot_id) : null,
      botName: String(row.bot_name || "DCA Bot"),
      pair: String(row.pair || ""),
      provider: String(row.provider || "unknown"),
      executionMode: String(row.execution_mode || ""),
      status: String(row.status || ""),
      averagePrice: n(row.average_price),
      quantity: n(row.quantity),
      remainingCostBasis: n(row.remaining_cost_basis),
      lastPrice: nullableNumber(row.last_price),
      marketValue: n(row.market_value),
      unrealizedPnl: n(row.unrealized_pnl),
      unrealizedPct: n(row.unrealized_pct),
      realizedPnl: n(row.realized_pnl),
      completedDcaOrders: n(row.completed_dca_orders),
      maxDcaOrders: n(row.max_dca_orders),
      activeDcaLimit: n(row.active_dca_limit),
      activeDcaOrders: n(row.active_dca_orders),
      stopEnabled: row.stop_enabled === true,
      stopPct: n(row.stop_pct),
      takeProfitTargets: normalizeTargets(row.take_profit_targets),
      takeProfitFilled: Array.isArray(row.take_profit_filled) ? row.take_profit_filled : [],
      exitStrategyV2: row.exit_strategy_v2 === true,
      openedAt: String(row.opened_at || ""),
      updatedAt: String(row.updated_at || ""),
    })),
  };
}

export async function loadCoreV2CommandCapabilities(): Promise<CoreV2CapabilitiesResponse> {
  return invokeRead<CoreV2CapabilitiesResponse>("trader-v2-command-capabilities");
}

export async function loadCoreV2ExitPlanState() {
  const [positions, capabilities] = await Promise.all([
    loadCoreV2Positions(),
    loadCoreV2CommandCapabilities(),
  ]);
  if (positions.accountId !== capabilities.account.id) throw new Error("core_v2_account_mismatch");
  return { positions, capabilities };
}
