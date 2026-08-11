import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const WORKER_ORIGIN = "https://labnarrative-platform-git-engine-v4-worker-lab-narrative.vercel.app";
const WORKER_HOST = "labnarrative-platform-git-engine-v4-worker-lab-narrative.vercel.app";
const AUTH_MARKER = "labnarrative-engine-v4-worker-auth-v1";
const DIRECT_ACTIONS = new Set([
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
]);
const STAGED_TARGET_ACTIONS = new Set([
  "record_stage_attempt",
  "upsert_evidence",
  "save_private_site",
  "complete_stage",
  "upsert_portrait",
  "record_renderer_check",
  "block_run",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function rec(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function envMap(name: string): Record<string, string> {
  try {
    return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function serviceKey() {
  return envMap("SUPABASE_SECRET_KEYS").default
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function allowedRedirect(url: URL) {
  if (url.protocol !== "https:") return false;
  if (url.hostname === WORKER_HOST) return true;
  return url.hostname === "vercel.com" && url.pathname === "/sso-api";
}

function captureCookies(response: Response, jar: Map<string, string>) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""];
  for (const raw of values) {
    const match = raw.match(/^\s*([^=;,\s]+)=([^;]*)/);
    if (match) jar.set(match[1], match[2]);
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function verifyVercelShareProof(proof: string) {
  if (!/^[A-Za-z0-9_-]{20,300}$/.test(proof)) return false;

  let current = new URL("/api/engine-v4/operator", WORKER_ORIGIN);
  current.searchParams.set("authCheck", "1");
  current.searchParams.set("_vercel_share", proof);
  const jar = new Map<string, string>();

  for (let step = 0; step < 6; step += 1) {
    if (!allowedRedirect(current)) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const headers: Record<string, string> = {
        "user-agent": "LabNarrative-Engine-v4-Operator/1.0",
        "accept": "application/json,text/plain;q=0.8,*/*;q=0.5",
      };
      const cookies = cookieHeader(jar);
      if (cookies) headers.cookie = cookies;

      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers,
        signal: controller.signal,
      });
      captureCookies(response, jar);

      if (response.status === 200) {
        const body = await response.json().catch(() => ({})) as JsonRecord;
        return body.ok === true
          && body.marker === AUTH_MARKER
          && body.previewOnly === true;
      }

      if (![301, 302, 303, 307, 308].includes(response.status)) return false;
      const location = response.headers.get("location") || "";
      if (!location) return false;
      const next = new URL(location, current);
      if (!allowedRedirect(next)) return false;
      current = next;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const proof = req.headers.get("x-vercel-share-proof") || "";
  if (!(await verifyVercelShareProof(proof))) {
    return json({ error: "Unauthorized worker request." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const service = serviceKey();
  if (!supabaseUrl || !service) {
    return json({ error: "Engine v4 operator configuration is incomplete." }, 500);
  }

  const body = await req.json().catch(() => ({})) as JsonRecord;
  const action = text(body.action, 100).toLowerCase();
  const payload = rec(body.payload);

  if (!DIRECT_ACTIONS.has(action) && action !== "commit_staged") {
    return json({ error: "Unsupported Engine v4 operator action." }, 400);
  }

  const admin = createClient(supabaseUrl, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function dispatch(dispatchAction: string, dispatchPayload: JsonRecord) {
    return await admin.rpc("engine_v4_operator_dispatch", {
      p_action: dispatchAction,
      p_payload: dispatchPayload,
    });
  }

  if (action === "commit_staged") {
    const commandId = text(payload.commandId, 80);
    if (!commandId) return json({ error: "commandId is required." }, 400);

    const { data: staged, error: stagedError } = await dispatch("get_staged", { commandId });
    if (stagedError) {
      return json({ error: "Staged command could not be loaded.", code: stagedError.code || null, detail: stagedError.message }, 400);
    }

    const stagedRecord = rec(staged);
    const targetAction = text(stagedRecord.targetAction, 100).toLowerCase();
    const encodedPayload = text(stagedRecord.encodedPayload, 900_000);
    if (!STAGED_TARGET_ACTIONS.has(targetAction) || !encodedPayload) {
      return json({ error: "Staged command is invalid." }, 400);
    }

    let decodedPayload: JsonRecord;
    try {
      decodedPayload = rec(JSON.parse(decodeBase64Url(encodedPayload)));
    } catch {
      return json({ error: "Staged payload could not be decoded." }, 400);
    }

    const { data, error } = await dispatch(targetAction, decodedPayload);
    if (error) {
      return json({ error: "Engine v4 staged command failed.", code: error.code || null, detail: error.message }, 400);
    }

    await dispatch("delete_staged", { commandId });
    return json({ ok: true, action: targetAction, staged: true, result: data });
  }

  const { data, error } = await dispatch(action, payload);
  if (error) {
    return json({ error: "Engine v4 operator command failed.", code: error.code || null, detail: error.message }, 400);
  }

  return json({ ok: true, action, result: data });
});
