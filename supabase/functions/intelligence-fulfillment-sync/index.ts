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
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function isHash(v: string) {
  return /^[0-9a-f]{64}$/i.test(v);
}
async function sha256(v: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return out({ error: "method_not_allowed" }, 405);
  if (req.headers.get("origin")) return out({ error: "browser_origin_rejected" }, 403);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceKey();
  if (!base || !key) return out({ error: "backend_not_configured" }, 500);
  const db = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const body = await req.json().catch(() => ({})) as J;
  const productRequestId = text(body.productRequestId, 100);
  const workspaceTokenHash = text(body.workspaceTokenHash, 100).toLowerCase();
  const status = text(body.status, 40);
  const reportId = text(body.reportId, 100);
  const webReportUrl = text(body.webReportUrl, 1800);
  const pdfReportUrl = text(body.pdfReportUrl, 1800);
  const allowedStatuses = ["queued", "researching", "scientific_review", "complete", "blocked"];

  if (!isUuid(productRequestId) || !isHash(workspaceTokenHash) || !allowedStatuses.includes(status)) {
    return out({ error: "invalid_sync_payload" }, 400);
  }
  if (reportId && !isUuid(reportId)) return out({ error: "invalid_report_id" }, 400);

  try {
    const productQ = await db.from("intelligence_product_requests").select("id,workspace_id").eq("id", productRequestId).maybeSingle();
    if (productQ.error || !productQ.data) return out({ error: "product_request_not_found" }, 404);

    const workspaceQ = await db.from("intelligence_client_workspaces").select("id,access_token,onboarding_status").eq("id", productQ.data.workspace_id).maybeSingle();
    if (workspaceQ.error || !workspaceQ.data) return out({ error: "workspace_not_found" }, 404);

    const expectedHash = await sha256(String(workspaceQ.data.access_token || ""));
    if (expectedHash !== workspaceTokenHash) return out({ error: "workspace_capability_rejected" }, 403);

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status,
      updated_at: now,
      intelligence_report_id: reportId || null,
      web_report_url: webReportUrl || null,
      pdf_report_url: pdfReportUrl || null,
    };
    const saved = await db.from("intelligence_product_requests").update(update).eq("id", productRequestId);
    if (saved.error) throw new Error(saved.error.message);

    const rowsQ = await db.from("intelligence_product_requests").select("status").eq("workspace_id", workspaceQ.data.id);
    if (rowsQ.error) throw new Error(rowsQ.error.message);
    const rows = rowsQ.data || [];
    const complete = rows.length > 0 && rows.every((row: any) => row.status === "complete");
    const anyStarted = rows.some((row: any) => ["queued", "researching", "scientific_review", "complete", "blocked"].includes(String(row.status || "")));
    const onboarding = complete ? "complete" : anyStarted ? "in_progress" : workspaceQ.data.onboarding_status;
    if (onboarding !== workspaceQ.data.onboarding_status) {
      await db.from("intelligence_client_workspaces").update({ onboarding_status: onboarding, updated_at: now }).eq("id", workspaceQ.data.id);
    }

    return out({ ok: true, productRequestId, status, reportId: reportId || null, workspaceStatus: onboarding });
  } catch (e) {
    console.error(e);
    return out({ error: "fulfillment_sync_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
