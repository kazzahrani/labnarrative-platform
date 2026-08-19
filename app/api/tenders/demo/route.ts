import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEMO_COMPANY_SLUG = "riyadh-scientific-demo";
const SOURCE_SLUG = "etimad-open-data";

type JsonRow = Record<string, unknown>;

async function restFetch(path: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public configuration is missing.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: publishableKey },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase REST request failed (${response.status}).`);
  }

  return (await response.json()) as JsonRow[];
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
}

function tagsMatch(left: string, right: string) {
  const a = normalise(left);
  const b = normalise(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

export async function GET() {
  try {
    const companies = await restFetch(
      `tender_companies?slug=eq.${DEMO_COMPANY_SLUG}&select=id,slug,name_en,name_ar,sector_en,sector_ar,capability_tags&limit=1`,
    );
    const company = companies[0];
    if (!company?.id) {
      return NextResponse.json({ error: "Tender demo company is not configured." }, { status: 404 });
    }

    const sources = await restFetch(
      `tender_data_sources?slug=eq.${SOURCE_SLUG}&select=id,slug,name,source_type,base_url,cadence,attribution_text,status,metadata&limit=1`,
    );
    const source = sources[0];
    if (!source?.id) {
      return NextResponse.json({ error: "Tender source is not configured." }, { status: 404 });
    }

    const [catalog, tenders] = await Promise.all([
      restFetch(
        `tender_catalog_items?company_id=eq.${company.id}&active=eq.true&select=id,sku,name_en,name_ar,tags&order=name_en.asc`,
      ),
      restFetch(
        `tenders?source_id=eq.${source.id}&is_public=eq.true&select=id,tender_number,reference_number,title_ar,title_en,buyer_ar,buyer_en,purpose_ar,purpose_en,tender_type_ar,tender_type_en,document_price_sar,contract_duration_text,source_status_text,verification_state,source_url,source_indexed_at,deadline_at,raw_payload&order=created_at.desc`,
      ),
    ]);

    const tenderIds = tenders.map((tender) => String(tender.id)).filter(Boolean);
    const requirements = tenderIds.length
      ? await restFetch(
          `tender_requirements?tender_id=in.(${tenderIds.join(",")})&select=id,tender_id,name_en,name_ar,tags,extraction_method,confidence&order=confidence.desc`,
        )
      : [];

    const catalogTags = catalog.flatMap((item) => Array.isArray(item.tags) ? item.tags.map(String) : []);
    const capabilityTags = Array.isArray(company.capability_tags) ? company.capability_tags.map(String) : [];
    const availableTags = [...catalogTags, ...capabilityTags];

    const opportunities = tenders.map((tender) => {
      const tenderRequirements = requirements.filter((requirement) => requirement.tender_id === tender.id);
      const matchedRequirements = tenderRequirements.filter((requirement) => {
        const tags = Array.isArray(requirement.tags) ? requirement.tags.map(String) : [];
        return tags.some((tag) => availableTags.some((available) => tagsMatch(tag, available)));
      });
      const fit = tenderRequirements.length
        ? Math.round((matchedRequirements.length / tenderRequirements.length) * 100)
        : 0;

      return {
        ...tender,
        requirements: tenderRequirements,
        matched_requirement_ids: matchedRequirements.map((requirement) => requirement.id),
        metadata_fit: fit,
      };
    }).sort((a, b) => b.metadata_fit - a.metadata_fit);

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      company,
      catalog,
      source,
      opportunities,
      caveat: "Official Etimad metadata. Current tender status must be rechecked on Etimad before bid action; public metadata signals are not a substitute for the tender documents and bill of quantities.",
    });
  } catch (error) {
    console.error("tenders demo source error", error);
    return NextResponse.json({ error: "Unable to load official-source tender data." }, { status: 502 });
  }
}
