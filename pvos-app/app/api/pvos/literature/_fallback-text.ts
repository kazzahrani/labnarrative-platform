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

export async function fetchFallbackArticleText(pmid:string,doi?:string|null){
  const europe=await fetchEuropePmcAbstract(pmid);
  if(europe)return europe;

  const crossref=await fetchCrossrefAbstract(doi);
  if(crossref)return crossref;

  const openAlex=await fetchOpenAlexAbstract(doi);
  if(openAlex)return openAlex;

  return null;
}
