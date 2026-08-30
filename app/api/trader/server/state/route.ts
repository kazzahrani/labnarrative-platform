import { NextRequest, NextResponse } from "next/server";
import { attachTraderCookie, bootstrapLegacyState, resolveTraderAccount, traderSnapshot } from "../../../../../lib/trader/server";
import { bindReferralAttributionToOwner, claimPendingReferral, REFERRAL_PENDING_COOKIE } from "../../../../../lib/trader/referrals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

async function processReferralState(request: NextRequest, db: Awaited<ReturnType<typeof resolveTraderAccount>>["db"], accountId: string) {
  const hasPendingCode = Boolean(request.cookies.get(REFERRAL_PENDING_COOKIE)?.value);
  try {
    await bindReferralAttributionToOwner(db, accountId);
    if (hasPendingCode) await claimPendingReferral(db, accountId, request);
    return hasPendingCode;
  } catch (error) {
    console.error("trader-referral-attribution", error);
    return false;
  }
}

function stateResponse(payload: unknown, tokenToSet: string | null, clearReferralCookie: boolean) {
  const response = attachTraderCookie(NextResponse.json(payload), tokenToSet);
  if (clearReferralCookie) response.cookies.delete(REFERRAL_PENDING_COOKIE);
  return noStore(response);
}

export async function GET(request: NextRequest) {
  try {
    const { db, account, tokenToSet } = await resolveTraderAccount(request);
    const clearReferralCookie = await processReferralState(request, db, account.id);
    const snapshot = await traderSnapshot(db, account);
    return stateResponse(snapshot, tokenToSet, clearReferralCookie);
  } catch (error) {
    console.error("trader-server-state-get", error);
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load trader server state." }, { status: 500 }));
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, account, tokenToSet } = await resolveTraderAccount(request);
    const clearReferralCookie = await processReferralState(request, db, account.id);
    const body = await request.json().catch(() => ({})) as { bots?: unknown; trades?: unknown };
    const bootstrap = await bootstrapLegacyState(db, account.id, body.bots, body.trades);
    const snapshot = await traderSnapshot(db, account);
    return stateResponse({ ...snapshot, bootstrap }, tokenToSet, clearReferralCookie);
  } catch (error) {
    console.error("trader-server-state-post", error);
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Unable to bootstrap trader server state." }, { status: 500 }));
  }
}
