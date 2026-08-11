import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_BODY_BYTES = 600_000;

const ALLOWED_ACTIONS = new Set([
  "health",
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
]);

type OperatorRequest = {
  action?: unknown;
  payload?: unknown;
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "referrer-policy": "no-referrer",
    },
  });
}

function previewOnly() {
  // This worker bridge must never exist as an active production mutation
  // surface. Production continues to render normally; only protected Vercel
  // preview deployments may execute Engine v4 operator commands.
  return process.env.VERCEL_ENV === "preview";
}

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

function buildSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) return null;

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function GET() {
  if (!previewOnly()) {
    return noStoreJson({ error: "Not found." }, 404);
  }

  return noStoreJson({
    ok: true,
    bridge: "labnarrative-engine-v4-operator",
    previewOnly: true,
    configured: configured(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
}

export async function POST(request: Request) {
  if (!previewOnly()) {
    return noStoreJson({ error: "Not found." }, 404);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return noStoreJson({ error: "Request body too large." }, 413);
  }

  let body: OperatorRequest;
  try {
    body = (await request.json()) as OperatorRequest;
  } catch {
    return noStoreJson({ error: "Invalid JSON body." }, 400);
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!ALLOWED_ACTIONS.has(action)) {
    return noStoreJson({ error: "Unsupported Engine v4 operator action." }, 400);
  }

  if (action === "health") {
    return noStoreJson({
      ok: true,
      bridge: "labnarrative-engine-v4-operator",
      previewOnly: true,
      configured: configured(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    });
  }

  const supabase = buildSupabase();
  if (!supabase) {
    return noStoreJson({ error: "Engine v4 operator database credentials are not configured." }, 503);
  }

  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : {};

  const { data, error } = await supabase.rpc("engine_v4_operator_dispatch", {
    p_action: action,
    p_payload: payload,
  });

  if (error) {
    console.error("Engine v4 operator dispatch failed", {
      action,
      code: error.code,
      message: error.message,
    });

    return noStoreJson({
      error: "Engine v4 operator command failed.",
      code: error.code || null,
    }, 502);
  }

  return noStoreJson({ ok: true, action, result: data });
}
