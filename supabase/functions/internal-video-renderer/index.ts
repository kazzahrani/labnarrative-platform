import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LOCAL_MATERIAL = "/MoneyPrinterTurbo/storage/local_videos/labnarrative-studio.mp4";
const ALLOWED_VOICES = new Set([
  "en-US-GuyNeural",
  "en-US-JennyNeural",
  "ar-SA-HamedNeural",
  "ar-SA-ZariyahNeural",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

function envKey(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) throw new Error(`missing_${name.toLowerCase()}`);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.default) return String(parsed.default);
  } catch {
    return raw;
  }
  return raw;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text.slice(0, 1000) };
  }
}

function cleanBase(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function clampText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function normalizeOutput(baseUrl: string, data: any) {
  const candidates = [
    ...(Array.isArray(data?.combined_videos) ? data.combined_videos : []),
    ...(Array.isArray(data?.videos) ? data.videos : []),
  ].filter(Boolean);
  const raw = String(candidates[0] || "");
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl + "/");
    const base = new URL(baseUrl);
    if (url.origin !== base.origin || !url.pathname.startsWith("/tasks/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const secret = envKey("SUPABASE_SECRET_KEYS");
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS");
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishable, Authorization: auth },
    });
    const user = await readJson(userRes);
    if (!userRes.ok || !user?.id) return json({ ok: false, error: "unauthorized" }, 401);

    const db = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: adminRow, error: adminError } = await db
      .from("internal_admins")
      .select("user_id")
      .eq("user_id", String(user.id))
      .maybeSingle();
    if (adminError) throw adminError;
    if (!adminRow) return json({ ok: false, error: "forbidden" }, 403);

    const { data: renderer, error: rendererError } = await db
      .from("internal_video_renderer_settings")
      .select("base_url,api_key")
      .eq("singleton", true)
      .maybeSingle();
    if (rendererError) throw rendererError;

    const baseUrl = cleanBase(renderer?.base_url);
    const apiKey = String(renderer?.api_key || "").trim();
    const configured = Boolean(baseUrl && apiKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "config");

    if (action === "config") return json({ ok: true, configured });
    if (!configured) return json({ ok: false, error: "renderer_not_configured" }, 503);

    if (action === "submit") {
      const subject = clampText(body?.subject, 220) || "LabNarrative Bot League";
      const script = clampText(body?.script, 6000);
      const voiceName = clampText(body?.voiceName, 80);
      const language = body?.language === "ar" ? "ar-SA" : "en-US";
      if (!script) return json({ ok: false, error: "script_required" }, 400);
      if (!ALLOWED_VOICES.has(voiceName)) return json({ ok: false, error: "unsupported_voice" }, 400);

      const payload = {
        video_subject: subject,
        video_script: script,
        video_terms: ["LabNarrative", "crypto trading", "paper trading"],
        video_aspect: "9:16",
        video_fit_mode: "cover",
        video_concat_mode: "sequential",
        video_clip_duration: 4,
        video_count: 1,
        video_source: "local",
        video_materials: [{ provider: "local", url: LOCAL_MATERIAL, duration: 0 }],
        video_language: language,
        voice_name: voiceName,
        voice_volume: 1,
        voice_rate: 1,
        bgm_type: "",
        bgm_volume: 0,
        subtitle_enabled: true,
        n_threads: 1,
      };

      const upstream = await fetch(`${baseUrl}/api/v1/videos`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25_000),
      });
      const data = await readJson(upstream);
      if (!upstream.ok) {
        console.error("internal-video-renderer submit", upstream.status, data?.message || data?.error || "unknown");
        return json({ ok: false, error: "renderer_submit_failed", status: upstream.status }, 502);
      }
      const taskId = String(data?.data?.task_id || data?.task_id || "");
      if (!taskId) return json({ ok: false, error: "renderer_missing_task_id" }, 502);
      return json({ ok: true, taskId });
    }

    if (action === "status") {
      const taskId = clampText(body?.taskId, 100);
      if (!/^[a-zA-Z0-9-]{8,100}$/.test(taskId)) return json({ ok: false, error: "invalid_task_id" }, 400);
      const upstream = await fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await readJson(upstream);
      if (!upstream.ok) return json({ ok: false, error: "renderer_status_failed", status: upstream.status }, 502);
      const data = payload?.data || payload || {};
      return json({
        ok: true,
        state: Number(data?.state ?? 0),
        progress: Number(data?.progress ?? 0),
        failedStage: data?.failed_stage ? String(data.failed_stage) : null,
        error: data?.error ? String(data.error).slice(0, 1500) : null,
        outputUrl: normalizeOutput(baseUrl, data),
      });
    }

    if (action === "media") {
      const raw = clampText(body?.outputUrl, 2000);
      let asset: URL;
      const base = new URL(baseUrl);
      try {
        asset = new URL(raw);
      } catch {
        return json({ ok: false, error: "invalid_media_url" }, 400);
      }
      if (asset.origin !== base.origin || !asset.pathname.startsWith("/tasks/") || !asset.pathname.endsWith(".mp4")) {
        return json({ ok: false, error: "untrusted_media_url" }, 400);
      }
      const upstream = await fetch(asset, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(55_000),
      });
      if (!upstream.ok) return json({ ok: false, error: "renderer_media_failed", status: upstream.status }, 502);
      const headers = new Headers(cors);
      headers.set("content-type", upstream.headers.get("content-type") || "video/mp4");
      const length = upstream.headers.get("content-length");
      if (length) headers.set("content-length", length);
      headers.set("cache-control", "private, no-store");
      return new Response(upstream.body, { status: 200, headers });
    }

    return json({ ok: false, error: "unsupported_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("internal-video-renderer", message);
    return json({ ok: false, error: "internal_video_renderer_failed" }, 500);
  }
});
