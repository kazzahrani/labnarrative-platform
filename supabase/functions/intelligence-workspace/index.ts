import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const PORTFOLIO_BRIDGE_URL = "https://pryezqkkildppjxbdrsj.supabase.co/functions/v1/client-portfolio-bridge";

function text(v: unknown, max = 3000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function serviceKey() { try { const m = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>; if (m.default) return m.default; } catch {} return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function allowedOrigin(origin: string | null) { if (!origin) return "*"; try { const u = new URL(origin); if (u.protocol === "https:" && (u.hostname === "labnarrative.com" || u.hostname === "www.labnarrative.com" || /^labnarrative-platform(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(u.hostname))) return origin; if (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) return origin; } catch {} return ""; }
function cors(origin: string | null) { const a = allowedOrigin(origin); return { ...(a ? { "Access-Control-Allow-Origin": a } : {}), "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" }; }
function json(body: unknown, status = 200, origin: string | null = null) { return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function isUuid(v: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
function normalizePriority(v: unknown) { const s = text(v, 20); return ["high", "normal", "low"].includes(s) ? s : "normal"; }
function object(v: unknown): Record<string, any> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}; }
function hasProductIdentity(item: any) { return Boolean(text(item?.productName, 600) || text(item?.catalogNumber, 300) || text(item?.productUrl, 1600)); }
async function bridge(action: string, token: string) { const r = await fetch(PORTFOLIO_BRIDGE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, token }), cache: "no-store" }); const p = await r.json().catch(() => ({})) as any; if (!r.ok) throw new Error(String(p.error || "Intelligence fulfillment bridge failed.")); return p; }

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const base = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  if (!base || !key) return json({ error: "Workspace service is not configured." }, 500, origin);
  const db = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({})) as J;
  const token = text(body.token, 100), action = text(body.action, 30) || "load";
  if (!isUuid(token)) return json({ error: "This workspace link is invalid." }, 400, origin);

  async function loadWorkspace() {
    const wr = await db.from("intelligence_client_workspaces").select("*").eq("access_token", token).maybeSingle();
    const workspace: any = wr.data;
    if (wr.error || !workspace) return { ok: false as const, status: 404, error: "Workspace not found." };
    if (workspace.portal_activated_at && origin) return { ok: false as const, status: 410, error: "This workspace now uses the authenticated Client Portal. Sign in at labnarrative.com/intelligence/login." };

    const pr = await db.from("intelligence_package_purchases").select("id,package_key,package_name,product_count,amount,currency,status,payer_name,payer_email,paid_at,source_report_id,provider_metadata").eq("id", workspace.purchase_id).maybeSingle();
    const purchase: any = pr.data;
    if (pr.error || !purchase || purchase.status !== "paid") return { ok: false as const, status: 403, error: "This workspace is not active." };

    let rows = (await db.from("intelligence_product_requests").select("*").eq("workspace_id", workspace.id).order("position")).data || [];
    if (rows.length < purchase.product_count) {
      const positions = new Set(rows.map((p: any) => Number(p.position))), missing: J[] = [];
      for (let i = 1; i <= purchase.product_count; i++) if (!positions.has(i)) missing.push({ workspace_id: workspace.id, position: i, status: "awaiting_product", priority: "normal" });
      if (missing.length) { await db.from("intelligence_product_requests").insert(missing); rows = (await db.from("intelligence_product_requests").select("*").eq("workspace_id", workspace.id).order("position")).data || rows; }
    }

    let sourceReport: any = null;
    const snapshot = object(object(purchase.provider_metadata).source_report_snapshot);
    if (purchase.source_report_id && snapshot.id === purchase.source_report_id) sourceReport = snapshot;
    else if (purchase.source_report_id) { try { const r = await fetch(`https://pryezqkkildppjxbdrsj.supabase.co/functions/v1/client-report-summary?report_id=${encodeURIComponent(purchase.source_report_id)}`, { headers: { accept: "application/json" }, cache: "no-store" }); if (r.ok) sourceReport = (await r.json()).report || null; } catch {} }

    const live = new Map<string, any>();
    const fulfillmentStarted = ["in_progress", "complete"].includes(String(workspace.onboarding_status || "")) || rows.some((p: any) => ["queued", "researching", "scientific_review", "complete", "blocked"].includes(String(p.status || "")));
    if (fulfillmentStarted) { try { const sp = await bridge("status", token); for (const item of Array.isArray(sp.jobs) ? sp.jobs : []) if (item?.sourceProductRequestId) live.set(item.sourceProductRequestId, item); } catch (e) { console.error("portfolio status bridge", e); } }

    const products = rows.map((p: any) => { const remote = live.get(p.id); return { id: p.id, position: p.position, productName: p.product_name || "", catalogNumber: p.catalog_number || "", productUrl: p.product_url || "", priority: p.priority || "normal", clientNotes: p.client_notes || "", status: remote?.status || p.status, reportId: remote?.reportId || p.intelligence_report_id || "", webReportUrl: remote?.webReportUrl || p.web_report_url || "", pdfReportUrl: remote?.pdfReportUrl || p.pdf_report_url || "" }; });
    let onboardingStatus = workspace.onboarding_status;
    if (products.length && products.every((p: any) => p.status === "complete") && onboardingStatus !== "complete") { onboardingStatus = "complete"; await db.from("intelligence_client_workspaces").update({ onboarding_status: "complete", updated_at: new Date().toISOString() }).eq("id", workspace.id); }

    return { ok: true as const, data: { ok: true, workspace: { id: workspace.id, companyName: workspace.company_name || "", companyWebsite: workspace.company_website || "", contactName: workspace.contact_name || "", contactEmail: workspace.contact_email || purchase.payer_email || "", targetGeography: workspace.target_geography || "", clientNotes: workspace.client_notes || "", onboardingStatus, submittedAt: workspace.submitted_at }, purchase: { id: purchase.id, packageKey: purchase.package_key || "", packageName: purchase.package_name, productCount: purchase.product_count, amount: Number(purchase.amount), currency: purchase.currency, paidAt: purchase.paid_at, payerName: purchase.payer_name || "", payerEmail: purchase.payer_email || "", sourceReportId: purchase.source_report_id || "" }, products, sourceReport } };
  }

  if (action === "load") { const result = await loadWorkspace(); if (!result.ok) return json({ error: result.error }, result.status, origin); return json(result.data, 200, origin); }
  if (!["save", "submit_product"].includes(action)) return json({ error: "Unknown workspace action." }, 400, origin);

  const current = await loadWorkspace();
  if (!current.ok) return json({ error: current.error }, current.status, origin);
  const workspace = current.data.workspace, purchase = current.data.purchase, currentProducts = current.data.products;
  const companyName = text(body.companyName, 300), companyWebsite = text(body.companyWebsite, 1200), contactName = text(body.contactName, 300), contactEmail = text(body.contactEmail, 320), targetGeography = text(body.targetGeography, 500), clientNotes = text(body.clientNotes, 4000);
  const rawProducts = Array.isArray(body.products) ? body.products as J[] : [], byPosition = new Map<number, J>();
  for (const item of rawProducts) { const position = Number(item.position); if (Number.isInteger(position) && position >= 1 && position <= purchase.productCount) byPosition.set(position, item); }

  const now = new Date().toISOString();
  for (const existing of currentProducts) {
    if (existing.status !== "awaiting_product") continue;
    const item = byPosition.get(existing.position); if (!item) continue;
    await db.from("intelligence_product_requests").update({ product_name: text(item.productName, 600) || null, product_url: text(item.productUrl, 1600) || null, catalog_number: text(item.catalogNumber, 300) || null, priority: normalizePriority(item.priority), client_notes: text(item.clientNotes, 3000) || null, updated_at: now }).eq("id", existing.id);
  }

  const detailsReady = Boolean(companyName && contactName && contactEmail);
  const hasExisting = currentProducts.some((p: any) => ["submitted", "queued", "researching", "scientific_review", "complete", "blocked"].includes(String(p.status || "")));
  let onboardingStatus = !detailsReady ? "awaiting_details" : hasExisting ? "in_progress" : "collecting_products";
  await db.from("intelligence_client_workspaces").update({ company_name: companyName || null, company_website: companyWebsite || null, contact_name: contactName || null, contact_email: contactEmail || null, target_geography: targetGeography || null, client_notes: clientNotes || null, onboarding_status: onboardingStatus, updated_at: now }).eq("id", workspace.id);
  try { await bridge("register", token); } catch (e) { console.error("portfolio account mirror", e); }

  if (action === "submit_product") {
    if (!detailsReady) return json({ error: "Complete company name, contact name and contact email before starting an analysis." }, 400, origin);
    const position = Number(body.position), selected = byPosition.get(position), existing = currentProducts.find((p: any) => Number(p.position) === position);
    if (!Number.isInteger(position) || position < 1 || position > purchase.productCount) return json({ error: "Choose a valid product slot." }, 400, origin);
    if (!selected || !hasProductIdentity(selected)) return json({ error: "Add a product name, catalogue number, or product URL before starting this analysis." }, 400, origin);
    if (!existing) return json({ error: "Product slot not found." }, 404, origin);
    if (existing.status !== "awaiting_product") return json({ error: "This product has already been submitted." }, 409, origin);

    await db.from("intelligence_product_requests").update({ status: "submitted", submitted_at: now, updated_at: now }).eq("id", existing.id).eq("status", "awaiting_product");
    await db.from("intelligence_client_workspaces").update({ onboarding_status: "ready_for_research", submitted_at: workspace.submittedAt || now, updated_at: now }).eq("id", workspace.id);
    try {
      const ingested = await bridge("ingest", token), queued = Array.isArray(ingested.queued) ? ingested.queued : [];
      for (const job of queued) if (job?.sourceProductRequestId) await db.from("intelligence_product_requests").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", job.sourceProductRequestId).in("status", ["submitted", "queued"]);
      onboardingStatus = "in_progress";
      await db.from("intelligence_client_workspaces").update({ onboarding_status: "in_progress", updated_at: new Date().toISOString() }).eq("id", workspace.id);
      try { await bridge("register", token); } catch (e) { console.error("portfolio account mirror after ingest", e); }
    } catch (e) {
      console.error("portfolio ingest bridge", e);
      await db.from("intelligence_product_requests").update({ status: "awaiting_product", submitted_at: null, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("status", "submitted");
      await db.from("intelligence_client_workspaces").update({ onboarding_status: hasExisting ? "in_progress" : "collecting_products", updated_at: new Date().toISOString() }).eq("id", workspace.id);
      try { await bridge("register", token); } catch {}
      return json({ error: "The Intelligence queue could not start this product yet. Your product is still saved and you can try again." }, 502, origin);
    }
  }

  const refreshed = await loadWorkspace();
  if (!refreshed.ok) return json({ error: refreshed.error }, refreshed.status, origin);
  return json(refreshed.data, 200, origin);
});
