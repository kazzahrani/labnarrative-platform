import { NextResponse } from "next/server";
import { parseQuoteWithAI } from "@/lib/ai";
import { parseDemoInput } from "@/lib/quote";
import {
  databaseConfigured,
  listCatalog,
  saveQuote,
  saveWhatsAppEvent,
  whatsappEventExists
} from "@/lib/supabase-rest";
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
  const messageId = String(message.id || "");
  let input = "";
  let sourceType = "text";

  if (databaseConfigured() && messageId) {
    try {
      if (await whatsappEventExists(messageId)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      await saveWhatsAppEvent({
        messageId,
        fromNumber: from,
        messageType: String(message.type || ""),
        payload: message
      });
    } catch (error) {
      console.error("THRWA WhatsApp event log error:", error);
    }
  }

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

    const catalog = databaseConfigured() ? await listCatalog().catch(() => []) : [];

    let draft = null;
    try {
      draft = await parseQuoteWithAI(input, Array.isArray(catalog) ? catalog : []);
    } catch (error) {
      console.error("THRWA WhatsApp AI parse error:", error);
    }
    draft ||= parseDemoInput(input);

    let customerLink = "";
    if (databaseConfigured()) {
      try {
        const quote = await saveQuote({ ...draft, phone: draft.phone || from }, input, sourceType);
        if (quote?.public_token) {
          const origin = new URL(request.url).origin;
          customerLink = `${origin}/q/${quote.public_token}`;
        }
      } catch (error) {
        console.error("THRWA WhatsApp quote save error:", error);
      }
    }

    await sendWhatsAppText(from, quoteReply(draft, customerLink));
  } catch (error) {
    console.error("THRWA WhatsApp webhook error:", error);
    if (from) {
      try { await sendWhatsAppText(from, "تعذر تجهيز عرض السعر الآن. حاول مرة أخرى بعد قليل."); } catch {}
    }
  }

  return NextResponse.json({ ok: true });
}
