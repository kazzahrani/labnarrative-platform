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

export async function bindReferralAttributionToOwner(db: SupabaseClient, accountId: string) {
  const ownerUserId = await accountOwnerUserId(db, accountId);
  if (!ownerUserId) return null;

  const accountAttribution = await db.from("trader_referral_attributions").select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").eq("referred_account_id", accountId).maybeSingle();
  if (accountAttribution.error) throw accountAttribution.error;
  if (!accountAttribution.data) return null;
  if (String(accountAttribution.data.referred_owner_user_id ?? "") === ownerUserId) return accountAttribution.data;

  const referrerOwnerUserId = accountAttribution.data.referrer_owner_user_id ? String(accountAttribution.data.referrer_owner_user_id) : null;
  if (referrerOwnerUserId === ownerUserId || (referrerOwnerUserId && await wouldCreateOwnerCycle(db, ownerUserId, referrerOwnerUserId))) {
    const removed = await db.from("trader_referral_attributions").delete().eq("referred_account_id", accountId);
    if (removed.error) throw removed.error;
    return null;
  }

  const ownerAttribution = await db.from("trader_referral_attributions").select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").eq("referred_owner_user_id", ownerUserId).maybeSingle();
  if (ownerAttribution.error) throw ownerAttribution.error;
  if (ownerAttribution.data && String(ownerAttribution.data.referred_account_id) !== accountId) {
    const removed = await db.from("trader_referral_attributions").delete().eq("referred_account_id", accountId);
    if (removed.error) throw removed.error;
    return ownerAttribution.data;
  }

  const updated = await db.from("trader_referral_attributions").update({ referred_owner_user_id: ownerUserId }).eq("referred_account_id", accountId).select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").single();
  if (updated.error) throw updated.error;
  return updated.data;
}

async function findAttributionForPrincipal(db: SupabaseClient, accountId: string | null, ownerUserId: string | null) {
  if (ownerUserId) {
    const ownerMatch = await db.from("trader_referral_attributions").select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").eq("referred_owner_user_id", ownerUserId).maybeSingle();
    if (ownerMatch.error) throw ownerMatch.error;
    if (ownerMatch.data) return ownerMatch.data;

    const ownedAccounts = await db.from("trader_accounts").select("id").eq("owner_user_id", ownerUserId);
    if (ownedAccounts.error) throw ownedAccounts.error;
    const accountIds = (ownedAccounts.data ?? []).map((row) => String(row.id));
    if (accountIds.length) {
      const legacyMatch = await db.from("trader_referral_attributions").select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").in("referred_account_id", accountIds).order("attributed_at", { ascending: true }).limit(1).maybeSingle();
      if (legacyMatch.error) throw legacyMatch.error;
      if (legacyMatch.data) {
        const legacyAccountId = String(legacyMatch.data.referred_account_id);
        return await bindReferralAttributionToOwner(db, legacyAccountId) ?? legacyMatch.data;
      }
    }
  }

  if (accountId) {
    const accountMatch = await db.from("trader_referral_attributions").select("referred_account_id,referred_owner_user_id,referrer_account_id,referrer_owner_user_id,referral_code,source,attributed_at,locked_at").eq("referred_account_id", accountId).maybeSingle();
    if (accountMatch.error) throw accountMatch.error;
    if (accountMatch.data) return accountMatch.data;
  }
  return null;
}

export type ReferralClaimResult =
  | { ok: true; status: "attributed" | "already_attributed"; referrerAccountId: string; referrerOwnerUserId: string | null; referralCode: string }
  | { ok: false; status: "inactive" | "invalid_code" | "self_referral" | "cycle" | "already_attributed_elsewhere" };

