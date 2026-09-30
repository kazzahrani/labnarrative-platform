import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice transcription is not configured yet." }, { status: 503 });

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Audio file is required." }, { status: 400 });

  const body = new FormData();
  body.append("file", file, file.name || "voice-note.webm");
  body.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe");
  body.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ error: data?.error?.message || "Transcription failed." }, { status: response.status });
  }

  return NextResponse.json({ text: String(data?.text || "").trim() });
}
