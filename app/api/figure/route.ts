import type { NextRequest } from "next/server";
import { inflateRawSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOSTS = new Set([
  "ars.els-cdn.com", "cdn.ncbi.nlm.nih.gov", "dm5migu4zj3pb.cloudfront.net",
  "genome.cshlp.org", "i1.rgstatic.net", "journals.plos.org",
  "lh3.googleusercontent.com", "link.springer.com", "loop.frontiersin.org",
  "mdpi-res.com", "media.springernature.com", "oup.silverchair-cdn.com",
  "pmc.ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "storage.googleapis.com",
  "www.aging-us.com", "www.ebi.ac.uk", "www.frontiersin.org", "www.irb.hr",
  "www.nature.com", "www.ncbi.nlm.nih.gov",
]);
const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_ZIP = 80 * 1024 * 1024;
const CACHE = 31_536_000;

function fail(message: string, status = 502) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
function allowed(url: URL) { return url.protocol === "https:" && HOSTS.has(url.hostname.toLowerCase()); }
function decode(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&apos;", "'").replaceAll("&#x2F;", "/");
}
async function timed(url: URL, init: RequestInit = {}, ms = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" }); }
  finally { clearTimeout(timer); }
}
async function fetchSource(url: URL, html = false) {
  if (!allowed(url)) throw new Error("Figure host is not approved.");
  const response = await timed(url, { headers: {
    "User-Agent": "Mozilla/5.0 (compatible; LabNarrative-Figure-Resolver/4.1; +https://labnarrative.com)",
    Accept: html ? "image/*,text/html;q=0.8,*/*;q=0.4" : "image/*,*/*;q=0.3",
    Referer: `${url.protocol}//${url.host}/`,
  } });
  if (!response.ok) throw new Error(`Upstream figure request failed (${response.status}).`);
  const finalUrl = new URL(response.url);
  if (!allowed(finalUrl)) throw new Error("Figure redirected to an unapproved host.");
  if (Number(response.headers.get("content-length") || 0) > MAX_IMAGE) throw new Error("Figure exceeds 20 MB.");
  return response;
}
function mime(name: string) {
  const value = name.toLowerCase();
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".gif")) return "image/gif";
  if (value.endsWith(".tif") || value.endsWith(".tiff")) return "image/tiff";
  return "image/jpeg";
}
function bytesResponse(bytes: Uint8Array, contentType: string) {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE) throw new Error("Figure is empty or exceeds 20 MB.");
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { status: 200, headers: {
    "Content-Type": contentType, "Content-Length": String(bytes.byteLength),
    "Cache-Control": `public, max-age=${CACHE}, s-maxage=${CACHE}, immutable`,
    "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*",
  } });
}
async function imageResponse(response: Response) {
  const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!type.startsWith("image/")) throw new Error("Upstream response was not an image.");
  return bytesResponse(new Uint8Array(await response.arrayBuffer()), type);
}

