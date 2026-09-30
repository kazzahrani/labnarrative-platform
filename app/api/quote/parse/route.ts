import { NextResponse } from "next/server";
import { parseDemoInput } from "@/lib/quote";
import { parseQuoteWithAI } from "@/lib/ai";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "Input is required" }, { status: 400 });

  if (process.env.OPENAI_API_KEY) {
    try {
      const draft = await parseQuoteWithAI(input);
      if (draft) return NextResponse.json({ draft, mode: "ai" });
    } catch (error) {
      console.error("THRWA AI extraction fallback:", error);
    }
  }

  return NextResponse.json({ draft: parseDemoInput(input), mode: "local-fallback" });
}
