import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_PENDING_COOKIE = "ln_referral_pending_v1";
export const REFERRAL_SIGN_IN_REQUIRED = "referral_sign_in_required";

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
  annual_l2_bps: 1500,
  annual_l3_bps: 1000,
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

export function commissionAmountCents(gross: number, rate: number) {
  return Math.max(0, Math.round(Math.max(0, gross) * Math.max(0, rate) / 10000));
}

export async function loadReferralProgramConfig(db: SupabaseClient): Promise<ReferralProgramConfig> {
  const result: any = await db
    .from("trader_referral_program_config")
    .select("active,currency,monthly_l1_bps,monthly_l2_bps,monthly_l3_bps,annual_l1_bps,annual_l2_bps,annual_l3_bps,customer_discount_bps,commission_hold_days,payout_minimum_cents")
    .eq("id", 1)
    .maybeSingle();
  if (result.error) throw result.error;
  const data: any = result.data;
  if (!data) return REFERRAL_FALLBACK_CONFIG;
  return {
    active: data.active !== false,
    currency: String(data.currency || "USD"),
    monthly_l1_bps: Number(data.monthly_l1_bps ?? 2500),
    monthly_l2_bps: Number(data.monthly_l2_bps ?? 1500),
    monthly_l3_bps: Number(data.monthly_l3_bps ?? 1000),
    annual_l1_bps: Number(data.annual_l1_bps ?? 3000),
    annual_l2_bps: Number(data.annual_l2_bps ?? 1500),
    annual_l3_bps: Number(data.annual_l3_bps ?? 1000),
    customer_discount_bps: Number(data.customer_discount_bps ?? 1000),
    commission_hold_days: Number(data.commission_hold_days ?? 30),
    payout_minimum_cents: Number(data.payout_minimum_cents ?? 2500),
  };
}

async function accountOwnerUserId(db: SupabaseClient, accountId: string) {
  const result: any = await db.from("trader_accounts").select("owner_user_id").eq("id", accountId).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.owner_user_id ? String(result.data.owner_user_id) : null;
}

function referralCodeForOwner(owner: string, length = 12) {
  return `LN${createHash("sha256").update(`labnarrative-referral:${owner}`).digest("hex").toUpperCase().slice(0, length)}`;
}

export async function ensureReferralProfile(db: SupabaseClient, accountId: string) {
  const owner = await accountOwnerUserId(db, accountId);
  if (!owner) throw new Error(REFERRAL_SIGN_IN_REQUIRED);

  const existing: any = await db
    .from("trader_referral_profiles")
    .select("account_id,owner_user_id,referral_code,status")
    .eq("owner_user_id", owner)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  for (const length of [12, 16, 24]) {
    const inserted: any = await db
      .from("trader_referral_profiles")
      .insert({ account_id: accountId, owner_user_id: owner, referral_code: referralCodeForOwner(owner, length) })
      .select("account_id,owner_user_id,referral_code,status")
      .single();
    if (!inserted.error && inserted.data) return inserted.data;
    if (inserted.error?.code !== "23505") throw inserted.error;
  }
  throw new Error("Unable to create a unique referral code.");
}

async function wouldCreateOwnerCycle(db: SupabaseClient, referred: string, referrer: string) {
  let cursor: string | null = referrer;
  const visited = new Set<string>();
  for (let depth = 0; depth < 25 && cursor; depth += 1) {
    if (cursor === referred || visited.has(cursor)) return true;
    visited.add(cursor);
    const queryResult: any = await db
      .from("trader_referral_attributions")
      .select("referrer_owner_user_id")
      .eq("referred_owner_user_id", cursor)
      .maybeSingle();
    if (queryResult.error) throw queryResult.error;
    const nextOwnerUserId: unknown = queryResult.data?.referrer_owner_user_id;
    cursor = nextOwnerUserId ? String(nextOwnerUserId) : null;
  }
  return false;
}

export async function bindReferralAttributionToOwner(db: SupabaseClient, accountId: string) {
  const owner = await accountOwnerUserId(db, accountId);
  if (!owner) return null;

  const result: any = await db
    .from("trader_referral_attributions")
    .select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at")
    .eq("referred_account_id", accountId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  if (String(result.data.referred_owner_user_id ?? "") === owner) return result.data;

  const refOwner = result.data.referrer_owner_user_id ? String(result.data.referrer_owner_user_id) : null;
  if (refOwner === owner || (refOwner && await wouldCreateOwnerCycle(db, owner, refOwner))) {
    const removed: any = await db.from("trader_referral_attributions").delete().eq("referred_account_id", accountId);
    if (removed.error) throw removed.error;
    return null;
  }

  const existing: any = await db
    .from("trader_referral_attributions")
    .select("referred_account_id")
    .eq("referred_owner_user_id", owner)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && String(existing.data.referred_account_id) !== accountId) {
    const removed: any = await db.from("trader_referral_attributions").delete().eq("referred_account_id", accountId);
    if (removed.error) throw removed.error;
    return existing.data;
  }

  const updated: any = await db
    .from("trader_referral_attributions")
    .update({ referred_owner_user_id: owner })
    .eq("referred_account_id", accountId)
    .select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at")
    .single();
  if (updated.error) throw updated.error;
  return updated.data;
}

