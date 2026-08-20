import { NextResponse } from "next/server";
import { careerAdminClient } from "../../../../../lib/career/admin";
import { authorizeCareerAutomation } from "../../../../../lib/career/automation-auth";
import { runCareerDiscovery } from "../../../../../lib/career/discovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const supabase = careerAdminClient();
    if (!(await authorizeCareerAutomation(request, supabase))) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const result = await runCareerDiscovery({ force: true });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("scheduled career discovery failed", error);
    return NextResponse.json({ ok: false, error: "Scheduled opportunity scan failed." }, { status: 500 });
  }
}
