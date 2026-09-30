import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_QUOTE_MODEL || "gpt-5.6-luna";

  if (!apiKey) {
    return NextResponse.json({ ok: false, stage: "config", error: "OPENAI_API_KEY is missing", model }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: "Reply with exactly OK",
        max_output_tokens: 16,
        reasoning: { effort: "none" }
      }),
      cache: "no-store"
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        stage: "openai",
        status: response.status,
        model,
        error: body?.error?.message || body?.error?.code || "OpenAI request failed"
      }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      stage: "openai",
      status: response.status,
      model
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "network",
      model,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 200 });
  }
}
