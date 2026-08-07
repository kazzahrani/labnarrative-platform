import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: NextRequest) {
  try {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";
    const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";

    if (
      !host.endsWith(`.${rootDomain}`)
      || host === `www.${rootDomain}`
      || host === `platform.${rootDomain}`
    ) {
      return new NextResponse(null, { status: 204 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const slug = trimText(body.slug, 120).toLowerCase();
    const sessionId = trimText(body.sessionId, 36);
    const eventType = trimText(body.eventType, 30) || "page_view";
    const path = trimText(body.path, 500) || "/";
    const source = trimText(body.source, 120);
    const medium = trimText(body.medium, 120);
    const campaign = trimText(body.campaign, 180);

    if (
      !SLUG_PATTERN.test(slug)
      || !UUID_PATTERN.test(sessionId)
      || !["page_view", "cta_click"].includes(eventType)
      || !path.startsWith("/")
    ) {
      return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: "Analytics is not configured." }, { status: 503 });
    }

    const siteQuery = new URLSearchParams({
      select: "id,status",
      slug: `eq.${slug}`,
      status: "eq.concept",
      limit: "1",
    });

    const siteResponse = await fetch(`${supabaseUrl}/rest/v1/sites?${siteQuery.toString()}`, {
      headers: { apikey: publishableKey },
      cache: "no-store",
    });

    if (!siteResponse.ok) {
      return NextResponse.json({ error: "Unable to resolve concept." }, { status: 502 });
    }

    const sites = (await siteResponse.json()) as Array<{ id: string; status: string }>;
    const site = sites[0];
    if (!site) {
      return new NextResponse(null, { status: 204 });
    }

    const eventResponse = await fetch(`${supabaseUrl}/rest/v1/concept_events`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        site_id: site.id,
        session_id: sessionId,
        event_type: eventType,
        path,
        source,
        medium,
        campaign,
      }),
      cache: "no-store",
    });

    if (!eventResponse.ok) {
      return NextResponse.json({ error: "Unable to record analytics event." }, { status: 502 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Invalid analytics request." }, { status: 400 });
  }
}
