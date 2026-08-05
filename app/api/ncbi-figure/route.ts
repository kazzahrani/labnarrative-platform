import type { NextRequest } from "next/server";
import { inflateRawSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const CACHE_SECONDS = 60 * 60 * 24 * 365;

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function errorResponse(message: string, status = 502) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function fetchTimed(url: URL, init: RequestInit = {}, timeoutMs = 30000) {
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

function pmcidFromUrl(sourceUrl: URL): string {
  return sourceUrl.pathname.match(/\/articles\/(PMC\d+)/i)?.[1]?.toUpperCase() || "";
}

function pmidFromUrl(sourceUrl: URL): string {
  if (sourceUrl.hostname.toLowerCase() !== "pubmed.ncbi.nlm.nih.gov") return "";
  return sourceUrl.pathname.match(/\/(\d+)/)?.[1] || "";
}

function requestedFigureNumber(sourceUrl: URL): number {
  const value = Number(sourceUrl.pathname.match(/\/figure\/[^/]*?(\d+)/i)?.[1] || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

async function pmcidForPubmedId(pmid: string): Promise<string> {
  const endpoint = new URL("https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/");
  endpoint.searchParams.set("ids", pmid);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("tool", "LabNarrative");
  endpoint.searchParams.set("email", "khaled@labnarrative.com");

  const response = await fetchTimed(endpoint, {
    headers: {
      "User-Agent": "LabNarrative-NCBI-Figure-Resolver/1.0 (+https://labnarrative.com)",
      Accept: "application/json",
    },
  });
  if (!response.ok) return "";
  const data = await response.json().catch(() => ({})) as {
    records?: Array<{ pmcid?: string }>;
  };
  const pmcid = data.records?.[0]?.pmcid?.toUpperCase() || "";
  return /^PMC\d+$/.test(pmcid) ? pmcid : "";
}

async function fetchArticleXml(pmcid: string): Promise<string> {
  const endpoint = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
  const response = await fetchTimed(endpoint, {
    headers: {
      "User-Agent": "LabNarrative-NCBI-Figure-Resolver/1.0 (+https://labnarrative.com)",
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.2",
    },
  });
  if (!response.ok) throw new Error(`Europe PMC XML request failed (${response.status}).`);
  const xml = await response.text();
  if (!xml.includes("<article")) throw new Error("Europe PMC did not return article XML.");
  return xml;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'");
}

function graphicNames(xml: string, figureNumber: number): string[] {
  const blocks = [...xml.matchAll(/<fig\b[^>]*>[\s\S]*?<\/fig>/gi)]
    .map((match) => match[0]);
  const requested = String(figureNumber);

  let selected = blocks.filter((block) => {
    const id = block.match(/<fig\b[^>]*\bid=["']([^"']+)["']/i)?.[1] || "";
    const label = (block.match(/<label[^>]*>([\s\S]*?)<\/label>/i)?.[1] || "")
      .replace(/<[^>]+>/g, " ");
    return (id.match(/\d+/)?.[0] || "") === requested
      || (label.match(/\d+/)?.[0] || "") === requested;
  });

  if (selected.length === 0 && blocks[figureNumber - 1]) {
    selected = [blocks[figureNumber - 1]];
  }

  const names: string[] = [];
  for (const block of selected) {
    for (const match of block.matchAll(
      /<(?:graphic|inline-graphic)\b[^>]*(?:xlink:href|href)=["']([^"']+)["']/gi,
    )) {
      if (match[1]) names.push(decodeXml(match[1]));
    }
  }
  return [...new Set(names)];
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const minimum = Math.max(0, zip.length - 65557);
  for (let index = zip.length - 22; index >= minimum; index -= 1) {
    if (zip.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("Europe PMC returned an invalid ZIP archive.");
}

function listZipEntries(zip: Buffer): ZipEntry[] {
  const end = findEndOfCentralDirectory(zip);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Europe PMC ZIP directory is invalid.");
    }
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    entries.push({
      name: zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      method: zip.readUInt16LE(offset + 10),
      compressedSize: zip.readUInt32LE(offset + 20),
      uncompressedSize: zip.readUInt32LE(offset + 24),
      localOffset: zip.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function stem(filename: string): string {
  const base = filename.replace(/^\.\//, "").split("/").at(-1) || filename;
  return base.replace(/\.(png|jpe?g|gif|webp)$/i, "").toLowerCase();
}

function formatScore(filename: string): number {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return 4;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return 3;
  if (lower.endsWith(".webp")) return 2;
  if (lower.endsWith(".gif")) return 1;
  return 0;
}

function chooseFullResolutionEntry(entries: ZipEntry[], graphicNames: string[]): ZipEntry | null {
  const wantedStems = new Set(graphicNames.map(stem));
  const matches = entries.filter((entry) =>
    /\.(png|jpe?g|gif|webp)$/i.test(entry.name)
    && wantedStems.has(stem(entry.name))
    && entry.uncompressedSize > 0
    && entry.uncompressedSize <= MAX_IMAGE_BYTES
  );

  matches.sort((left, right) => {
    const sizeDifference = right.uncompressedSize - left.uncompressedSize;
    if (Math.abs(sizeDifference) > 4096) return sizeDifference;
    return formatScore(right.name) - formatScore(left.name);
  });
  return matches[0] || null;
}

function extractZipEntry(zip: Buffer, entry: ZipEntry): Uint8Array {
  if (zip.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    throw new Error("Europe PMC ZIP entry is invalid.");
  }
  const nameLength = zip.readUInt16LE(entry.localOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new Uint8Array(compressed);
  if (entry.method === 8) return new Uint8Array(inflateRawSync(compressed));
  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}

function contentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function resolveFigure(pmcid: string, figureNumber: number): Promise<Response> {
  const names = graphicNames(await fetchArticleXml(pmcid), figureNumber);
  if (names.length === 0) throw new Error(`Figure ${figureNumber} was not found in the article XML.`);

  const endpoint = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/supplementaryFiles`);
  endpoint.searchParams.set("includeInlineImage", "true");
  const response = await fetchTimed(endpoint, {
    headers: {
      "User-Agent": "LabNarrative-NCBI-Figure-Resolver/1.0 (+https://labnarrative.com)",
      Accept: "application/zip,application/octet-stream",
    },
  }, 45000);
  if (!response.ok) throw new Error(`Europe PMC figure archive request failed (${response.status}).`);

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_ARCHIVE_BYTES) throw new Error("Europe PMC archive exceeds 80 MB.");
  const zip = Buffer.from(await response.arrayBuffer());
  if (!zip.byteLength || zip.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Europe PMC archive is empty or too large.");
  }

  const entry = chooseFullResolutionEntry(listZipEntries(zip), names);
  if (!entry) throw new Error(`A full-resolution image for figure ${figureNumber} was not found.`);
  const image = extractZipEntry(zip, entry);
  if (!image.byteLength || image.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Resolved figure is empty or exceeds 20 MB.");
  }

  const body = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType(entry.name),
      "Content-Length": String(image.byteLength),
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "X-LabNarrative-Figure-File": entry.name,
    },
  });
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return errorResponse("Missing NCBI figure URL.", 400);

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    return errorResponse("Invalid NCBI figure URL.", 400);
  }

  try {
    let pmcid = pmcidFromUrl(sourceUrl);
    if (!pmcid) {
      const pmid = pmidFromUrl(sourceUrl);
      if (!pmid) return errorResponse("Only PMC and PubMed URLs are supported.", 400);
      pmcid = await pmcidForPubmedId(pmid);
      if (!pmcid) return errorResponse("The PubMed record has no open-access PMC full text.");
    }
    return await resolveFigure(pmcid, requestedFigureNumber(sourceUrl));
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "NCBI figure retrieval timed out."
      : error instanceof Error ? error.message : "Unable to retrieve the NCBI figure.";
    return errorResponse(message);
  }
}
