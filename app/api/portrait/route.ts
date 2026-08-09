import { NextRequest, NextResponse } from "next/server";

const ALLOWED_SOURCE_HOSTS = [
  "ucl.ac.uk",
  "sussex.ac.uk",
  "qub.ac.uk",
  "birmingham.ac.uk",
  "massgeneral.org",
  "mgh.harvard.edu",
  "dfhcc.harvard.edu",
  "uni-wuerzburg.de",
  "dana-farber.org",
  "westlake.edu.cn",
  "ucsf.edu",
  "unige.ch",
  "ox.ac.uk",
  "ed.ac.uk",
  "manchester.ac.uk",
  "imp.ac.at",
  "viennabiocenter.org",
  "nyu.edu",
  "nyulangone.org",
];

function sourceHostAllowed(hostname: string) {
  const host = hostname.toLowerCase();
  return ALLOWED_SOURCE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalise(value: string) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getAttr(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  if (quoted?.[1]) return decodeHtml(quoted[1]);
  const bare = tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return bare?.[1] ? decodeHtml(bare[1]) : "";
}

function getSrcFromTag(tag: string) {
  const candidates = [
    getAttr(tag, "src"),
    getAttr(tag, "data-src"),
    getAttr(tag, "data-lazy-src"),
  ].filter(Boolean);
  if (candidates.length) return candidates[0];

  const srcset = getAttr(tag, "srcset") || getAttr(tag, "data-srcset");
  if (!srcset) return "";
  const parts = srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
  return parts[parts.length - 1] || "";
}

function scoreImage(tag: string, personName: string) {
  const alt = normalise(getAttr(tag, "alt"));
  const title = normalise(getAttr(tag, "title"));
  const name = normalise(personName);
  const parts = name.split(" ").filter(Boolean);
  const surname = parts.at(-1) || "";
  const first = parts[0] || "";
  let score = 0;

  if (alt === name || title === name) score += 100;
  if (name && (alt.includes(name) || title.includes(name))) score += 80;
  if (surname && (alt.includes(surname) || title.includes(surname))) score += 35;
  if (first && (alt.includes(first) || title.includes(first))) score += 15;
  if (/portrait|profile|headshot|staff|person/.test(`${alt} ${title}`)) score += 10;
  if (/logo|icon|banner|hero|diagram|figure|graph|sdg|fund/.test(`${alt} ${title}`)) score -= 80;

  return score;
}

function findPortrait(html: string, sourceUrl: URL, personName: string) {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  const ranked = tags
    .map((tag) => ({ tag, score: scoreImage(tag, personName) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const item of ranked) {
    const raw = getSrcFromTag(item.tag);
    if (!raw || raw.startsWith("data:")) continue;
    try {
      return new URL(raw, sourceUrl).toString();
    } catch {
      continue;
    }
  }

  return "";
}

function validatedHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !sourceHostAllowed(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function proxyImage(imageUrl: URL) {
  const imageResponse = await fetch(imageUrl, {
    headers: { "user-agent": "LabNarrativePortraitResolver/1.1" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  const contentType = imageResponse.headers.get("content-type") || "";
  if (!imageResponse.ok || !contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "portrait_fetch_failed" }, { status: 502 });
  }

  const contentLength = Number(imageResponse.headers.get("content-length") || 0);
  if (contentLength > 5_000_000) {
    return NextResponse.json({ error: "portrait_too_large" }, { status: 413 });
  }

  const body = await imageResponse.arrayBuffer();
  if (body.byteLength > 5_000_000) {
    return NextResponse.json({ error: "portrait_too_large" }, { status: 413 });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source")?.trim() || "";
  const name = request.nextUrl.searchParams.get("name")?.trim() || "";
  const directImage = request.nextUrl.searchParams.get("image")?.trim() || "";

  if (!source || !name) {
    return NextResponse.json({ error: "missing_source_or_name" }, { status: 400 });
  }

  const sourceUrl = validatedHttpsUrl(source);
  if (!sourceUrl) {
    return NextResponse.json({ error: "source_not_allowed" }, { status: 403 });
  }

  try {
    if (directImage) {
      const directImageUrl = validatedHttpsUrl(directImage);
      if (!directImageUrl) {
        return NextResponse.json({ error: "image_not_allowed" }, { status: 403 });
      }
      return await proxyImage(directImageUrl);
    }

    const pageResponse = await fetch(sourceUrl, {
      headers: { "user-agent": "LabNarrativePortraitResolver/1.1" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!pageResponse.ok) {
      return NextResponse.json({ error: "source_fetch_failed" }, { status: 502 });
    }

    const html = await pageResponse.text();
    const imageUrl = findPortrait(html, sourceUrl, name);
    if (!imageUrl) {
      return NextResponse.json({ error: "portrait_not_found" }, { status: 404 });
    }

    const resolvedImageUrl = validatedHttpsUrl(imageUrl);
    if (!resolvedImageUrl) {
      return NextResponse.json({ error: "portrait_image_not_allowed" }, { status: 403 });
    }

    return await proxyImage(resolvedImageUrl);
  } catch {
    return NextResponse.json({ error: "portrait_resolution_failed" }, { status: 502 });
  }
}
