import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ingestNupcoPublicTenders } from "../../../../../lib/tenders/nupco-official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE?.trim();
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing for NUPCO tender ingestion.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await ingestNupcoPublicTenders(adminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("NUPCO public tender ingestion failed", error);
    return NextResponse.json({
      ok: false,
      error: "NUPCO public tender ingestion failed.",
      detail: error instanceof Error ? error.message : "Unknown error.",
    }, { status: 500 });
  }
}
