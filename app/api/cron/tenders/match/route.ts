import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authorizeTenderAutomation } from "../../../../../lib/tenders/automation-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MATCH_VERSION = "official_metadata_v1";

type Organization = { id: string; onboarding_status: string };
type Product = {
  id: string;
  org_id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  stock_qty: number;
  reserved_qty: number;
};
type Tender = {
  id: string;
  title_ar: string;
  title_en: string | null;
  purpose_ar: string | null;
  purpose_en: string | null;
  verification_state: string;
  deadline_at: string | null;
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

const stopTokens = new Set([
  "the", "and", "or", "for", "with", "from", "into", "of", "to", "in", "a", "an", "supply", "supplies",
  "item", "items", "product", "products", "laboratory", "lab", "equipment", "materials", "material",
  "توريد", "تأمين", "و", "او", "أو", "في", "من", "على", "الى", "إلى", "مع", "البند", "الصنف", "مختبر", "مختبرات", "مواد", "اجهزة", "أجهزة",
]);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE?.trim();
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing for tender matching.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

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
  return normalize(value).split(" ").filter((token) => token.length > 1 && !stopTokens.has(token));
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

function timingFit(daysLeft: number | null) {
  if (daysLeft === null) return 0.45;
  if (daysLeft < 0) return 0;
  if (daysLeft >= 14) return 1;
  if (daysLeft >= 7) return 0.82;
  if (daysLeft >= 3) return 0.55;
  return 0.25;
}

function metadataTags(value: string) {
  return [...new Set(tokens(value))].slice(0, 24);
}

async function ensureMetadataRequirements(supabase: ReturnType<typeof adminClient>, tenders: Tender[], current: Requirement[]) {
  const byTender = new Map<string, Requirement[]>();
  current.forEach((requirement) => {
    const list = byTender.get(requirement.tender_id) ?? [];
    list.push(requirement);
    byTender.set(requirement.tender_id, list);
  });

  const rows: Array<Record<string, unknown>> = [];
  for (const tender of tenders) {
    if ((byTender.get(tender.id) ?? []).length) continue;
    const titleText = [tender.title_en, tender.title_ar].filter(Boolean).join(" ");
    rows.push({
      tender_id: tender.id,
      name_en: tender.title_en || tender.title_ar,
      name_ar: tender.title_ar,
      tags: metadataTags([titleText, tender.purpose_en, tender.purpose_ar].filter(Boolean).join(" ")),
      extraction_method: "public_metadata",
      confidence: 0.65,
    });
    const purpose = tender.purpose_en || tender.purpose_ar;
    if (purpose && normalize(purpose) !== normalize(tender.title_en || tender.title_ar)) {
      rows.push({
        tender_id: tender.id,
        name_en: purpose,
        name_ar: tender.purpose_ar,
        tags: metadataTags(purpose),
        extraction_method: "public_metadata",
        confidence: 0.55,
      });
    }
  }

  if (!rows.length) return current;
  const { data, error } = await supabase
    .from("tender_requirements")
    .insert(rows)
    .select("id,tender_id,name_en,name_ar,tags,extraction_method,confidence");
  if (error) throw error;
  return [...current, ...((data ?? []) as Requirement[])];
}

export async function GET(request: Request) {
  try {
    const supabase = adminClient();
    if (!(await authorizeTenderAutomation(request, supabase))) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const [{ data: orgRows, error: orgError }, { data: productRows, error: productError }, { data: tenderRows, error: tenderError }] = await Promise.all([
      supabase.from("ln_organizations").select("id,onboarding_status").neq("onboarding_status", "paused"),
      supabase.from("ln_products").select("id,org_id,sku,name,category,brand,stock_qty,reserved_qty").eq("active", true),
      supabase.from("tenders").select("id,title_ar,title_en,purpose_ar,purpose_en,verification_state,deadline_at").eq("is_public", true),
    ]);
    if (orgError) throw orgError;
    if (productError) throw productError;
    if (tenderError) throw tenderError;

    const organizations = (orgRows ?? []) as Organization[];
    const products = (productRows ?? []) as Product[];
    const tenders = (tenderRows ?? []) as Tender[];
    const tenderIds = tenders.map((tender) => tender.id);
    let requirements: Requirement[] = [];
    if (tenderIds.length) {
      const { data, error } = await supabase
        .from("tender_requirements")
        .select("id,tender_id,name_en,name_ar,tags,extraction_method,confidence")
        .in("tender_id", tenderIds);
      if (error) throw error;
      requirements = (data ?? []) as Requirement[];
      requirements = await ensureMetadataRequirements(supabase, tenders, requirements);
    }

    const productsByOrg = new Map<string, Product[]>();
    products.forEach((product) => {
      const list = productsByOrg.get(product.org_id) ?? [];
      list.push(product);
      productsByOrg.set(product.org_id, list);
    });
    const requirementsByTender = new Map<string, Requirement[]>();
    requirements.forEach((requirement) => {
      const list = requirementsByTender.get(requirement.tender_id) ?? [];
      list.push(requirement);
      requirementsByTender.set(requirement.tender_id, list);
    });

    const computedAt = new Date().toISOString();
    const rows: Array<Record<string, unknown>> = [];
    for (const organization of organizations) {
      const orgProducts = productsByOrg.get(organization.id) ?? [];
      if (!orgProducts.length) continue;

      for (const tender of tenders) {
        const tenderRequirements = requirementsByTender.get(tender.id) ?? [];
        if (!tenderRequirements.length) continue;
        const matches = tenderRequirements.map((requirement) => {
          const ranked = orgProducts
            .map((product) => ({ product, score: fitRequirement(requirement, product) }))
            .sort((a, b) => b.score - a.score);
          const best = ranked[0] ?? null;
          const score = best?.score ?? 0;
          const possible = score >= 0.34;
          const availableStock = best ? Math.max(0, Number(best.product.stock_qty || 0) - Number(best.product.reserved_qty || 0)) : 0;
          return { requirement, best, score, possible, availableStock };
        });

        const requirementCount = matches.length;
        const matched = matches.filter((match) => match.possible);
        const matchedCount = matched.length;
        const exactCount = matches.filter((match) => match.score >= 0.9).length;
        const equivalentCount = matches.filter((match) => match.score >= 0.55 && match.score < 0.9).length;
        const missingCount = Math.max(0, requirementCount - matchedCount);
        const stockAvailableCount = matched.filter((match) => match.availableStock > 0).length;
        const requiresSourcingCount = matched.filter((match) => match.availableStock <= 0).length;
        const coverage = matchedCount / Math.max(1, requirementCount);
        const capabilityFit = matches.reduce((sum, match) => sum + match.score, 0) / Math.max(1, requirementCount);
        const daysLeft = daysUntil(tender.deadline_at);
        const timing = timingFit(daysLeft);
        const supply = matchedCount ? stockAvailableCount / matchedCount : 0;
        const extractionMethods = new Set(tenderRequirements.map((requirement) => requirement.extraction_method));
        const documentation = extractionMethods.has("human_verified") ? 1 : extractionMethods.has("document_extract") ? 0.9 : 0.55;
        const brandCategory = capabilityFit;
        const score = Math.max(0, Math.min(100, Math.round(coverage * 45 + capabilityFit * 20 + timing * 15 + supply * 10 + documentation * 10)));
        const expired = daysLeft !== null && daysLeft < 0;
        const closed = tender.verification_state === "closed";
        let decision: "BID" | "REVIEW" | "NO-BID" = "REVIEW";
        if (expired || closed) decision = "NO-BID";
        else if (tender.verification_state === "verified_metadata" && documentation >= 0.8 && requirementCount >= 3 && coverage >= 0.8 && score >= 75 && (daysLeft === null || daysLeft >= 5)) decision = "BID";

        const reasons = [
          `${matchedCount} of ${requirementCount} requirement signals overlap the organization catalog.`,
          daysLeft === null ? "Deadline is not normalized yet." : daysLeft < 0 ? "Stored deadline has passed." : `${daysLeft} days remain to the stored deadline.`,
          documentation < 0.8 ? "Public metadata is not enough for a technical BID recommendation; tender documents / BoQ should be reviewed." : "Tender-document evidence is available for technical review.",
        ];
        const topMatches = matches
          .filter((match) => match.best)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((match) => ({
            requirement_id: match.requirement.id,
            product_id: match.best?.product.id,
            sku: match.best?.product.sku,
            product_name: match.best?.product.name,
            fit: Number(match.score.toFixed(3)),
            available_stock: match.availableStock,
          }));

        rows.push({
          org_id: organization.id,
          tender_id: tender.id,
          matched_count: matchedCount,
          requirement_count: requirementCount,
          coverage: Number(coverage.toFixed(4)),
          capability_fit: Number(capabilityFit.toFixed(4)),
          timing_fit: Number(timing.toFixed(4)),
          score,
          decision,
          rationale: { reasons, top_matches: topMatches, evidence_level: documentation >= 0.8 ? "document" : "public_metadata" },
          computed_at: computedAt,
          exact_count: exactCount,
          equivalent_count: equivalentCount,
          missing_count: missingCount,
          stock_available_count: stockAvailableCount,
          requires_sourcing_count: requiresSourcingCount,
          brand_category_fit: Number(brandCategory.toFixed(4)),
          supply_fit: Number(supply.toFixed(4)),
          documentation_fit: documentation,
          match_version: MATCH_VERSION,
          score_components: {
            coverage: Math.round(coverage * 100),
            capability_fit: Math.round(capabilityFit * 100),
            timing_fit: Math.round(timing * 100),
            supply_fit: Math.round(supply * 100),
            documentation_fit: Math.round(documentation * 100),
          },
        });
      }
    }

    for (let index = 0; index < rows.length; index += 200) {
      const { error } = await supabase
        .from("tender_matches")
        .upsert(rows.slice(index, index + 200), { onConflict: "org_id,tender_id" });
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      status: "succeeded",
      match_version: MATCH_VERSION,
      organizations_scanned: organizations.length,
      organizations_with_products: [...productsByOrg.keys()].length,
      tenders_scanned: tenders.length,
      requirement_signals: requirements.length,
      tenant_matches_upserted: rows.length,
      computed_at: computedAt,
    });
  } catch (error) {
    console.error("automatic tender matching failed", error);
    return NextResponse.json({ error: "Automatic tender matching failed." }, { status: 500 });
  }
}
