import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl.startsWith("https://")) {
    return NextResponse.json({ configured: false, verified: false, provider: "paypal", error: "Supabase URL unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/paypal-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { configured?: boolean; verified?: boolean; environment?: string; authError?: string; error?: string };
    return NextResponse.json(
      {
        provider: "paypal",
        configured: Boolean(payload.configured),
        verified: Boolean(payload.verified),
        environment: payload.environment === "sandbox" ? "sandbox" : "live",
        healthy: response.ok,
        ...(payload.authError ? { authError: payload.authError } : {}),
        ...(!response.ok ? { error: payload.error || "Provider status unavailable" } : {}),
      },
      { status: response.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { provider: "paypal", configured: false, verified: false, healthy: false, error: error instanceof Error ? error.message : "Provider status unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
