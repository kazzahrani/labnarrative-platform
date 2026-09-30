import crypto from "node:crypto";
import { calculateQuote, QuoteDraft } from "@/lib/quote";

const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
const token = () => process.env.WHATSAPP_ACCESS_TOKEN || "";

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function sendWhatsAppText(to: string, body: string) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneId || !token()) throw new Error("WhatsApp Cloud API is not configured");
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body } })
  });
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status})`);
  return response.json();
}

export async function downloadWhatsAppMedia(mediaId: string) {
  const meta = await fetch(`https://graph.facebook.com/${graphVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store"
  });
  if (!meta.ok) throw new Error("Could not resolve WhatsApp media");
  const payload = await meta.json();
  const file = await fetch(payload.url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  if (!file.ok) throw new Error("Could not download WhatsApp media");
  return { blob: await file.blob(), mimeType: payload.mime_type || file.headers.get("content-type") || "audio/ogg" };
}

export async function transcribeBlob(blob: Blob, mimeType: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI transcription is not configured");
  const body = new FormData();
  body.append("file", new File([blob], "whatsapp-voice.ogg", { type: mimeType }));
  body.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe");
  body.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    cache: "no-store"
  });
  if (!response.ok) throw new Error("WhatsApp voice transcription failed");
  const data = await response.json();
  return String(data?.text || "").trim();
}

export function quoteReply(draft: QuoteDraft) {
  const totals = calculateQuote(draft);
  const lines = draft.items.map(i => `• ${i.descriptionAr || i.description} × ${i.quantity} — ${(i.quantity * i.unitPrice).toFixed(2)} ر.س`);
  return [
    `عرض السعر المقترح لـ ${draft.customer}`,
    "",
    ...lines,
    draft.discount ? `الخصم: ${draft.discount.toFixed(2)} ر.س` : "",
    `الضريبة: ${draft.vatRate}%`,
    `الإجمالي: ${totals.total.toFixed(2)} ر.س`,
    "",
    "راجع البنود ثم افتح THRWA لاعتماد العرض وإرساله."
  ].filter(Boolean).join("\n");
}
