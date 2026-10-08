export type Notice={title:string,url:string,published_at:string|null,summary:string,publisher_url:string};
function decode(s:string){return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(Math.min(parseInt(x,16),0x10ffff))).replace(/&#(\d+);/g,(_,x)=>String.fromCodePoint(Math.min(Number(x),0x10ffff))).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&nbsp;/g," ");}
export function plain(s:string){return decode(decode(s).replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim();}
function value(xml:string,name:string){return xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||"";}
export function httpsUrl(raw:string,base?:string){try{const u=new URL(decode(raw.trim()),base);if(u.protocol==="http:"&&["www.fda.gov","fda.gov"].includes(u.hostname)&&base&&new URL(base).hostname==="www.fda.gov")u.protocol="https:";if(u.protocol!=="https:"||u.username||u.password)return null;return u.toString();}catch{return null;}}
export function parseFeed(xml:string,base:string):Notice[]{
 if(xml.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error("Feed is oversized or contains unsupported declarations");
 if(!/<(?:feed|rss)\b/i.test(xml))throw new Error("Response is not an Atom/RSS feed");
 const blocks=[...xml.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)];
 if(!/<\/(?:feed|rss)\s*>/i.test(xml)||blocks.length!==[...xml.matchAll(/<(?:entry|item)\b/gi)].length)throw new Error("Feed XML is incomplete; manual verification required");
 if(!blocks.length||blocks.length>1000)throw new Error("Feed entry count is empty or exceeds the collection limit");
 const out:Notice[]=[],seen=new Set<string>();
 for(const block of blocks){
  const x=block[2],title=plain(value(x,"title"));let link="";
  if(block[1].toLowerCase()==="entry"){
   const links=[...x.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
   const tag=links.find(t=>/rel=["']alternate["']/i.test(t))||links.find(t=>!t.includes("rel="));
   link=tag?.match(/href=["']([^"']+)["']/i)?.[1]||"";
  }else link=plain(value(x,"link"));
  const url=httpsUrl(link,base);
  if(!title||!url)throw new Error("A feed entry is missing a title or safe evidence link; manual verification required");
  const rawDate=plain(value(x,"published")||value(x,"pubDate")||value(x,"dc:date")||value(x,"updated"));
  const d=rawDate?new Date(rawDate):null,published_at=d&&!Number.isNaN(d.getTime())?d.toISOString():null;
  const summary=plain(value(x,"summary")||value(x,"description")||value(x,"content")).slice(0,20000);
  const key=url+"|"+title+"|"+summary+"|"+published_at;
  if(!seen.has(key)){seen.add(key);out.push({title:title.slice(0,2000),url,published_at,summary,publisher_url:decode(link)});}
 }
 return out;
}
export async function sha256(text:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");}
export const VERIFIED_FEEDS:Record<string,string>={mhra_dsu:"https://www.gov.uk/drug-safety-update.atom",fda_medwatch:"https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml"};
export async function collectFeed(source:{source_key:string,feed_url:string},fetcher:typeof fetch=fetch){
 const approved=VERIFIED_FEEDS[source.source_key];if(!approved||source.feed_url!==approved)throw new Error("Automatic source is not in the verified collection allowlist");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const r=await fetcher(approved,{signal:controller.signal,redirect:"error",headers:{"User-Agent":"PVOS authority monitoring; public feed collection","Accept":"application/atom+xml,application/rss+xml,application/xml,text/xml"}});
  if(!r.ok)throw new Error("Publisher returned HTTP "+r.status);
  const body=await r.text(),notices=parseFeed(body,approved);
  const dates=notices.map(n=>n.published_at).filter((d):d is string=>!!d).sort();
  return {http_status:r.status,feed_sha256:await sha256(body),entry_count:notices.length,oldest_published_at:dates[0]||null,newest_published_at:dates.at(-1)||null,notices};
 }finally{clearTimeout(timer);}
}
