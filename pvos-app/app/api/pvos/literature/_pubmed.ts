export type ProductInput = {
  id: string;
  brand_name?: string | null;
  active_ingredient?: string | null;
};

export type PubMedDetail = {
  pmid: string;
  abstract: string;
  keywords: string[];
  online_date: string | null;
  issue_date: string | null;
  pubmed_date: string | null;
};

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const sleep = (ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function decodeXml(v:string){
  return v
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function textOnly(v:string){
  return decodeXml(v.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
}
function xmlTag(block:string,tag:string){
  const m=block.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"));
  return m?textOnly(m[1]):"";
}
function monthNumber(v:string){
  const x=v.trim().slice(0,3).toLowerCase();
  const map:Record<string,string>={jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
  if(map[x])return map[x];
  const n=Number(v);
  return Number.isFinite(n)&&n>=1&&n<=12?String(n).padStart(2,"0"):"01";
}
function dateFromBlock(block:string){
  if(!block)return null;
  const year=xmlTag(block,"Year")||block.match(/\b(19|20)\d{2}\b/)?.[0]||"";
  if(!year)return null;
  const month=monthNumber(xmlTag(block,"Month")||"1");
  const day=String(Number(xmlTag(block,"Day")||"1")).padStart(2,"0");
  return year+"-"+month+"-"+day;
}
function firstBlock(block:string,pattern:RegExp){
  return block.match(pattern)?.[1]||"";
}

export function normalizeTerm(v:string){
  return v.replace(/\s+/g," ").trim();
}

export function productTerms(p:ProductInput){
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

export function ymd(v?:string){
  if(!v)return null;
  const m=v.match(/(\d{4})[-\s\/]([A-Za-z]{3}|\d{1,2})[-\s\/](\d{1,2})/);
  if(m)return m[1]+"-"+monthNumber(m[2])+"-"+String(Number(m[3])).padStart(2,"0");
  const year=v.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? year+"-01-01" : null;
}

export async function ncbiJson(path:string,params:URLSearchParams){
  params.set("tool","PVOS");
  const url=EUTILS+"/"+path+"?"+params.toString();
  const res=await fetch(url,{headers:{"User-Agent":"PVOS literature screening prototype"}});
  if(!res.ok)throw new Error("PubMed request failed ("+res.status+").");
  return res.json();
}

async function ncbiText(path:string,params:URLSearchParams){
  params.set("tool","PVOS");
  const url=EUTILS+"/"+path+"?"+params.toString();
  const res=await fetch(url,{headers:{"User-Agent":"PVOS literature screening prototype"}});
  if(!res.ok)throw new Error("PubMed request failed ("+res.status+").");
  return res.text();
}

export async function fetchPubMedDetails(ids:string[]){
  const out:Record<string,PubMedDetail>={};
  for(let i=0;i<ids.length;i+=100){
    if(i)await sleep(360);
    const chunk=ids.slice(i,i+100);
    const xml=await ncbiText("efetch.fcgi",new URLSearchParams({
      db:"pubmed",retmode:"xml",id:chunk.join(",")
    }));
    for(const m of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)){
      const article=m[1];
      const pmid=xmlTag(article,"PMID");
      if(!pmid)continue;

      const abstractParts:string[]=[];
      for(const a of article.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)){
        const label=a[1].match(/Label="([^"]+)"/i)?.[1];
        const body=textOnly(a[2]);
        if(body)abstractParts.push(label?label+": "+body:body);
      }
      const keywords=[...article.matchAll(/<Keyword(?:\s[^>]*)?>([\s\S]*?)<\/Keyword>/g)]
        .map(k=>textOnly(k[1])).filter(Boolean);

      const journalIssue=firstBlock(article,/<JournalIssue[^>]*>([\s\S]*?)<\/JournalIssue>/i);
      const issuePub=firstBlock(journalIssue,/<PubDate>([\s\S]*?)<\/PubDate>/i);
      const electronic=firstBlock(article,/<ArticleDate[^>]*DateType="Electronic"[^>]*>([\s\S]*?)<\/ArticleDate>/i);
      const pubmedHistory=firstBlock(article,/<PubMedPubDate[^>]*PubStatus="pubmed"[^>]*>([\s\S]*?)<\/PubMedPubDate>/i);

      out[pmid]={
        pmid,
        abstract:abstractParts.join("\n\n"),
        keywords,
        online_date:dateFromBlock(electronic),
        issue_date:dateFromBlock(issuePub),
        pubmed_date:dateFromBlock(pubmedHistory)
      };
    }
  }
  return out;
}

const SAUDI_TERMS=[
  "saudi arabia","saudi","kingdom of saudi arabia","ksa","riyadh","jeddah","makkah","mecca",
  "madinah","medina","dammam","khobar","al khobar","qassim","al-qassim","buraydah","buraidah",
  "king saud","king abdulaziz","king faisal","king fahad"
];
const CASE_TERMS=[
  "case report","case series","case presentation","patient","patients","individual case",
  "spontaneous report","adverse event","adverse events","adverse reaction","adverse reactions"
];
const SAFETY_TERMS=[
  "adverse event","adverse events","adverse reaction","adverse reactions","toxicity","toxicities",
  "side effect","side effects","drug-induced","drug induced","hospitalization","hospitalisation",
  "death","fatal","died","overdose","medication error","pregnancy","foetal","fetal","teratogenic",
  "anaphylaxis","hypersensitivity","bleeding","hemorrhage","haemorrhage","liver injury","hepatotoxic",
  "kidney injury","renal injury","renal failure","cardiac arrest","arrhythmia","thrombosis",
  "suicidal","suicide","interaction","withdrawal","off-label","off label","misuse","abuse"
];

function escapeRegExp(v:string){return v.replace(/[.*+?^\\${}()|[\\]\\\\]/g,"\\\\function hits(text:string,terms:string[]){
  const l=text.toLowerCase();
  return terms.filter(t=>l.includes(t));
}")}
function phrasePresent(text:string,term:string){
  const normalized=text.toLowerCase();
  const t=term.toLowerCase().trim();
  if(!t)return false;
  const pattern=escapeRegExp(t).replace(/\\\\s+/g,"\\\\s+");
  return new RegExp("(^|[^a-z0-9])"+pattern+"(?=$|[^a-z0-9])","i").test(normalized);
}
function hits(text:string,terms:string[]){
  return terms.filter(t=>phrasePresent(text,t));
}

export function analyzeArticle(title:string,abstract:string,keywords:string[],terms:string[]){
  const titleLower=title.toLowerCase();
  const abstractLower=abstract.toLowerCase();
  const keywordText=keywords.join(" ").toLowerCase();

  const matchedTerms:string[]=[];
  const locations=new Set<string>();
  const termLocations:Record<string,string[]>={};
  for(const term of terms){
    const t=term.toLowerCase();
    const loc:string[]=[];
    if(titleLower.includes(t))loc.push("Title");
    if(abstractLower.includes(t))loc.push("Abstract");
    if(keywordText.includes(t))loc.push("Keywords");
    if(loc.length){
      matchedTerms.push(term);
      termLocations[term]=loc;
      loc.forEach(x=>locations.add(x));
    }
  }

  const combined=[title,abstract,keywords.join(" ")].join(" ");
  const saudiHits=hits(combined,SAUDI_TERMS);
  const caseHits=hits(combined,CASE_TERMS);
  const safetyHits=hits(combined,SAFETY_TERMS);
  const caseLike=caseHits.length>0;
  const urgentSaudi=saudiHits.length>0 && (caseLike||safetyHits.length>0);

  let relevance:"likely_relevant"|"possible"|"unlikely"="unlikely";
  let reason="No strong generic safety or case-report terms detected. Keep available for QPPV review.";
  if(urgentSaudi){
    relevance="likely_relevant";
    reason="Priority review: Saudi context plus patient/case or safety terminology detected.";
  }else if(caseHits.some(x=>x.includes("case report")||x.includes("case series")) || safetyHits.length>=2){
    relevance="likely_relevant";
    reason="High-priority safety/case terminology detected in the title, abstract or keywords.";
  }else if(caseLike||safetyHits.length){
    relevance="possible";
    reason="Possible safety relevance detected; QPPV assessment required.";
  }

  return {
    matchedTerms,
    matchLocations:[...locations],
    termLocations,
    relevance,
    reason,
    urgentSaudi,
    saudiHits:[...new Set(saudiHits)].slice(0,8),
    safetyHits:[...new Set(safetyHits)].slice(0,10),
    caseHits:[...new Set(caseHits)].slice(0,8)
  };
}

export { sleep };
