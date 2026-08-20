const EDGE_URL = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/career-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const response = await fetch(EDGE_URL, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "scheduled_scan" }),
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
    console.error("scheduled career proxy failed", error);
    return Response.json({ ok: false, error: "Scheduled opportunity scan failed." }, { status: 502 });
  }
}
