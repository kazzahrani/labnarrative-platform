import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOSTS = new Set([
  "ars.els-cdn.com",
  "cdn.ncbi.nlm.nih.gov",
  "dm5migu4zj3pb.cloudfront.net",
  "genome.cshlp.org",
  "i1.rgstatic.net",
  "journals.plos.org",
  "lh3.googleusercontent.com",
  "link.springer.com",
  "loop.frontiersin.org",
  "mdpi-res.com",
  "media.springernature.com",
  "oup.silverchair-cdn.com",
  "pmc.ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "storage.googleapis.com",
  "www.aging-us.com",
  "www.ebi.ac.uk",
  "www.frontiersin.org",
  "www.irb.hr",
  "www.nature.com",
  "www.ncbi.nlm.nih.gov",
]);

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_BYTES = 4_000;
const CACHE_SECONDS = 31_536_000;

type Dimensions = { width: number; height: number };

function fail(message: string, status = 502) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function allowed(url: URL) {
  return url.protocol === "https:" && HOSTS.has(url.hostname.toLowerCase());
}

function decode(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&#x2F;", "/");
}

async function timed(url: URL, init: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSource(url: URL, html = false) {
  if (!allowed(url)) throw new Error("Figure host is not approved.");
  const response = await timed(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LabNarrative-Figure-Resolver/6.0; +https://labnarrative.com)",
      Accept: html
        ? "image/png,image/jpeg,image/webp,image/*;q=0.9,text/html;q=0.7,*/*;q=0.2"
        : "image/png,image/jpeg,image/webp,image/*;q=0.9,*/*;q=0.2",
      Referer: `${url.protocol}//${url.host}/`,
    },
  });
  if (!response.ok) throw new Error(`Upstream figure request failed (${response.status}).`);
  const finalUrl = new URL(response.url);
  if (!allowed(finalUrl)) throw new Error("Figure redirected to an unapproved host.");
  if (Number(response.headers.get("content-length") || 0) > MAX_IMAGE_BYTES) {
    throw new Error("Figure exceeds 20 MB.");
  }
  return response;
}

function pngDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function gifDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 10) return null;
  const header = new TextDecoder().decode(bytes.subarray(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpegDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1];
    }
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.length) break;
    const isStartOfFrame = [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ].includes(marker);
    if (isStartOfFrame && length >= 7) {
      return {
        height: view.getUint16(offset + 3, false),
        width: view.getUint16(offset + 5, false),
      };
    }
    offset += length;
  }
  return null;
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 30) return null;
  const text = new TextDecoder();
  if (text.decode(bytes.subarray(0, 4)) !== "RIFF" || text.decode(bytes.subarray(8, 12)) !== "WEBP") return null;
  const chunk = text.decode(bytes.subarray(12, 16));
  if (chunk === "VP8X") {
    return { width: uint24le(bytes, 24) + 1, height: uint24le(bytes, 27) + 1 };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  return null;
}

function dimensions(bytes: Uint8Array, contentType: string): Dimensions | null {
  if (contentType === "image/png") return pngDimensions(bytes);
  if (contentType === "image/jpeg" || contentType === "image/jpg") return jpegDimensions(bytes);
  if (contentType === "image/webp") return webpDimensions(bytes);
  if (contentType === "image/gif") return gifDimensions(bytes);
  return null;
}

function validateQuality(bytes: Uint8Array, contentType: string): Dimensions {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Figure is empty or exceeds 20 MB.");
  }
  if (contentType === "image/gif") {
    throw new Error("GIF preview rejected; a full-resolution PNG, JPEG or WebP figure is required.");
  }
  if (bytes.byteLength < MIN_IMAGE_BYTES) {
    throw new Error(`Figure file is too small (${bytes.byteLength} bytes).`);
  }
  const size = dimensions(bytes, contentType);
  if (!size) throw new Error("Figure dimensions could not be verified.");
  const longSide = Math.max(size.width, size.height);
  const shortSide = Math.min(size.width, size.height);
  const area = size.width * size.height;
  const wideScientificFigure = longSide >= 700 && shortSide >= 220 && area >= 220_000;
  const squareScientificFigure = size.width >= 550 && size.height >= 550;
  if (!wideScientificFigure && !squareScientificFigure) {
    throw new Error(`Figure resolution is too low (${size.width}×${size.height}).`);
  }
  return size;
}

