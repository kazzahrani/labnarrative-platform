const EDGE_URL = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/career-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function allowedHost(request: Request) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() || "";
  if (host === "career.labnarrative.com" || host === "localhost") return true;
  return process.env.VERCEL_ENV !== "production" && host.endsWith(".vercel.app");
}

export async function POST(request: Request) {
  if (!allowedHost(request)) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const response = await fetch(EDGE_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "scan" }),
      signal: AbortSignal.timeout(55_000),
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("career scan proxy failed", error);
    return Response.json({ ok: false, error: "Opportunity scan failed." }, { status: 502 });
  }
}
