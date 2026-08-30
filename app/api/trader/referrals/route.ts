import { NextRequest, NextResponse } from "next/server";
import { attachTraderCookie, resolveTraderAccount } from "../../../../lib/trader/server";
import { claimReferralCode, ensureReferralProfile, loadReferralProgramConfig } from "../../../../lib/trader/referrals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function respond(payload: unknown, tokenToSet: string | null, status = 200) {
  return noStore(attachTraderCookie(NextResponse.json(payload, { status }), tokenToSet));
}

function cents(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

export async function GET(request: NextRequest) {
  try {
    const { db, account, tokenToSet } = await resolveTraderAccount(request);
    const [profile, config] = await Promise.all([
      ensureReferralProfile(db, account.id),
      loadReferralProgramConfig(db),
    ]);

    const [directResult, commissionsResult, attributionResult] = await Promise.all([
      db.from("trader_referral_attributions").select("referred_account_id", { count: "exact", head: true }).eq("referrer_account_id", account.id),
      db.from("trader_referral_commissions").select("status,commission_amount_cents").eq("beneficiary_account_id", account.id),
      db.from("trader_referral_attributions").select("referral_code,source,attributed_at,locked_at").eq("referred_account_id", account.id).maybeSingle(),
    ]);

    if (directResult.error) throw directResult.error;
    if (commissionsResult.error) throw commissionsResult.error;
    if (attributionResult.error) throw attributionResult.error;

    const totals = { pending: 0, available: 0, paid: 0, reversed: 0, cancelled: 0 };
    for (const row of commissionsResult.data ?? []) {
      const status = String(row.status) as keyof typeof totals;
      if (status in totals) totals[status] += cents(row.commission_amount_cents);
    }

    const baseUrl = process.env.NEXT_PUBLIC_TRADER_URL?.trim() || "https://platform.labnarrative.com/trader";
    const referralCode = String(profile.referral_code);

    return respond({
      ok: true,
      referral: {
        code: referralCode,
        url: `${baseUrl}?ref=${encodeURIComponent(referralCode)}`,
        status: profile.status,
        directReferrals: directResult.count ?? 0,
        attribution: attributionResult.data ?? null,
      },
      earnings: totals,
      program: config,
    }, tokenToSet);
  } catch (error) {
    console.error("trader-referrals-get", error);
    return noStore(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load referral program." }, { status: 500 }));
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, account, tokenToSet } = await resolveTraderAccount(request);
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const result = await claimReferralCode(db, account.id, body.code, "code");

    if (!result.ok) {
      const status = result.status === "invalid_code" ? 404 : result.status === "inactive" ? 503 : 409;
      return respond({ ok: false, error: result.status }, tokenToSet, status);
    }

    return respond({ ok: true, attribution: result }, tokenToSet);
  } catch (error) {
    console.error("trader-referrals-post", error);
    return noStore(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to apply referral code." }, { status: 500 }));
  }
}
