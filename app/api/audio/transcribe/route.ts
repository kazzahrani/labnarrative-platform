import { NextResponse } from "next/server";

export const runtime = "nodejs";

function extensionFor(type: string) {
  const base = type.toLowerCase().split(";")[0].trim();
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/x-m4a") return "m4a";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav" || base === "audio/x-wav") return "wav";
  if (base === "audio/mpeg" || base === "audio/mp3") return "mp3";
  return "webm";
}

function normalizedType(type: string) {
  return type.toLowerCase().split(";")[0].trim() || "audio/webm";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice transcription is not configured yet." }, { status: 503 });

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  if (file.size < 800) return NextResponse.json({ error: "Recording was too short. Please record for at least a second." }, { status: 400 });

  const type = normalizedType(file.type);
  const ext = extensionFor(type);
  const bytes = await file.arrayBuffer();
  const normalized = new File([bytes], `thrwa-voice.${ext}`, { type });

  const body = new FormData();
  body.append("file", normalized, normalized.name);
  body.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  body.append("response_format", "json");
  body.append("temperature", "0");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({
      error: data?.error?.message || "Transcription failed.",
      audioType: type,
      audioSize: file.size
    }, { status: response.status });
  }

  const text = String(data?.text || "").trim();
  const normalized = text.toLowerCase();
  const looksLikePromptLeak =
    normalized.includes("saudi arabic or english business quotation voice note") ||
    normalized.includes("preserve names, quantities, units, and numbers accurately");

  if (!text || looksLikePromptLeak) {
    return NextResponse.json({
      error: "No clear speech was detected. Please try recording again and speak for at least 2 seconds.",
      audioType: type,
      audioSize: file.size
    }, { status: 422 });
  }

  return NextResponse.json({
    text,
    audioType: type,
    audioSize: file.size
  });
}
