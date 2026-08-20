import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function authorized(request: Request) {
  if (process.env.VERCEL_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const targets = [
    "https://www.nupco.com/wp-json/wp/v2/types",
    "https://www.nupco.com/wp-json/wp/v2/search?per_page=5&search=NPT",
    "https://www.nupco.com/tenders/tenders-list/",
  ];

  const results = [] as Array<Record<string, unknown>>;
  for (const url of targets) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "follow",
        headers: {
          accept: "application/json,text/html;q=0.9,*/*;q=0.5",
          "user-agent": "LabNarrative-Tender-Intelligence/1.0",
        },
      });
      const text = await response.text();
      let summary: unknown = text.slice(0, 1200);
      if ((response.headers.get("content-type") || "").includes("json")) {
        try {
          const parsed = JSON.parse(text);
          if (url.endsWith("/types")) summary = Object.keys(parsed || {});
          else if (Array.isArray(parsed)) summary = parsed.slice(0, 5).map((item) => ({ id: item?.id, title: item?.title, subtype: item?.subtype, url: item?.url }));
          else summary = parsed;
        } catch {
          // Keep text preview.
        }
      }
      results.push({ url, status: response.status, content_type: response.headers.get("content-type"), final_url: response.url, summary });
    } catch (error) {
      results.push({ url, error: error instanceof Error ? error.message : "probe failed" });
    }
  }

  return NextResponse.json({ ok: true, results });
}
