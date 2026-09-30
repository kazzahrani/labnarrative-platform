import { NextResponse } from "next/server";
import { parseDemoInput } from "@/lib/quote";
import { parseQuoteWithAI } from "@/lib/ai";
import { databaseConfigured, listCatalog } from "@/lib/supabase-rest";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "Input is required" }, { status: 400 });

  if (process.env.OPENAI_API_KEY) {
    try {
      const catalog = databaseConfigured() ? await listCatalog().catch(() => []) : [];
      const draft = await parseQuoteWithAI(input, Array.isArray(catalog) ? catalog : []);
      if (draft) return NextResponse.json({ draft, mode: "ai", catalogMatchesEnabled: Array.isArray(catalog) && catalog.length > 0 });
    } catch (error) {
      console.error("THRWA AI extraction fallback:", error);
    }
  }

  return NextResponse.json({ draft: parseDemoInput(input), mode: "local-fallback" });
}
