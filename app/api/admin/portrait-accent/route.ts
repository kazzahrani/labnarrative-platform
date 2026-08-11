import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const runtime = "nodejs";

type SiteContent = Record<string, any>;
type Bucket = {
  score: number;
  r: number;
  g: number;
  b: number;
  weight: number;
  count: number;
};

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const AUTO_SOURCE = "portrait-clothing-v1";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (delta > 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
    if (h < 0) h += 360;
  }

  return { h, s: Number.isFinite(s) ? s : 0, l };
}

function hslToRgb(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function toHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function usableAccent(r: number, g: number, b: number) {
  const hsl = rgbToHsl(r, g, b);
  const saturated = hsl.s >= 0.12;
  const targetS = saturated ? clamp(hsl.s * 0.95, 0.32, 0.68) : 0.08;
  const targetL = saturated ? clamp(hsl.l, 0.24, 0.34) : clamp(hsl.l, 0.20, 0.28);
  const rgb = hslToRgb(hsl.h, targetS, targetL);
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function portraitUrl(content: SiteContent) {
  const candidates = [
    content?.pages?.home?.piImage,
    content?.pages?.home?.topPortrait,
    content?.pages?.home?.homepageImage,
    content?.members?.[0]?.image,
    content?.team?.[0]?.image,
    content?.pages?.contact?.piImage,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol !== "https:") continue;
      const host = url.hostname.toLowerCase();
      if (host === "localhost" || host.endsWith(".local")) continue;
      return url.toString();
    } catch {
      // Ignore malformed portrait candidates.
    }
  }

  return "";
}

function addBucket(map: Map<string, Bucket>, key: string, score: number, r: number, g: number, b: number) {
  const current = map.get(key) || { score: 0, r: 0, g: 0, b: 0, weight: 0, count: 0 };
  current.score += score;
  current.r += r * score;
  current.g += g * score;
  current.b += b * score;
  current.weight += score;
  current.count += 1;
  map.set(key, current);
}

function bestBucket(map: Map<string, Bucket>) {
  let best: Bucket | undefined;
  for (const bucket of map.values()) {
    if (!best || bucket.score > best.score) best = bucket;
  }
  return best;
}

async function derivePortraitAccent(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(120, 160, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const chromatic = new Map<string, Bucket>();
  const fallback = new Map<string, Bucket>();
  let validPixels = 0;
  let chromaticPixels = 0;

  const xStart = Math.floor(info.width * 0.10);
  const xEnd = Math.ceil(info.width * 0.90);
  const yStart = Math.floor(info.height * 0.52);
  const yEnd = Math.ceil(info.height * 0.96);

  for (let y = yStart; y < yEnd; y += 1) {
    const verticalWeight = 1 + ((y - yStart) / Math.max(1, yEnd - yStart)) * 0.8;
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const { h, s, l } = rgbToHsl(r, g, b);
      if (l < 0.045 || l > 0.82) continue;

      validPixels += 1;
      const centerDistance = Math.abs((x / info.width) - 0.5) / 0.5;
      const centerWeight = 1.2 - clamp(centerDistance, 0, 1) * 0.35;
      const saturationWeight = 0.35 + Math.pow(s, 1.35) * 2.9;
      const skinLike = h >= 15 && h <= 48 && l >= 0.34 && s >= 0.18;
      const skinPenalty = skinLike ? 0.38 : 1;
      const weight = verticalWeight * centerWeight * saturationWeight * skinPenalty;

      const rgbKey = `${Math.floor(r / 24)}:${Math.floor(g / 24)}:${Math.floor(b / 24)}`;
      addBucket(fallback, rgbKey, weight, r, g, b);

      if (s >= 0.14) {
        chromaticPixels += 1;
        const hueBin = Math.floor(h / 18);
        const satBin = Math.floor(s * 5);
        const lightBin = Math.floor(l * 5);
        addBucket(chromatic, `${hueBin}:${satBin}:${lightBin}`, weight, r, g, b);
      }
    }
  }

  const useChromatic = validPixels > 0 && chromaticPixels / validPixels >= 0.035 && chromatic.size > 0;
  const winner = bestBucket(useChromatic ? chromatic : fallback) || bestBucket(fallback);
  if (!winner || winner.weight <= 0) throw new Error("No usable clothing color was found in the portrait.");

  return usableAccent(
    winner.r / winner.weight,
    winner.g / winner.weight,
    winner.b / winner.weight,
  );
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Administrator sign-in required." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase configuration is missing." }, { status: 500 });

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return NextResponse.json({ error: "Administrator sign-in required." }, { status: 401 });

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (role?.role !== "admin") return NextResponse.json({ error: "Administrator permission required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
  if (!siteId) return NextResponse.json({ error: "Website ID is required." }, { status: 400 });

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id,slug,status,content,design_settings")
    .eq("id", siteId)
    .maybeSingle();
  if (siteError || !site) return NextResponse.json({ error: "Website not found." }, { status: 404 });

  const imageUrl = portraitUrl((site.content || {}) as SiteContent);
  if (!imageUrl) return NextResponse.json({ error: "No eligible HTTPS portrait is available for this PI." }, { status: 422 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(imageUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "LabNarrative-Portrait-Color/1.0",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`Portrait fetch failed with HTTP ${response.status}.`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error("Portrait source did not return an image.");

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) throw new Error("Portrait image is too large for color analysis.");

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) throw new Error("Portrait image is too large for color analysis.");

    const accent = await derivePortraitAccent(imageBuffer);
    const { data: saved, error: saveError } = await supabase.rpc("admin_set_site_portrait_accent", {
      p_site_id: siteId,
      p_portrait_accent: accent,
    });
    if (saveError || !saved || (typeof saved === "object" && "ok" in saved && saved.ok !== true)) {
      throw new Error(saveError?.message || "The portrait color could not be saved.");
    }

    return NextResponse.json({ ok: true, accent, source: AUTO_SOURCE, imageUrl }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Portrait color analysis failed.",
    }, { status: 422, headers: { "cache-control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
