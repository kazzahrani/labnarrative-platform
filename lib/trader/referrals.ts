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
    annual_l2_bps: Number(data.annual_l2_bps ?? 1500),
    annual_l3_bps: Number(data.annual_l3_bps ?? 1000),
    customer_discount_bps: Number(data.customer_discount_bps ?? 1000),
    commission_hold_days: Number(data.commission_hold_days ?? 30),
    payout_minimum_cents: Number(data.payout_minimum_cents ?? 2500),
  };
}

async function accountOwnerUserId(db: SupabaseClient, accountId: string) {
  const { data, error } = await db.from("trader_accounts").select("owner_user_id").eq("id", accountId).maybeSingle();
  if (error) throw error;
  return data?.owner_user_id ? String(data.owner_user_id) : null;
}

function referralCodeForOwner(ownerUserId: string, length = 12) {
  const digest = createHash("sha256").update(`labnarrative-referral:${ownerUserId}`).digest("hex").toUpperCase();
  return `LN${digest.slice(0, length)}`;
}

export async function ensureReferralProfile(db: SupabaseClient, accountId: string) {
  const ownerUserId = await accountOwnerUserId(db, accountId);
  if (!ownerUserId) throw new Error(REFERRAL_SIGN_IN_REQUIRED);

  const ownerProfile = await db.from("trader_referral_profiles").select("account_id,owner_user_id,referral_code,status").eq("owner_user_id", ownerUserId).maybeSingle();
  if (ownerProfile.error) throw ownerProfile.error;
  if (ownerProfile.data) return ownerProfile.data;

  const accountProfile = await db.from("trader_referral_profiles").select("account_id,owner_user_id,referral_code,status").eq("account_id", accountId).maybeSingle();
  if (accountProfile.error) throw accountProfile.error;
  if (accountProfile.data) {
    const updated = await db.from("trader_referral_profiles").update({ owner_user_id: ownerUserId, updated_at: new Date().toISOString() }).eq("account_id", accountId).select("account_id,owner_user_id,referral_code,status").single();
    if (updated.error) throw updated.error;
    return updated.data;
  }

  for (const length of [12, 16, 24]) {
    const referralCode = referralCodeForOwner(ownerUserId, length);
    const inserted = await db.from("trader_referral_profiles").insert({ account_id: accountId, owner_user_id: ownerUserId, referral_code: referralCode }).select("account_id,owner_user_id,referral_code,status").single();
    if (!inserted.error && inserted.data) return inserted.data;
    if (inserted.error?.code !== "23505") throw inserted.error;

    const retryOwner = await db.from("trader_referral_profiles").select("account_id,owner_user_id,referral_code,status").eq("owner_user_id", ownerUserId).maybeSingle();
    if (retryOwner.error) throw retryOwner.error;
    if (retryOwner.data) return retryOwner.data;
  }
  throw new Error("Unable to create a unique referral code.");
}

