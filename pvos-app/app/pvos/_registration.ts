export const registrationStatuses=["Not recorded","Pre-registration","Under review","Registered","Suspended","Expired","Cancelled","Rejected"];

export function registrationLabel(value:string|null|undefined){
  return value?.trim()||"Not recorded";
}

export function registrationTone(value:string|null|undefined):"default"|"green"|"amber"|"red"{
  const label=registrationLabel(value).toLowerCase();
  if(label==="registered")return "green";
  if(["pre-registration","under review","pending"].includes(label))return "amber";
  if(["suspended","expired","cancelled","rejected"].includes(label))return "red";
  return "default";
}

export function registrationSummary(products:{registration_status?:string|null}[]){
  const counts=new Map<string,number>();
  for(const p of products){const label=registrationLabel(p.registration_status);counts.set(label,(counts.get(label)||0)+1);}
  return Array.from(counts,([label,count])=>({label,count})).sort((a,b)=>a.label.localeCompare(b.label));
}

// Product portfolios can exceed the Data API's default row limit.
export async function readProductPages<T>(fetchPage:(from:number,to:number)=>PromiseLike<{data:T[]|null,error:{message:string}|null}>):Promise<T[]>{
  const rows:T[]=[];
  for(let from=0;;from+=1000){
    const {data,error}=await fetchPage(from,from+999);
    if(error)throw new Error(error.message);
    rows.push(...(data||[]));
    if((data?.length||0)<1000)return rows;
  }
}
