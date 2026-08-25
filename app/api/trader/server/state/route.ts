import { NextRequest, NextResponse } from "next/server";
import { attachTraderCookie, bootstrapLegacyState, resolveTraderAccount, traderSnapshot } from "../../../../../lib/trader/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { db, account, tokenToSet } = await resolveTraderAccount(request);
    const snapshot = await traderSnapshot(db, account);
    return noStore(attachTraderCookie(NextResponse.json(snapshot), tokenToSet));
  } catch (error) {
    console.error("trader-server-state-get", error);
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load trader server state." }, { status: 500 }));
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, account, tokenToSet } = await resolveTraderAccount(request);
    const body = await request.json().catch(() => ({})) as { bots?: unknown; trades?: unknown };
    const bootstrap = await bootstrapLegacyState(db, account.id, body.bots, body.trades);
    const snapshot = await traderSnapshot(db, account);
    return noStore(attachTraderCookie(NextResponse.json({ ...snapshot, bootstrap }), tokenToSet));
  } catch (error) {
    console.error("trader-server-state-post", error);
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Unable to bootstrap trader server state." }, { status: 500 }));
  }
}