async function wouldCreateOwnerCycle(db: SupabaseClient, referredOwnerUserId: string, prospectiveReferrerOwnerUserId: string) {
  let cursor: string | null = prospectiveReferrerOwnerUserId;
  const visited = new Set<string>();
  for (let depth = 0; depth < 25 && cursor; depth += 1) {
    if (cursor === referredOwnerUserId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const { data, error } = await db.from("trader_referral_attributions").select("referrer_owner_user_id").eq("referred_owner_user_id", cursor).maybeSingle();
    if (error) throw error;
    cursor = data?.referrer_owner_user_id ? String(data.referrer_owner_user_id) : null;
  }
  return false;
}

export async function claimReferralCode(db: SupabaseClient, referredAccountId: string, rawCode: unknown, source: ReferralSource = "link") {
  const referralCode = normalizeReferralCode(rawCode);
  if (!referralCode) return { ok: false as const, status: "invalid_code" as const };

  const referredOwnerUserId = await accountOwnerUserId(db, referredAccountId);
  if (!referredOwnerUserId) return { ok: false as const, status: REFERRAL_SIGN_IN_REQUIRED as const };

  const existing = await db.from("trader_referral_attributions").select("referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").eq("referred_owner_user_id", referredOwnerUserId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { ok: true as const, status: "already_attributed" as const, ...existing.data };

  const profile = await db.from("trader_referral_profiles").select("account_id,owner_user_id,referral_code,status").eq("referral_code", referralCode).maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return { ok: false as const, status: "invalid_code" as const };
  if (profile.data.status !== "active") return { ok: false as const, status: "inactive" as const };

  const referrerAccountId = String(profile.data.account_id);
  const referrerOwnerUserId = profile.data.owner_user_id ? String(profile.data.owner_user_id) : await accountOwnerUserId(db, referrerAccountId);
  if (!referrerOwnerUserId) return { ok: false as const, status: "invalid_code" as const };
  if (referrerOwnerUserId === referredOwnerUserId) return { ok: false as const, status: "self_referral" as const };
  if (await wouldCreateOwnerCycle(db, referredOwnerUserId, referrerOwnerUserId)) return { ok: false as const, status: "cycle" as const };

  const inserted = await db.from("trader_referral_attributions").insert({
    referred_account_id: referredAccountId,
    referrer_account_id: referrerAccountId,
    referred_owner_user_id: referredOwnerUserId,
    referrer_owner_user_id: referrerOwnerUserId,
    referral_code: referralCode,
    source,
  }).select("referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").single();
  if (inserted.error?.code === "23505") {
    const raced = await db.from("trader_referral_attributions").select("referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").eq("referred_owner_user_id", referredOwnerUserId).maybeSingle();
    if (raced.error) throw raced.error;
    if (raced.data) return { ok: true as const, status: "already_attributed" as const, ...raced.data };
  }
  if (inserted.error) throw inserted.error;
  return { ok: true as const, status: "attributed" as const, ...inserted.data };
}

export async function claimPendingReferral(db: SupabaseClient, accountId: string, request: NextRequest) {
  const raw = request.cookies.get(REFERRAL_PENDING_COOKIE)?.value;
  if (!raw) return { ok: false as const, status: "missing" as const };
  return claimReferralCode(db, accountId, raw, "link");
}

export async function referralUpline(db: SupabaseClient, referredAccountId: string) {
  const referredOwnerUserId = await accountOwnerUserId(db, referredAccountId);
  if (!referredOwnerUserId) return [];

  const chain: Array<{ level: ReferralLevel; accountId: string; ownerUserId: string }> = [];
  let cursorOwnerUserId: string | null = referredOwnerUserId;
  for (let level = 1 as ReferralLevel; level <= 3 && cursorOwnerUserId; level = (level + 1) as ReferralLevel) {
    const { data, error } = await db.from("trader_referral_attributions").select("referrer_account_id,referrer_owner_user_id").eq("referred_owner_user_id", cursorOwnerUserId).maybeSingle();
    if (error) throw error;
    if (!data?.referrer_account_id || !data?.referrer_owner_user_id) break;
    chain.push({ level, accountId: String(data.referrer_account_id), ownerUserId: String(data.referrer_owner_user_id) });
    cursorOwnerUserId = String(data.referrer_owner_user_id);
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
  if (!config.active) return [];
  const upline = await referralUpline(db, input.referredAccountId);
  if (!upline.length) return [];

  const holdUntil = new Date(Date.now() + config.commission_hold_days * 86400000).toISOString();
  const rows = upline.map(({ level, accountId, ownerUserId }) => {
    const rateBps = referralRateBps(config, input.billingInterval, level);
    return {
      beneficiary_account_id: accountId,
      beneficiary_owner_user_id: ownerUserId,
      referred_account_id: input.referredAccountId,
      provider: input.provider,
      external_payment_id: input.externalPaymentId,
      billing_interval: input.billingInterval,
      referral_level: level,
      gross_amount_cents: Math.max(0, Math.round(input.grossAmountCents)),
      rate_bps: rateBps,
      commission_amount_cents: commissionAmountCents(input.grossAmountCents, rateBps),
      currency: input.currency || config.currency,
      status: "pending",
      hold_until: holdUntil,
      metadata: input.metadata ?? {},
    };
  }).filter((row) => row.rate_bps > 0 && row.commission_amount_cents > 0);

  if (!rows.length) return [];
  const { data, error } = await db.from("trader_referral_commissions").upsert(rows, { onConflict: "provider,external_payment_id,beneficiary_account_id,referral_level", ignoreDuplicates: true }).select("id,beneficiary_account_id,beneficiary_owner_user_id,referral_level,rate_bps,commission_amount_cents,status,hold_until");
  if (error) throw error;
  return data ?? [];
}

export async function reverseReferralPayment(db: SupabaseClient, provider: string, externalPaymentId: string, reason = "payment_reversed") {
  const reversedAt = new Date().toISOString();
  const { data, error } = await db.from("trader_referral_commissions").update({ status: "reversed", reversed_at: reversedAt, metadata: { reversal_reason: reason } }).eq("provider", provider).eq("external_payment_id", externalPaymentId).in("status", ["pending", "available"]).select("id,status,reversed_at");
  if (error) throw error;
  return data ?? [];
}

export async function releaseMatureReferralCommissions(db: SupabaseClient, now = new Date()) {
  const timestamp = now.toISOString();
  const { data, error } = await db.from("trader_referral_commissions").update({ status: "available", available_at: timestamp }).eq("status", "pending").lte("hold_until", timestamp).select("id,beneficiary_account_id,beneficiary_owner_user_id,commission_amount_cents,currency,available_at");
  if (error) throw error;
  return data ?? [];
}
