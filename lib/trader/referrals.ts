import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_PENDING_COOKIE = "ln_referral_pending_v1";

export type ReferralLevel = 1 | 2 | 3;
export type BillingInterval = "monthly" | "annual";
export type ReferralSource = "link" | "code" | "strategy" | "bot" | "admin";

export type ReferralProgramConfig = {
  active: boolean;
  currency: string;
  monthly_l1_bps: number;
  monthly_l2_bps: number;
  monthly_l3_bps: number;
  annual_l1_bps: number;
  annual_l2_bps: number;
  annual_l3_bps: number;
  customer_discount_bps: number;
  commission_hold_days: number;
  payout_minimum_cents: number;
};

export const REFERRAL_FALLBACK_CONFIG: ReferralProgramConfig = {
  active: true,
  currency: "USD",
  monthly_l1_bps: 2500,
  monthly_l2_bps: 1500,
  monthly_l3_bps: 1000,
  annual_l1_bps: 3000,
  annual_l2_bps: 1000,
  annual_l3_bps: 500,
  customer_discount_bps: 1000,
  commission_hold_days: 30,
  payout_minimum_cents: 2500,
};

export function normalizeReferralCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export function referralRateBps(config: ReferralProgramConfig, interval: BillingInterval, level: ReferralLevel) {
  return Number(config[`${interval}_l${level}_bps` as keyof ReferralProgramConfig] ?? 0);
}

export function commissionAmountCents(grossAmountCents: number, rateBps: number) {
  return Math.max(0, Math.round(Math.max(0, grossAmountCents) * Math.max(0, rateBps) / 10000));
}

export async function loadReferralProgramConfig(db: SupabaseClient): Promise<ReferralProgramConfig> {
  const { data, error } = await db.from("trader_referral_program_config").select("active,currency,monthly_l1_bps,monthly_l2_bps,monthly_l3_bps,annual_l1_bps,annual_l2_bps,annual_l3_bps,customer_discount_bps,commission_hold_days,payout_minimum_cents").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) return REFERRAL_FALLBACK_CONFIG;
  return {
    active: data.active !== false,
    currency: String(data.currency || "USD"),
    monthly_l1_bps: Number(data.monthly_l1_bps ?? 2500),
    monthly_l2_bps: Number(data.monthly_l2_bps ?? 1500),
    monthly_l3_bps: Number(data.monthly_l3_bps ?? 1000),
    annual_l1_bps: Number(data.annual_l1_bps ?? 3000),
    annual_l2_bps: Number(data.annual_l2_bps ?? 1000),
    annual_l3_bps: Number(data.annual_l3_bps ?? 500),
    customer_discount_bps: Number(data.customer_discount_bps ?? 1000),
    commission_hold_days: Number(data.commission_hold_days ?? 30),
    payout_minimum_cents: Number(data.payout_minimum_cents ?? 2500),
  };
}

function referralCodeForAccount(accountId: string, length = 12) {
  const digest = createHash("sha256").update(`labnarrative-referral:${accountId}`).digest("hex").toUpperCase();
  return `LN${digest.slice(0, length)}`;
}

export async function ensureReferralProfile(db: SupabaseClient, accountId: string) {
  const existing = await db.from("trader_referral_profiles").select("account_id,referral_code,status").eq("account_id", accountId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  for (const length of [12, 16, 24]) {
    const referralCode = referralCodeForAccount(accountId, length);
    const inserted = await db.from("trader_referral_profiles").insert({ account_id: accountId, referral_code: referralCode }).select("account_id,referral_code,status").single();
    if (!inserted.error && inserted.data) return inserted.data;
    if (inserted.error?.code !== "23505") throw inserted.error;

    const retryExisting = await db.from("trader_referral_profiles").select("account_id,referral_code,status").eq("account_id", accountId).maybeSingle();
    if (retryExisting.error) throw retryExisting.error;
    if (retryExisting.data) return retryExisting.data;
  }
  throw new Error("Unable to create a unique referral code.");
}

async function wouldCreateReferralCycle(db: SupabaseClient, referredAccountId: string, prospectiveReferrerId: string) {
  let cursor: string | null = prospectiveReferrerId;
  const visited = new Set<string>();
  for (let depth = 0; depth < 25 && cursor; depth += 1) {
    if (cursor === referredAccountId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const { data, error } = await db.from("trader_referral_attributions").select("referrer_account_id").eq("referred_account_id", cursor).maybeSingle();
    if (error) throw error;
    cursor = data?.referrer_account_id ? String(data.referrer_account_id) : null;
  }
  return false;
}

export type ReferralClaimResult =
  | { ok: true; status: "attributed" | "already_attributed"; referrerAccountId: string; referralCode: string }
  | { ok: false; status: "inactive" | "invalid_code" | "self_referral" | "cycle" | "already_attributed_elsewhere" };

export async function claimReferralCode(db: SupabaseClient, referredAccountId: string, rawCode: unknown, source: ReferralSource = "code"): Promise<ReferralClaimResult> {
  const config = await loadReferralProgramConfig(db);
  if (!config.active) return { ok: false, status: "inactive" };

  const referralCode = normalizeReferralCode(rawCode);
  if (referralCode.length < 4) return { ok: false, status: "invalid_code" };

  const existing = await db.from("trader_referral_attributions").select("referrer_account_id,referral_code").eq("referred_account_id", referredAccountId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (normalizeReferralCode(existing.data.referral_code) === referralCode) {
      return { ok: true, status: "already_attributed", referrerAccountId: String(existing.data.referrer_account_id), referralCode };
    }
    return { ok: false, status: "already_attributed_elsewhere" };
  }

  const profile = await db.from("trader_referral_profiles").select("account_id,referral_code,status").eq("referral_code", referralCode).eq("status", "active").maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return { ok: false, status: "invalid_code" };

  const referrerAccountId = String(profile.data.account_id);
  if (referrerAccountId === referredAccountId) return { ok: false, status: "self_referral" };
  if (await wouldCreateReferralCycle(db, referredAccountId, referrerAccountId)) return { ok: false, status: "cycle" };

  const inserted = await db.from("trader_referral_attributions").insert({
    referred_account_id: referredAccountId,
    referrer_account_id: referrerAccountId,
    referral_code: referralCode,
    source,
  });
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const concurrent = await db.from("trader_referral_attributions").select("referrer_account_id,referral_code").eq("referred_account_id", referredAccountId).maybeSingle();
      if (concurrent.error) throw concurrent.error;
      if (concurrent.data && normalizeReferralCode(concurrent.data.referral_code) === referralCode) {
        return { ok: true, status: "already_attributed", referrerAccountId: String(concurrent.data.referrer_account_id), referralCode };
      }
      return { ok: false, status: "already_attributed_elsewhere" };
    }
    throw inserted.error;
  }

  return { ok: true, status: "attributed", referrerAccountId, referralCode };
}

