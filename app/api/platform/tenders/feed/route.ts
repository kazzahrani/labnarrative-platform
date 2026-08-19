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
  source_indexed_at: string | null;
  published_at: string | null;
  deadline_at: string | null;
  updated_at: string;
};

type Requirement = {
  id: string;
  tender_id: string;
  name_en: string;
  name_ar: string | null;
  tags: string[];
  extraction_method: string;
  confidence: number;
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

const stopTokens = new Set([
  "the", "and", "or", "for", "with", "from", "into", "of", "to", "in", "a", "an", "supply", "supplies",
  "item", "items", "product", "products", "laboratory", "lab", "equipment", "materials", "material",
  "توريد", "تأمين", "و", "او", "أو", "في", "من", "على", "الى", "إلى", "مع", "البند", "الصنف", "مختبر", "مختبرات", "مواد", "اجهزة", "أجهزة",
]);

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopTokens.has(token));
}

function fitRequirement(requirement: Requirement, product: Product) {
  const requested = [requirement.name_en, requirement.name_ar ?? "", ...(requirement.tags ?? [])].filter(Boolean).join(" ");
  const offered = [product.sku, product.name, product.category ?? "", product.brand ?? ""].filter(Boolean).join(" ");
  const requestedNorm = normalize(requested);
  const offeredNorm = normalize(offered);
  const sku = normalize(product.sku);

  if (sku && requestedNorm.includes(sku)) return 0.98;
  if (requestedNorm && offeredNorm && (requestedNorm.includes(offeredNorm) || offeredNorm.includes(requestedNorm))) return 0.9;

  const left = new Set(tokens(requested));
  const right = new Set(tokens(offered));
  if (!left.size || !right.size) return 0;

  const intersection = [...left].filter((token) => right.has(token)).length;
  const requestedCoverage = intersection / Math.max(1, Math.min(left.size, 8));
  const jaccard = intersection / Math.max(1, new Set([...left, ...right]).size);
  return Math.min(1, requestedCoverage * 0.75 + jaccard * 0.25);
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - Date.now()) / 86_400_000);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orgId = url.searchParams.get("org_id")?.trim() ?? "";
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

    const [{ data: productRows, error: productError }, { data: tenderRows, error: tenderError }, { data: savedRows, error: savedError }] = await Promise.all([
      supabase
        .from("ln_products")
        .select("id,sku,name,category,brand,stock_qty,reserved_qty")
        .eq("org_id", orgId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("tenders")
        .select("id,source_id,source_record_id,tender_number,reference_number,title_ar,title_en,buyer_ar,buyer_en,purpose_ar,purpose_en,source_status_text,verification_state,source_url,source_indexed_at,published_at,deadline_at,updated_at")
        .eq("is_public", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(150),
      supabase
        .from("ln_opportunities")
        .select("id,source_tender_id,status")
        .eq("org_id", orgId)
        .not("source_tender_id", "is", null),
    ]);

    if (productError) throw productError;
    if (tenderError) throw tenderError;
    if (savedError) throw savedError;

    const products = (productRows ?? []) as Product[];
    const tenders = (tenderRows ?? []) as TenderRow[];
    const saved = (savedRows ?? []) as SavedOpportunity[];
    const tenderIds = tenders.map((tender) => tender.id);
    const sourceIds = [...new Set(tenders.map((tender) => tender.source_id))];

    const [{ data: requirementRows, error: requirementError }, { data: sourceRows, error: sourceError }] = await Promise.all([
      tenderIds.length
        ? supabase
            .from("tender_requirements")
            .select("id,tender_id,name_en,name_ar,tags,extraction_method,confidence")
            .in("tender_id", tenderIds)
            .order("confidence", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      sourceIds.length
        ? supabase
            .from("tender_data_sources")
            .select("id,name,base_url,cadence,attribution_text")
            .in("id", sourceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (requirementError) throw requirementError;
    if (sourceError) throw sourceError;

    const requirements = (requirementRows ?? []) as Requirement[];
    const sources = new Map(((sourceRows ?? []) as SourceRow[]).map((source) => [source.id, source]));
    const savedByTender = new Map(saved.filter((row) => row.source_tender_id).map((row) => [String(row.source_tender_id), row]));

    const opportunities = tenders.map((tender) => {
      const tenderRequirements = requirements.filter((requirement) => requirement.tender_id === tender.id);
      const requirementMatches = tenderRequirements.map((requirement) => {
        const ranked = products
          .map((product) => ({ product, score: fitRequirement(requirement, product) }))
          .sort((a, b) => b.score - a.score);
        const best = ranked[0];
        const possible = Boolean(best && best.score >= 0.34);
        return {
          requirement_id: requirement.id,
          requirement: requirement.name_en || requirement.name_ar || "Requirement",
          confidence: Number(requirement.confidence || 0),
          possible_match: possible,
          match_score: Number((best?.score ?? 0).toFixed(3)),
          product: possible && best ? {
            id: best.product.id,
            sku: best.product.sku,
            name: best.product.name,
            category: best.product.category,
            brand: best.product.brand,
            available_stock: Math.max(0, Number(best.product.stock_qty || 0) - Number(best.product.reserved_qty || 0)),
          } : null,
        };
      });

      const matchedSignals = requirementMatches.filter((match) => match.possible_match).length;
      const requirementCount = tenderRequirements.length;
      const metadataCoverage = requirementCount ? matchedSignals / requirementCount : 0;
      const daysLeft = daysUntil(tender.deadline_at);
      const timingFit = daysLeft === null ? 0.45 : daysLeft < 0 ? 0 : daysLeft >= 14 ? 1 : daysLeft >= 7 ? 0.82 : daysLeft >= 3 ? 0.55 : 0.25;
      const sourceFit = tender.verification_state === "verified_metadata" ? 1 : tender.verification_state === "needs_recheck" ? 0.55 : tender.verification_state === "closed" ? 0 : 0.35;
      const completenessFit = requirementCount >= 4 ? 1 : requirementCount > 0 ? 0.65 : 0.25;
      const score = Math.round(clamp01(metadataCoverage) * 60 + timingFit * 15 + sourceFit * 15 + completenessFit * 10);
      const expired = daysLeft !== null && daysLeft < 0;
      const closed = tender.verification_state === "closed";

      let recommendation: "BID" | "REVIEW" | "NO-BID" = "REVIEW";
      if (expired || closed) recommendation = "NO-BID";
      else if (tender.verification_state === "verified_metadata" && requirementCount >= 3 && metadataCoverage >= 0.8 && score >= 75 && (daysLeft === null || daysLeft >= 5)) recommendation = "BID";

      const reasons = [
        requirementCount
          ? `${matchedSignals} of ${requirementCount} public requirement signals overlap the organization catalog.`
          : "No bill-of-quantities or structured requirement lines are available in the stored public metadata yet.",
        daysLeft === null ? "Deadline is not yet normalized; verify it at the source." : daysLeft < 0 ? "Stored deadline has passed." : `${daysLeft} days remain to the stored deadline.`,
        tender.verification_state === "verified_metadata"
          ? "Source metadata has been verified in LabNarrative."
          : "Current source status must be rechecked before a bid decision.",
        "Metadata overlap is not technical product equivalence. Possible matches require human confirmation and BoQ analysis.",
      ];

      const source = sources.get(tender.source_id) ?? null;
      const savedOpportunity = savedByTender.get(tender.id) ?? null;
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
        requirement_count: requirementCount,
        matched_signal_count: matchedSignals,
        metadata_coverage: Math.round(metadataCoverage * 100),
        score,
        score_components: {
          metadata_coverage: Math.round(metadataCoverage * 100),
          timing_fit: Math.round(timingFit * 100),
          source_verification: Math.round(sourceFit * 100),
          metadata_completeness: Math.round(completenessFit * 100),
        },
        recommendation,
        decision_basis: "public_metadata",
        reasons,
        requirement_matches: requirementMatches,
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
      return b.score - a.score;
    });

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      org_id: orgId,
      catalog_products: products.length,
      scanned: opportunities.length,
      new_matches: opportunities.filter((opportunity) => !opportunity.saved_opportunity && (opportunity.days_left === null || opportunity.days_left >= 0)).length,
      opportunities,
      caveat: "Automatic feed V1 uses official-source metadata already ingested into LabNarrative. It does not treat metadata overlap as technical equivalence or a substitute for the tender documents / BoQ.",
    });
  } catch (error) {
    console.error("platform tender feed error", error);
    return NextResponse.json({ error: "Unable to build the organization tender feed." }, { status: 500 });
  }
}