function bytesResponse(bytes: Uint8Array, contentType: string) {
  const size = validateQuality(bytes, contentType);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "X-LabNarrative-Image-Width": String(size.width),
      "X-LabNarrative-Image-Height": String(size.height),
      "X-LabNarrative-Image-Quality": "verified-scientific-figure",
    },
  });
}

async function imageResponse(response: Response) {
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(contentType)) {
    throw new Error(`Unsupported image type ${contentType || "unknown"}.`);
  }
  return bytesResponse(new Uint8Array(await response.arrayBuffer()), contentType === "image/jpg" ? "image/jpeg" : contentType);
}

function isNcbiFigureSource(url: URL) {
  const host = url.hostname.toLowerCase();
  return host === "pmc.ncbi.nlm.nih.gov"
    || host === "pubmed.ncbi.nlm.nih.gov"
    || (host === "www.ncbi.nlm.nih.gov" && /\/pmc\/articles\//i.test(url.pathname));
}

function candidateScore(value: string) {
  const lower = value.toLowerCase();
  return (lower.includes("media.springernature.com") ? 35 : 0)
    + (/\.(png|jpe?g|webp)(?:[?#]|$)/i.test(lower) ? 25 : 0)
    + (/full|large|original|hires|high-res|download/.test(lower) ? 24 : 0)
    + (lower.includes("fig") ? 10 : 0)
    - (/thumb|thumbnail|small|preview|teaser|card|logo|icon|avatar|author/.test(lower) ? 70 : 0)
    - (/[?&](?:w|width|resize)=\d{1,3}(?:&|$)/.test(lower) ? 50 : 0);
}

function candidates(html: string, base: URL) {
  const raw: string[] = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)/gi,
    /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      if (match[1]) raw.push(decode(match[1]));
    }
  }
  for (const match of html.matchAll(/<(?:img|source)[^>]+srcset=["']([^"']+)/gi)) {
    const srcset = decode(match[1] || "");
    for (const item of srcset.split(",")) {
      const candidate = item.trim().split(/\s+/)[0];
      if (candidate) raw.push(candidate);
    }
  }

  const urls = new Map<string, URL>();
  for (const value of raw) {
    try {
      const url = new URL(value, base);
      if (allowed(url)) urls.set(url.href, url);
    } catch {
      // Ignore malformed markup.
    }
  }
  return [...urls.values()]
    .sort((left, right) => candidateScore(right.href) - candidateScore(left.href))
    .slice(0, 30);
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return fail("Missing figure URL.", 400);

  let source: URL;
  try {
    source = new URL(raw);
  } catch {
    return fail("Invalid figure URL.", 400);
  }

  try {
    if (isNcbiFigureSource(source)) {
      const endpoint = new URL("/api/ncbi-figure", request.nextUrl.origin);
      endpoint.searchParams.set("url", source.toString());
      const response = await timed(endpoint, {
        headers: { Accept: "image/png,image/jpeg,image/webp,image/*" },
      }, 60_000);
      if (!response.ok) throw new Error(await response.text());
      return await imageResponse(response);
    }

    const upstream = await fetchSource(source, true);
    const type = (upstream.headers.get("content-type") || "").toLowerCase();
    if (type.startsWith("image/")) return await imageResponse(upstream);
    if (!type.includes("text/html")) {
      return fail("Upstream response was not an image or figure page.");
    }

    const html = await upstream.text();
    const failures: string[] = [];
    for (const url of candidates(html, new URL(upstream.url))) {
      try {
        return await imageResponse(await fetchSource(url));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Candidate rejected.");
      }
    }
    const reason = failures.find(Boolean) || "No direct image could be resolved from this publisher page.";
    return fail(`No usable scientific image was found. ${reason}`);
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Upstream figure request timed out."
      : error instanceof Error ? error.message : "Unable to retrieve the figure.";
    return fail(message);
  }
}
