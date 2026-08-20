import { NextResponse } from "next/server";
import { careerAdminClient } from "../../../../lib/career/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = careerAdminClient();
    const [{ data: opportunities, error: opportunityError }, { data: run }, { data: sources }] = await Promise.all([
      supabase
        .from("career_opportunities")
        .select("id,external_key,opportunity_type,title,organization,city,country,track,employment_type,source_url,date_posted,valid_through,description_excerpt,fit_score,fit_components,reasons,gaps,strategy,verification_state,is_active,first_seen_at,last_seen_at,source_checked_at")
        .eq("is_active", true)
        .order("fit_score", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .limit(250),
      supabase
        .from("career_discovery_runs")
        .select("id,started_at,finished_at,status,sources_scanned,opportunities_seen,opportunities_upserted,errors")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("career_sources")
        .select("key,organization,source_type,country,city,last_checked_at,last_success_at,last_error")
        .eq("active", true)
        .order("organization", { ascending: true }),
    ]);

    if (opportunityError) throw opportunityError;

    return NextResponse.json(
      {
        ok: true,
        opportunities: opportunities ?? [],
        discovery: run ?? null,
        sources: sources ?? [],
        generated_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("career opportunities read failed", error);
    return NextResponse.json({ ok: false, error: "Career opportunities are temporarily unavailable." }, { status: 500 });
  }
}
