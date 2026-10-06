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
  "death","fatal","died","overdose","medication error","anaphylaxis","hypersensitivity",
  "bleeding","hemorrhage","hemorrhages","haemorrhage","haemorrhages","liver injury","hepatotoxic",
  "kidney injury","renal injury","renal failure","cardiac arrest","arrhythmia","thrombosis",
  "thromboembolism","thromboembolic event","thromboembolic events","venous thromboembolism",
  "ischemic stroke","ischemic strokes","stroke","strokes","intracranial hemorrhage","intracranial hemorrhages",
  "suicidal ideation","suicide","tolerability","safety"
];
const SPECIAL_SITUATION_TERMS=[
  "pregnancy","pregnant","maternal","fetal","foetal","neonatal","breastfeeding","breast-feeding",
  "lactation","overdose","medication error","off-label","off label","misuse","abuse",
  "occupational exposure","teratogenic"
];
const LACK_EFFICACY_TERMS=[
  "treatment failure","lack of efficacy","breakthrough","resistance","resistant","refractory",
  "disease progression","progression","recurrence","recurrent","relapse","nonresponse","non-response",
  "poor response","poorer response","loss of response"
];
const EXPOSURE_TERMS=[
  "above range","above-range","plasma level","plasma levels","drug level","drug levels",
  "concentration","concentrations","exposure","cyp3a4","p-glycoprotein","p glycoprotein",
  "pharmacokinetic","pharmacokinetics","auc","clearance"
];
const INTERACTION_TERMS=[
  "drug-drug interaction","drug drug interaction","interaction","interactions",
  "cyp3a4","p-glycoprotein","p glycoprotein","inhibitor","inducer"
];
const ASSOCIATION_TERMS=[
  "associated with","increased risk","higher risk","elevated risk","lower risk","reduced risk",
  "risk factor","caused by","induced by","attributed to","related to",
  "adverse effect","adverse event","adverse reaction"
];
const COMPARISON_TERMS=[
  "compared with","compared to","versus"," vs ","relative to","than with","than placebo"
];
const EFFICACY_VERBS=[
  "improved","improves","reduced","reduces","prevented","prevents","attenuated","attenuates",
  "mitigated","mitigates","protected","protects","suppressed","suppresses","inhibited","inhibits",
  "restored","restores","effective","efficacy","benefit","beneficial","response rate"
];
const HUMAN_TERMS=[
  "patient","patients","participant","participants","adult","adults","women","men","children",
  "cohort","clinical trial","randomized trial","randomised trial","retrospective","prospective",
  "medical records","electronic health records","hospital","multicenter","multi-center"
];
const NONHUMAN_TERMS=[
  "mouse","mice","rat","rats","rabbit","rabbits","murine","animal model","cell line","cell lines",
  "cultured cells","in vitro","in vivo rat","in vivo mouse","xenograft"
];
const ENVIRONMENTAL_TERMS=[
  "wastewater","aquatic","soil","adsorption","adsorbent","phytotoxicity","agricultural",
  "agronomic","ecosystem","nontarget organisms","non-target organisms","water treatment",
  "environmental contaminant","pollutant","removal from water"
];
const ANALYTICAL_FORMULATION_TERMS=[
  "3d-printed","3d printed","formulation","drug delivery","delivery system","tablet","tablets",
  "lc-ms/ms","chromatography","analytical method","method validation","quantitative determination",
  "dried plasma spot","bioanalytical","pbpk model","pbpk models","physiologically-based pk",
  "physiologically based pk","pharmacokinetic model","pharmacokinetic models"
];
const ECONOMIC_TERMS=[
  "cost-utility","cost utility","cost-effectiveness","cost effectiveness","qaly","qalys","icer",
  "reimbursement","markov model","willingness-to-pay","willingness to pay"
];
const REVIEW_TERMS=[
  "review","narrative review","systematic review","meta-analysis","meta analysis"
];
const FULL_TEXT_TITLE_TERMS=[
  "correction to","corrigendum","comment on","response to the letter","letter to the editor","editorial"
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
function hasComparison(text:string){
  const lower=" "+text.toLowerCase()+" ";
  return COMPARISON_TERMS.some(t=>lower.includes(t));
}
function hasBackgroundPattern(text:string,terms:string[]){
  const lower=text.toLowerCase();
  return terms.some(term=>{
    const t=term.toLowerCase();
    return lower.includes("previously treated with "+t)||
      lower.includes("prior "+t)||
      lower.includes("prior treatment with "+t)||
      lower.includes("history of "+t)||
      lower.includes("after progression on "+t)||
      lower.includes("progression on "+t)||
      lower.includes("after surgery, she received "+t)||
      lower.includes("after surgery, he received "+t)||
      lower.includes("standard treatment")&&lower.includes(t);
  });
}
function hasTreatmentPattern(text:string,terms:string[]){
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
      lower.includes("treated with "+t)||
      lower.includes("followed by "+t);
  });
}
function hasBreakthroughPattern(text:string,terms:string[]){
  const lower=text.toLowerCase();
  if(!hasAnyProductTerm(text,terms))return false;
  if(hits(text,LACK_EFFICACY_TERMS).length)return true;
  return terms.some(term=>{
    const t=term.toLowerCase();
    return lower.includes("while on "+t)||
      lower.includes("while taking "+t)||
      lower.includes("despite "+t)||
      lower.includes("despite treatment with "+t);
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
  const productMentionCount=productContexts.length;

  const saudiHits=hits(combined,SAUDI_TERMS);
  const caseHits=hits(combined,CASE_TERMS);
  const caseReportHits=hits(combined,CASE_REPORT_TERMS);
  const safetyHits=hits(combined,SAFETY_TERMS);
  const specialHits=hits(combined,SPECIAL_SITUATION_TERMS);
  const lackEfficacyHits=hits(combined,LACK_EFFICACY_TERMS);
  const exposureHits=hits(combined,EXPOSURE_TERMS);
  const interactionHits=hits(combined,INTERACTION_TERMS);

  const productSafetyHits=unique(productContexts.flatMap(s=>hits(s,SAFETY_TERMS)));
  const productSpecialHits=unique(productContexts.flatMap(s=>hits(s,SPECIAL_SITUATION_TERMS)));
  const productLackEfficacyHits=unique(productContexts.flatMap(s=>hits(s,LACK_EFFICACY_TERMS)));
  const productExposureHits=unique(productContexts.flatMap(s=>hits(s,EXPOSURE_TERMS)));
  const productInteractionHits=unique(productContexts.flatMap(s=>hits(s,INTERACTION_TERMS)));
  const productAssociationHits=unique(productContexts.flatMap(s=>hits(s,ASSOCIATION_TERMS)));

  const quantifiedProductEvidence=productContexts.some(hasQuantifiedFinding);
  const directOutcomeStatement=productContexts.some(s=>
    (hasQuantifiedFinding(s)||hasComparison(s)) &&
    (hits(s,SAFETY_TERMS).length||hits(s,SPECIAL_SITUATION_TERMS).length||
     hits(s,LACK_EFFICACY_TERMS).length||hits(s,ASSOCIATION_TERMS).length)
  );
  const breakthrough=productContexts.some(s=>hasBreakthroughPattern(s,terms));
  const backgroundPattern=productContexts.some(s=>hasBackgroundPattern(s,terms));
  const treatmentPattern=productContexts.some(s=>hasTreatmentPattern(s,terms));
  const efficacyPattern=productContexts.some(s=>hits(s,EFFICACY_VERBS).length>0);
  const comparatorPattern=productContexts.some(hasComparison);

  const environmental=hits(combined,ENVIRONMENTAL_TERMS).length>=2||hits(title,ENVIRONMENTAL_TERMS).length>0;
  const economic=hits(combined,ECONOMIC_TERMS).length>=2||hits(title,ECONOMIC_TERMS).length>0;
  const analyticalOrFormulation=hits(title,ANALYTICAL_FORMULATION_TERMS).length>0||
    (hits(combined,ANALYTICAL_FORMULATION_TERMS).length>=2 && !hits(combined,SAFETY_TERMS).length);
  const humanClinical=hits(combined,HUMAN_TERMS).length>0;
  const nonHuman=hits(combined,NONHUMAN_TERMS).length>0&&!humanClinical;
  const reviewArticle=hits(title,REVIEW_TERMS).length>0||/^review\b/i.test(abstract.trim());
  const correctionLike=hits(title,FULL_TEXT_TITLE_TERMS).length>0;
  const fullTextRequired=!abstract.trim();

  const directSafety=productSafetyHits.length>0;
  const directSpecial=productSpecialHits.length>0;
  const directLackEfficacy=productLackEfficacyHits.length>0||breakthrough;
  const directInteraction=productInteractionHits.length>0 &&
    (productExposureHits.length>0||productAssociationHits.length>0||directSafety);
  const directClinicalFinding=directSafety||directSpecial||directLackEfficacy||directInteraction||directOutcomeStatement;

  const reviewMechanismConcern=reviewArticle&&productMentionCount>0&&(
    phrasePresent(combined,"tolerability")||
    phrasePresent(combined,"drug inactivation")||
    phrasePresent(combined,"biotransformation")||
    phrasePresent(combined,"interindividual variability")||
    directLackEfficacy||
    directInteraction
  );

  let productRole:"subject"|"comparator"|"background"|"intervention"|"mentioned"="mentioned";
  if(directClinicalFinding||productInTitle)productRole="subject";
  else if(comparatorPattern)productRole="comparator";
  else if(backgroundPattern||productMentionCount===1)productRole="background";
  else if(treatmentPattern||efficacyPattern)productRole="intervention";

  if(productRole==="subject"&&!directClinicalFinding&&comparatorPattern&&!productInTitle)productRole="comparator";
  if(productRole==="subject"&&!directClinicalFinding&&treatmentPattern&&!productInTitle)productRole="intervention";

  const urgentSaudi=saudiHits.length>0&&humanClinical&&(
    directClinicalFinding||caseHits.length>0||safetyHits.length>0||specialHits.length>0
  );

  let relevance:"likely_relevant"|"possible"|"unlikely"="unlikely";
  let reason="The monitored product is mentioned without a product-linked safety, special-situation, interaction, or lack-of-efficacy finding.";
  let assessmentState:"standard"|"full_text_required"="standard";

  if(fullTextRequired){
    relevance="possible";
    assessmentState="full_text_required";
    reason=correctionLike
      ?"Full text/source review required: PubMed does not provide an abstract for this correction, comment, or letter."
      :"Full text review required: PubMed does not provide enough abstract information for a safe automated relevance decision.";
  }else if(environmental){
    relevance="unlikely";
    reason="Environmental or agricultural research was detected; no human pharmacovigilance finding is evident.";
  }else if(economic){
    relevance="unlikely";
    reason="Health-economic or cost-utility research was detected without a product safety finding.";
  }else if(analyticalOrFormulation&&!directClinicalFinding){
    relevance="unlikely";
    reason="Analytical, formulation, delivery, or PK-model research was detected without a product-linked safety finding.";
  }else if(nonHuman){
    if(directSafety||directSpecial){
      relevance="possible";
      reason="Non-human safety or special-situation evidence detected; human QPPV review is required before use.";
    }else{
      relevance="unlikely";
      reason="Preclinical/non-human efficacy or mechanistic research without a product-linked safety finding.";
    }
  }else if(urgentSaudi){
    relevance="likely_relevant";
    reason="Priority review: Saudi human clinical context with product-linked safety, case, special-situation, or efficacy concern.";
  }else if(humanClinical&&productRole==="subject"&&directClinicalFinding){
    const strongEvidence=productInTitle||directOutcomeStatement||quantifiedProductEvidence||
      caseReportHits.length>0||directSpecial||directLackEfficacy||directInteraction;
    relevance=strongEvidence?"likely_relevant":"possible";
    reason=strongEvidence
      ?"Human product-linked safety, special-situation, interaction, or lack-of-efficacy evidence detected."
      :"Possible human product-linked safety finding; attribution is not strong enough for high-priority classification.";
  }else if(humanClinical&&productRole==="comparator"&&(directClinicalFinding||quantifiedProductEvidence)){
    relevance="possible";
    reason="The monitored product is a comparator in a human clinical outcome analysis; QPPV relevance requires review.";
  }else if(reviewMechanismConcern){
    relevance="possible";
    reason="Review-level evidence discusses product response, tolerability, interaction, or resistance mechanisms that may warrant QPPV review.";
  }else if(directLackEfficacy){
    relevance="possible";
    reason="Possible resistance, progression, breakthrough, or lack-of-efficacy evidence involving the monitored product.";
  }else if(productRole==="background"){
    relevance="unlikely";
    reason="The monitored product appears to be prior/background therapy rather than the subject of the reported finding.";
  }else if(treatmentPattern&&!directClinicalFinding){
    relevance="unlikely";
    reason="The monitored product appears to be treatment/intervention context without a product-linked safety finding.";
  }else if(efficacyPattern&&!directClinicalFinding){
    relevance="unlikely";
    reason="Efficacy or beneficial-effect evidence was detected without a pharmacovigilance safety concern.";
  }

  const publicationContext=fullTextRequired?"abstract_missing":
    environmental?"environmental":
    economic?"health_economic":
    analyticalOrFormulation?"analytical_or_formulation":
    nonHuman?"preclinical":
    humanClinical?"human_clinical":
    reviewArticle?"review":"other";

  const findingTypes:string[]=[];
  if(directSafety)findingTypes.push("safety");
  if(directSpecial)findingTypes.push("special_situation");
  if(directLackEfficacy)findingTypes.push("lack_of_efficacy");
  if(directInteraction)findingTypes.push("interaction");
  if(productExposureHits.length)findingTypes.push("exposure_pk");
  if(quantifiedProductEvidence)findingTypes.push("quantified");
  if(!findingTypes.length&&efficacyPattern)findingTypes.push("efficacy_only");

  return {
    matchedTerms,
    matchLocations:[...locations],
    termLocations,
    relevance,
    reason,
    assessmentState,
    fullTextRequired,
    publicationContext,
    productRole,
    findingTypes:unique(findingTypes),
    urgentSaudi,
    saudiHits:unique(saudiHits).slice(0,8),
    safetyHits:unique(safetyHits).slice(0,12),
    specialHits:unique(specialHits).slice(0,10),
    lackEfficacyHits:unique(lackEfficacyHits).slice(0,10),
    interactionHits:unique(interactionHits).slice(0,10),
    caseHits:unique(caseHits).slice(0,8),
    productSafetyHits:productSafetyHits.slice(0,10),
    productSpecialHits:productSpecialHits.slice(0,10),
    productLackEfficacyHits:productLackEfficacyHits.slice(0,10),
    exposureHits:unique(exposureHits).slice(0,10),
    productExposureHits:productExposureHits.slice(0,10),
    productInteractionHits:productInteractionHits.slice(0,10),
    productAssociationHits:productAssociationHits.slice(0,8),
    breakthrough,
    quantifiedProductEvidence,
    directOutcomeStatement,
    environmental,
    economic,
    analyticalOrFormulation,
    humanClinical,
    nonHuman,
    reviewArticle,
    treatmentPattern,
    analysisVersion:"v3"
  };
}

export { sleep };
