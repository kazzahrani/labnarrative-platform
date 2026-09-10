import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_FUNCTION_URL = "https://tksxauosaswshylbaayf.supabase.co/functions/v1/paper-bot-share";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tqhr6-YB7dXxdcogjPVAiw_RVlSYbZt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const countView = request.nextUrl.searchParams.get("countView") !== "false";

  if (!slug) {
    return Response.json({ ok: false, error: "slug_required" }, { status: 400 });
  }

  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "get", slug, countView }),
      cache: "no-store",
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("shared-bot proxy failed", error);
    return Response.json(
      { ok: false, error: "shared_bot_proxy_failed", message: "Could not load this shared bot right now." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
