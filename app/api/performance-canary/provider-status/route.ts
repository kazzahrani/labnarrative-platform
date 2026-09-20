import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "");
  const match = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return NextResponse.json({
    ok: true,
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    nowpayments: Boolean(process.env.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_KEY),
    supabaseRef: match?.[1] || null,
  }, { headers: { "Cache-Control": "no-store" } });
}