export async function claimPendingReferral(db: SupabaseClient, accountId: string, request: NextRequest) {
  const code = normalizeReferralCode(request.cookies.get(REFERRAL_PENDING_COOKIE)?.value);
  if (!code) return null;
  return claimReferralCode(db, accountId, code, "link");
}

export type ReferralPaymentInput = {
  referredAccountId: string;
  provider: string;
  externalPaymentId: string;
  billingInterval: BillingInterval;
  grossAmountCents: number;
  currency?: string;
  paidAt?: string | Date;
  metadata?: Record<string, unknown>;
};

export async function createReferralCommissionsForPayment(db: SupabaseClient, input: ReferralPaymentInput) {
  const config = await loadReferralProgramConfig(db);
  if (!config.active || input.grossAmountCents <= 0) return [];

  const paidAt = input.paidAt instanceof Date ? input.paidAt : new Date(input.paidAt ?? Date.now());
  if (!Number.isFinite(paidAt.getTime())) throw new Error("Invalid referral payment timestamp.");
  const holdUntil = new Date(paidAt.getTime() + config.commission_hold_days * 24 * 60 * 60 * 1000).toISOString();
  const rows: Record<string, unknown>[] = [];
  let referredNodeId = input.referredAccountId;

  for (const level of [1, 2, 3] as ReferralLevel[]) {
    const { data: attribution, error } = await db.from("trader_referral_attributions").select("referrer_account_id,referral_code,source").eq("referred_account_id", referredNodeId).maybeSingle();
    if (error) throw error;
    if (!attribution) break;

    const beneficiaryAccountId = String(attribution.referrer_account_id);
    const rateBps = referralRateBps(config, input.billingInterval, level);
    const amountCents = commissionAmountCents(input.grossAmountCents, rateBps);
    if (rateBps > 0 && amountCents > 0) {
      rows.push({
        beneficiary_account_id: beneficiaryAccountId,
        referred_account_id: input.referredAccountId,
        provider: input.provider,
        external_payment_id: input.externalPaymentId,
        billing_interval: input.billingInterval,
        referral_level: level,
        gross_amount_cents: Math.round(input.grossAmountCents),
        rate_bps: rateBps,
        commission_amount_cents: amountCents,
        currency: input.currency || config.currency,
        status: "pending",
        hold_until: holdUntil,
        metadata: {
          ...(input.metadata ?? {}),
          referral_code: attribution.referral_code,
          referral_source: attribution.source,
        },
      });
    }
    referredNodeId = beneficiaryAccountId;
  }

  if (!rows.length) return [];
  const { data, error } = await db.from("trader_referral_commissions").upsert(rows, {
    onConflict: "provider,external_payment_id,beneficiary_account_id,referral_level",
    ignoreDuplicates: true,
  }).select("*");
  if (error) throw error;
  return data ?? [];
}

export async function releaseMaturedReferralCommissions(db: SupabaseClient, now = new Date()) {
  const timestamp = now.toISOString();
  const { data, error } = await db.from("trader_referral_commissions").update({ status: "available", available_at: timestamp }).eq("status", "pending").lte("hold_until", timestamp).select("id");
  if (error) throw error;
  return data ?? [];
}

export async function reverseReferralCommissionsForPayment(db: SupabaseClient, provider: string, externalPaymentId: string) {
  const reversedAt = new Date().toISOString();
  const { data, error } = await db.from("trader_referral_commissions").update({ status: "reversed", reversed_at: reversedAt }).eq("provider", provider).eq("external_payment_id", externalPaymentId).in("status", ["pending", "available"]).select("id");
  if (error) throw error;
  return data ?? [];
}
