import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, any>;

function envMap(name: string): Record<string, string> {
  try { return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>; } catch { return {}; }
}
function serviceKey() { return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function text(value: unknown, max = 100000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function normalizeBody(value: unknown, max = 100000) {
  return text(value, max)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function htmlFromText(value: string) {
  const normalized = normalizeBody(value, 150000);
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px 0;line-height:1.65">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#171717;max-width:680px">${paragraphs}</div>`;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function resolveInternetMessageId(fullKey: string, providerId: string) {
  if (!fullKey || !providerId) return "";
  try {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId)}`, { headers: { authorization: `Bearer ${fullKey}`, "content-type": "application/json" } });
    if (!response.ok) return "";
    const data = await response.json().catch(() => ({})) as J;
    return text(data.message_id, 1000);
  } catch { return ""; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const service = serviceKey();
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const secret = req.headers.get("x-automation-secret") || "";
  if (!base || !service || !resendKey) return json({ error: "backend_not_configured" }, 503);

  const admin = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: valid, error: validError } = await admin.rpc("validate_outreach_worker_secret", { p_secret: secret });
  if (validError || valid !== true) return json({ error: "unauthorized" }, 401);

  const { data: fullRaw } = await admin.rpc("get_resend_full_access_key");
  const fullKey = text(fullRaw, 2000);

  let sent = 0, failed = 0, claimed = 0;
  const results: J[] = [];

  for (let i = 0; i < 10; i++) {
    const { data: preparedRaw, error: claimError } = await admin.rpc("claim_due_systems_outreach_followup");
    if (claimError) { results.push({ error: claimError.message }); break; }
    if (!preparedRaw) break;

    claimed++;
    const prepared = preparedRaw as J;
    const messageId = text(prepared.messageId, 100);
    const prospectId = text(prepared.prospectId, 100);
    const kind = text(prepared.messageKind, 50);
    const recipient = text(prepared.recipientEmail, 320);
    const sender = text(prepared.senderEmail, 500) || "Khaled Azzahrani <khaled@labnarrative.com>";
    const subject = text(prepared.subject, 1000);
    const bodyText = normalizeBody(prepared.bodyText, 100000);
    const bodyHtml = htmlFromText(bodyText);
    const replyTo = text(prepared.replyToEmail, 500);
    const parentProviderId = text(prepared.parentProviderMessageId, 500);
    let parentInternetId = text(prepared.parentInternetMessageId, 1000);
    if (!parentInternetId && parentProviderId) parentInternetId = await resolveInternetMessageId(fullKey, parentProviderId);

    const payload: J = {
      from: sender,
      to: [recipient],
      subject,
      text: bodyText,
      html: bodyHtml,
      reply_to: replyTo,
      tags: [
        { name: "app", value: "labnarrative_systems" },
        { name: "message_id", value: messageId },
        { name: "prospect_id", value: prospectId },
        { name: "message_kind", value: kind.replace(/[^A-Za-z0-9_-]/g, "_") },
      ],
    };
    if (parentInternetId) payload.headers = { "In-Reply-To": parentInternetId, "References": parentInternetId };

    try {
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json", "idempotency-key": `labnarrative-systems/${messageId}` }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({})) as J;
      const providerId = text(data.id, 500);

      if (!response.ok || !providerId) {
        const err = text(data?.error?.message, 2000) || text(data?.message, 2000) || `Resend HTTP ${response.status}`;
        await admin.rpc("release_failed_systems_outreach_followup", { p_message_id: messageId, p_error_message: err });
        await admin.from("systems_outreach_events").insert({ prospect_id: prospectId, channel: "email", event_type: "followup_failed", status: "failed", content: `${kind} failed: ${err}` });
        failed++;
        results.push({ messageId, kind, error: err });
        continue;
      }

      const sentAt = new Date().toISOString();
      if (parentInternetId && prepared.parentMessageId) await admin.from("systems_outreach_messages").update({ internet_message_id: parentInternetId, updated_at: sentAt }).eq("id", prepared.parentMessageId).eq("internet_message_id", "");
      await admin.from("systems_outreach_messages").update({ body_text: bodyText, body_html: bodyHtml, updated_at: sentAt }).eq("id", messageId);
      await admin.rpc("finalize_systems_outreach_followup", { p_message_id: messageId, p_provider_message_id: providerId, p_sent_at: sentAt, p_parent_internet_message_id: parentInternetId });
      await admin.from("systems_outreach_events").insert({ prospect_id: prospectId, channel: "email", event_type: `${kind}_sent`, status: "sent", content: `${kind} sent automatically to ${recipient}.` });
      sent++;
      results.push({ messageId, kind, providerId, threaded: Boolean(parentInternetId) });
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      await admin.rpc("release_failed_systems_outreach_followup", { p_message_id: messageId, p_error_message: err });
      failed++;
      results.push({ messageId, kind, error: err });
    }
  }

  return json({ ok: true, claimed, sent, failed, results });
});