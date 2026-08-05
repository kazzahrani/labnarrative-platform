import type { NextRequest } from "next/server";
import { inflateRawSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MIN_IMAGE_BYTES = 4_000;
const CACHE_SECONDS = 60 * 60 * 24 * 365;
const USER_AGENT = "LabNarrative-NCBI-Figure-Resolver/2.0 (+https://labnarrative.com)";

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

type Dimensions = { width: number; height: number };
type FigureRef = {
  number: number;
  id: string;
  label: string;
  caption: string;
  graphics: string[];
};

type ImageCandidate = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  figureNumber: number;
  score: number;
  source: string;
  dimensions: Dimensions;
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

async function fetchTimed(url: URL, init: RequestInit = {}, timeoutMs = 30_000) {
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

async function fetchWithRetry(url: URL, init: RequestInit = {}, timeoutMs = 30_000, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchTimed(url, init, timeoutMs);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`Upstream request failed (${response.status}).`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError instanceof Error ? lastError : new Error("Upstream request failed.");
}

function pmcidFromUrl(sourceUrl: URL): string {
  return sourceUrl.pathname.match(/\/articles\/(PMC\d+)/i)?.[1]?.toUpperCase() || "";
}

function pmidFromUrl(sourceUrl: URL): string {
  if (sourceUrl.hostname.toLowerCase() !== "pubmed.ncbi.nlm.nih.gov") return "";
  return sourceUrl.pathname.match(/\/(\d+)/)?.[1] || "";
}

function requestedFigureNumber(sourceUrl: URL): number | null {
  const match = sourceUrl.pathname.match(/\/figure\/[^/]*?(\d+)/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function pmcidForPubmedId(pmid: string): Promise<string> {
  const endpoint = new URL("https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/");
  endpoint.searchParams.set("ids", pmid);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("tool", "LabNarrative");
  endpoint.searchParams.set("email", "khaled@labnarrative.com");

  const response = await fetchWithRetry(endpoint, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) return "";
  const data = await response.json().catch(() => ({})) as { records?: Array<{ pmcid?: string }> };
  const pmcid = data.records?.[0]?.pmcid?.toUpperCase() || "";
  return /^PMC\d+$/.test(pmcid) ? pmcid : "";
}

async function fetchArticleXml(pmcid: string): Promise<string> {
  const endpoint = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
  const response = await fetchWithRetry(endpoint, {
    headers: {
      "User-Agent": USER_AGENT,
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
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function plainText(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function figuresFromXml(xml: string): FigureRef[] {
  const figures: FigureRef[] = [];
  const blocks = [...xml.matchAll(/<fig\b[^>]*>[\s\S]*?<\/fig>/gi)].map((match) => match[0]);
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const id = block.match(/<fig\b[^>]*\bid=["']([^"']+)["']/i)?.[1] || `fig-${index + 1}`;
    const label = plainText(block.match(/<label[^>]*>([\s\S]*?)<\/label>/i)?.[1] || "");
    const caption = plainText(block.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1] || "");
    const parsedNumber = Number(label.match(/\d+/)?.[0] || id.match(/\d+/)?.[0] || index + 1);
    const graphics = [...block.matchAll(/<(?:graphic|inline-graphic)\b[^>]*(?:xlink:href|href)=["']([^"']+)["']/gi)]
      .map((match) => decodeXml(match[1] || ""))
      .filter(Boolean);
    if (graphics.length) {
      figures.push({
        number: Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : index + 1,
        id,
        label,
        caption,
        graphics: [...new Set(graphics)],
      });
    }
  }
  return figures;
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
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
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) { offset += 1; marker = bytes[offset + 1]; }
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
      return { height: view.getUint16(offset + 3, false), width: view.getUint16(offset + 5, false) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 30) return null;
  const text = new TextDecoder();
  if (text.decode(bytes.subarray(0, 4)) !== "RIFF" || text.decode(bytes.subarray(8, 12)) !== "WEBP") return null;
  const chunk = text.decode(bytes.subarray(12, 16));
  if (chunk === "VP8X") return { width: uint24le(bytes, 24) + 1, height: uint24le(bytes, 27) + 1 };
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

function imageDimensions(bytes: Uint8Array, contentType: string): Dimensions | null {
  if (contentType === "image/png") return pngDimensions(bytes);
  if (contentType === "image/jpeg" || contentType === "image/jpg") return jpegDimensions(bytes);
  if (contentType === "image/webp") return webpDimensions(bytes);
  if (contentType === "image/gif") return gifDimensions(bytes);
  return null;
}

function normalizeContentType(value: string, filename = ""): string {
  const type = value.split(";")[0].trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)) return type;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

function qualifies(bytes: Uint8Array, contentType: string): Dimensions | null {
  if (bytes.byteLength < MIN_IMAGE_BYTES || bytes.byteLength > MAX_IMAGE_BYTES || contentType === "image/gif") return null;
  const size = imageDimensions(bytes, contentType);
  if (!size) return null;
  const longSide = Math.max(size.width, size.height);
  const shortSide = Math.min(size.width, size.height);
  const area = size.width * size.height;
  const widePass = longSide >= 700 && shortSide >= 220 && area >= 220_000;
  const squarePass = size.width >= 550 && size.height >= 550;
  return widePass || squarePass ? size : null;
}

function candidateScore(bytes: Uint8Array, size: Dimensions, contentType: string, figureNumber: number, requested: number | null): number {
  const area = size.width * size.height;
  const format = contentType === "image/png" ? 25 : contentType === "image/jpeg" ? 20 : 10;
  const requestedBonus = requested !== null && figureNumber === requested ? 1_000_000 : 0;
  return requestedBonus + Math.min(area, 12_000_000) + Math.min(bytes.byteLength, 2_000_000) / 5 + format;
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
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("Europe PMC ZIP directory is invalid.");
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

function extractZipEntry(zip: Buffer, entry: ZipEntry): Uint8Array {
  if (zip.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error("Europe PMC ZIP entry is invalid.");
  const nameLength = zip.readUInt16LE(entry.localOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return new Uint8Array(compressed);
  if (entry.method === 8) return new Uint8Array(inflateRawSync(compressed));
  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}

function basename(value: string): string {
  return value.replace(/^\.\//, "").split("/").at(-1) || value;
}

function stem(value: string): string {
  return basename(value).replace(/\.(png|jpe?g|gif|webp|tiff?)$/i, "").toLowerCase();
}

function stemMatches(left: string, right: string): boolean {
  const a = stem(left), b = stem(right);
  return a === b || a.includes(b) || b.includes(a);
}

function graphicVariants(graphic: string): string[] {
  const clean = basename(graphic);
  if (/\.(png|jpe?g|gif|webp)$/i.test(clean)) return [clean];
  return [clean, `${clean}.jpg`, `${clean}.jpeg`, `${clean}.png`, `${clean}.webp`];
}

async function directCandidates(pmcid: string, figures: FigureRef[], requested: number | null): Promise<ImageCandidate[]> {
  const ordered = requested === null
    ? figures
    : [...figures.filter((figure) => figure.number === requested), ...figures.filter((figure) => figure.number !== requested)];
  const tasks: Array<{ url: URL; figureNumber: number; filename: string }> = [];
  const seen = new Set<string>();
  for (const figure of ordered) {
    for (const graphic of figure.graphics) {
      for (const filename of graphicVariants(graphic)) {
        const url = new URL(`https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/bin/${encodeURIComponent(filename)}`);
        if (seen.has(url.href)) continue;
        seen.add(url.href);
        tasks.push({ url, figureNumber: figure.number, filename });
        if (tasks.length >= 36) break;
      }
      if (tasks.length >= 36) break;
    }
    if (tasks.length >= 36) break;
  }

  const found: ImageCandidate[] = [];
  for (let offset = 0; offset < tasks.length; offset += 6) {
    const batch = tasks.slice(offset, offset + 6);
    const results = await Promise.all(batch.map(async (task) => {
      try {
        const response = await fetchTimed(task.url, {
          headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/jpeg,image/webp,image/*;q=0.8,*/*;q=0.2" },
        }, 12_000);
        if (!response.ok) return null;
        const declared = Number(response.headers.get("content-length") || 0);
        if (declared > MAX_IMAGE_BYTES) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = normalizeContentType(response.headers.get("content-type") || "", task.filename);
        const size = contentType ? qualifies(bytes, contentType) : null;
        if (!size) return null;
        return {
          bytes,
          contentType,
          filename: task.filename,
          figureNumber: task.figureNumber,
          score: candidateScore(bytes, size, contentType, task.figureNumber, requested),
          source: task.url.href,
          dimensions: size,
        } satisfies ImageCandidate;
      } catch {
        return null;
      }
    }));
    found.push(...results.filter((item): item is ImageCandidate => Boolean(item)));
    if (requested !== null && found.some((item) => item.figureNumber === requested)) break;
    if (requested === null && found.length >= 4) break;
  }
  return found;
}

async function archiveCandidates(pmcid: string, figures: FigureRef[], requested: number | null): Promise<ImageCandidate[]> {
  const endpoint = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/supplementaryFiles`);
  endpoint.searchParams.set("includeInlineImage", "true");
  const response = await fetchWithRetry(endpoint, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/zip,application/octet-stream" },
  }, 45_000);
  if (!response.ok) throw new Error(`Europe PMC figure archive request failed (${response.status}).`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_ARCHIVE_BYTES) throw new Error("Europe PMC archive exceeds 80 MB.");
  const zip = Buffer.from(await response.arrayBuffer());
  if (!zip.byteLength || zip.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Europe PMC archive is empty or too large.");

  const entries = listZipEntries(zip).filter((entry) =>
    /\.(png|jpe?g|gif|webp)$/i.test(entry.name)
    && entry.uncompressedSize >= MIN_IMAGE_BYTES
    && entry.uncompressedSize <= MAX_IMAGE_BYTES
    && !/logo|icon|avatar|thumbnail|thumb/i.test(entry.name)
  );
  const candidates: ImageCandidate[] = [];
  for (const figure of figures) {
    if (requested !== null && candidates.some((item) => item.figureNumber === requested) && figure.number !== requested) continue;
    const matches = entries.filter((entry) => figure.graphics.some((graphic) => stemMatches(entry.name, graphic)));
    for (const entry of matches) {
      try {
        const bytes = extractZipEntry(zip, entry);
        const contentType = normalizeContentType("", entry.name);
        const size = contentType ? qualifies(bytes, contentType) : null;
        if (!size) continue;
        candidates.push({
          bytes,
          contentType,
          filename: entry.name,
          figureNumber: figure.number,
          score: candidateScore(bytes, size, contentType, figure.number, requested),
          source: endpoint.href,
          dimensions: size,
        });
      } catch {
        // Try the next matching archive entry.
      }
    }
  }
  return candidates;
}

function candidateResponse(candidate: ImageCandidate, pmcid: string): Response {
  const body = candidate.bytes.buffer.slice(
    candidate.bytes.byteOffset,
    candidate.bytes.byteOffset + candidate.bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": candidate.contentType,
      "Content-Length": String(candidate.bytes.byteLength),
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "X-LabNarrative-PMCID": pmcid,
      "X-LabNarrative-Figure": String(candidate.figureNumber),
      "X-LabNarrative-Figure-File": candidate.filename,
      "X-LabNarrative-Figure-Source": candidate.source,
      "X-LabNarrative-Image-Width": String(candidate.dimensions.width),
      "X-LabNarrative-Image-Height": String(candidate.dimensions.height),
    },
  });
}

async function resolveFigure(pmcid: string, requested: number | null): Promise<Response> {
  const figures = figuresFromXml(await fetchArticleXml(pmcid));
  if (!figures.length) throw new Error("No scientific figures were found in the article XML.");

  const direct = await directCandidates(pmcid, figures, requested);
  let candidates = direct;
  if (!candidates.length || (requested !== null && !candidates.some((item) => item.figureNumber === requested))) {
    try {
      candidates = [...candidates, ...await archiveCandidates(pmcid, figures, requested)];
    } catch (error) {
      if (!candidates.length) throw error;
    }
  }
  if (!candidates.length) throw new Error("No usable full-resolution scientific figure was found in this open-access article.");
  candidates.sort((left, right) => right.score - left.score);
  return candidateResponse(candidates[0], pmcid);
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
