const EUTILS="https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let lastNcbiRequestAt=0;

async function paceNcbi(){
  const minGap=380;
  const wait=Math.max(0,minGap-(Date.now()-lastNcbiRequestAt));
  if(wait)await sleep(wait);
  lastNcbiRequestAt=Date.now();
}

function decodeXml(v:string){
  return v
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function textOnly(v:string){
  return decodeXml(
    v
      .replace(/<xref[^>]*>[\s\S]*?<\/xref>/gi," ")
      .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi," $1 ")
      .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi," $1 ")
      .replace(/<[^>]+>/g," ")
      .replace(/\s+/g," ")
      .trim()
  );
}
async function ncbiText(path:string,params:URLSearchParams){
  params.set("tool","PVOS");
  const apiKey=process.env.NCBI_API_KEY?.trim();
  if(apiKey)params.set("api_key",apiKey);

  let lastStatus=0;
  for(let attempt=0;attempt<5;attempt++){
    await paceNcbi();
    const res=await fetch(EUTILS+"/"+path+"?"+params.toString(),{
      headers:{"User-Agent":"PVOS literature screening prototype"},
      cache:"no-store"
    });
    lastStatus=res.status;
    if(res.ok)return res.text();

    if(res.status!==429&&res.status<500){
      throw new Error("NCBI request failed ("+res.status+").");
    }

    const retryAfter=Number(res.headers.get("retry-after")||"0");
    const backoff=retryAfter>0?retryAfter*1000:Math.min(8000,800*Math.pow(2,attempt));
    await sleep(backoff);
  }
  throw new Error("NCBI request failed after retries ("+lastStatus+").");
}

export async function fetchPmcIdsForPmids(pmids:string[]){
  const out:Record<string,string|null>={};
  for(const id of pmids)out[id]=null;

  for(let i=0;i<pmids.length;i+=100){
    if(i)await sleep(360);
    const chunk=pmids.slice(i,i+100);
    const xml=await ncbiText("efetch.fcgi",new URLSearchParams({
      db:"pubmed",retmode:"xml",id:chunk.join(",")
    }));

    for(const m of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)){
      const article=m[1];
      const pmid=article.match(/<PMID(?:\s[^>]*)?>([\s\S]*?)<\/PMID>/i)?.[1]?.replace(/<[^>]+>/g,"").trim();
      if(!pmid)continue;
      const pmcid=article.match(/<ArticleId[^>]*IdType="pmc"[^>]*>(PMC\d+)<\/ArticleId>/i)?.[1]||null;
      out[pmid]=pmcid;
    }
  }
  return out;
}

export type PmcArticle={
  pmcid:string;
  abstract:string;
  fullText:string;
  sourceUrl:string;
};

function parsePmcArticle(article:string):PmcArticle|null{
  const pmcid=article.match(/<article-id[^>]*pub-id-type="pmc"[^>]*>(PMC\d+)<\/article-id>/i)?.[1]||"";
  if(!pmcid)return null;
  const abstractBlock=article.match(/<abstract(?:\s[^>]*)?>([\s\S]*?)<\/abstract>/i)?.[1]||"";
  const bodyBlock=article.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)?.[1]||"";
  const abstract=textOnly(abstractBlock);
  const fullText=textOnly(bodyBlock).slice(0,120000);
  if(!abstract&&!fullText)return null;
  return {
    pmcid,
    abstract,
    fullText,
    sourceUrl:"https://pmc.ncbi.nlm.nih.gov/articles/"+pmcid+"/"
  };
}

export async function fetchPmcArticles(pmcids:string[]){
  const out:Record<string,PmcArticle|null>={};
  const ids=[...new Set(pmcids.map(x=>x.toUpperCase()).filter(Boolean))];
  for(const id of ids)out[id]=null;

  for(let i=0;i<ids.length;i+=50){
    const chunk=ids.slice(i,i+50);
    const xml=await ncbiText("efetch.fcgi",new URLSearchParams({
      db:"pmc",retmode:"xml",id:chunk.map(x=>x.replace(/^PMC/i,"")).join(",")
    }));
    for(const m of xml.matchAll(/<article\b[\s\S]*?<\/article>/gi)){
      const parsed=parsePmcArticle(m[0]);
      if(parsed)out[parsed.pmcid.toUpperCase()]=parsed;
    }
  }
  return out;
}

export async function fetchPmcArticle(pmcid:string):Promise<PmcArticle|null>{
  const map=await fetchPmcArticles([pmcid]);
  return map[pmcid.toUpperCase()]||null;
}