export async function claimReferralCode(db: SupabaseClient, referredAccountId: string, rawCode: unknown, source: ReferralSource = "code"): Promise<ReferralClaimResult> {
  const config = await loadReferralProgramConfig(db);
  if (!config.active) return { ok: false, status: "inactive" };

  const referralCode = normalizeReferralCode(rawCode);
  if (referralCode.length < 4) return { ok: false, status: "invalid_code" };

  await bindReferralAttributionToOwner(db, referredAccountId);
  const referredOwnerUserId = await accountOwnerUserId(db, referredAccountId);
  const existing = await findAttributionForPrincipal(db, referredAccountId, referredOwnerUserId);
  if (existing) {
    if (normalizeReferralCode(existing.referral_code) === referralCode) {
      return {
        ok: true,
        status: "already_attributed",
        referrerAccountId: String(existing.referrer_account_id),
        referrerOwnerUserId: existing.referrer_owner_user_id ? String(existing.referrer_owner_user_id) : null,
        referralCode,
      };
    }
    return { ok: false, status: "already_attributed_elsewhere" };
  }

  const profile = await db.from("trader_referral_profiles").select("account_id,owner_user_id,referral_code,status").eq("referral_code", referralCode).eq("status", "active").maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return { ok: false, status: "invalid_code" };

  const referrerAccountId = String(profile.data.account_id);
  const referrerOwnerUserId = profile.data.owner_user_id ? String(profile.data.owner_user_id) : await accountOwnerUserId(db, referrerAccountId);
  if (referrerAccountId === referredAccountId || (referredOwnerUserId && referrerOwnerUserId === referredOwnerUserId)) return { ok: false, status: "self_referral" };
  if (referredOwnerUserId && referrerOwnerUserId && await wouldCreateOwnerCycle(db, referredOwnerUserId, referrerOwnerUserId)) return { ok: false, status: "cycle" };

  const inserted = await db.from("trader_referral_attributions").insert({
    referred_account_id: referredAccountId,
    referred_owner_user_id: referredOwnerUserId,
    referrer_account_id: referrerAccountId,
    referrer_owner_user_id: referrerOwnerUserId,
    referral_code: referralCode,
    source,
  });
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const concurrent = await findAttributionForPrincipal(db, referredAccountId, referredOwnerUserId);
      if (concurrent && normalizeReferralCode(concurrent.referral_code) === referralCode) {
        return {
          ok: true,
          status: "already_attributed",
          referrerAccountId: String(concurrent.referrer_account_id),
          referrerOwnerUserId: concurrent.referrer_owner_user_id ? String(concurrent.referrer_owner_user_id) : null,
          referralCode,
        };
      }
      return { ok: false, status: "already_attributed_elsewhere" };
    }
    throw inserted.error;
  }

  return { ok: true, status: "attributed", referrerAccountId, referrerOwnerUserId, referralCode };
}

export async function claimPendingReferral(db: SupabaseClient, accountId: string, request: NextRequest) {
  const code = normalizeReferralCode(request.cookies.get(REFERRAL_PENDING_COOKIE)?.value);
  if (!code) return null;
  return claimReferralCode(db, accountId, code, "link");
}

export type ReferralPaymentInput = {
  referredAccountId: string;
  referredOwnerUserId?: string | null;
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
  const referredOwnerUserId = input.referredOwnerUserId ?? await accountOwnerUserId(db, input.referredAccountId);
  if (referredOwnerUserId) await bindReferralAttributionToOwner(db, input.referredAccountId);

  const rows: Record<string, unknown>[] = [];
  let lookupAccountId: string | null = input.referredAccountId;
  let lookupOwnerUserId: string | null = referredOwnerUserId;

  for (const level of [1, 2, 3] as ReferralLevel[]) {
    const attribution = await findAttributionForPrincipal(db, lookupAccountId, lookupOwnerUserId);
    if (!attribution) break;

    const beneficiaryAccountId = String(attribution.referrer_account_id);
    const beneficiaryOwnerUserId = attribution.referrer_owner_user_id ? String(attribution.referrer_owner_user_id) : await accountOwnerUserId(db, beneficiaryAccountId);
    const rateBps = referralRateBps(config, input.billingInterval, level);
    const amountCents = commissionAmountCents(input.grossAmountCents, rateBps);
    if (rateBps > 0 && amountCents > 0) {
      rows.push({
        beneficiary_account_id: beneficiaryAccountId,
        beneficiary_owner_user_id: beneficiaryOwnerUserId,
        referred_account_id: input.referredAccountId,
        referred_owner_user_id: referredOwnerUserId,
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
    lookupAccountId = beneficiaryAccountId;
    lookupOwnerUserId = beneficiaryOwnerUserId;
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
