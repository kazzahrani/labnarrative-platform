import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_HOSTS = new Set([
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
  "storage.googleapis.com",
  "www.aging-us.com",
  "www.frontiersin.org",
  "www.irb.hr",
  "www.nature.com",
]);

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const CACHE_SECONDS = 60 * 60 * 24 * 365;

function errorResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isApprovedHost(hostname: string): boolean {
  return ALLOWED_IMAGE_HOSTS.has(hostname.toLowerCase());
}

function sourceReferer(sourceUrl: URL): string {
  const host = sourceUrl.hostname.toLowerCase();
  if (host === "i1.rgstatic.net") return "https://www.researchgate.net/";
  if (host === "loop.frontiersin.org") return "https://loop.frontiersin.org/";
  if (host === "lh3.googleusercontent.com") return "https://www.societa-sirr.com/";
  if (host === "www.irb.hr") return "https://www.irb.hr/";
  return `${sourceUrl.protocol}//${sourceUrl.host}/`;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x2F;", "/");
}

function imageCandidateScore(value: string): number {
  const url = value.toLowerCase();
  let score = 0;
  if (url.includes("media.springernature.com")) score += 30;
  if (url.includes("mediaobjects")) score += 20;
  if (url.includes("type=large") || url.includes("large.")) score += 15;
  if (/\.(png|jpe?g|webp|gif|tiff?)(?:[?#]|$)/i.test(url)) score += 12;
  if (url.includes("fig") || url.includes("figure")) score += 8;
  if (url.includes("article/file")) score += 8;
  if (url.includes("logo") || url.includes("icon") || url.includes("avatar") || url.includes("author")) score -= 40;
  return score;
}

function extractImageCandidates(html: string, baseUrl: URL): URL[] {
  const rawCandidates: string[] = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi,
    /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      if (match[1]) rawCandidates.push(decodeHtml(match[1]));
    }
  }

  const unique = new Map<string, URL>();
  for (const candidate of rawCandidates) {
    try {
      const resolved = new URL(candidate, baseUrl);
      if (resolved.protocol !== "https:" || !isApprovedHost(resolved.hostname)) continue;
      unique.set(resolved.href, resolved);
    } catch {
      // Ignore malformed publisher markup.
    }
  }

  return [...unique.values()]
    .sort((a, b) => imageCandidateScore(b.href) - imageCandidateScore(a.href))
    .slice(0, 12);
}

async function fetchApproved(sourceUrl: URL, acceptHtml: boolean): Promise<Response> {
  if (sourceUrl.protocol !== "https:" || !isApprovedHost(sourceUrl.hostname)) {
    throw new Error("Figure host is not approved.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(sourceUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        Accept: acceptHtml
          ? "image/avif,image/webp,image/apng,image/svg+xml,image/*,text/html;q=0.8,*/*;q=0.5"
          : "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.5",
        Referer: sourceReferer(sourceUrl),
      },
      next: { revalidate: CACHE_SECONDS },
    });

    if (!upstream.ok) throw new Error(`Upstream figure request failed (${upstream.status}).`);
    const finalUrl = new URL(upstream.url);
    if (finalUrl.protocol !== "https:" || !isApprovedHost(finalUrl.hostname)) {
      throw new Error("The source redirected to an unapproved host.");
    }

    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) throw new Error("Figure exceeds the size limit.");
    return upstream;
  } finally {
    clearTimeout(timeout);
  }
}

async function imageResponse(upstream: Response): Promise<Response> {
  const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
  if (!contentType.startsWith("image/")) throw new Error("Upstream response was not an image.");

  const image = await upstream.arrayBuffer();
  if (image.byteLength > MAX_IMAGE_BYTES) throw new Error("Figure exceeds the size limit.");

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(image.byteLength),
    "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
  });

  const etag = upstream.headers.get("etag");
  const lastModified = upstream.headers.get("last-modified");
  if (etag) headers.set("ETag", etag);
  if (lastModified) headers.set("Last-Modified", lastModified);
  return new Response(image, { status: 200, headers });
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return errorResponse("Missing figure URL.", 400);

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    return errorResponse("Invalid figure URL.", 400);
  }

  try {
    const upstream = await fetchApproved(sourceUrl, true);
    const contentType = upstream.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.startsWith("image/")) return await imageResponse(upstream);
    if (!contentType.includes("text/html")) return errorResponse("Upstream response was not an image or a figure page.", 502);

    const candidates = extractImageCandidates(await upstream.text(), new URL(upstream.url));
    for (const candidate of candidates) {
      try {
        const image = await fetchApproved(candidate, false);
        const candidateType = image.headers.get("content-type")?.toLowerCase() || "";
        if (!candidateType.startsWith("image/")) continue;
        return await imageResponse(image);
      } catch {
        // Try the next verified figure candidate.
      }
    }

    return errorResponse("No direct image could be resolved from this publisher figure page.", 502);
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Upstream figure request timed out."
      : error instanceof Error ? error.message : "Unable to retrieve the figure.";
    return errorResponse(message, 502);
  }
}
