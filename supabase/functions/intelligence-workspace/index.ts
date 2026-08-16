import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;

function text(v: unknown, max = 3000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function serviceKey() {
  try {
    const m = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
    if (m.default) return m.default;
  } catch {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
function allowedOrigin(origin: string | null) {
  if (!origin) return "*";
  try {
    const u = new URL(origin);
    if (u.protocol === "https:" && (u.hostname === "labnarrative.com" || u.hostname === "www.labnarrative.com" || /^labnarrative-platform(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(u.hostname))) return origin;
    if (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) return origin;
  } catch {}
  return "";
}
function cors(origin: string | null) {
  const a = allowedOrigin(origin);
  return {
    ...(a ? { "Access-Control-Allow-Origin": a } : {}),
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function normalizePriority(v: unknown) {
  const s = text(v, 20);
  return ["high", "normal", "low"].includes(s) ? s : "normal";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceKey();
  if (!base || !key) return json({ error: "Workspace service is not configured." }, 500, origin);
  const db = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({})) as J;
  const token = text(body.token, 100);
  const action = text(body.action, 30) || "load";
  if (!isUuid(token)) return json({ error: "This workspace link is invalid." }, 400, origin);

  async function loadWorkspace() {
    const { data: workspace, error: workspaceError } = await db
      .from("intelligence_client_workspaces")
      .select("*")
      .eq("access_token", token)
      .maybeSingle();
    if (workspaceError || !workspace) return { ok: false as const, status: 404, error: "Workspace not found." };

    const { data: purchase, error: purchaseError } = await db
      .from("intelligence_package_purchases")
      .select("id,package_key,package_name,product_count,amount,currency,status,payer_name,payer_email,paid_at,source_report_id")
      .eq("id", workspace.purchase_id)
      .maybeSingle();
    if (purchaseError || !purchase || purchase.status !== "paid") return { ok: false as const, status: 403, error: "This workspace is not active." };

    let { data: productRows } = await db
      .from("intelligence_product_requests")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("position");
    productRows = productRows || [];

    if (productRows.length < purchase.product_count) {
      const existing = new Set(productRows.map((p: any) => Number(p.position)));
      const missing: J[] = [];
      for (let i = 1; i <= purchase.product_count; i++) {
        if (!existing.has(i)) missing.push({ workspace_id: workspace.id, position: i, status: "awaiting_product", priority: "normal" });
      }
      if (missing.length) {
        await db.from("intelligence_product_requests").insert(missing);
        const refreshed = await db.from("intelligence_product_requests").select("*").eq("workspace_id", workspace.id).order("position");
        productRows = refreshed.data || productRows;
      }
    }

    let sourceReport: any = null;
    if (purchase.source_report_id) {
      try {
        const r = await fetch(`https://pryezqkkildppjxbdrsj.supabase.co/functions/v1/client-report-summary?report_id=${encodeURIComponent(purchase.source_report_id)}`, { headers: { accept: "application/json" }, cache: "no-store" });
        if (r.ok) {
          const payload = await r.json();
          sourceReport = payload.report || null;
        }
      } catch {}
    }

    const products = productRows.map((p: any) => ({
      id: p.id,
      position: p.position,
      productName: p.product_name || "",
      catalogNumber: p.catalog_number || "",
      productUrl: p.product_url || "",
      priority: p.priority || "normal",
      clientNotes: p.client_notes || "",
      status: p.status,
      reportId: p.intelligence_report_id || "",
      webReportUrl: p.web_report_url || "",
      pdfReportUrl: p.pdf_report_url || "",
    }));

    return {
      ok: true as const,
      data: {
        ok: true,
        workspace: {
          id: workspace.id,
          companyName: workspace.company_name || "",
          companyWebsite: workspace.company_website || "",
          contactName: workspace.contact_name || "",
          contactEmail: workspace.contact_email || purchase.payer_email || "",
          targetGeography: workspace.target_geography || "",
          clientNotes: workspace.client_notes || "",
          onboardingStatus: workspace.onboarding_status,
          submittedAt: workspace.submitted_at,
        },
        purchase: {
          id: purchase.id,
          packageName: purchase.package_name,
          productCount: purchase.product_count,
          amount: Number(purchase.amount),
          currency: purchase.currency,
          paidAt: purchase.paid_at,
          payerName: purchase.payer_name || "",
          payerEmail: purchase.payer_email || "",
        },
        products,
        sourceReport,
      },
    };
  }

  if (action === "load") {
    const result = await loadWorkspace();
    if (!result.ok) return json({ error: result.error }, result.status, origin);
    return json(result.data, 200, origin);
  }
  if (action !== "save") return json({ error: "Unknown workspace action." }, 400, origin);

  const current = await loadWorkspace();
  if (!current.ok) return json({ error: current.error }, current.status, origin);
  const workspace = current.data.workspace;
  const purchase = current.data.purchase;
  const currentProducts = current.data.products;

  const companyName = text(body.companyName, 300);
  const companyWebsite = text(body.companyWebsite, 1200);
  const contactName = text(body.contactName, 300);
  const contactEmail = text(body.contactEmail, 320);
  const targetGeography = text(body.targetGeography, 500);
  const clientNotes = text(body.clientNotes, 4000);
  const rawProducts = Array.isArray(body.products) ? body.products as J[] : [];
  const byPosition = new Map<number, J>();
  for (const item of rawProducts) {
    const position = Number(item.position);
    if (Number.isInteger(position) && position >= 1 && position <= purchase.productCount) byPosition.set(position, item);
  }

  const now = new Date().toISOString();
  for (const existing of currentProducts) {
    if (!["awaiting_product", "submitted"].includes(existing.status)) continue;
    const item = byPosition.get(existing.position);
    if (!item) continue;
    const productName = text(item.productName, 600);
    const productUrl = text(item.productUrl, 1600);
    const catalogNumber = text(item.catalogNumber, 300);
    const notes = text(item.clientNotes, 3000);
    const filled = Boolean(productName || productUrl || catalogNumber);
    await db.from("intelligence_product_requests").update({
      product_name: productName || null,
      product_url: productUrl || null,
      catalog_number: catalogNumber || null,
      priority: normalizePriority(item.priority),
      client_notes: notes || null,
      status: filled ? "submitted" : "awaiting_product",
      submitted_at: filled ? now : null,
      updated_at: now,
    }).eq("id", existing.id);
  }

  const { data: afterProducts } = await db.from("intelligence_product_requests").select("status").eq("workspace_id", workspace.id);
  const submittedCount = (afterProducts || []).filter((p: any) => p.status !== "awaiting_product").length;
  const detailsReady = Boolean(companyName && contactName && contactEmail);
  const onboardingStatus = !detailsReady ? "awaiting_details" : submittedCount >= purchase.productCount ? "ready_for_research" : "collecting_products";

  await db.from("intelligence_client_workspaces").update({
    company_name: companyName || null,
    company_website: companyWebsite || null,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    target_geography: targetGeography || null,
    client_notes: clientNotes || null,
    onboarding_status: onboardingStatus,
    submitted_at: onboardingStatus === "ready_for_research" ? (workspace.submittedAt || now) : null,
    updated_at: now,
  }).eq("id", workspace.id);

  const refreshed = await loadWorkspace();
  if (!refreshed.ok) return json({ error: refreshed.error }, refreshed.status, origin);
  return json(refreshed.data, 200, origin);
});
