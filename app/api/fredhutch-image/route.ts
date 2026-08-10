import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["research.fredhutch.org", "www.fredhutch.org", "fredhutch.org"];

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalise(value: string) {
  return decodeHtml(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function attr(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return quoted?.[1] ? decodeHtml(quoted[1]) : "";
}

function bestFromSrcset(srcset: string) {
  const entries = decodeHtml(srcset)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, descriptor = ""] = part.split(/\s+/, 2);
      const width = Number(descriptor.replace(/[^0-9.]/g, "")) || 0;
      return { url, width };
    })
    .filter((entry) => entry.url && !entry.url.includes("1x1-gray.gif"));
  entries.sort((a, b) => b.width - a.width);
  return entries[0]?.url || "";
}

function candidateUrl(block: string) {
  const sourceTags = block.match(/<source\b[^>]*>/gi) ?? [];
  const imgTags = block.match(/<img\b[^>]*>/gi) ?? [];
  const tags = [...sourceTags, ...imgTags];
  for (const tag of tags) {
    for (const name of ["data-srcset", "srcset"]) {
      const value = attr(tag, name);
      const best = value ? bestFromSrcset(value) : "";
      if (best) return best;
    }
  }
  for (const tag of imgTags) {
    for (const name of ["data-src", "data-lazy-src", "src"]) {
      const value = attr(tag, name);
      if (value && !value.includes("1x1-gray.gif") && !value.startsWith("data:")) return value;
    }
  }
  return "";
}

function scoreBlock(block: string, query: string) {
  const q = normalise(query);
  if (!q) return 0;
  const text = normalise(block);
  let score = 0;
  if (text.includes(q)) score += 120;
  for (const token of q.split(" ").filter((token) => token.length > 2)) {
    if (text.includes(token)) score += 12;
  }
  if (/1x1-gray\.gif/i.test(block)) score -= 1;
  return score;
}

function resolveImage(html: string, source: URL, query: string) {
  const pictureBlocks = html.match(/<picture\b[\s\S]*?<\/picture>/gi) ?? [];
  const figureBlocks = html.match(/<figure\b[\s\S]*?<\/figure>/gi) ?? [];
  const imgBlocks = html.match(/<img\b[^>]*>/gi) ?? [];
  const blocks = [...pictureBlocks, ...figureBlocks, ...imgBlocks]
    .map((block) => ({ block, score: scoreBlock(block, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const item of blocks) {
    const raw = candidateUrl(item.block);
    if (!raw) continue;
    try {
      const url = new URL(raw, source);
      if (ALLOWED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return url;
    } catch {}
  }
  return null;
}

async function proxy(url: URL) {
  const response = await fetch(url, {
    headers: { "user-agent": "LabNarrativeFredHutchImageResolver/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !type.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "image_fetch_failed", url: url.toString() }, { status: 502 });
  }
  const body = await response.arrayBuffer();
  if (body.byteLength < 2000) {
    return NextResponse.json({ error: "image_too_small", url: url.toString(), bytes: body.byteLength }, { status: 502 });
  }
  return new NextResponse(body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      "x-labnarrative-source-image": url.toString(),
    },
  });
}

export async function GET(request: NextRequest) {
  const sourceValue = request.nextUrl.searchParams.get("source")?.trim() || "";
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!sourceValue || !query) return NextResponse.json({ error: "missing_source_or_query" }, { status: 400 });
  let source: URL;
  try {
    source = new URL(sourceValue);
  } catch {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }
  if (source.protocol !== "https:" || !ALLOWED_HOSTS.some((host) => source.hostname === host || source.hostname.endsWith(`.${host}`))) {
    return NextResponse.json({ error: "source_not_allowed" }, { status: 403 });
  }
  try {
    const page = await fetch(source, {
      headers: { "user-agent": "LabNarrativeFredHutchImageResolver/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!page.ok) return NextResponse.json({ error: "source_fetch_failed" }, { status: 502 });
    const html = await page.text();
    const image = resolveImage(html, source, query);
    if (!image) return NextResponse.json({ error: "image_not_found", query }, { status: 404 });
    return await proxy(image);
  } catch {
    return NextResponse.json({ error: "resolver_failed" }, { status: 502 });
  }
}
