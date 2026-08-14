import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENDER = "Khaled Azzahrani <khaled@labnarrative.com>";
const REPLY_TO = "khaled@labnarrative.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function envMap(name: string): Record<string, string> {
  try { return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>; } catch { return {}; }
}
function serviceKey() {
  return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
function text(value: unknown, max = 50000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const service = serviceKey();
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !service || !resendKey) return json({ error: "Systems email delivery is not configured." }, 500);
  if (!token) return json({ error: "Administrator authentication is required." }, 401);

  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Administrator authentication could not be verified." }, 401);
  const { data: role, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).maybeSingle();
  if (roleError || role?.role !== "admin") return json({ error: "Administrator permission is required." }, 403);

  const body = await req.json().catch(() => ({})) as J;
  const prospectId = text(body.prospectId, 100);
  const contactId = text(body.contactId, 100);
  if (!prospectId || !contactId) return json({ error: "prospectId and contactId are required." }, 400);

  const { data: prospect, error: prospectError } = await admin
    .from("systems_outreach_prospects")
    .select("id,company_name,status,email_subject,email_body,email_recipient_contact_id,email_recipient_email,email_provider_message_id,email_sent_at")
    .eq("id", prospectId)
    .maybeSingle();
  if (prospectError) return json({ error: prospectError.message }, 500);
  if (!prospect) return json({ error: "Systems prospect was not found." }, 404);

  if (prospect.email_provider_message_id && prospect.email_sent_at) {
    return json({ ok: true, alreadySent: true, providerMessageId: prospect.email_provider_message_id, recipient: prospect.email_recipient_email || "", sentAt: prospect.email_sent_at });
  }

  const { data: contact, error: contactError } = await admin
    .from("systems_outreach_contacts")
    .select("id,prospect_id,name,title,email,is_current_verified")
    .eq("id", contactId)
    .eq("prospect_id", prospectId)
    .maybeSingle();
  if (contactError) return json({ error: contactError.message }, 500);
  if (!contact) return json({ error: "The selected contact does not belong to this prospect." }, 404);
  const recipient = text(contact.email, 320).toLowerCase();
  if (!contact.is_current_verified || !recipient) return json({ error: "A current verified contact with a public work email is required." }, 409);

  const subject = text(prospect.email_subject, 1000);
  const bodyText = text(prospect.email_body, 50000);
  if (!subject || !bodyText) return json({ error: "The formal email draft is incomplete." }, 409);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `labnarrative-systems/${prospectId}/${contactId}/initial`,
      },
      body: JSON.stringify({
        from: SENDER,
        to: [recipient],
        subject,
        text: bodyText,
        reply_to: REPLY_TO,
        tags: [
          { name: "category", value: "labnarrative_systems_outreach" },
          { name: "message_kind", value: "initial" },
        ],
      }),
    });
    const result = await response.json().catch(() => ({})) as J;
    const providerMessageId = text(result.id, 500);
    if (!response.ok || !providerMessageId) {
      const message = text((result.error as J | undefined)?.message, 1500) || text(result.message, 1500) || `Resend returned HTTP ${response.status}.`;
      await admin.from("systems_outreach_prospects").update({ email_last_error: message, email_delivery_status: "failed", email_last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", prospectId);
      await admin.from("systems_outreach_events").insert({ prospect_id: prospectId, channel: "email", event_type: "email_failed", status: "failed", content: `${recipient}: ${message}` });
      return json({ error: message }, 502);
    }

    const sentAt = new Date().toISOString();
    const preContact = ["discovered", "researching", "qualified", "concept_ready", "ready_to_send"].includes(String(prospect.status || ""));
    const update: J = {
      email_recipient_contact_id: contactId,
      email_recipient_email: recipient,
      email_provider_message_id: providerMessageId,
      email_sent_at: sentAt,
      email_delivery_status: "sent",
      email_last_error: "",
      email_last_event_at: sentAt,
      updated_at: sentAt,
    };
    if (preContact) { update.status = "contacted"; update.contacted_at = sentAt; }
    const { error: updateError } = await admin.from("systems_outreach_prospects").update(update).eq("id", prospectId);
    if (updateError) return json({ error: updateError.message, providerMessageId }, 500);

    await admin.from("systems_outreach_events").insert({
      prospect_id: prospectId,
      channel: "email",
      event_type: "email_sent",
      status: "sent",
      content: `Initial email sent from ${REPLY_TO} to ${contact.name} <${recipient}>. Provider message: ${providerMessageId}`,
    });

    return json({ ok: true, providerMessageId, recipient, recipientName: contact.name, recipientTitle: contact.title, sender: SENDER, replyTo: REPLY_TO, sentAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed.";
    await admin.from("systems_outreach_prospects").update({ email_last_error: message, email_delivery_status: "failed", email_last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", prospectId);
    await admin.from("systems_outreach_events").insert({ prospect_id: prospectId, channel: "email", event_type: "email_failed", status: "failed", content: `${recipient}: ${message}` });
    return json({ error: message }, 500);
  }
});