export async function claimReferralCode(db: SupabaseClient, accountId: string, raw: unknown, source: ReferralSource = "link") {
  const code = normalizeReferralCode(raw);
  if (!code) return { ok: false as const, status: "invalid_code" as const };

  const owner = await accountOwnerUserId(db, accountId);
  if (!owner) return { ok: false as const, status: REFERRAL_SIGN_IN_REQUIRED };

  const existing: any = await db
    .from("trader_referral_attributions")
    .select("referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at")
    .eq("referred_owner_user_id", owner)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { ok: true as const, status: "already_attributed" as const, ...existing.data };

  const profile: any = await db
    .from("trader_referral_profiles")
    .select("account_id,owner_user_id,referral_code,status")
    .eq("referral_code", code)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return { ok: false as const, status: "invalid_code" as const };
  if (profile.data.status !== "active") return { ok: false as const, status: "inactive" as const };

  const refAccount = String(profile.data.account_id);
  const refOwner = profile.data.owner_user_id ? String(profile.data.owner_user_id) : await accountOwnerUserId(db, refAccount);
  if (!refOwner || refOwner === owner) return { ok: false as const, status: "self_referral" as const };
  if (await wouldCreateOwnerCycle(db, owner, refOwner)) return { ok: false as const, status: "cycle" as const };

  const inserted: any = await db
    .from("trader_referral_attributions")
    .insert({
      referred_account_id: accountId,
      referrer_account_id: refAccount,
      referred_owner_user_id: owner,
      referrer_owner_user_id: refOwner,
      referral_code: code,
      source,
    })
    .select("referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at")
    .single();
  if (inserted.error) throw inserted.error;
  return { ok: true as const, status: "attributed" as const, ...inserted.data };
}

export async function claimPendingReferral(db: SupabaseClient, accountId: string, request: NextRequest) {
  const raw = request.cookies.get(REFERRAL_PENDING_COOKIE)?.value;
  if (!raw) return null;
  return claimReferralCode(db, accountId, raw, "link");
}

export async function referralUpline(db: SupabaseClient, accountId: string) {
  const owner = await accountOwnerUserId(db, accountId);
  if (!owner) return [];

  const chain: Array<{ level: ReferralLevel; accountId: string; ownerUserId: string }> = [];
  let cursor: string | null = owner;
  for (let level = 1 as ReferralLevel; level <= 3 && cursor; level = (level + 1) as ReferralLevel) {
    const result: any = await db
      .from("trader_referral_attributions")
      .select("referrer_account_id,referrer_owner_user_id")
      .eq("referred_owner_user_id", cursor)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data?.referrer_account_id || !result.data?.referrer_owner_user_id) break;
    chain.push({
      level,
      accountId: String(result.data.referrer_account_id),
      ownerUserId: String(result.data.referrer_owner_user_id),
    });
    cursor = String(result.data.referrer_owner_user_id);
  }
  return chain;
}

export async function recordReferralPayment(db: SupabaseClient, input: {
  referredAccountId: string;
  provider: string;
  externalPaymentId: string;
  billingInterval: BillingInterval;
  grossAmountCents: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}) {
  const config = await loadReferralProgramConfig(db);
  const upline = await referralUpline(db, input.referredAccountId);
  if (!config.active || !upline.length) return [];

  const hold = new Date(Date.now() + config.commission_hold_days * 86400000).toISOString();
  const rows = upline.map(({ level, accountId, ownerUserId }) => {
    const rate = referralRateBps(config, input.billingInterval, level);
    return {
      beneficiary_account_id: accountId,
      beneficiary_owner_user_id: ownerUserId,
      referred_account_id: input.referredAccountId,
      provider: input.provider,
      external_payment_id: input.externalPaymentId,
      billing_interval: input.billingInterval,
      referral_level: level,
      gross_amount_cents: Math.round(input.grossAmountCents),
      rate_bps: rate,
      commission_amount_cents: commissionAmountCents(input.grossAmountCents, rate),
      currency: input.currency || config.currency,
      status: "pending",
      hold_until: hold,
      metadata: input.metadata ?? {},
    };
  }).filter((row) => row.rate_bps > 0 && row.commission_amount_cents > 0);

  if (!rows.length) return [];
  const result: any = await db
    .from("trader_referral_commissions")
    .upsert(rows, {
      onConflict: "provider,external_payment_id,beneficiary_account_id,referral_level",
      ignoreDuplicates: true,
    })
    .select("*");
  if (result.error) throw result.error;
  return result.data ?? [];
}

export const createReferralCommissionsForPayment = recordReferralPayment;

export async function reverseReferralPayment(db: SupabaseClient, provider: string, id: string) {
  const result: any = await db
    .from("trader_referral_commissions")
    .update({ status: "reversed", reversed_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("external_payment_id", id)
    .in("status", ["pending", "available"])
    .select("id");
  if (result.error) throw result.error;
  return result.data ?? [];
}

export const reverseReferralCommissionsForPayment = reverseReferralPayment;

export async function releaseMatureReferralCommissions(db: SupabaseClient, now = new Date()) {
  const timestamp = now.toISOString();
  const result: any = await db
    .from("trader_referral_commissions")
    .update({ status: "available", available_at: timestamp })
    .eq("status", "pending")
    .lte("hold_until", timestamp)
    .select("id");
  if (result.error) throw result.error;
  return result.data ?? [];
}

export const releaseMaturedReferralCommissions = releaseMatureReferralCommissions;
