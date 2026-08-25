import { NextRequest, NextResponse } from "next/server";
import { TRADER_COOKIE } from "../../../../lib/trader/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traderSession = request.cookies.get(TRADER_COOKIE)?.value?.trim();
  if (!traderSession) {
    return NextResponse.json({ error: "trader_session_missing" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    return NextResponse.json({ error: "binance_control_configuration_missing" }, { status: 500, headers: { "cache-control": "no-store" } });
  }

  const rawBody = await request.text();
  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/trader-binance-session-control`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-trader-session": traderSession,
      },
      body: rawBody || "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("trader-binance-control proxy", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "binance_control_unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
