import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Json = Record<string, unknown>;
type CorePosition = { trade_id?: unknown; client_id?: unknown };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store, max-age=0" } });
}

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function permittedHost(host: string) {
  if (host === "platform.labnarrative.com" || host === "app.labnarrative.com" || host === "localhost" || host === "127.0.0.1") return true;
  return process.env.VERCEL_ENV !== "production" && host.endsWith(".vercel.app");
}

function permittedOrigin(origin: string, host: string) {
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === host; }
  catch { return false; }
}

async function callFunction(
  name: string,
  authorization: string,
  apikey: string,
  supabaseUrl: string,
  body: unknown,
  timeoutMs: number,
) {
  return await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      authorization,
      apikey,
      "content-type": "application/json",
      "x-client-info": "labnarrative-platform-v1-position-edit/1",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function parseResponse(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) as unknown : null; }
  catch { return text || null; }
}

export async function POST(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!permittedHost(host)) return json({ error: "not_found" }, 404);
  if (!permittedOrigin(request.headers.get("origin") || "", host)) return json({ error: "origin_not_allowed" }, 403);

  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!supabaseUrl || !apikey) return json({ error: "server_configuration_missing" }, 500);

  let body: Json;
  try { body = object(await request.json()); }
  catch { return json({ error: "invalid_request" }, 400); }

  const tradeId = String(body.tradeId || "").trim();
  if (!tradeId) return json({ error: "position_not_found" }, 404);

  try {
    const positionsResponse = await callFunction("trader-v2-positions-read", authorization, apikey, supabaseUrl, {}, 20_000);
    const positionsPayload = object(await parseResponse(positionsResponse));
    if (!positionsResponse.ok || positionsPayload.ok !== true || positionsPayload.ready !== true || !Array.isArray(positionsPayload.positions)) {
      return json({ error: String(positionsPayload.error || "core_v2_positions_not_ready") }, positionsResponse.ok ? 409 : positionsResponse.status);
    }

    const match = (positionsPayload.positions as CorePosition[]).find((position) =>
      String(position.client_id || "") === tradeId || String(position.trade_id || "") === tradeId
    );
    const positionId = String(match?.trade_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(positionId)) {
      return json({ error: "core_v2_position_id_unavailable" }, 404);
    }

    const payload = {
      positionId,
      idempotencyKey: `v1-position-edit:${positionId}:${crypto.randomUUID()}`,
      maxAveraging: body.maxAveraging,
      activeOrdersLimit: body.activeOrdersLimit,
      takeProfitPct: body.takeProfitPct,
      stopEnabled: body.stopEnabled,
      stopPct: body.stopPct,
    };

    const editResponse = await callFunction("trader-v2-position-edit-submit", authorization, apikey, supabaseUrl, payload, 105_000);
    const editPayload = await parseResponse(editResponse);
    const editJson = object(editPayload);
    if (!editResponse.ok || editJson.ok !== true) {
      return json({ error: String(editJson.error || `position_edit_http_${editResponse.status}`) }, editResponse.ok ? 400 : editResponse.status);
    }
    return json(editPayload, 200);
  } catch (error) {
    const name = error instanceof Error ? error.name : "position_edit_transport_failed";
    if (name === "TimeoutError" || name === "AbortError") {
      return json({ error: "position_edit_timeout" }, 504);
    }
    return json({ error: "position_edit_transport_failed" }, 502);
  }
}
