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
const CASE_REPORT_TERMS=[
  "case report","case series","case presentation","individual case","spontaneous report"
];
const SAFETY_TERMS=[
  "adverse event","adverse events","adverse reaction","adverse reactions","toxicity","toxicities",
  "side effect","side effects","drug-induced","drug induced","hospitalization","hospitalisation",
  "death","fatal","died","overdose","medication error","pregnancy","foetal","fetal","teratogenic",
  "anaphylaxis","hypersensitivity","bleeding","hemorrhage","hemorrhages","haemorrhage","haemorrhages","liver injury","hepatotoxic",
  "kidney injury","renal injury","renal failure","cardiac arrest","arrhythmia","thrombosis",
  "thromboembolism","thromboembolic event","thromboembolic events","venous thromboembolism","ischemic stroke","ischemic strokes","stroke","strokes","intracranial hemorrhage","intracranial hemorrhages",
  "suicidal","suicide","interaction","drug-drug interaction","withdrawal","off-label","off label",
  "misuse","abuse","treatment failure","lack of efficacy","breakthrough"
];
const EXPOSURE_TERMS=[
  "above range","above-range","plasma level","plasma levels","drug level","drug levels",
  "concentration","concentrations","exposure","cyp3a4","p-glycoprotein","p glycoprotein",
  "pharmacokinetic","pharmacokinetics","auc","clearance"
];
const ASSOCIATION_TERMS=[
  "associated with","increased risk","higher risk","elevated risk","caused by","induced by",
  "attributed to","related to","adverse effect","adverse event","adverse reaction"
];
const HIGH_SIGNAL_TITLE_TERMS=[
  "signal","signals","risk","safety","bleeding","hemorrhage","hemorrhages","haemorrhage","haemorrhages",
  "adverse event","adverse events","adverse reaction","adverse reactions","interaction","interactions",
  "drug-drug interaction","drug-drug interactions","toxicity","toxicities"
];

function isWordChar(v:string){
  if(!v)return false;
  const n=v.toLowerCase().charCodeAt(0);
  return (n>=97&&n<=122)||(n>=48&&n<=57);
}
function phrasePresent(text:string,term:string){
  const hay=text.toLowerCase();
  const needle=term.toLowerCase().trim();
  if(!needle)return false;
  let from=0;
  while(from<hay.length){
    const i=hay.indexOf(needle,from);
    if(i<0)return false;
    const before=i>0?hay[i-1]:"";
    const after=i+needle.length<hay.length?hay[i+needle.length]:"";
    if(!isWordChar(before)&&!isWordChar(after))return true;
    from=i+1;
  }
  return false;
}
function hits(text:string,terms:string[]){
  return terms.filter(t=>phrasePresent(text,t));
}
function unique(values:string[]){
  return [...new Set(values)];
}
function sentences(v:string){
  return v.replace(/\s+/g," ").split(/(?<=[.!?])\s+(?=[A-Z])/).map(x=>x.trim()).filter(Boolean);
}
function hasAnyProductTerm(text:string,terms:string[]){
  return terms.some(t=>phrasePresent(text,t));
}
function hasQuantifiedFinding(text:string){
  return /\b\d+(?:\.\d+)?\s*%|\b(?:OR|HR|RR)\s*[=:]?\s*\d|\bhazard ratio\s*\d|\b(?:odds|risk|rate) ratio\s*\d|95\s*%\s*(?:CI|confidence interval)|above[- ]range|significantly\s+(?:higher|lower|increased|decreased|more|fewer)|\b(?:higher|lower|increased|decreased)\s+(?:risk|odds|rate|level|levels|concentration|concentrations|exposure)/i.test(text);
}
function hasBreakthroughPattern(text:string,terms:string[]){
  const lower=text.toLowerCase();
  if(!hasAnyProductTerm(text,terms))return false;
  if(/\b(?:breakthrough|treatment failure|lack of efficacy)\b/i.test(text))return true;
  return terms.some(term=>{
    const t=term.toLowerCase();
    return lower.includes("while on "+t)||
      lower.includes("while taking "+t)||
      lower.includes("despite "+t)||
      lower.includes("despite treatment with "+t);
  });
}
function hasTreatmentOnlyPattern(text:string,terms:string[]){
  const lower=text.toLowerCase();
  return terms.some(term=>{
    const t=term.toLowerCase();
    return lower.includes("transitioned to "+t)||
      lower.includes("transitioned to oral "+t)||
      lower.includes("switched to "+t)||
      lower.includes("switched to oral "+t)||
      lower.includes("started on "+t)||
      lower.includes("started on oral "+t)||
      lower.includes("initiated "+t)||
      lower.includes("treated with "+t);
  });
}

