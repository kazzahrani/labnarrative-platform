import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL ?? "https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

type ProductInput = {
  id: string;
  brand_name?: string | null;
  active_ingredient?: string | null;
};

type SummaryDoc = {
  uid?: string;
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  sortpubdate?: string;
  articleids?: Array<{idtype?: string; value?: string}>;
};

const sleep = (ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function normalizeTerm(v:string){
  return v.replace(/\s+/g," ").trim();
}

function productTerms(p:ProductInput){
  const out = new Set<string>();
  const brand = normalizeTerm(p.brand_name ?? "");
  if(brand) out.add(brand);

  const ingredient = normalizeTerm(p.active_ingredient ?? "");
  if(ingredient){
    out.add(ingredient);
    const parts = ingredient.split(/\s*(?:&|\+|\/|;|,)\s*/).map(normalizeTerm).filter(Boolean);
    for(const part of parts){
      out.add(part);
      const base = part.replace(/\s+(hydrochloride|sodium|potassium|calcium|mesylate|maleate|succinate|tartrate|phosphate|acetate|citrate|fumarate|besylate)$/i,"").trim();
      if(base && base !== part) out.add(base);
    }
  }
  return [...out].filter(x=>x.length>=3).slice(0,12);
}

function ymd(v?:string){
  if(!v)return null;
  const m=v.match(/(\d{4})[-\s\/]([A-Za-z]{3}|\d{1,2})[-\s\/](\d{1,2})/);
  if(m){
    const months:Record<string,string>={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
    const month=/^\d+$/.test(m[2])?String(Number(m[2])).padStart(2,"0"):months[m[2].slice(0,3)] ?? "01";
    return `${m[1]}-${month}-${String(Number(m[3])).padStart(2,"0")}`;
  }
  const year=v.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? year+"-01-01" : null;
}

async function requireUser(req:NextRequest){
  const auth=req.headers.get("authorization") ?? "";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token)return null;
  const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return null;
  return data.user;
}

async function ncbiJson(path:string,params:URLSearchParams){
  params.set("tool","PVOS");
  const url=EUTILS+"/"+path+"?"+params.toString();
  const res=await fetch(url,{headers:{"User-Agent":"PVOS literature screening prototype"}});
  if(!res.ok)throw new Error("PubMed request failed ("+res.status+").");
  return res.json();
}

export async function POST(req:NextRequest){
  try{
    const user=await requireUser(req);
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});

    const body=await req.json();
    const products=(Array.isArray(body?.products)?body.products:[]) as ProductInput[];
    const periodStart=String(body?.periodStart ?? "");
    const periodEnd=String(body?.periodEnd ?? "");

    if(!products.length||products.length>30)return NextResponse.json({error:"Choose between 1 and 30 products."},{status:400});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)||!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))return NextResponse.json({error:"Invalid screening period."},{status:400});

    const start=new Date(periodStart+"T00:00:00Z"),end=new Date(periodEnd+"T23:59:59Z");
    const days=(end.getTime()-start.getTime())/86400000;
    if(days<0||days>366)return NextResponse.json({error:"Screening period must be between 0 and 366 days."},{status:400});

    const items:any[]=[];
    let requestCount=0;

    for(const product of products){
      const terms=productTerms(product);
      if(!terms.length)continue;
      const query=terms.map(t=>`"${t.replace(/"/g,"")}"[Title/Abstract]`).join(" OR ");

      if(requestCount)await sleep(360);
      const search=await ncbiJson("esearch.fcgi",new URLSearchParams({
        db:"pubmed",retmode:"json",retmax:"100",sort:"pub date",
        term:"("+query+")",datetype:"pdat",mindate:periodStart,maxdate:periodEnd
      }));
      requestCount++;
      const ids=(search?.esearchresult?.idlist ?? []) as string[];
      if(!ids.length)continue;

      await sleep(360);
      const summary=await ncbiJson("esummary.fcgi",new URLSearchParams({
        db:"pubmed",retmode:"json",id:ids.join(",")
      }));
      requestCount++;

      const uids=(summary?.result?.uids ?? []) as string[];
      for(const uid of uids){
        const doc=(summary?.result?.[uid] ?? {}) as SummaryDoc;
        const title=String(doc.title ?? "").replace(/<[^>]+>/g,"").trim();
        if(!title)continue;
        const titleLower=title.toLowerCase();
        const matched=terms.filter(t=>titleLower.includes(t.toLowerCase()));
        const doi=doc.articleids?.find(x=>x.idtype==="doi")?.value ?? null;
        items.push({
          product_id:product.id,
          title,
          journal:doc.fulljournalname || doc.source || "PubMed",
          publication_date:ymd(doc.sortpubdate || doc.pubdate),
          article_url:"https://pubmed.ncbi.nlm.nih.gov/"+uid+"/",
          doi,
          matched_terms:matched.length?matched:terms,
          relevance:"unscored",
          review_status:"unreviewed",
          metadata:{
            connector:"pubmed",
            pmid:uid,
            search_terms:terms,
            retrieved_at:new Date().toISOString()
          }
        });
      }
    }

    const seen=new Set<string>();
    const deduped=items.filter(x=>{
      const key=x.product_id+"|"+(x.doi?String(x.doi).toLowerCase():x.article_url);
      if(seen.has(key))return false;
      seen.add(key);return true;
    });

    return NextResponse.json({
      source:"PubMed",
      products_searched:products.length,
      results:deduped.length,
      items:deduped
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message ?? "PubMed screening failed."},{status:500});
  }
}
