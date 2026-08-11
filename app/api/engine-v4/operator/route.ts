import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const AUTH_MARKER = "labnarrative-engine-v4-worker-auth-v1";
const ALLOWED_ACTIONS = new Set([
  "get_execution_state",
  "get_run_context",
  "open_execution",
  "claim_next_action",
  "record_stage_attempt",
  "upsert_evidence",
  "save_private_site",
  "attach_site",
  "complete_stage",
  "upsert_portrait",
  "issue_render_token",
  "record_renderer_check",
  "finalize_for_review",
  "block_run",
  "stage_chunk",
  "commit_staged",
]);

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function isPreview() {
  return process.env.VERCEL_ENV === "preview";
}

function relayAllowed() {
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production";
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: Request) {
  if (!relayAllowed()) return noStoreJson({ error: "Not found." }, 404);

  const url = new URL(request.url);
  const shareProof = url.searchParams.get("proof") || url.searchParams.get("_vercel_share") || "";

  if (url.searchParams.get("authCheck") === "1") {
    if (!isPreview()) return noStoreJson({ error: "Not found." }, 404);
    return noStoreJson({
      ok: true,
      marker: AUTH_MARKER,
      previewOnly: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    });
  }

  const action = (url.searchParams.get("action") || "").trim().toLowerCase();
  if (!action) {
    return noStoreJson({
      ok: true,
      bridge: "labnarrative-engine-v4-operator",
      relay: true,
      environment: process.env.VERCEL_ENV || "unknown",
      proofRequiredForActions: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    });
  }

  if (!ALLOWED_ACTIONS.has(action)) {
    return noStoreJson({ error: "Unsupported Engine v4 operator action." }, 400);
  }
  if (!shareProof) {
    return noStoreJson({ error: "Temporary protected-preview proof is required." }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!supabaseUrl) {
    return noStoreJson({ error: "Supabase URL is not configured for this deployment." }, 503);
  }

  let payload: Record<string, unknown> = {};
  if (action === "stage_chunk") {
    payload = {
      commandId: url.searchParams.get("commandId") || "",
      chunkIndex: Number(url.searchParams.get("chunkIndex") || "-1"),
      expectedChunks: Number(url.searchParams.get("expectedChunks") || "0"),
      targetAction: url.searchParams.get("targetAction") || "",
      chunk: url.searchParams.get("chunk") || "",
    };
  } else if (action === "commit_staged") {
    payload = { commandId: url.searchParams.get("commandId") || "" };
  } else {
    const encoded = url.searchParams.get("payload") || "";
    if (encoded) {
      try {
        payload = objectPayload(JSON.parse(decodeBase64Url(encoded)));
      } catch {
        return noStoreJson({ error: "Invalid base64url JSON payload." }, 400);
      }
    }
  }

  const edgeUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/labnarrative-engine-v4-operator`;
  let edgeResponse: Response;
  try {
    edgeResponse = await fetch(edgeUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-vercel-share-proof": shareProof,
      },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    return noStoreJson({ error: "Engine v4 operator relay is unavailable." }, 502);
  }

  const result = await edgeResponse.json().catch(() => ({ error: "Invalid operator response." }));
  return noStoreJson(result, edgeResponse.status);
}

export async function POST() {
  return noStoreJson({ error: "Method not allowed." }, 405);
}
