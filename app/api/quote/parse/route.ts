import { NextResponse } from "next/server";
import { parseDemoInput } from "@/lib/quote";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "Input is required" }, { status: 400 });

  return NextResponse.json({ draft: parseDemoInput(input), mode: "local-mvp" });
}
