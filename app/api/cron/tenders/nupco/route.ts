import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authorizeTenderAutomation } from "../../../../../lib/tenders/automation-auth";
import { ingestNupcoPublicTenders } from "../../../../../lib/tenders/nupco-official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE?.trim();
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing for NUPCO tender ingestion.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  try {
    const supabase = adminClient();
    if (!(await authorizeTenderAutomation(request, supabase))) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const result = await ingestNupcoPublicTenders(supabase);
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
