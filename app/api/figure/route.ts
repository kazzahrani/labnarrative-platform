import type { NextRequest } from "next/server";
import { inflateRawSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_HOSTS = new Set([
  "ars.els-cdn.com",
  "cdn.ncbi.nlm.nih.gov",
  "dm5migu4zj3pb.cloudfront.net",
  "eutils.ncbi.nlm.nih.gov",
  "ftp.ncbi.nlm.nih.gov",
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
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
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

function decodeXml(value: string): string {
  return decodeHtml(value)
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
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
    .slice(0, 16);
}

async function fetchTimed(url: URL, init: RequestInit, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchApproved(sourceUrl: URL, acceptHtml: boolean): Promise<Response> {
  if (sourceUrl.protocol !== "https:" || !isApprovedHost(sourceUrl.hostname)) {
    throw new Error("Figure host is not approved.");
  }

  const upstream = await fetchTimed(sourceUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      Accept: acceptHtml
        ? "image/avif,image/webp,image/apng,image/svg+xml,image/*,text/html;q=0.8,*/*;q=0.5"
        : "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.5",
      Referer: sourceReferer(sourceUrl),
    },
  });

  if (!upstream.ok) throw new Error(`Upstream figure request failed (${upstream.status}).`);
  const finalUrl = new URL(upstream.url);
  if (finalUrl.protocol !== "https:" || !isApprovedHost(finalUrl.hostname)) {
    throw new Error("The source redirected to an unapproved host.");
  }

  const declaredLength = Number(upstream.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("Figure exceeds the size limit.");
  return upstream;
}

function imageMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  return "image/jpeg";
}

function bufferResponse(image: Uint8Array, filename: string): Response {
  if (!image.byteLength || image.byteLength > MAX_IMAGE_BYTES) throw new Error("Figure is empty or exceeds the size limit.");
  return new Response(image, {
    status: 200,
    headers: {
      "Content-Type": imageMime(filename),
      "Content-Length": String(image.byteLength),
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function imageResponse(upstream: Response): Promise<Response> {
  const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
  if (!contentType.startsWith("image/")) throw new Error("Upstream response was not an image.");
  const image = new Uint8Array(await upstream.arrayBuffer());
  if (!image.byteLength || image.byteLength > MAX_IMAGE_BYTES) throw new Error("Figure is empty or exceeds the size limit.");

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(image.byteLength),
    "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
  });
  return new Response(image, { status: 200, headers });
}

function pmcidFromUrl(sourceUrl: URL): string | null {
  return sourceUrl.pathname.match(/\/articles\/(PMC\d+)/i)?.[1]?.toUpperCase() || null;
}

function requestedFigureNumber(sourceUrl: URL): number {
  const token = sourceUrl.pathname.match(/\/figure\/([^/]+)/i)?.[1] || "1";
  const value = Number(token.match(/\d+/)?.[0] || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function pubmedIdFromUrl(sourceUrl: URL): string | null {
  if (sourceUrl.hostname.toLowerCase() !== "pubmed.ncbi.nlm.nih.gov") return null;
  return sourceUrl.pathname.match(/\/(\d+)/)?.[1] || null;
}

async function pmcidForPubmedId(pmid: string): Promise<string | null> {
  const endpoint = new URL("https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/");
  endpoint.searchParams.set("ids", pmid);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("tool", "LabNarrative");
  endpoint.searchParams.set("email", "khaled@labnarrative.com");

  const response = await fetchTimed(endpoint, {
    headers: { "User-Agent": "LabNarrative-Figure-Resolver/4.0", Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({})) as { records?: Array<{ pmcid?: string }> };
  const pmcid = data.records?.[0]?.pmcid?.toUpperCase() || "";
  return /^PMC\d+$/.test(pmcid) ? pmcid : null;
}

async function fetchEuropePmcXml(pmcid: string): Promise<string> {
  const endpoint = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
  const response = await fetchTimed(endpoint, {
    headers: { "User-Agent": "LabNarrative-Figure-Resolver/4.0", Accept: "application/xml,text/xml;q=0.9,*/*;q=0.2" },
  }, 30000);
  if (!response.ok) throw new Error(`Europe PMC XML request failed (${response.status}).`);
  const xml = await response.text();
  if (!xml.includes("<article") && !xml.includes("<pmc-articleset")) throw new Error("Europe PMC did not return article XML.");
  return xml;
}

function graphicNamesFromXml(xml: string, figureNumber: number): string[] {
  const figureBlocks = [...xml.matchAll(/<fig\b[^>]*>[\s\S]*?<\/fig>/gi)].map((match) => match[0]);
  const requested = String(figureNumber);
  const selected: string[] = [];

  for (const block of figureBlocks) {
    const id = block.match(/<fig\b[^>]*\bid=["']([^"']+)["']/i)?.[1] || "";
    const label = block.match(/<label[^>]*>([\s\S]*?)<\/label>/i)?.[1]?.replace(/<[^>]+>/g, " ") || "";
    const idNumber = id.match(/\d+/)?.[0] || "";
    const labelNumber = label.match(/\d+/)?.[0] || "";
    if (idNumber !== requested && labelNumber !== requested) continue;

    for (const graphic of block.matchAll(/<(?:graphic|inline-graphic)\b[^>]*(?:xlink:href|href)=["']([^"']+)["'][^>]*>/gi)) {
      if (graphic[1]) selected.push(decodeXml(graphic[1]));
    }
  }

  if (selected.length === 0 && figureBlocks[figureNumber - 1]) {
    for (const graphic of figureBlocks[figureNumber - 1].matchAll(/<(?:graphic|inline-graphic)\b[^>]*(?:xlink:href|href)=["']([^"']+)["'][^>]*>/gi)) {
      if (graphic[1]) selected.push(decodeXml(graphic[1]));
    }
  }

  return [...new Set(selected)].filter(Boolean);
}

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number };

function findEndOfCentralDirectory(zip: Buffer): number {
  const minimum = Math.max(0, zip.length - 65557);
  for (let index = zip.length - 22; index >= minimum; index -= 1) {
    if (zip.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("Europe PMC returned an invalid ZIP archive.");
}

function listZipEntries(zip: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("Europe PMC ZIP directory is invalid.");
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntry(zip: Buffer, entry: ZipEntry): Uint8Array {
  if (entry.uncompressedSize > MAX_IMAGE_BYTES) throw new Error("Archived figure exceeds the size limit.");
  const offset = entry.localOffset;
  if (zip.readUInt32LE(offset) !== 0x04034b50) throw new Error("Europe PMC ZIP entry is invalid.");
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new Uint8Array(compressed);
  if (entry.method === 8) return new Uint8Array(inflateRawSync(compressed));
  throw new Error(`Unsupported Europe PMC ZIP compression method ${entry.method}.`);
}

function imageEntry(entries: ZipEntry[], graphicNames: string[]): ZipEntry | null {
  const candidates = graphicNames.flatMap((raw) => {
    const clean = raw.replace(/^\.\//, "").replace(/^bin\//i, "");
    const base = clean.split("/").at(-1) || clean;
    const stem = base.replace(/\.(png|jpe?g|gif|webp|tiff?)$/i, "").toLowerCase();
    return [clean.toLowerCase(), base.toLowerCase(), stem];
  });

  const images = entries.filter((entry) => /\.(png|jpe?g|gif|webp|tiff?)$/i.test(entry.name));
  for (const wanted of candidates) {
    const exact = images.find((entry) => {
      const name = entry.name.toLowerCase();
      const base = name.split("/").at(-1) || name;
      const stem = base.replace(/\.(png|jpe?g|gif|webp|tiff?)$/i, "");
      return name === wanted || base === wanted || stem === wanted;
    });
    if (exact) return exact;
  }
  return null;
}

async function resolveEuropePmcFigure(pmcid: string, figureNumber: number): Promise<Response> {
  const xml = await fetchEuropePmcXml(pmcid);
  const graphics = graphicNamesFromXml(xml, figureNumber);
  if (graphics.length === 0) throw new Error(`Europe PMC figure ${figureNumber} was not found in the article XML.`);

  const endpoint = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/supplementaryFiles`);
  endpoint.searchParams.set("includeInlineImage", "true");
  const archiveResponse = await fetchTimed(endpoint, {
    headers: { "User-Agent": "LabNarrative-Figure-Resolver/4.0", Accept: "application/zip,application/octet-stream" },
  }, 45000);
  if (!archiveResponse.ok) throw new Error(`Europe PMC figure archive request failed (${archiveResponse.status}).`);
  const declared = Number(archiveResponse.headers.get("content-length") || 0);
  if (declared > MAX_ARCHIVE_BYTES) throw new Error("Europe PMC figure archive exceeds the size limit.");
  const zip = Buffer.from(await archiveResponse.arrayBuffer());
  if (!zip.byteLength || zip.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Europe PMC figure archive is empty or too large.");

  const entry = imageEntry(listZipEntries(zip), graphics);
  if (!entry) throw new Error(`Europe PMC figure ${figureNumber} was not present in the figure archive.`);
  return bufferResponse(extractZipEntry(zip, entry), entry.name);
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
    const directPmcid = pmcidFromUrl(sourceUrl);
    if (directPmcid) return await resolveEuropePmcFigure(directPmcid, requestedFigureNumber(sourceUrl));

    const pmid = pubmedIdFromUrl(sourceUrl);
    if (pmid) {
      const pmcid = await pmcidForPubmedId(pmid);
      if (!pmcid) return errorResponse("The PubMed record has no downloadable open-access full-text figure.", 502);
      return await resolveEuropePmcFigure(pmcid, requestedFigureNumber(sourceUrl));
    }

    const upstream = await fetchApproved(sourceUrl, true);
    const contentType = upstream.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.startsWith("image/")) return await imageResponse(upstream);
    if (!contentType.includes("text/html")) return errorResponse("Upstream response was not an image or a figure page.", 502);

    const candidates = extractImageCandidates(await upstream.text(), new URL(upstream.url));
    for (const candidate of candidates) {
      try {
        const image = await fetchApproved(candidate, false);
        if ((image.headers.get("content-type") || "").toLowerCase().startsWith("image/")) return await imageResponse(image);
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
