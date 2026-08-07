import type { NextRequest } from "next/server";
import { gunzipSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "LabNarrative-NCBI-OA-Figure/1.1 (+https://labnarrative.com)";
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_BYTES = 4_000;
const CACHE_SECONDS = 31_536_000;

type Dimensions = { width: number; height: number };
type TarEntry = { name: string; bytes: Uint8Array };

function fail(message: string, status = 502) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
async function timed(url: URL, init: RequestInit = {}, timeoutMs = 35_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" }); }
  finally { clearTimeout(timer); }
}
function decodeXml(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
function pmcidFrom(source: URL) { return source.pathname.match(/\/articles\/(PMC\d+)/i)?.[1]?.toUpperCase() || ""; }
function figureNumber(source: URL) {
  const value = Number(source.pathname.match(/\/figure\/[^/]*?(\d+)/i)?.[1] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function plain(value: string) { return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(); }
function basename(value: string) { return decodeXml(value).replace(/^\.\//, "").split("/").at(-1) || value; }
function stem(value: string) { return basename(value).replace(/\.(?:png|jpe?g|gif|webp|tiff?)$/i, "").toLowerCase(); }

async function articleXml(pmcid: string) {
  const endpoint = new URL(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
  const response = await timed(endpoint, { headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml" } });
  if (!response.ok) throw new Error(`Europe PMC XML request failed (${response.status}).`);
  const xml = await response.text();
  if (!xml.includes("<article")) throw new Error("Article XML is unavailable.");
  return xml;
}
function figureGraphics(xml: string, requested: number) {
  const figures = [...xml.matchAll(/<fig\b[^>]*>[\s\S]*?<\/fig>/gi)].map(m=>m[0]);
  for (let index=0; index<figures.length; index+=1) {
    const block = figures[index];
    const id = block.match(/<fig\b[^>]*\bid=["']([^"']+)["']/i)?.[1] || "";
    const label = plain(block.match(/<label[^>]*>([\s\S]*?)<\/label>/i)?.[1] || "");
    const number = Number(label.match(/\d+/)?.[0] || id.match(/\d+/)?.[0] || index+1);
    if (number !== requested) continue;
    return [...block.matchAll(/<(?:graphic|inline-graphic)\b[^>]*(?:xlink:href|href)=["']([^"']+)["']/gi)].map(m=>decodeXml(m[1]||"")).filter(Boolean);
  }
  return [];
}

async function oaPackageUrl(pmcid: string) {
  const endpoint = new URL("https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi");
  endpoint.searchParams.set("id", pmcid);
  const response = await timed(endpoint, { headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml" } });
  if (!response.ok) throw new Error(`NCBI OA lookup failed (${response.status}).`);
  const xml = await response.text();
  const links = [...xml.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
  for (const tag of links) {
    const format = tag.match(/\bformat=["']([^"']+)/i)?.[1]?.toLowerCase() || "";
    const href = decodeXml(tag.match(/\bhref=["']([^"']+)/i)?.[1] || "");
    if (format !== "tgz" || !href) continue;
    const https = href
      .replace(/^ftp:\/\/ftp\.ncbi\.nlm\.nih\.gov/i, "https://ftp.ncbi.nlm.nih.gov")
      .replace(
        /^https:\/\/ftp\.ncbi\.nlm\.nih\.gov\/pub\/pmc\/oa_package\//i,
        "https://ftp.ncbi.nlm.nih.gov/pub/pmc/deprecated/oa_package/",
      );
    const url = new URL(https);
    if (url.protocol === "https:" && url.hostname === "ftp.ncbi.nlm.nih.gov") return url;
  }
  throw new Error("NCBI OA package is not available for this PMCID.");
}

function octal(bytes: Uint8Array) {
  const value = new TextDecoder().decode(bytes).replace(/\0.*$/, "").trim();
  return value ? parseInt(value, 8) : 0;
}
function tarEntries(tar: Uint8Array) {
  const entries: TarEntry[] = [];
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(v=>v===0)) break;
    const name = decoder.decode(header.subarray(0,100)).replace(/\0.*$/, "");
    const prefix = decoder.decode(header.subarray(345,500)).replace(/\0.*$/, "");
    const fullName = [prefix,name].filter(Boolean).join("/");
    const size = octal(header.subarray(124,136));
    const type = String.fromCharCode(header[156] || 48);
    const start = offset + 512, end = start + size;
    if ((type === "0" || type === "\0") && size > 0 && end <= tar.length) entries.push({ name: fullName, bytes: tar.slice(start,end) });
    offset = start + Math.ceil(size/512)*512;
  }
  return entries;
}

function uint24le(bytes: Uint8Array, offset: number) { return bytes[offset] | (bytes[offset+1]<<8) | (bytes[offset+2]<<16); }
function png(bytes: Uint8Array): Dimensions | null {
  if (bytes.length<24 || ![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return null;
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); return {width:v.getUint32(16,false),height:v.getUint32(20,false)};
}
function jpeg(bytes: Uint8Array): Dimensions | null {
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)return null;const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let o=2;
  while(o+8<bytes.length){if(bytes[o]!==255){o++;continue}let m=bytes[o+1];while(m===255&&o+2<bytes.length){o++;m=bytes[o+1]}o+=2;if(m===216||m===217||m===1||(m>=208&&m<=215))continue;if(o+2>bytes.length)break;const len=v.getUint16(o,false);if(len<2||o+len>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)&&len>=7)return{height:v.getUint16(o+3,false),width:v.getUint16(o+5,false)};o+=len}return null;
}
function webp(bytes: Uint8Array): Dimensions | null {
  if(bytes.length<30)return null;const t=new TextDecoder();if(t.decode(bytes.subarray(0,4))!=="RIFF"||t.decode(bytes.subarray(8,12))!=="WEBP")return null;const c=t.decode(bytes.subarray(12,16));if(c==="VP8X")return{width:uint24le(bytes,24)+1,height:uint24le(bytes,27)+1};if(c==="VP8 "&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return{width:v.getUint16(26,true)&0x3fff,height:v.getUint16(28,true)&0x3fff}}return null;
}
function typeFor(name: string) { const l=name.toLowerCase(); return l.endsWith(".png")?"image/png":l.endsWith(".webp")?"image/webp":l.endsWith(".jpg")||l.endsWith(".jpeg")?"image/jpeg":""; }
function sizeFor(bytes: Uint8Array,type:string){return type==="image/png"?png(bytes):type==="image/jpeg"?jpeg(bytes):type==="image/webp"?webp(bytes):null;}
function quality(s:Dimensions){const l=Math.max(s.width,s.height),sh=Math.min(s.width,s.height),a=s.width*s.height;return(l>=600&&sh>=400&&a>=280000)||(s.width>=500&&s.height>=500);}

export async function GET(request: NextRequest) {
  const raw=request.nextUrl.searchParams.get("url"); if(!raw)return fail("Missing figure URL.",400);
  let source:URL; try{source=new URL(raw)}catch{return fail("Invalid figure URL.",400)}
  const pmcid=pmcidFrom(source),requested=figureNumber(source);
  if(source.protocol!=="https:"||source.hostname!=="pmc.ncbi.nlm.nih.gov"||!pmcid||!requested)return fail("An exact PMC figure URL is required.",400);
  try{
    const xml=await articleXml(pmcid),graphics=figureGraphics(xml,requested);
    if(!graphics.length)throw new Error(`Figure ${requested} has no graphic reference in article XML.`);
    const archiveUrl=await oaPackageUrl(pmcid),archiveResponse=await timed(archiveUrl,{headers:{"User-Agent":USER_AGENT,Accept:"application/gzip,application/octet-stream"}},50_000);
    if(!archiveResponse.ok)throw new Error(`NCBI OA package request failed (${archiveResponse.status}).`);
    const compressed=new Uint8Array(await archiveResponse.arrayBuffer());
    if(!compressed.byteLength||compressed.byteLength>MAX_ARCHIVE_BYTES)throw new Error("NCBI OA package is empty or too large.");
    const tar=new Uint8Array(gunzipSync(compressed)),entries=tarEntries(tar).filter(e=>/\.(png|jpe?g|webp)$/i.test(e.name));
    const wanted=new Set(graphics.flatMap(g=>[basename(g).toLowerCase(),stem(g)]));
    const matches=entries.filter(e=>wanted.has(basename(e.name).toLowerCase())||wanted.has(stem(e.name))||graphics.some(g=>stem(e.name)===stem(g)));
    const usable=matches.map(e=>{const type=typeFor(e.name),size=type&&e.bytes.byteLength>=MIN_IMAGE_BYTES&&e.bytes.byteLength<=MAX_IMAGE_BYTES?sizeFor(e.bytes,type):null;return{...e,type,size};}).filter((e):e is TarEntry&{type:string,size:Dimensions}=>Boolean(e.type&&e.size&&quality(e.size))).sort((a,b)=>(b.size.width*b.size.height)-(a.size.width*a.size.height));
    if(!usable.length)throw new Error(`NCBI OA package contained no display-quality file matching Figure ${requested}.`);
    const best=usable[0],body=best.bytes.buffer.slice(best.bytes.byteOffset,best.bytes.byteOffset+best.bytes.byteLength) as ArrayBuffer;
    return new Response(body,{status:200,headers:{"Content-Type":best.type,"Content-Length":String(best.bytes.byteLength),"Cache-Control":`public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,"Access-Control-Allow-Origin":"*","X-Content-Type-Options":"nosniff","X-LabNarrative-Image-Width":String(best.size.width),"X-LabNarrative-Image-Height":String(best.size.height),"X-LabNarrative-Resolver":"ncbi-oa-package","X-LabNarrative-Figure":String(requested)}});
  }catch(error){return fail(error instanceof Error?error.message:"NCBI OA figure resolution failed.");}
}
