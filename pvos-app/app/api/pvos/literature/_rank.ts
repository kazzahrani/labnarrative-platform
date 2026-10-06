export function refineRanking(analysis:any,title:string,abstract:string,terms:string[]){
  const out={...analysis,analysisVersion:"v3.1"};
  if(out.fullTextRequired)return out;

  const text=abstract.toLowerCase();
  const heading=title.toLowerCase();
  const types=new Set<string>(out.findingTypes||[]);
  const inTitle=terms.some(t=>heading.includes(String(t).toLowerCase()));

  const background=terms.some(term=>{
    const t=String(term).toLowerCase();
    return text.includes("previously treated with "+t)||
      text.includes("prior treatment with "+t)||
      text.includes("after disease progression on "+t)||
      text.includes("progression on "+t);
  });
  if(background&&!inTitle){
    out.relevance="unlikely";
    out.productRole="background";
    out.reason="The monitored product is prior/background therapy rather than the subject of the reported finding.";
    return out;
  }

  const comparator=terms.some(term=>{
    const t=String(term).toLowerCase();
    return text.includes("compared with "+t)||
      text.includes("compared to "+t)||
      text.includes("versus "+t)||
      text.includes("relative to "+t)||
      text.includes("than with "+t);
  });
  if(comparator&&!inTitle){
    out.relevance="possible";
    out.productRole="comparator";
    out.reason="The monitored product is a comparator in a human outcome analysis; QPPV relevance requires review.";
    return out;
  }

  const reviewLike=heading.includes("review")||
    text.includes("in this review")||
    text.includes("we review")||
    text.includes("we survey");
  if(reviewLike&&types.has("lack_of_efficacy")){
    out.relevance="possible";
    out.reason="Review-level response evidence involving the monitored product requires QPPV assessment.";
    return out;
  }

  const beneficialPreclinical=out.publicationContext==="preclinical"&&(
    text.includes("attenuated")||
    text.includes("prevented")||
    text.includes("protected")||
    text.includes("improved")||
    text.includes("restored")
  );
  if(beneficialPreclinical&&!types.has("special_situation")){
    out.relevance="unlikely";
    out.reason="Preclinical beneficial or mechanistic evidence without a human pharmacovigilance concern.";
    return out;
  }

  const core=types.has("safety")||
    types.has("special_situation")||
    types.has("lack_of_efficacy")||
    types.has("interaction");
  if(out.relevance==="likely_relevant"&&!out.urgentSaudi&&!core){
    out.relevance="possible";
    out.reason="Human product-related outcome evidence detected, but no direct pharmacovigilance finding was identified.";
  }
  return out;
}
