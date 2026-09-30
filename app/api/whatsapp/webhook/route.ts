import { NextResponse } from "next/server";
import { parseQuoteWithAI } from "@/lib/ai";
import { parseDemoInput } from "@/lib/quote";
import { databaseConfigured, saveQuote } from "@/lib/supabase-rest";
import { downloadWhatsAppMedia, quoteReply, sendWhatsAppText, transcribeBlob, verifyMetaSignature } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(raw || "{}");
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return NextResponse.json({ ok: true });

  const from = String(message.from || "");
  let input = "";
  let sourceType = "text";

  try {
    if (message.type === "text") input = String(message.text?.body || "");
    if (message.type === "audio" && message.audio?.id) {
      sourceType = "audio";
      const media = await downloadWhatsAppMedia(String(message.audio.id));
      input = await transcribeBlob(media.blob, media.mimeType);
    }

    if (!input.trim()) {
      await sendWhatsAppText(from, "أرسل تفاصيل عرض السعر كنص أو ملاحظة صوتية.");
      return NextResponse.json({ ok: true });
    }

    let draft = null;
    try { draft = await parseQuoteWithAI(input); } catch (error) { console.error(error); }
    draft ||= parseDemoInput(input);

    if (databaseConfigured()) {
      try { await saveQuote({ ...draft, phone: draft.phone || from }, input, sourceType); } catch (error) { console.error(error); }
    }

    await sendWhatsAppText(from, quoteReply(draft));
  } catch (error) {
    console.error("THRWA WhatsApp webhook error:", error);
    if (from) {
      try { await sendWhatsAppText(from, "تعذر تجهيز عرض السعر الآن. حاول مرة أخرى بعد قليل."); } catch {}
    }
  }

  return NextResponse.json({ ok: true });
}
