function cleanMarkup(v:string){
  return v
    .replace(/<jats:[^>]+>/gi," ")
    .replace(/<\/jats:[^>]+>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/\s+/g," ")
    .trim();
}

async function fetchJson(url:string,headers:Record<string,string>={}){
  const res=await fetch(url,{headers:{"User-Agent":"PVOS literature screening prototype",...headers},cache:"no-store"});
  if(!res.ok)return null;
  return res.json();
}

export async function fetchEuropePmcAbstract(pmid:string){
  const url="https://www.ebi.ac.uk/europepmc/webservices/rest/search?query="+
    encodeURIComponent("EXT_ID:"+pmid+" AND SRC:MED")+
    "&format=json&resultType=core&pageSize=1";
  const data=await fetchJson(url);
  const item=data?.resultList?.result?.[0];
  const abstract=String(item?.abstractText||"").trim();
  return abstract?{
    text:cleanMarkup(abstract),
    source:"Europe PMC",
    sourceUrl:item?.pmcid
      ?"https://europepmc.org/article/PMC/"+String(item.pmcid).replace(/^PMC/i,"")
      :"https://europepmc.org/article/MED/"+pmid
  }:null;
}

export async function fetchCrossrefAbstract(doi?:string|null){
  if(!doi)return null;
  const data=await fetchJson("https://api.crossref.org/works/"+encodeURIComponent(doi),{
    "Accept":"application/json"
  });
  const abstract=String(data?.message?.abstract||"").trim();
  return abstract?{
    text:cleanMarkup(abstract),
    source:"Crossref",
    sourceUrl:"https://doi.org/"+doi
  }:null;
}

function rebuildOpenAlexAbstract(index:Record<string,number[]>|null|undefined){
  if(!index)return "";
  let max=-1;
  for(const positions of Object.values(index)){
    for(const p of positions)if(p>max)max=p;
  }
  if(max<0)return "";
  const words=new Array(max+1).fill("");
  for(const [word,positions] of Object.entries(index)){
    for(const p of positions)words[p]=word;
  }
  return words.join(" ").replace(/\s+/g," ").trim();
}

export async function fetchOpenAlexAbstract(doi?:string|null){
  if(!doi)return null;
  const url="https://api.openalex.org/works/"+encodeURIComponent("https://doi.org/"+doi);
  const data=await fetchJson(url,{"Accept":"application/json"});
  const abstract=rebuildOpenAlexAbstract(data?.abstract_inverted_index);
  return abstract?{
    text:abstract,
    source:"OpenAlex",
    sourceUrl:String(data?.id||"https://openalex.org")
  }:null;
}


async function fetchSemanticScholarAbstract(doi?:string|null,pmid?:string|null){
  const id=doi?"DOI:"+doi:pmid?"PMID:"+pmid:"";
  if(!id)return null;
  const data=await fetchJson(
    "https://api.semanticscholar.org/graph/v1/paper/"+encodeURIComponent(id)+"?fields=title,abstract,url,openAccessPdf",
    {"Accept":"application/json"}
  );
  const abstract=String(data?.abstract||"").trim();
  return abstract?{
    text:cleanMarkup(abstract),
    source:"Semantic Scholar",
    sourceUrl:String(data?.url||data?.openAccessPdf?.url||"")
  }:null;
}

function decodeHtmlEntities(v:string){
  return v
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}

function metaContent(html:string,names:string[]){
  const wanted=new Set(names.map(x=>x.toLowerCase()));
  for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
    const tag=m[0];
    const key=tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if(!key||!wanted.has(key))continue;
    const value=tag.match(/content=["']([\s\S]*?)["']/i)?.[1];
    if(value&&value.trim())return cleanMarkup(decodeHtmlEntities(value));
  }
  return "";
}

function jsonLdDescription(html:string){
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const parsed=JSON.parse(decodeHtmlEntities(m[1]));
      const stack=Array.isArray(parsed)?parsed:[parsed];
      for(const item of stack){
        const value=item?.abstract||item?.description;
        if(typeof value==="string"&&value.trim())return cleanMarkup(value);
        if(Array.isArray(item?.["@graph"])){
          for(const node of item["@graph"]){
            const v=node?.abstract||node?.description;
            if(typeof v==="string"&&v.trim())return cleanMarkup(v);
          }
        }
      }
    }catch{}
  }
  return "";
}

export async function fetchPublisherMetadataText(doi?:string|null){
  if(!doi)return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch("https://doi.org/"+doi,{
      redirect:"follow",
      signal:controller.signal,
      cache:"no-store",
      headers:{
        "User-Agent":"PVOS literature screening prototype",
        "Accept":"text/html,application/xhtml+xml"
      }
    });
    if(!res.ok)return null;
    const contentType=res.headers.get("content-type")||"";
    if(!contentType.includes("text/html")&&!contentType.includes("application/xhtml+xml"))return null;
    const html=(await res.text()).slice(0,1500000);

    let text=metaContent(html,[
      "citation_abstract","dc.description","dcterms.abstract",
      "description","og:description","twitter:description"
    ]);
    if(!text)text=jsonLdDescription(html);

    if(text.length<120)return null;
    return {
      text,
      source:"Publisher metadata",
      sourceUrl:res.url||"https://doi.org/"+doi
    };
  }catch{
    return null;
  }finally{
    clearTimeout(timer);
  }
}

export async function fetchFallbackArticleText(pmid:string,doi?:string|null){
  const europe=await fetchEuropePmcAbstract(pmid);
  if(europe)return europe;

  const crossref=await fetchCrossrefAbstract(doi);
  if(crossref)return crossref;

  const openAlex=await fetchOpenAlexAbstract(doi);
  if(openAlex)return openAlex;

  const semantic=await fetchSemanticScholarAbstract(doi,pmid);
  if(semantic)return semantic;

  const publisher=await fetchPublisherMetadataText(doi);
  if(publisher)return publisher;

  return null;
}
