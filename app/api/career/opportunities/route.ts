const EDGE_URL = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/career-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const response = await fetch(`${EDGE_URL}?action=opportunities`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
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
    console.error("career opportunities proxy failed", error);
    return Response.json({ ok: false, error: "Career opportunities are temporarily unavailable." }, { status: 502 });
  }
}
