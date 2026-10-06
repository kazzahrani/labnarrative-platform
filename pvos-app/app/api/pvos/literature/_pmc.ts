const EUTILS="https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

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
  const res=await fetch(EUTILS+"/"+path+"?"+params.toString(),{
    headers:{"User-Agent":"PVOS literature screening prototype"}
  });
  if(!res.ok)throw new Error("NCBI request failed ("+res.status+").");
  return res.text();
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

export async function fetchPmcArticle(pmcid:string):Promise<PmcArticle|null>{
  const numeric=pmcid.replace(/^PMC/i,"");
  const xml=await ncbiText("efetch.fcgi",new URLSearchParams({
    db:"pmc",retmode:"xml",id:numeric
  }));
  if(!xml||!/<article[\s>]/i.test(xml))return null;

  const article=xml.match(/<article[\s\S]*?<\/article>/i)?.[0]||xml;
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
