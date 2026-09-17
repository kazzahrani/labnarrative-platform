import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OutreachRow = {
  email_id: string;
  prospect_id: string;
  to_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  sequence_step: number;
  campaign_slug: string | null;
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlFromText(value: string) {
  const paragraphs = value
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0;line-height:1.65">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#171717;max-width:680px">${paragraphs}</div>`;
}

function serverClient(authorization?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
  });
}

async function providerSecret(
  client: ReturnType<typeof serverClient>,
  workerToken: string | null,
) {
  const envKey = String(process.env.RESEND_API_KEY || "").trim();
  if (envKey) return { key: envKey, error: null as string | null };

  const result = workerToken
    ? await client.rpc("internal_outreach_provider_secret", { p_token: workerToken })
    : await client.rpc("internal_admin_outreach_provider_secret");

  if (result.error) return { key: "", error: result.error.message || "Unable to read provider secret." };
  return { key: String(result.data || "").trim(), error: null as string | null };
}

async function complete(
  client: ReturnType<typeof serverClient>,
  workerToken: string | null,
  emailId: string,
  providerMessageId: string | null,
  error: string | null,
) {
  if (workerToken) {
    return client.rpc("internal_complete_outreach_send", {
      p_token: workerToken,
      p_email_id: emailId,
      p_provider_message_id: providerMessageId,
      p_error: error,
    });
  }

  return client.rpc("internal_admin_complete_outreach_send", {
    p_email_id: emailId,
    p_provider_message_id: providerMessageId,
    p_error: error,
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    workerToken?: string;
    limit?: number;
  };

  const workerToken = String(payload.workerToken || "").trim() || null;
  const authorization = request.headers.get("authorization") || "";
  const limit = Math.max(1, Math.min(Number(payload.limit || 5), 10));

  if (!workerToken && !authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Administrator authentication or worker token is required." }, 401);
  }

  let client: ReturnType<typeof serverClient>;
  try {
    client = serverClient(workerToken ? undefined : authorization);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Server configuration error." }, 500);
  }

  const secret = await providerSecret(client, workerToken);
  if (secret.error) {
    const unauthorized = /unauthorized|required/i.test(secret.error);
    return json({ error: secret.error }, unauthorized ? 401 : 500);
  }
  if (!secret.key) {
    return json({ error: "Resend delivery is not connected yet." }, 503);
  }
  const resendKey = secret.key;

  const claim = workerToken
    ? await client.rpc("internal_claim_outreach_batch", {
        p_token: workerToken,
        p_limit: limit,
      })
    : await client.rpc("internal_admin_claim_outreach_batch", {
        p_limit: limit,
      });

  if (claim.error) {
    const message = claim.error.message || "Unable to claim outreach messages.";
    const unauthorized = /unauthorized|required/i.test(message);
    return json({ error: message }, unauthorized ? 401 : 500);
  }

  const rows = (claim.data || []) as OutreachRow[];
  if (!rows.length) {
    return json({ ok: true, claimed: 0, sent: 0, failed: 0, results: [] });
  }

  const results: Array<Record<string, unknown>> = [];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `labnarrative-trading-outreach/${row.email_id}`,
        },
        body: JSON.stringify({
          from: `${row.sender_name} <${row.sender_email}>`,
          to: [row.to_email],
          reply_to: row.reply_to_email,
          subject: row.subject,
          text: row.body,
          html: htmlFromText(row.body),
          headers: {
            "List-Unsubscribe": `<mailto:${row.reply_to_email}?subject=unsubscribe>`,
          },
          tags: [
            { name: "app", value: "labnarrative_trading" },
            { name: "email_id", value: row.email_id },
            { name: "prospect_id", value: row.prospect_id },
            { name: "sequence_step", value: String(row.sequence_step) },
            ...(row.campaign_slug
              ? [{ name: "campaign", value: row.campaign_slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) }]
              : []),
          ],
        }),
      });

      const provider = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        error?: { message?: string };
      };
      const providerMessageId = String(provider.id || "").trim();

      if (!response.ok || !providerMessageId) {
        const message =
          provider.error?.message ||
          provider.message ||
          `Resend returned HTTP ${response.status}.`;
        await complete(client, workerToken, row.email_id, null, message);
        failed += 1;
        results.push({ emailId: row.email_id, to: row.to_email, status: "failed", error: message });
        continue;
      }

      await complete(client, workerToken, row.email_id, providerMessageId, null);
      sent += 1;
      results.push({
        emailId: row.email_id,
        to: row.to_email,
        status: "sent",
        providerMessageId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed.";
      await complete(client, workerToken, row.email_id, null, message).catch(() => undefined);
      failed += 1;
      results.push({ emailId: row.email_id, to: row.to_email, status: "failed", error: message });
    }
  }

  return json({
    ok: true,
    claimed: rows.length,
    sent,
    failed,
    results,
  });
}
