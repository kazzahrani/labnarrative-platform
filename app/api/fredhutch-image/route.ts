import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["research.fredhutch.org", "www.fredhutch.org", "fredhutch.org"];

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function normalise(value: string) { return decodeHtml(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function attr(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return quoted?.[1] ? decodeHtml(quoted[1]) : "";
}
function isPlaceholder(value: string) {
  const v = value.toLowerCase();
  return !value || v.startsWith("data:") || /\/backgrounds\/.*gray\.gif/.test(v) || /(?:1x1|400x400)-gray\.gif/.test(v);
}
function bestFromSrcset(srcset: string) {
  const entries = decodeHtml(srcset).split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const bits = part.split(/\s+/); const url = bits[0] || ""; const width = Number((bits[1] || "").replace(/[^0-9.]/g, "")) || 0; return { url, width };
  }).filter((entry) => !isPlaceholder(entry.url));
  entries.sort((a,b)=>b.width-a.width); return entries[0]?.url || "";
}
function urlsIn(block: string) {
  const found: string[] = [];
  const tags = block.match(/<(?:source|img)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    for (const name of ["data-srcset","srcset"]) { const value = attr(tag,name); if (value) { const best = bestFromSrcset(value); if (best) found.push(best); } }
    for (const name of ["data-src","data-lazy-src","data-cmp-src","src"]) { const value = attr(tag,name); if (!isPlaceholder(value)) found.push(value); }
  }
  const rawUrls = decodeHtml(block).match(/(?:https?:\/\/[^\s"'<>]+|\/content\/dam\/[^\s"'<>]+|\/[^\s"'<>]+(?:coreimg|\.jpe?g|\.png|\.webp)[^\s"'<>]*)/gi) ?? [];
  for (const value of rawUrls) if (!isPlaceholder(value)) found.push(value);
  return [...new Set(found)];
}
function scoreBlock(block: string, query: string) {
  const q = normalise(query); const text = normalise(block); if (!q) return 0; let score = 0;
  const altTags = block.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of altTags) { const alt = normalise(attr(tag,"alt")); const title = normalise(attr(tag,"title")); if (alt === q || title === q) score += 500; else if (alt.includes(q) || title.includes(q)) score += 250; }
  if (text.includes(q)) score += 120;
  for (const token of q.split(" ").filter((token)=>token.length>2)) if (text.includes(token)) score += 10;
  return score;
}
function toAllowedUrl(raw: string, source: URL) {
  try { const url = new URL(raw, source); return ALLOWED_HOSTS.some((host)=>url.hostname===host || url.hostname.endsWith(`.${host}`)) ? url : null; } catch { return null; }
}
function resolveImage(html: string, source: URL, query: string) {
  const blocks = [
    ...(html.match(/<picture\b[\s\S]*?<\/picture>/gi) ?? []),
    ...(html.match(/<figure\b[\s\S]*?<\/figure>/gi) ?? []),
    ...(html.match(/<div\b[^>]*>[\s\S]{0,4000}?(?:<img\b[^>]*>)[\s\S]{0,1500}?<\/div>/gi) ?? []),
    ...(html.match(/<img\b[^>]*>/gi) ?? []),
  ].map((block)=>({block,score:scoreBlock(block,query)})).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score);
  for (const item of blocks) for (const raw of urlsIn(item.block)) { const url = toAllowedUrl(raw,source); if (url) return url; }

  const queryIndex = html.toLowerCase().indexOf(query.toLowerCase());
  if (queryIndex >= 0) {
    const nearby = html.slice(Math.max(0,queryIndex-9000), Math.min(html.length,queryIndex+12000));
    for (const raw of urlsIn(nearby)) { const url = toAllowedUrl(raw,source); if (url) return url; }
  }
  return null;
}
async function proxy(url: URL) {
  const response = await fetch(url,{headers:{"user-agent":"LabNarrativeFredHutchImageResolver/1.1"},cache:"no-store",signal:AbortSignal.timeout(10000)});
  const type=response.headers.get("content-type")||""; if(!response.ok||!type.toLowerCase().startsWith("image/")) return NextResponse.json({error:"image_fetch_failed",url:url.toString()},{status:502});
  const body=await response.arrayBuffer(); if(body.byteLength<2000) return NextResponse.json({error:"image_too_small",url:url.toString(),bytes:body.byteLength},{status:502});
  return new NextResponse(body,{headers:{"content-type":type,"cache-control":"public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800","x-content-type-options":"nosniff","x-labnarrative-source-image":url.toString()}});
}
export async function GET(request: NextRequest) {
  const sourceValue=request.nextUrl.searchParams.get("source")?.trim()||""; const query=request.nextUrl.searchParams.get("q")?.trim()||"";
  if(!sourceValue||!query) return NextResponse.json({error:"missing_source_or_query"},{status:400});
  let source:URL; try{source=new URL(sourceValue);}catch{return NextResponse.json({error:"invalid_source"},{status:400});}
  if(source.protocol!=="https:"||!ALLOWED_HOSTS.some((host)=>source.hostname===host||source.hostname.endsWith(`.${host}`))) return NextResponse.json({error:"source_not_allowed"},{status:403});
  try { const page=await fetch(source,{headers:{"user-agent":"LabNarrativeFredHutchImageResolver/1.1"},cache:"no-store",signal:AbortSignal.timeout(10000)}); if(!page.ok) return NextResponse.json({error:"source_fetch_failed"},{status:502}); const html=await page.text(); const image=resolveImage(html,source,query); if(!image) return NextResponse.json({error:"image_not_found",query},{status:404}); return await proxy(image); } catch { return NextResponse.json({error:"resolver_failed"},{status:502}); }
}
