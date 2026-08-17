import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PDF_ENDPOINT =
  "https://pryezqkkildppjxbdrsj.supabase.co/functions/v1/client-report-pdf-v3";

function reportIdFrom(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("report_id") || "";
  return /^[0-9a-f-]{36}$/i.test(id) ? id : "";
}

async function proxy(req: NextRequest, head = false) {
  const reportId = reportIdFrom(req);
  if (!reportId) return new Response("Invalid report", { status: 400 });

  const target = new URL(PDF_ENDPOINT);
  target.searchParams.set("report_id", reportId);
  if (req.nextUrl.searchParams.get("download") === "1") {
    target.searchParams.set("download", "1");
  }

  const upstream = await fetch(target, {
    method: head ? "HEAD" : "GET",
    cache: "no-store",
    headers: { accept: "application/pdf" },
  });

  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "cache-control": "no-store" },
    });
  }

  const headers = new Headers();
  headers.set("content-type", "application/pdf");
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-labnarrative-report-proxy", "1");
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  const count = upstream.headers.get("x-report-opportunity-count");
  if (count) headers.set("x-report-opportunity-count", count);
  const brand = upstream.headers.get("x-labnarrative-brand");
  if (brand) headers.set("x-labnarrative-brand", brand);

  if (head) return new Response(null, { status: 200, headers });
  return new Response(await upstream.arrayBuffer(), { status: 200, headers });
}

export async function GET(req: NextRequest) {
  return proxy(req, false);
}

export async function HEAD(req: NextRequest) {
  return proxy(req, true);
}
