import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  stock_qty: number;
  reserved_qty: number;
};

type TenderRow = {
  id: string;
  source_id: string;
  source_record_id: string | null;
  tender_number: string | null;
  reference_number: string | null;
  title_ar: string;
  title_en: string | null;
  buyer_ar: string | null;
  buyer_en: string | null;
  purpose_ar: string | null;
  purpose_en: string | null;
  source_status_text: string | null;
  verification_state: string;
  source_url: string;
  published_at: string | null;
  deadline_at: string | null;
};

type MatchRow = {
  tender_id: string;
  matched_count: number;
  requirement_count: number;
  coverage: number;
  capability_fit: number;
  timing_fit: number;
  score: number;
  decision: "BID" | "REVIEW" | "NO-BID";
  rationale: unknown;
  exact_count: number;
  equivalent_count: number;
  missing_count: number;
  stock_available_count: number;
  requires_sourcing_count: number;
  supply_fit: number;
  documentation_fit: number;
  match_version: string;
  score_components: unknown;
  computed_at: string;
};

type SourceRow = {
  id: string;
  name: string;
  base_url: string;
  cadence: string | null;
  attribution_text: string | null;
};

type SavedOpportunity = {
  id: string;
  source_tender_id: string | null;
  status: string;
};

type TopMatch = {
  requirement_id?: unknown;
  item_code?: unknown;
  requested_item?: unknown;
  product_id?: unknown;
  sku?: unknown;
  product_name?: unknown;
  fit?: unknown;
  available_stock?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.ceil((time - Date.now()) / 86_400_000) : null;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const orgId = requestUrl.searchParams.get("org_id")?.trim() ?? "";
    const authorization = request.headers.get("authorization") ?? "";
    if (!orgId) return NextResponse.json({ error: "org_id is required." }, { status: 400 });
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: "Supabase public configuration is missing." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });

    const { data: membership, error: membershipError } = await supabase
      .from("ln_organization_members")
      .select("org_id,role,status")
      .eq("org_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });

    const [productResult, tenderResult, savedResult] = await Promise.all([
      supabase
        .from("ln_products")
        .select("id,sku,name,category,brand,stock_qty,reserved_qty")
        .eq("org_id", orgId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("tenders")
        .select("id,source_id,source_record_id,tender_number,reference_number,title_ar,title_en,buyer_ar,buyer_en,purpose_ar,purpose_en,source_status_text,verification_state,source_url,published_at,deadline_at")
        .eq("is_public", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(150),
      supabase
        .from("ln_opportunities")
        .select("id,source_tender_id,status")
        .eq("org_id", orgId)
        .not("source_tender_id", "is", null),
    ]);

    if (productResult.error) throw productResult.error;
    if (tenderResult.error) throw tenderResult.error;
    if (savedResult.error) throw savedResult.error;

    const products = (productResult.data ?? []) as Product[];
    const tenders = (tenderResult.data ?? []) as TenderRow[];
    const saved = (savedResult.data ?? []) as SavedOpportunity[];
    const tenderIds = tenders.map((tender) => tender.id);
    const sourceIds = [...new Set(tenders.map((tender) => tender.source_id))];

    const [matchResult, sourceResult] = await Promise.all([
      tenderIds.length
        ? supabase
            .from("tender_matches")
            .select("tender_id,matched_count,requirement_count,coverage,capability_fit,timing_fit,score,decision,rationale,exact_count,equivalent_count,missing_count,stock_available_count,requires_sourcing_count,supply_fit,documentation_fit,match_version,score_components,computed_at")
            .eq("org_id", orgId)
            .in("tender_id", tenderIds)
        : Promise.resolve({ data: [], error: null }),
      sourceIds.length
        ? supabase
            .from("tender_data_sources")
            .select("id,name,base_url,cadence,attribution_text")
            .in("id", sourceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (matchResult.error) throw matchResult.error;
    if (sourceResult.error) throw sourceResult.error;

    const matchesByTender = new Map(((matchResult.data ?? []) as MatchRow[]).map((row) => [row.tender_id, row]));
    const sources = new Map(((sourceResult.data ?? []) as SourceRow[]).map((source) => [source.id, source]));
    const savedByTender = new Map(saved.filter((row) => row.source_tender_id).map((row) => [String(row.source_tender_id), row]));
    const productById = new Map(products.map((product) => [product.id, product]));

    const opportunities = tenders.map((tender) => {
      const match = matchesByTender.get(tender.id) ?? null;
      const daysLeft = daysUntil(tender.deadline_at);
      const expired = daysLeft !== null && daysLeft < 0;
      const closed = tender.verification_state === "closed";
      const rationale = asRecord(match?.rationale);
      const rawTopMatches = Array.isArray(rationale.top_matches) ? rationale.top_matches as TopMatch[] : [];
      const scoreComponents = asRecord(match?.score_components);
      const evidenceLevel = typeof rationale.evidence_level === "string" ? rationale.evidence_level : "pending";
      const partialDocument = rationale.partial_document === true;
      const source = sources.get(tender.source_id) ?? null;
      const savedOpportunity = savedByTender.get(tender.id) ?? null;

      const requirementMatches = rawTopMatches.slice(0, 12).map((raw) => {
        const productId = typeof raw.product_id === "string" ? raw.product_id : "";
        const product = productById.get(productId) ?? null;
        return {
          requirement_id: typeof raw.requirement_id === "string" ? raw.requirement_id : `${tender.id}-${String(raw.item_code ?? "match")}`,
          item_code: typeof raw.item_code === "string" ? raw.item_code : null,
          requirement: typeof raw.requested_item === "string" ? raw.requested_item : "Tender line item",
          match_score: numberValue(raw.fit),
          product: product ? {
            id: product.id,
            sku: product.sku,
            name: product.name,
            category: product.category,
            brand: product.brand,
            available_stock: numberValue(raw.available_stock, Math.max(0, Number(product.stock_qty || 0) - Number(product.reserved_qty || 0))),
          } : productId ? {
            id: productId,
            sku: typeof raw.sku === "string" ? raw.sku : "",
            name: typeof raw.product_name === "string" ? raw.product_name : "Catalog product",
            category: null,
            brand: null,
            available_stock: numberValue(raw.available_stock),
          } : null,
        };
      });

      const fallbackRecommendation: "BID" | "REVIEW" | "NO-BID" = expired || closed ? "NO-BID" : "REVIEW";
      const reasons = match
        ? asStringArray(rationale.reasons)
        : [
            "Tenant matching has not completed for this newly ingested tender yet.",
            daysLeft === null ? "Deadline is not normalized yet; verify it at the source." : daysLeft < 0 ? "Stored deadline has passed." : `${daysLeft} days remain to the stored deadline.`,
            "LabNarrative will keep this record at REVIEW until an organization-specific match is computed.",
          ];

      return {
        id: tender.id,
        source_record_id: tender.source_record_id,
        reference_number: tender.reference_number,
        tender_number: tender.tender_number,
        title_ar: tender.title_ar,
        title_en: tender.title_en,
        buyer_ar: tender.buyer_ar,
        buyer_en: tender.buyer_en,
        purpose_ar: tender.purpose_ar,
        purpose_en: tender.purpose_en,
        source_status_text: tender.source_status_text,
        verification_state: tender.verification_state,
        source_url: tender.source_url,
        published_at: tender.published_at,
        deadline_at: tender.deadline_at,
        days_left: daysLeft,
        catalog_products: products.length,
        requirement_count: numberValue(match?.requirement_count),
        matched_signal_count: numberValue(match?.matched_count),
        catalog_coverage: Math.round(numberValue(match?.coverage) * 100),
        capability_fit: Math.round(numberValue(match?.capability_fit) * 100),
        score: numberValue(match?.score),
        score_components: {
          coverage: numberValue(scoreComponents.coverage, Math.round(numberValue(match?.coverage) * 100)),
          capability_fit: numberValue(scoreComponents.capability_fit, Math.round(numberValue(match?.capability_fit) * 100)),
          timing_fit: numberValue(scoreComponents.timing_fit, Math.round(numberValue(match?.timing_fit) * 100)),
          supply_fit: numberValue(scoreComponents.supply_fit, Math.round(numberValue(match?.supply_fit) * 100)),
          documentation_fit: numberValue(scoreComponents.documentation_fit, Math.round(numberValue(match?.documentation_fit) * 100)),
        },
        recommendation: match?.decision ?? fallbackRecommendation,
        decision_basis: match?.match_version ?? "pending_match",
        evidence_level: evidenceLevel,
        partial_document: partialDocument,
        reasons,
        requirement_matches: requirementMatches,
        computed_at: match?.computed_at ?? null,
        source: source ? {
          name: source.name,
          base_url: source.base_url,
          cadence: source.cadence,
          attribution_text: source.attribution_text,
        } : null,
        saved_opportunity: savedOpportunity,
      };
    }).sort((a, b) => {
      const aExpired = a.days_left !== null && a.days_left < 0;
      const bExpired = b.days_left !== null && b.days_left < 0;
      if (aExpired !== bExpired) return aExpired ? 1 : -1;
      if (a.recommendation !== b.recommendation) {
        const rank = { BID: 3, REVIEW: 2, "NO-BID": 1 } as const;
        return rank[b.recommendation] - rank[a.recommendation];
      }
      return b.score - a.score;
    });

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      org_id: orgId,
      catalog_products: products.length,
      scanned: opportunities.length,
      new_matches: opportunities.filter((opportunity) => !opportunity.saved_opportunity && opportunity.matched_signal_count > 0 && (opportunity.days_left === null || opportunity.days_left >= 0)).length,
      opportunities,
      caveat: "Opportunity scores use the latest persisted organization-specific tender match. Document evidence is kept separate from source verification, and lexical/catalog overlap is never treated as technical equivalence without human confirmation.",
    });
  } catch (error) {
    console.error("platform tender feed error", error);
    return NextResponse.json({ error: "Unable to load organization tender intelligence." }, { status: 500 });
  }
}
