import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const MIN_BYTES = 4_000;
const CACHE_SECONDS = 31_536_000;
const USER_AGENT = "LabNarrative-PMC-Direct-Figure/1.0 (+https://labnarrative.com)";
const IMAGE_HOSTS = new Set(["pmc.ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov", "cdn.ncbi.nlm.nih.gov"]);

type Dimensions = { width: number; height: number };
type Candidate = { url: URL; score: number };

function fail(message: string, status = 502) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

async function timed(url: URL, init: RequestInit = {}, timeoutMs = 25_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" }); }
  finally { clearTimeout(timer); }
}

function isExactFigurePage(url: URL) {
  return url.protocol === "https:"
    && url.hostname.toLowerCase() === "pmc.ncbi.nlm.nih.gov"
    && /^\/articles\/PMC\d+\/figure\/[^/]+\/?$/i.test(url.pathname);
}

function decode(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&apos;", "'");
}

function attr(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decode((match?.[1] || match?.[2] || match?.[3] || "").trim());
}

function uint24le(bytes: Uint8Array, offset: number) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }
function png(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}
function jpeg(bytes: Uint8Array): Dimensions | null {
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
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) {
      return { height: view.getUint16(offset + 3, false), width: view.getUint16(offset + 5, false) };
    }
    offset += length;
  }
  return null;
}
function webp(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 30) return null;
  const t = new TextDecoder();
  if (t.decode(bytes.subarray(0,4)) !== "RIFF" || t.decode(bytes.subarray(8,12)) !== "WEBP") return null;
  const chunk = t.decode(bytes.subarray(12,16));
  if (chunk === "VP8X") return { width: uint24le(bytes,24)+1, height: uint24le(bytes,27)+1 };
  if (chunk === "VP8 " && bytes[23]===0x9d && bytes[24]===0x01 && bytes[25]===0x2a) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint16(26,true)&0x3fff, height: view.getUint16(28,true)&0x3fff };
  }
  return null;
}
function sizeOf(bytes: Uint8Array, type: string) {
  if (type === "image/png") return png(bytes);
  if (type === "image/jpeg" || type === "image/jpg") return jpeg(bytes);
  if (type === "image/webp") return webp(bytes);
  return null;
}
function quality(size: Dimensions) {
  const long = Math.max(size.width, size.height), short = Math.min(size.width, size.height), area = size.width * size.height;
  return (long >= 600 && short >= 400 && area >= 280_000) || (size.width >= 500 && size.height >= 500);
}

function candidateScore(url: URL, tag = "") {
  const value = `${url.href} ${tag}`.toLowerCase();
  return (/\/bin\//.test(value) ? 80 : 0)
    + (/cdn\.ncbi\.nlm\.nih\.gov/.test(value) ? 60 : 0)
    + (/fig|figure/.test(value) ? 35 : 0)
    + (/full|large|original|hires|high-res/.test(value) ? 30 : 0)
    + (/\.(png|jpe?g|webp)(?:[?#]|$)/.test(value) ? 20 : 0)
    - (/logo|icon|sprite|avatar|banner|branding|favicon|thumbnail|thumb/.test(value) ? 150 : 0);
}

function candidates(html: string, base: URL) {
  const out = new Map<string, Candidate>();
  const add = (raw: string, tag = "", bonus = 0) => {
    if (!raw) return;
    try {
      const url = new URL(decode(raw), base);
      if (url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname.toLowerCase())) return;
      const score = candidateScore(url, tag) + bonus;
      const previous = out.get(url.href);
      if (!previous || score > previous.score) out.set(url.href, { url, score });
    } catch { /* ignore malformed markup */ }
  };
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const context = `${attr(tag,"class")} ${attr(tag,"id")} ${attr(tag,"alt")}`;
    add(attr(tag,"src") || attr(tag,"data-src") || attr(tag,"data-original"), context, /fig|figure/i.test(context) ? 50 : 0);
    const srcset = attr(tag,"srcset") || attr(tag,"data-srcset");
    for (const item of srcset.split(",")) add(item.trim().split(/\s+/)[0] || "", context, 70);
  }
  for (const tag of html.match(/<source\b[^>]*>/gi) || []) {
    const srcset = attr(tag,"srcset");
    for (const item of srcset.split(",")) add(item.trim().split(/\s+/)[0] || "", tag, 60);
  }
  return [...out.values()].filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,40);
}

async function inspect(candidate: Candidate) {
  const response = await timed(candidate.url, { headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/jpeg,image/webp,image/*;q=.9,*/*;q=.1", Referer: "https://pmc.ncbi.nlm.nih.gov/" } }, 25_000);
  if (!response.ok) throw new Error(`candidate HTTP ${response.status}`);
  const finalUrl = new URL(response.url);
  if (!IMAGE_HOSTS.has(finalUrl.hostname.toLowerCase())) throw new Error("candidate redirected off NCBI");
  const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!["image/png","image/jpeg","image/jpg","image/webp"].includes(type)) throw new Error("candidate is not a supported image");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < MIN_BYTES || buffer.byteLength > MAX_BYTES) throw new Error("candidate byte size failed");
  const bytes = new Uint8Array(buffer), size = sizeOf(bytes,type);
  if (!size || !quality(size)) throw new Error(`candidate resolution failed ${size?.width||0}x${size?.height||0}`);
  return { bytes, type: type === "image/jpg" ? "image/jpeg" : type, size, score: candidate.score + Math.min(size.width*size.height,12_000_000)/10_000 };
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return fail("Missing figure URL.",400);
  let source: URL;
  try { source = new URL(raw); } catch { return fail("Invalid figure URL.",400); }
  if (!isExactFigurePage(source)) return fail("Only exact PMC figure pages are accepted.",400);
  try {
    const page = await timed(source,{headers:{"User-Agent":USER_AGENT,Accept:"text/html,application/xhtml+xml"}},25_000);
    if (!page.ok) return fail(`PMC figure page failed (${page.status}).`);
    const html = (await page.text()).slice(0,4_000_000), found = candidates(html,new URL(page.url));
    const passed: Array<Awaited<ReturnType<typeof inspect>>> = [];
    for (const candidate of found) {
      try { passed.push(await inspect(candidate)); } catch { /* try next */ }
      if (passed.length >= 8) break;
    }
    if (!passed.length) return fail("No full-resolution image could be extracted from the exact PMC figure page.");
    passed.sort((a,b)=>b.score-a.score);
    const best = passed[0];
    const body = best.bytes.buffer.slice(best.bytes.byteOffset,best.bytes.byteOffset+best.bytes.byteLength) as ArrayBuffer;
    return new Response(body,{status:200,headers:{"Content-Type":best.type,"Content-Length":String(best.bytes.byteLength),"Cache-Control":`public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,"Access-Control-Allow-Origin":"*","X-Content-Type-Options":"nosniff","X-LabNarrative-Image-Width":String(best.size.width),"X-LabNarrative-Image-Height":String(best.size.height),"X-LabNarrative-Resolver":"pmc-direct-figure-page"}});
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Direct PMC figure extraction failed.");
  }
}
