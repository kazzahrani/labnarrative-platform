import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_HOSTS = new Set([
  "ars.els-cdn.com",
  "cdn.ncbi.nlm.nih.gov",
  "dm5migu4zj3pb.cloudfront.net",
  "journals.plos.org",
  "mdpi-res.com",
  "media.springernature.com",
  "oup.silverchair-cdn.com",
  "pmc.ncbi.nlm.nih.gov",
  "www.aging-us.com",
  "www.frontiersin.org",
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

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return errorResponse("Missing figure URL.", 400);

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    return errorResponse("Invalid figure URL.", 400);
  }

  if (sourceUrl.protocol !== "https:") return errorResponse("Only HTTPS figure URLs are allowed.", 400);
  if (!ALLOWED_IMAGE_HOSTS.has(sourceUrl.hostname.toLowerCase())) {
    return errorResponse("Figure host is not approved.", 403);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(sourceUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LabNarrativeFigureCache/1.0; +https://labnarrative.com)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: `${sourceUrl.protocol}//${sourceUrl.host}/`,
      },
      next: { revalidate: CACHE_SECONDS },
    });

    if (!upstream.ok) return errorResponse(`Upstream figure request failed (${upstream.status}).`, 502);

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
    if (!contentType.startsWith("image/")) {
      return errorResponse("Upstream response was not an image.", 502);
    }

    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) return errorResponse("Figure exceeds the size limit.", 413);

    const image = await upstream.arrayBuffer();
    if (image.byteLength > MAX_IMAGE_BYTES) return errorResponse("Figure exceeds the size limit.", 413);

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
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Upstream figure request timed out."
      : "Unable to retrieve the figure.";
    return errorResponse(message, 502);
  } finally {
    clearTimeout(timeout);
  }
}