export function analyzeArticle(title:string,abstract:string,keywords:string[],terms:string[]){
  const matchedTerms:string[]=[];
  const locations=new Set<string>();
  const termLocations:Record<string,string[]>={};

  for(const term of terms){
    const loc:string[]=[];
    if(phrasePresent(title,term))loc.push("Title");
    if(phrasePresent(abstract,term))loc.push("Abstract");
    if(phrasePresent(keywords.join(" "),term))loc.push("Keywords");
    if(loc.length){
      matchedTerms.push(term);
      termLocations[term]=loc;
      loc.forEach(x=>locations.add(x));
    }
  }

  const combined=[title,abstract,keywords.join(" ")].join(" ");
  const allSentences=[title,...sentences(abstract),...keywords];
  const productContexts=allSentences.filter(s=>hasAnyProductTerm(s,terms));
  const productInTitle=hasAnyProductTerm(title,terms);
  const saudiHits=hits(combined,SAUDI_TERMS);
  const caseHits=hits(combined,CASE_TERMS);
  const caseReportHits=hits(combined,CASE_REPORT_TERMS);
  const safetyHits=hits(combined,SAFETY_TERMS);
  const exposureHits=hits(combined,EXPOSURE_TERMS);
  const productSafetyHits=unique(productContexts.flatMap(s=>hits(s,SAFETY_TERMS)));
  const productExposureHits=unique(productContexts.flatMap(s=>hits(s,EXPOSURE_TERMS)));
  const productAssociationHits=unique(productContexts.flatMap(s=>hits(s,ASSOCIATION_TERMS)));
  const quantifiedProductEvidence=productContexts.some(hasQuantifiedFinding);
  const highSignalTitle=hits(title,HIGH_SIGNAL_TITLE_TERMS).length>0;
  const breakthrough=productContexts.some(s=>hasBreakthroughPattern(s,terms));
  const localSafetyEvidence=productSafetyHits.length>0||productExposureHits.length>0||productAssociationHits.length>0;
  const genericSafetyEvidence=safetyHits.length>0||exposureHits.length>0;
  const treatmentOnly=productContexts.length>0 &&
    productContexts.some(s=>hasTreatmentOnlyPattern(s,terms)) &&
    !localSafetyEvidence &&
    !breakthrough;
  const caseLike=caseHits.length>0;
  const caseReportLike=caseReportHits.length>0;
  const urgentSaudi=saudiHits.length>0 && (caseLike||genericSafetyEvidence);

  let score=0;
  if(productInTitle)score+=3;
  if(localSafetyEvidence)score+=2;
  if(productAssociationHits.length)score+=2;
  if(quantifiedProductEvidence&&localSafetyEvidence)score+=2;
  if(quantifiedProductEvidence&&highSignalTitle)score+=4;
  if(genericSafetyEvidence)score+=1;
  if(productInTitle&&genericSafetyEvidence)score+=1;
  if(caseReportLike&&localSafetyEvidence)score+=1;
  if(breakthrough)score+=1;
  if(treatmentOnly)score-=2;

  let relevance:"likely_relevant"|"possible"|"unlikely"="unlikely";
  let reason="Product mention found without clear product-linked safety, interaction, exposure, or case evidence.";

  if(urgentSaudi){
    relevance="likely_relevant";
    reason="Priority review: Saudi context plus clinical case or safety evidence detected. Human review remains required.";
  }else if(score>=5){
    relevance="likely_relevant";
    reason="Product-linked safety, interaction, exposure, or quantified outcome evidence detected.";
  }else if(breakthrough){
    relevance="possible";
    reason="Possible breakthrough or lack-of-efficacy event while on the monitored product; QPPV assessment required.";
  }else if((genericSafetyEvidence||caseReportLike)&&!treatmentOnly){
    relevance="possible";
    reason=localSafetyEvidence
      ?"Possible product-linked safety relevance detected; attribution is not strong enough for high-priority classification."
      :"Safety-relevant article mentions the monitored product, but product-specific attribution is unclear from the abstract.";
  }else if(treatmentOnly){
    relevance="unlikely";
    reason="The monitored product appears to be background or treatment context without a product-linked safety finding.";
  }

  return {
    matchedTerms,
    matchLocations:[...locations],
    termLocations,
    relevance,
    reason,
    urgentSaudi,
    saudiHits:unique(saudiHits).slice(0,8),
    safetyHits:unique(safetyHits).slice(0,12),
    caseHits:unique(caseHits).slice(0,8),
    productSafetyHits:productSafetyHits.slice(0,10),
    exposureHits:unique(exposureHits).slice(0,10),
    productExposureHits:productExposureHits.slice(0,10),
    productAssociationHits:productAssociationHits.slice(0,8),
    breakthrough,
    quantifiedProductEvidence,
    highSignalTitle,
    treatmentOnly,
    score,
    analysisVersion:"v2.2"
  };
}

export { sleep };
