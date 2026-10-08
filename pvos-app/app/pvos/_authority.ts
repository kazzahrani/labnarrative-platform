import {readApprovalRows} from "./_approval";
export type AuthorityRow=Record<string,any>;
export type AuthorityData={companies:AuthorityRow[],products:AuthorityRow[],members:AuthorityRow[],sources:AuthorityRow[],settings:AuthorityRow[],periods:AuthorityRow[],checks:AuthorityRow[],findings:AuthorityRow[],reviews:AuthorityRow[],records:AuthorityRow[],notices:AuthorityRow[],collections:AuthorityRow[],signals:AuthorityRow[]};
export const authorityStatus:Record<string,string>={draft:"In preparation",pending_review:"Awaiting named reviewer",returned:"Returned",approved:"Approved"};
export function riyadhDay(value:string){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));return ["year","month","day"].map(k=>parts.find(p=>p.type===k)?.value).join("-");}
export function noticeInPeriod(n:AuthorityRow,p:AuthorityRow){
 const publication=n.published_at?riyadhDay(n.published_at):null,seen=riyadhDay(n.first_seen_at);
 return !!publication&&publication>=p.period_start&&publication<=p.period_end||(!n.baseline||!publication)&&seen>=p.period_start&&seen<=p.period_end;
}
export function latestNotices(rows:AuthorityRow[]){const sorted=[...rows].sort((a,b)=>b.first_seen_at.localeCompare(a.first_seen_at)||b.id.localeCompare(a.id)),urls=new Set<string>();return sorted.filter(n=>{const key=n.source_id+"|"+n.url;if(urls.has(key))return false;urls.add(key);return true;});}
export function suggestedProducts(notice:AuthorityRow,products:AuthorityRow[]){
 const text=(notice.title+" "+(notice.summary||"")).normalize("NFKC").toLowerCase();
 return products.filter(p=>[p.brand_name,p.active_ingredient].filter(Boolean).some((t:string)=>{const terms=[t,...t.split(/\s*[+;/]\s*/)].map(x=>x.trim().toLowerCase()).filter(x=>x.length>=3);return terms.some(term=>new RegExp('(^|[^\\p{L}\\p{N}])'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\p{L}\\p{N}])','u').test(text));}));
}
export function sourceNeedsRecheck(check:AuthorityRow,period:AuthorityRow,notices:AuthorityRow[],products:AuthorityRow[]=[]){return !check.checked_at||products.some(pr=>pr.company_id===period.company_id&&pr.updated_at&&pr.updated_at>check.checked_at)||notices.some(n=>n.source_id===check.source_id&&n.first_seen_at>check.checked_at&&noticeInPeriod(n,period));}
export async function loadAuthority(client:any,organizationId:string):Promise<AuthorityData>{
 const direct=(table:string)=>readApprovalRows<AuthorityRow>((from,to)=>client.from(table).select("*").eq("organization_id",organizationId).order("id").range(from,to));
 const [companies,products,directory,sources,settings,periods,checks,findings,reviews,records,notices,collections,signals]=await Promise.all([
 direct("pvos_companies"),readApprovalRows<AuthorityRow>((from,to)=>client.from("pvos_products").select("*,pvos_companies!inner(organization_id)").eq("pvos_companies.organization_id",organizationId).order("id").range(from,to)),client.rpc("pvos_member_directory",{p_organization_id:organizationId}),
 ...['sources','settings','periods','checks','findings','reviews','records','notices','collection_runs'].map(t=>direct('pvos_authority_'+t)),direct('pvos_signal_reviews')]);
 if(directory.error)throw new Error(directory.error.message);
 return {companies,products,members:directory.data||[],sources,settings,periods,checks,findings,reviews,records,notices,collections,signals};
}
export function saveAuthorityJSON(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);}
