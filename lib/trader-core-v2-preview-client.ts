"use client";

import { browserSupabase } from "./supabase-browser";
import type { CoreV2TakeProfitTarget } from "./trader-core-v2-command-client";

export type CoreV2ExitPlanPreviewInput = {
  positionId: string;
  stopEnabled: boolean;
  stopPct: number;
  takeProfitTargets: CoreV2TakeProfitTarget[];
};

export type CoreV2ExitPlanPreviewResponse = {
  ok: true;
  ready: true;
  preview: {
    accountId: string;
    target: {
      type: "position";
      id: string;
      clientId: string | null;
      pair: string;
      provider: string;
      executionMode: string;
    };
    current: {
      stopEnabled: boolean;
      stopPct: number;
      takeProfitTargets: CoreV2TakeProfitTarget[];
    };
    requested: {
      stopEnabled: boolean;
      stopPct: number;
      takeProfitTargets: CoreV2TakeProfitTarget[];
    };
    changes: {
      stopEnabled: boolean;
      stopPct: boolean;
      takeProfitTargets: boolean;
    };
    hasChanges: boolean;
    executeReady: boolean;
    blockers: string[];
    safeguards: {
      authenticatedOwner: boolean;
      activeLivePosition: boolean;
      exitStrategyV2: boolean;
      liveExecutionReady: boolean;
      gateEnabled: boolean;
      exchangeReady: boolean;
      noCommandEnqueued: true;
      noOrderSent: true;
      noPositionMutation: true;
    };
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function previewCoreV2ExitPlan(input: CoreV2ExitPlanPreviewInput): Promise<CoreV2ExitPlanPreviewResponse> {
  if (!UUID_PATTERN.test(input.positionId)) throw new Error("core_v2_position_uuid_required");
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-exit-plan-preview", {
    body: {
      positionId: input.positionId,
      stopEnabled: input.stopEnabled,
      stopPct: Number(input.stopPct) || 0,
      takeProfitTargets: input.takeProfitTargets,
    },
  });
  if (error) throw new Error(await functionError(error, "exit_plan_preview_failed"));
  const result = (data ?? {}) as Partial<CoreV2ExitPlanPreviewResponse> & { error?: string };
  if (result.error || result.ok !== true || !result.preview?.target?.id) {
    throw new Error(result.error || "exit_plan_preview_failed");
  }
  return result as CoreV2ExitPlanPreviewResponse;
}