function pmcid(url: URL) { return url.pathname.match(/\/articles\/(PMC\d+)/i)?.[1]?.toUpperCase() || ""; }
function pmid(url: URL) { return url.hostname === "pubmed.ncbi.nlm.nih.gov" ? url.pathname.match(/\/(\d+)/)?.[1] || "" : ""; }
function figureNumber(url: URL) { return Number(url.pathname.match(/\/figure\/[^/]*?(\d+)/i)?.[1] || 1); }
async function convertPmid(value: string) {
  const url = new URL("https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/");
  url.searchParams.set("ids", value); url.searchParams.set("format", "json");
  url.searchParams.set("tool", "LabNarrative"); url.searchParams.set("email", "khaled@labnarrative.com");
  const response = await timed(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return "";
  const json = await response.json().catch(() => ({})) as { records?: Array<{ pmcid?: string }> };
  return json.records?.[0]?.pmcid?.toUpperCase() || "";
}
async function xmlFor(id: string) {
  const response = await timed(new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${id}/fullTextXML`),
    { headers: { Accept: "application/xml,text/xml" } }, 30_000);
  if (!response.ok) throw new Error(`Europe PMC XML request failed (${response.status}).`);
  const xml = await response.text();
  if (!xml.includes("<article")) throw new Error("Europe PMC did not return article XML.");
  return xml;
}
function graphicNames(xml: string, number: number) {
  const blocks = [...xml.matchAll(/<fig\b[^>]*>[\s\S]*?<\/fig>/gi)].map((match) => match[0]);
  const selected: string[] = [];
  const wanted = String(number);
  const matched = blocks.filter((block) => {
    const id = block.match(/<fig\b[^>]*\bid=["']([^"']+)["']/i)?.[1] || "";
    const label = (block.match(/<label[^>]*>([\s\S]*?)<\/label>/i)?.[1] || "").replace(/<[^>]+>/g, " ");
    return (id.match(/\d+/)?.[0] || "") === wanted || (label.match(/\d+/)?.[0] || "") === wanted;
  });
  for (const block of matched.length ? matched : blocks.slice(number - 1, number)) {
    for (const match of block.matchAll(/<(?:graphic|inline-graphic)\b[^>]*(?:xlink:href|href)=["']([^"']+)["']/gi)) {
      if (match[1]) selected.push(decode(match[1]));
    }
  }
  return [...new Set(selected)];
}

type Entry = { name: string; method: number; compressed: number; size: number; offset: number };
function zipEntries(zip: Buffer): Entry[] {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Europe PMC returned an invalid ZIP archive.");
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const result: Entry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("Europe PMC ZIP directory is invalid.");
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    result.push({
      name: zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      method: zip.readUInt16LE(offset + 10), compressed: zip.readUInt32LE(offset + 20),
      size: zip.readUInt32LE(offset + 24), offset: zip.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}
function chooseEntry(entries: Entry[], names: string[]) {
  const wanted = names.flatMap((raw) => {
    const base = raw.replace(/^\.\//, "").split("/").at(-1) || raw;
    return [base.toLowerCase(), base.replace(/\.(png|jpe?g|gif|webp|tiff?)$/i, "").toLowerCase()];
  });
  return entries.find((entry) => {
    if (!/\.(png|jpe?g|gif|webp|tiff?)$/i.test(entry.name)) return false;
    const base = entry.name.split("/").at(-1)?.toLowerCase() || entry.name.toLowerCase();
    const stem = base.replace(/\.(png|jpe?g|gif|webp|tiff?)$/i, "");
    return wanted.includes(base) || wanted.includes(stem);
  });
}
function unzip(zip: Buffer, entry: Entry) {
  if (entry.size > MAX_IMAGE) throw new Error("Archived figure exceeds 20 MB.");
  if (zip.readUInt32LE(entry.offset) !== 0x04034b50) throw new Error("Europe PMC ZIP entry is invalid.");
  const nameLength = zip.readUInt16LE(entry.offset + 26);
  const extraLength = zip.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(start, start + entry.compressed);
  if (entry.method === 0) return new Uint8Array(compressed);
  if (entry.method === 8) return new Uint8Array(inflateRawSync(compressed));
  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}
async function europePmcFigure(id: string, number: number) {
  const names = graphicNames(await xmlFor(id), number);
  if (!names.length) throw new Error(`Figure ${number} was not found in Europe PMC XML.`);
  const url = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${id}/supplementaryFiles`);
  url.searchParams.set("includeInlineImage", "true");
  const response = await timed(url, { headers: { Accept: "application/zip,application/octet-stream" } }, 45_000);
  if (!response.ok) throw new Error(`Europe PMC figure archive request failed (${response.status}).`);
  if (Number(response.headers.get("content-length") || 0) > MAX_ZIP) throw new Error("Europe PMC archive exceeds 80 MB.");
  const zip = Buffer.from(await response.arrayBuffer());
  if (!zip.length || zip.length > MAX_ZIP) throw new Error("Europe PMC archive is empty or too large.");
  const entry = chooseEntry(zipEntries(zip), names);
  if (!entry) throw new Error(`Figure ${number} was not found in the Europe PMC archive.`);
  return bytesResponse(unzip(zip, entry), mime(entry.name));
}

function candidateScore(value: string) {
  const url = value.toLowerCase();
  return (url.includes("media.springernature.com") ? 30 : 0)
    + (/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url) ? 15 : 0)
    + (url.includes("fig") ? 8 : 0)
    - (/logo|icon|avatar|author/.test(url) ? 40 : 0);
}
function candidates(html: string, base: URL) {
  const raw: string[] = [];
  for (const pattern of [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)/gi,
    /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)/gi,
  ]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) if (match[1]) raw.push(decode(match[1]));
  }
  const urls = new Map<string, URL>();
  for (const value of raw) try {
    const url = new URL(value, base); if (allowed(url)) urls.set(url.href, url);
  } catch { /* malformed markup */ }
  return [...urls.values()].sort((a, b) => candidateScore(b.href) - candidateScore(a.href)).slice(0, 16);
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return fail("Missing figure URL.", 400);
  let source: URL;
  try { source = new URL(raw); } catch { return fail("Invalid figure URL.", 400); }
  try {
    const directId = pmcid(source);
    if (directId) return await europePmcFigure(directId, figureNumber(source));
    const pubmed = pmid(source);
    if (pubmed) {
      const id = await convertPmid(pubmed);
      if (!id) return fail("The PubMed record has no downloadable open-access figure.");
      return await europePmcFigure(id, figureNumber(source));
    }
    const upstream = await fetchSource(source, true);
    const type = (upstream.headers.get("content-type") || "").toLowerCase();
    if (type.startsWith("image/")) return await imageResponse(upstream);
    if (!type.includes("text/html")) return fail("Upstream response was not an image or figure page.");
    for (const url of candidates(await upstream.text(), new URL(upstream.url))) {
      try { return await imageResponse(await fetchSource(url)); } catch { /* next */ }
    }
    return fail("No direct image could be resolved from this publisher page.");
  } catch (error) {
    return fail(error instanceof Error && error.name === "AbortError"
      ? "Upstream figure request timed out."
      : error instanceof Error ? error.message : "Unable to retrieve the figure.");
  }
}
