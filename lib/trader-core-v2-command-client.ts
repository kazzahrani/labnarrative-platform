"use client";

import { browserSupabase } from "./supabase-browser";

export type CoreV2TakeProfitTarget = {
  profitPct: number;
  allocationPct: number;
};

export type CoreV2ExitPlanInput = {
  /** Database trader_trades.id / Core V2 positions-read trade_id. Never pass the legacy client trade id. */
  positionId: string;
  stopEnabled: boolean;
  stopPct: number;
  takeProfitTargets?: CoreV2TakeProfitTarget[];
  idempotencyKey?: string;
};

export type CoreV2ExitPlanCommand = {
  id: string;
  status: string;
  mode: string;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  requested_at?: string;
  validated_at?: string | null;
  finished_at?: string | null;
  attempt_count?: number;
};

export type CoreV2ExitPlanResponse = {
  ok: true;
  command: CoreV2ExitPlanCommand;
  replayed: boolean;
  dispatchRequested: boolean;
  message?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Client-side rollout switch only. The database per-account command gate is the authoritative safety barrier.
 * This defaults OFF when the environment variable is absent.
 */
export const CORE_V2_EXIT_PLAN_CLIENT_ENABLED =
  process.env.NEXT_PUBLIC_TRADER_CORE_V2_EXIT_PLAN_WRITE === "1";

function makeIdempotencyKey(positionId: string) {
  const nonce = globalThis.crypto?.randomUUID?.();
  if (!nonce) throw new Error("core_v2_secure_random_unavailable");
  return `exit-plan:${positionId}:${nonce}`;
}

async function functionError(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const typed = error as { message?: string; context?: Response };
  let message = typed.message || fallback;
  if (typed.context) {
    try {
      const payload = await typed.context.clone().json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {}
  }
  return message;
}

export async function submitCoreV2ExitPlan(input: CoreV2ExitPlanInput): Promise<CoreV2ExitPlanResponse> {
  if (!CORE_V2_EXIT_PLAN_CLIENT_ENABLED) throw new Error("core_v2_exit_plan_client_disabled");
  if (!UUID_PATTERN.test(input.positionId)) throw new Error("core_v2_position_uuid_required");
  if (input.stopEnabled && !(Number(input.stopPct) > 0)) throw new Error("invalid_stop_loss");

  const idempotencyKey = input.idempotencyKey?.trim() || makeIdempotencyKey(input.positionId);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error("invalid_idempotency_key");

  const body: Record<string, unknown> = {
    positionId: input.positionId,
    idempotencyKey,
    stopEnabled: input.stopEnabled,
    stopPct: Number(input.stopPct) || 0,
  };
  if (input.takeProfitTargets !== undefined) body.takeProfitTargets = input.takeProfitTargets;

  const { data, error } = await browserSupabase.functions.invoke("trader-v2-exit-plan-submit", { body });
  if (error) throw new Error(await functionError(error, "exit_plan_submit_failed"));

  const result = (data ?? {}) as Partial<CoreV2ExitPlanResponse> & { error?: string };
  if (result.error || result.ok !== true || !result.command?.id) {
    throw new Error(result.error || "exit_plan_submit_failed");
  }
  return result as CoreV2ExitPlanResponse;
}
