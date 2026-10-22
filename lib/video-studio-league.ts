export type PublicLeagueBenchmark={returnPct:number};
export type PublicLeagueBot={
 id:string;slug:string;name:string;creator:string;pair:string;status:"running"|"paused"|"closed";
 versionNumber:number;totalReturn:number|null;maxDrawdown:number|null;winRate:number|null;
 closedTrades:number;ageDays:number;apy:number|null;benchmark:PublicLeagueBenchmark|null;
 ethBenchmark:PublicLeagueBenchmark|null;publishedAt:string;
};
export type PublicLeagueIndexItem={id:string;slug:string;name:string;publishedAt:string;updatedAt:string};

async function callLeague(body:Record<string,unknown>){
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)return null;
 try{
  const response=await fetch(`${base}/functions/v1/bot-league`,{
   method:"POST",
   headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
   body:JSON.stringify(body),cache:"no-store"
  });
  if(!response.ok)return null;
  const data=await response.json();
  return data?.ok?data:null;
 }catch{return null}
}

export async function getPublicLeagueBot(entryId:string):Promise<PublicLeagueBot|null>{
 if(!entryId)return null;
 const data=await callLeague({action:"details",entryId});
 return data?.bot?data.bot as PublicLeagueBot:null;
}
export async function getPublicLeagueDiscovery():Promise<{bots:PublicLeagueIndexItem[]}>{
 const data=await callLeague({action:"index"});
 return{bots:Array.isArray(data?.bots)?data.bots as PublicLeagueIndexItem[]:[]};
}
export function leaguePct(value:number|null,decimals=1){
 if(value==null||!Number.isFinite(value))return"—";
 const sign=value>0?"+":value<0?"−":"";
 return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}
export function leagueDrawdown(value:number|null,decimals=1){
 if(value==null||!Number.isFinite(value))return"—";
 return value===0?`0.${"0".repeat(decimals)}%`:`−${Math.abs(value).toFixed(decimals)}%`;
}
export function leagueAge(days:number){
 if(!Number.isFinite(days)||days<0)return"—";
 if(days<1)return"<1d";
 if(days<60)return`${Math.floor(days)}d`;
 if(days<730)return`${(days/30.4375).toFixed(1)}mo`;
 return`${(days/365.25).toFixed(1)}y`;
}
