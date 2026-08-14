import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENDER = "Khaled Azzahrani <khaled@labnarrative.com>";
const KSU_COPY = "kazzahrani@ksu.edu.sa";
const DIRECT_REPLY = "khaled@labnarrative.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
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
function addDaysIso(days: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString(); }

async function sendKsuCopy(admin: any, resendKey: string, message: J, prospectId: string, subject: string, bodyText: string, bodyHtml: string) {
  const existingStatus = text(message.copy_delivery_status, 100);
  if (["sent", "delivery_delayed", "delivered"].includes(existingStatus) || message.copy_provider_message_id) {
    return {
      requested: true,
      recipient: message.copy_recipient_email || KSU_COPY,
      providerMessageId: message.copy_provider_message_id || null,
      status: existingStatus || "sent",
      alreadySent: true,
      error: null,
    };
  }

  const startedAt = new Date().toISOString();
  await admin.from("systems_outreach_messages").update({
    copy_recipient_email: KSU_COPY,
    copy_delivery_status: "pending",
    copy_error_message: "",
    copy_delivery_details: { mode: "separate_transaction", requested_at: startedAt },
    updated_at: startedAt,
  }).eq("id", message.id);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
        "idempotency-key": `labnarrative-systems-copy/${message.id}/ksu`,
      },
      body: JSON.stringify({
        from: SENDER,
        to: [KSU_COPY],
        subject,
        text: bodyText,
        html: bodyHtml,
        reply_to: DIRECT_REPLY,
        tags: [
          { name: "app", value: "labnarrative_systems_copy" },
          { name: "message_id", value: String(message.id) },
          { name: "prospect_id", value: prospectId },
          { name: "message_kind", value: "initial_copy" },
        ],
      }),
    });
    const result = await response.json().catch(() => ({})) as J;
    const providerMessageId = text(result.id, 500);
    if (!response.ok || !providerMessageId) {
      const error = text(result?.error?.message, 2000) || text(result?.message, 2000) || `Resend returned HTTP ${response.status}.`;
      await admin.from("systems_outreach_messages").update({
        copy_delivery_status: "failed",
        copy_error_message: error,
        copy_delivery_details: { mode: "separate_transaction", failed_at: new Date().toISOString(), error },
        updated_at: new Date().toISOString(),
      }).eq("id", message.id);
      return { requested: true, recipient: KSU_COPY, providerMessageId: null, status: "failed", alreadySent: false, error };
    }

    const sentAt = new Date().toISOString();
    await admin.from("systems_outreach_messages").update({
      copy_recipient_email: KSU_COPY,
      copy_provider_message_id: providerMessageId,
      copy_delivery_status: "sent",
      copy_sent_at: sentAt,
      copy_error_message: "",
      copy_delivery_details: { mode: "separate_transaction", provider_message_id: providerMessageId, sent_at: sentAt },
      updated_at: sentAt,
    }).eq("id", message.id);
    return { requested: true, recipient: KSU_COPY, providerMessageId, status: "sent", alreadySent: false, error: null };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Copy delivery failed.";
    await admin.from("systems_outreach_messages").update({
      copy_delivery_status: "failed",
      copy_error_message: messageText,
      copy_delivery_details: { mode: "separate_transaction", failed_at: new Date().toISOString(), error: messageText },
      updated_at: new Date().toISOString(),
    }).eq("id", message.id);
    return { requested: true, recipient: KSU_COPY, providerMessageId: null, status: "failed", alreadySent: false, error: messageText };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const service = serviceKey();
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!base || !service || !resendKey) return json({ error: "Systems email delivery is not configured." }, 500);
  if (!token) return json({ error: "Administrator authentication is required." }, 401);

  const admin = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Administrator authentication could not be verified." }, 401);
  const { data: role, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).maybeSingle();
  if (roleError || role?.role !== "admin") return json({ error: "Administrator permission is required." }, 403);

  const requestBody = await req.json().catch(() => ({})) as J;
  const prospectId = text(requestBody.prospectId, 100);
  const contactId = text(requestBody.contactId, 100);
  const copyToKsu = requestBody.copyToKsu === true;
  if (!prospectId || !contactId) return json({ error: "prospectId and contactId are required." }, 400);

  const { data: prospect, error: prospectError } = await admin.from("systems_outreach_prospects").select("id,company_name,status,email_subject,email_body,followup_1,followup_2,email_draft_approved_at").eq("id", prospectId).maybeSingle();
  if (prospectError) return json({ error: prospectError.message }, 500);
  if (!prospect) return json({ error: "Systems prospect was not found." }, 404);
  if (!prospect.email_draft_approved_at) return json({ error: "Approve the current email draft before sending." }, 409);

  const { data: contact, error: contactError } = await admin.from("systems_outreach_contacts").select("id,prospect_id,name,title,email,is_current_verified").eq("id", contactId).eq("prospect_id", prospectId).maybeSingle();
  if (contactError) return json({ error: contactError.message }, 500);
  if (!contact) return json({ error: "The selected contact does not belong to this prospect." }, 404);
  const recipient = text(contact.email, 320).toLowerCase();
  if (!contact.is_current_verified || !recipient) return json({ error: "A current verified contact with a public work email is required." }, 409);

  const subject = text(prospect.email_subject, 1000);
  const bodyText = normalizeBody(prospect.email_body, 100000);
  const followup1Text = normalizeBody(prospect.followup_1, 100000);
  const followup2Text = normalizeBody(prospect.followup_2, 100000);
  if (!subject || !bodyText) return json({ error: "The formal email draft is incomplete." }, 409);

  const { data: integration } = await admin.from("resend_integration_state").select("inbound_domain,status").eq("id", "primary").maybeSingle();
  const inboundDomain = text(integration?.inbound_domain, 500).toLowerCase();
  if (integration?.status !== "connected" || !inboundDomain) return json({ error: "Resend inbound reply handling is not connected." }, 503);

  let { data: message, error: messageError } = await admin.from("systems_outreach_messages").select("*").eq("prospect_id", prospectId).eq("message_kind", "initial").maybeSingle();
  if (messageError) return json({ error: messageError.message }, 500);

  const initialHtml = htmlFromText(bodyText);
  if (message?.status === "sent" && message.provider_message_id) {
    const copyResult = copyToKsu ? await sendKsuCopy(admin, resendKey, message, prospectId, subject, bodyText, initialHtml) : null;
    return json({
      ok: true,
      alreadySent: true,
      providerMessageId: message.provider_message_id,
      recipient: message.recipient_email,
      sentAt: message.sent_at,
      replyTo: message.reply_to_email,
      copy: copyResult,
      bccCopy: null,
    });
  }

  if (!message) {
    const { data: created, error: createError } = await admin.from("systems_outreach_messages").insert({ prospect_id: prospectId, contact_id: contactId, message_kind: "initial", sequence: 1, sender_email: SENDER, recipient_email: recipient, subject, body_text: bodyText, body_html: initialHtml, status: "draft", delivery_status: "pending" }).select("*").single();
    if (createError) return json({ error: createError.message }, 500);
    message = created;
  } else {
    const { data: updated, error: updateDraftError } = await admin.from("systems_outreach_messages").update({ contact_id: contactId, recipient_email: recipient, subject, body_text: bodyText, body_html: initialHtml, sender_email: SENDER, updated_at: new Date().toISOString() }).eq("id", message.id).select("*").single();
    if (updateDraftError) return json({ error: updateDraftError.message }, 500);
    message = updated;
  }

  const replyTo = `sys-${String(message.id).toLowerCase()}@${inboundDomain}`;
  await admin.from("systems_outreach_messages").update({ reply_to_email: replyTo, updated_at: new Date().toISOString() }).eq("id", message.id);

  const resendPayload: J = {
    from: SENDER,
    to: [recipient],
    subject,
    text: bodyText,
    html: initialHtml,
    reply_to: replyTo,
    tags: [
      { name: "app", value: "labnarrative_systems" },
      { name: "message_id", value: String(message.id) },
      { name: "prospect_id", value: prospectId },
      { name: "message_kind", value: "initial" },
    ],
  };

  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json", "idempotency-key": `labnarrative-systems/${message.id}` }, body: JSON.stringify(resendPayload) });
    const result = await response.json().catch(() => ({})) as J;
    const providerMessageId = text(result.id, 500);
    if (!response.ok || !providerMessageId) {
      const err = text(result?.error?.message, 2000) || text(result?.message, 2000) || `Resend returned HTTP ${response.status}.`;
      await admin.from("systems_outreach_messages").update({ status: "failed", delivery_status: "failed", error_message: err, updated_at: new Date().toISOString() }).eq("id", message.id);
      await admin.from("systems_outreach_prospects").update({ email_last_error: err, email_delivery_status: "failed", email_last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", prospectId);
      await admin.from("systems_outreach_events").insert({ prospect_id: prospectId, channel: "email", event_type: "email_failed", status: "failed", content: `${recipient}: ${err}` });
      return json({ error: err }, 502);
    }

    const sentAt = new Date().toISOString();
    await admin.from("systems_outreach_messages").update({ status: "sent", delivery_status: "sent", provider_message_id: providerMessageId, sent_at: sentAt, error_message: "", updated_at: sentAt }).eq("id", message.id);

    let followup1: J | null = null;
    if (followup1Text) {
      const { data: f1, error: f1Error } = await admin.from("systems_outreach_messages").upsert({ prospect_id: prospectId, contact_id: contactId, parent_message_id: message.id, message_kind: "followup_1", sequence: 2, sender_email: SENDER, recipient_email: recipient, subject: `Re: ${subject.replace(/^Re:\s*/i, "")}`, body_text: followup1Text, body_html: htmlFromText(followup1Text), reply_to_email: "", status: "scheduled", delivery_status: "pending", scheduled_for: addDaysIso(3), updated_at: sentAt }, { onConflict: "prospect_id,message_kind" }).select("*").single();
      if (!f1Error) { followup1 = f1; await admin.from("systems_outreach_messages").update({ reply_to_email: `sys-${String(f1.id).toLowerCase()}@${inboundDomain}` }).eq("id", f1.id); }
    }
    if (followup2Text) {
      const parentId = followup1?.id || message.id;
      const { data: f2, error: f2Error } = await admin.from("systems_outreach_messages").upsert({ prospect_id: prospectId, contact_id: contactId, parent_message_id: parentId, message_kind: "followup_2", sequence: 3, sender_email: SENDER, recipient_email: recipient, subject: `Re: ${subject.replace(/^Re:\s*/i, "")}`, body_text: followup2Text, body_html: htmlFromText(followup2Text), reply_to_email: "", status: "scheduled", delivery_status: "pending", scheduled_for: addDaysIso(7), updated_at: sentAt }, { onConflict: "prospect_id,message_kind" }).select("*").single();
      if (!f2Error) await admin.from("systems_outreach_messages").update({ reply_to_email: `sys-${String(f2.id).toLowerCase()}@${inboundDomain}` }).eq("id", f2.id);
    }

    const preContact = ["discovered", "researching", "qualified", "concept_ready", "ready_to_send"].includes(String(prospect.status || ""));
    await admin.from("systems_outreach_prospects").update({ ...(preContact ? { status: "contacted", contacted_at: sentAt } : {}), email_recipient_contact_id: contactId, email_recipient_email: recipient, email_provider_message_id: providerMessageId, email_sent_at: sentAt, email_delivery_status: "sent", email_last_error: "", email_last_event_at: sentAt, sequence_status: (followup1Text || followup2Text) ? "active" : "completed", sequence_started_at: sentAt, sequence_stopped_at: null, sequence_stop_reason: "", updated_at: sentAt }).eq("id", prospectId);

    const copyResult = copyToKsu ? await sendKsuCopy(admin, resendKey, { ...message, status: "sent", provider_message_id: providerMessageId }, prospectId, subject, bodyText, initialHtml) : null;
    await admin.from("systems_outreach_events").insert({
      prospect_id: prospectId,
      channel: "email",
      event_type: "email_sent",
      status: "sent",
      content: `Initial email sent from khaled@labnarrative.com to ${contact.name} <${recipient}>.${copyResult ? ` Separate KSU copy ${copyResult.status} for ${KSU_COPY}.` : ""} Automatic follow-ups prepared behind the approved human send gate.`,
    });

    return json({
      ok: true,
      providerMessageId,
      recipient,
      recipientName: contact.name,
      recipientTitle: contact.title,
      sender: SENDER,
      replyTo,
      sentAt,
      sequenceActive: Boolean(followup1Text || followup2Text),
      copy: copyResult,
      bccCopy: null,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Email delivery failed.";
    await admin.from("systems_outreach_messages").update({ status: "failed", delivery_status: "failed", error_message: err, updated_at: new Date().toISOString() }).eq("id", message.id);
    await admin.from("systems_outreach_prospects").update({ email_last_error: err, email_delivery_status: "failed", email_last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", prospectId);
    return json({ error: err }, 500);
  }
});