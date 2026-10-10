"use client";

// PVOS session cache: memory only, cleared on sign-out/reload. All keys are
// scoped to BOTH user and workspace; never cache auth tokens or signed URLs.
type Cached<T>={data:T;at:number;generation:number};
const entries=new Map<string,Cached<unknown>>();
const maxEntries=64;
let generation=0;

export function pvosCacheKey(userId:string|undefined|null,organizationId:string|undefined|null,section:string){
 return userId&&organizationId?userId+"|"+organizationId+"|"+section:"";
}
export function getPVOSCache<T>(key:string):Cached<T>|null{
 if(!key)return null;
 const cached=entries.get(key);
 if(!cached)return null;
 // Recent entries stay most recently used and are not evicted first.
 entries.delete(key);entries.set(key,cached);
 return cached as Cached<T>;
}
export function setPVOSCache<T>(key:string,data:T){
 if(!key)return;
 entries.delete(key);entries.set(key,{data,at:Date.now(),generation});
 while(entries.size>maxEntries)entries.delete(entries.keys().next().value!);
}
export function shouldRefreshPVOSCache(cached:{at:number;generation:number}|null,ttlMs=30000){
 return !cached||cached.generation!==generation||Date.now()-cached.at>ttlMs;
}
export function invalidatePVOSCache(){
 // Keep old content visible on next visit, but silently refresh from server.
 generation++;
}
export function clearPVOSCache(){
 entries.clear();generation++;
}
