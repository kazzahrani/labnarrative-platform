"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import * as XLSX from "xlsx";
import {Badge,Help} from "../_components";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";

const EMA_URL="https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/periodic-safety-update-reports-psurs";
type Entry={id:string,product_id:string,active_substance:string,data_lock_point:string,submission_due_date:string,frequency_months:number|null,jurisdiction:string,authority_basis:string|null,source_revision:string,status:string,task_id:string|null,source_row:any};
type EurdRow={substance:string,dlp:string,due:string,frequency:string,raw:Record<string,string>};
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function dateFromCell(v:any):string{
 if(v instanceof Date&&!isNaN(v.getTime()))return v.toISOString().slice(0,10);
 if(typeof v==="number"&&v>20000&&v<100000){
   const d=XLSX.SSF.parse_date_code(v);if(d)return [d.y,String(d.m).padStart(2,"0"),String(d.d).padStart(2,"0")].join("-");
 }
 const s=String(v??"").trim();
 if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
 const m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
 if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
 return "";
}
function freqMonths(value:string):number|null{
 const s=norm(value);
 if(/six monthly|6 month|half yearly|semi annual|twice yearly/.test(s))return 6;
 if(/quarterly|3 month/.test(s))return 3;
 if(/12 month|once yearly|yearly|annual/.test(s))return 12;
 if(/24 month|2 yearly|2 year|biennial/.test(s))return 24;
 if(/36 month|3 yearly|3 year|triennial/.test(s))return 36;
 return null;
}
function readEurdFile(data:ArrayBuffer):EurdRow[]{
 const book=XLSX.read(data,{type:"array",cellDates:true});
 const result:EurdRow[]=[];
 for(const name of book.SheetNames){
  const grid=XLSX.utils.sheet_to_json<any[]>(book.Sheets[name],{header:1,raw:true,defval:""});
  const headerIndex=grid.slice(0,60).findIndex(row=>Array.isArray(row)&&row.some(v=>/active substance|inn\b|substance\/combination/i.test(String(v))));
  if(headerIndex<0)continue;
  const heads=grid[headerIndex].map((x:any)=>norm(x));
  function column(pattern:RegExp){return heads.findIndex((h:string)=>pattern.test(h));}
  const ingredient=column(/active substance|substance combination|\binn\b/);
  const dlp=column(/data lock point|\bdlp\b/);
  const submission=column(/submission date|deadline.*submission|date of submission/);
  const freq=column(/frequency|interval/);
  if(ingredient<0||dlp<0||submission<0)continue;
  for(const row of grid.slice(headerIndex+1)){
    if(!Array.isArray(row))continue;
    const substance=String(row[ingredient]??"").trim(),lock=dateFromCell(row[dlp]),due=dateFromCell(row[submission]);
    if(!substance||!lock||!due)continue;
    const raw:Record<string,string>={};
    heads.forEach((h:string,i:number)=>{if(h&&row[i]!==undefined&&String(row[i]).trim())raw[h]=String(row[i]);});
    result.push({substance,dlp:lock,due,frequency:String(row[freq]??""),raw});
  }
 }
 return result;
}
export function PsurCycles({companyId,organizationId,products,onChanged}:{companyId:string,organizationId:string,products:any[],onChanged?:()=>void}){
 const [entries,setEntries]=useState<Entry[]>([]),[parsed,setParsed]=useState<EurdRow[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [productId,setProductId]=useState(""),[substance,setSubstance]=useState(""),[dlp,setDlp]=useState(""),[due,setDue]=useState("");
 const [frequency,setFrequency]=useState(""),[jurisdiction,setJurisdiction]=useState("reference_only");
 const [basis,setBasis]=useState(""),[revision,setRevision]=useState("EMA EURD Rev. 164 (23 Sep 2026)");
 const [published,setPublished]=useState("2026-09-23"),[selectedRow,setSelectedRow]=useState<EurdRow|null>(null),[search,setSearch]=useState("");
 const load=useCallback(async()=>{
  const {data,error:e}=await pvosSupabase.from("pvos_psur_cycles").select("*").eq("company_id",companyId).eq("organization_id",organizationId).order("submission_due_date",{ascending:true});
  if(e)throw e;
  setEntries(data||[]);
 },[companyId,organizationId]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 useEffect(()=>{if(products.length&&!productId)setProductId(products[0].id)},[products,productId]);
 const p=products.find(x=>x.id===productId);
 const suggestions=useMemo(()=>{
  const term=norm(search||p?.active_ingredient||"");
  if(!term)return parsed.slice(0,20);
  return parsed.filter(r=>norm(r.substance)===term||norm(r.substance).includes(term)).slice(0,30);
 },[parsed,p?.active_ingredient,search]);
 async function upload(file:File|undefined){
  if(!file)return;
  setError("");setMessage("");
  try{
   const rows=readEurdFile(await file.arrayBuffer());setParsed(rows);
   if(!rows.length)throw Error("Could not identify the active-substance, DLP and submission-date columns. Check the EMA XLSX layout; do not create a deadline from uncertain data.");
   setMessage(rows.length+" EURD rows parsed locally. Choose the matching substance and verify its values.");
  }catch(e){setParsed([]);setError((e as Error).message);}
 }
 function choose(r:EurdRow){setSelectedRow(r);setSubstance(r.substance);setDlp(r.dlp);setDue(r.due);setFrequency(String(freqMonths(r.frequency)||""));setSearch(r.substance);setMessage("Source row selected. Verify the jurisdiction and regulatory basis before confirming.");}
 async function save(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   if(!productId||!substance.trim()||!dlp||!due)throw Error("Choose a product, active substance, DLP and submission date.");
   const payload={organization_id:organizationId,company_id:companyId,product_id:productId,active_substance:substance.trim(),
    data_lock_point:dlp,submission_due_date:due,frequency_months:frequency?Number(frequency):null,jurisdiction,
    authority_basis:basis.trim()||null,source_url:EMA_URL,source_revision:revision.trim(),source_published_at:published||null,
    source_row:selectedRow?.raw||{entered_manually:true}};
   const {error:e2}=await pvosSupabase.from("pvos_psur_cycles").insert(payload);
   if(e2)throw e2;
   setMessage("Draft saved. A PV lead must confirm applicability before PVOS creates a deadline task.");
   setSelectedRow(null);await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function confirm(id:string){
  setBusy(true);setError("");setMessage("");
  try{
   const {data,error:e}=await pvosSupabase.rpc("pvos_confirm_psur_cycle",{p_cycle_id:id});
   if(e)throw e;setMessage(data?.already_confirmed?"Already confirmed.":"Confirmed. PSUR task is now in the Dashboard with a source-linked deadline.");
   await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div style={{display:"grid",gap:16}}>
  <section className={styles.panel}>
   <div className={styles.panelHeader}><h2>EURD / PSUR deadlines</h2><Help>EMA EURD dates are binding for applicable EU submissions, not automatically for Saudi-authorised products. Record and confirm the actual authority obligation before creating a task. The official EURD file changes monthly.</Help></div>
   <div className={styles.sectionBody}>
    <div className={styles.inlineActions}>
     <a href={EMA_URL} target="_blank" rel="noreferrer" className={styles.buttonGhost}>Official EMA EURD list ↗</a>
     <label className={styles.buttonGhost}>Import EMA XLSX <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>{upload(e.target.files?.[0]);e.target.value="";}}/></label>
     {parsed.length?<Badge tone="green">{parsed.length} source rows</Badge>:null}
    </div>
    {parsed.length?<div style={{marginTop:16}}>
     <label>Find substance<input className={styles.input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search an active substance"/></label>
     <div className={styles.tableWrap} style={{maxHeight:240,overflowY:"auto",marginTop:10}}><table className={styles.table}><thead><tr><th>EURD active substance</th><th>DLP</th><th>Submission</th><th></th></tr></thead><tbody>
      {suggestions.map((r,i)=><tr key={i}><td>{r.substance}</td><td>{r.dlp}</td><td>{r.due}</td><td><button className={styles.buttonGhost} onClick={()=>choose(r)}>Use row</button></td></tr>)}
     </tbody></table></div>
     {suggestions.length===0?<div className={styles.muted}>No automatic match. Search the official file; never assume a similar substance is equivalent.</div>:null}
    </div>:null}
    <form onSubmit={save} style={{display:"grid",gap:12,marginTop:18}}>
     <div className={styles.formGrid}>
      <label>Product<select className={styles.input} required value={productId} onChange={e=>{setProductId(e.target.value);setSearch("");}}>{products.map(p=><option key={p.id} value={p.id}>{p.brand_name} · {p.active_ingredient||"no ingredient recorded"}</option>)}</select></label>
      <label>Matched active substance<input className={styles.input} required value={substance} onChange={e=>setSubstance(e.target.value)}/></label>
      <label>Data lock point<input className={styles.input} type="date" required value={dlp} onChange={e=>setDlp(e.target.value)}/></label>
      <label>Submission deadline<input className={styles.input} type="date" required value={due} min={dlp||undefined} onChange={e=>setDue(e.target.value)}/></label>
      <label>Frequency (source-confirmed)<select className={styles.input} value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="">Unspecified</option>{[3,6,12,24,36].map(m=><option key={m} value={m}>{m} months</option>)}</select></label>
      <label>Applicable authority<select className={styles.input} value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)}><option value="reference_only">Reference only — do not schedule</option><option value="eu">EU EURD obligation confirmed</option><option value="sfda">SFDA/local obligation separately verified</option></select></label>
      <label>EURD revision<input className={styles.input} required value={revision} onChange={e=>setRevision(e.target.value)}/></label>
      <label>Source publication<input className={styles.input} type="date" value={published} onChange={e=>setPublished(e.target.value)}/></label>
     </div>
     <label>Regulatory basis / documented verification<textarea className={styles.input} rows={2} value={basis} onChange={e=>setBasis(e.target.value)} placeholder="Applicable authority, licence condition or regulatory instruction; cite the source and scope"/></label>
     <div><button className={styles.button} type="submit" disabled={busy||!products.length}>Save draft for confirmation</button></div>
    </form>
   </div>
  </section>
  {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
  {message?<div className={styles.info} role="status">{message}</div>:null}
  <section className={styles.panel}>
   <div className={styles.panelHeader}><h2>PSUR cycle register</h2><Help>Only confirmed cycles create actual deadline tasks. Recurrence forecasts are drafts and require checking against a current EURD revision before approval.</Help></div>
   <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Product / DLP</th><th>Submission deadline</th><th>Authority</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>
    {entries.map(c=><tr key={c.id}><td>{products.find(p=>p.id===c.product_id)?.brand_name||c.active_substance}<div className={styles.muted}>DLP {c.data_lock_point}</div></td>
     <td>{c.submission_due_date}</td><td>{c.jurisdiction==="reference_only"?"Unverified":c.jurisdiction.toUpperCase()}</td>
     <td title={c.source_revision}>{c.source_revision}</td><td><Badge tone={c.status==="confirmed"?"green":"amber"}>{c.status==="draft"?"Needs confirmation":c.status}</Badge></td>
     <td>{c.task_id?<Link className={styles.buttonGhost} href={"/pvos/tasks/"+c.task_id}>Open task</Link>:c.status==="draft"?<button className={styles.buttonGhost} disabled={busy||c.jurisdiction==="reference_only"||!c.authority_basis} onClick={()=>confirm(c.id)}>Confirm & schedule</button>:null}</td>
    </tr>)}
   </tbody></table>{!entries.length?<div className={styles.empty}>No EURD cycles recorded for this company.</div>:null}</div>
  </section>
 </div>;
}
