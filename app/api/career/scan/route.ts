import { NextResponse } from "next/server";
import { runCareerDiscovery } from "../../../../lib/career/discovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function allowedHost(request: Request) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() || "";
  if (host === "career.labnarrative.com" || host === "localhost") return true;
  return process.env.VERCEL_ENV !== "production" && host.endsWith(".vercel.app");
}

export async function POST(request: Request) {
  if (!allowedHost(request)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const result = await runCareerDiscovery({ force: false });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("manual career discovery failed", error);
    return NextResponse.json({ ok: false, error: "Opportunity scan failed." }, { status: 500 });
  }
}
