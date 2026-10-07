// Shared by manual screening and the scheduled Edge Function.
export function crossrefIssns(metadata: Record<string, any> = {}) {
  const configured = Array.isArray(metadata.crossref_issns) ? metadata.crossref_issns : null;
  return [...new Set((configured ?? [metadata.online_issn, metadata.print_issn])
    .map((value: any) => String(value ?? "").trim().toUpperCase())
    .filter((value: string) => /^\d{4}-[\dX]{4}$/.test(value)))];
}

export function unusableJournalPage(html: string) {
  return /test page for (?:the )?nginx|welcome to.*nginx|checking your browser|just a moment|access denied|verify you are human/i.test(html);
}

export async function fetchCrossrefWorks(issn: string, start: string, end: string,
  mode: "publication" | "update" = "update", request: typeof fetch = fetch) {
  const rows = 500, items: any[] = [];
  let cursor = "*", total = 0;
  for (let page = 0; page < 8; page++) {
    const url = new URL("https://api.crossref.org/v1/journals/" + encodeURIComponent(issn) + "/works");
    url.searchParams.set("filter", (mode === "update" ? "from-update-date:" : "from-pub-date:") + start +
      (mode === "update" ? ",until-update-date:" : ",until-pub-date:") + end + ",type:journal-article");
    url.searchParams.set("rows", String(rows));
    url.searchParams.set("cursor", cursor);
    url.searchParams.set("mailto", "support@pvos.site");
    let message: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await request(url.toString(), {cache: "no-store", signal: AbortSignal.timeout(15000),
          headers: {Accept: "application/json", "User-Agent": "PVOS literature monitoring/1.0 (https://pvos.site)"}});
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); continue; }
          throw new Error("Crossref request failed (" + response.status + ").");
        }
        message = (await response.json())?.message;
        if (!message || !Array.isArray(message.items)) throw new Error("Invalid Crossref works response.");
        break;
      } catch (error) {
        if (attempt === 2 || /Crossref request failed|Invalid Crossref/.test(String(error))) throw error;
      }
    }
    const batch = message.items;
    total = Number(message["total-results"] ?? batch.length);
    items.push(...batch);
    const next = String(message["next-cursor"] ?? "");
    if (items.length >= total || !next || !batch.length || next === cursor) break;
    cursor = next;
  }
  return {items, total, truncated: items.length < total, mode};
}

// PostgREST caps individual responses: paginate before deduplicating against history.
export async function readAllRows(query: (from: number, to: number) => PromiseLike<{data: any[] | null; error: any}>) {
  const rows: any[] = [];
  for(let from = 0; ; from += 1000) {
    const {data, error} = await query(from, from + 999);
    if(error) throw error;
    rows.push(...(data || []));
    if(!data || data.length < 1000) return rows;
  }
}

function journalText(value: string) {
  return value.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
}
export function saudiJournalArticles(html: string, base: string, code: string) {
  if(!/^[a-z]+$/.test(code)) return [];
  const items: {url:string; title:string; doi:string}[] = [];
  const seen = new Set<string>();
  for(const block of html.split(/<div\b[^>]*class=["'][^"']*article-box[^"']*["'][^>]*>/i).slice(1)) {
    const doi = block.match(new RegExp("10\\.36348/"+code+"\\.[A-Z0-9._-]+", "i"))?.[0];
    const heading = block.match(/<div\b[^>]*onclick=["']location\.href='([^']+)'["'][^>]*>([\s\S]*?)<\/div>/i);
    const path = heading?.[1] || block.match(/href=["'](\/articles\/\d+\/)["']/)?.[1];
    if(!doi || !path || seen.has(doi.toLowerCase())) continue;
    const url = new URL(path, base);
    if(url.host !== new URL(base).host || !/^\/articles\/\d+\/$/.test(url.pathname)) continue;
    seen.add(doi.toLowerCase());
    items.push({url:url.toString(),title:journalText(heading?.[2] || ""),doi});
  }
  return items;
}
export function saudiJournalIssueUrls(html: string, base: string, code: string) {
  if(!/^[a-z]+$/.test(code)) return [];
  const links = [...html.matchAll(new RegExp("(?:href|location\\.href)=[\"'](/journal-details/"+code+"/(\\d+)/(\\d+))[\"']", "g"))];
  const volume = Math.max(...links.map(x=>Number(x[2])));
  return [...new Set(links.filter(x=>Number(x[2])===volume).sort((a,b)=>Number(b[3])-Number(a[3])).slice(0,2).map(x=>new URL(x[1],base).toString()))];
}
export function parseSaudiJournalArticle(html: string) {
  const title=journalText(html.match(/<div[^>]*class=["']fs-2["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||"");
  const abstract=journalText(html.match(/<strong>\s*Abstract\s*<\/strong>\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i)?.[1]||"");
  const doi=html.match(/10\.36348\/[A-Z0-9._-]+/i)?.[0]||null;
  const published=journalText(html.match(/<strong>Published\s*:\s*<\/strong>([\s\S]*?)<\/div>/i)?.[1]||"");
  const date=new Date(published+" UTC");
  return {title,abstract,doi,publicationDate:published&&!Number.isNaN(date.getTime())?date.toISOString().slice(0,10):null};
}
type JournalPage={ok:boolean;status:number;url:string;text:string;error?:string};
export async function scanSaudiJournal(source: any, load: (url:string)=>Promise<JournalPage>) {
  const code=String(source.metadata?.journal_code||"").toLowerCase();
  const base=String(source.url||"");
  const attempts:any[]=[];
  const articles=new Map<string,ReturnType<typeof saudiJournalArticles>[number]>();
  let landingUrl="";
  const visit=async(url:string)=>{
    const page=await load(url);
    const usable=page.ok&&!unusableJournalPage(page.text);
    attempts.push({url,final_url:page.url,status:page.status,ok:usable,error:page.error||null});
    if(usable){landingUrl=page.url;for(const item of saudiJournalArticles(page.text,page.url,code))articles.set(item.doi.toLowerCase(),item)}
    return usable?page:null;
  };
  await visit(base);
  const archive=await visit(new URL("/journal/"+code+"/archives",base).toString());
  if(archive) for(const url of saudiJournalIssueUrls(archive.text,archive.url,code)) await visit(url);
  return {landingUrl,attempts,candidates:[...articles.values()]};
}
