"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {readEurdFile,parseEurdRows,eurdFrequencyMonths,type EurdRow,type EurdColumns,type EurdImport} from "./_eurd-import";
import {Badge,Help} from "../_components";
import {PSURLifecycle} from "./_psur-lifecycle";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";

const EMA_URL="https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/periodic-safety-update-reports-psurs";
type Entry={id:string,product_id:string,active_substance:string,data_lock_point:string,submission_due_date:string,frequency_months:number|null,jurisdiction:string,authority_basis:string|null,source_revision:string,status:string,task_id:string|null,source_row:any,confirmed_at:string|null,is_simulated:boolean};
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const colLetter=(value:number)=>{let n=value+1,s="";while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
export function PsurCycles({companyId,organizationId,products,onChanged}:{companyId:string,organizationId:string,products:any[],onChanged?:()=>void}){
 const [entries,setEntries]=useState<Entry[]>([]),[parsed,setParsed]=useState<EurdRow[]>([]);
 const [importData,setImportData]=useState<EurdImport|null>(null);
 const [mapSheet,setMapSheet]=useState(0),[headerRow,setHeaderRow]=useState(0);
 const [columns,setColumns]=useState<EurdColumns>({substance:-1,dlp:-1,due:-1,frequency:-1});
 const [showMapping,setShowMapping]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [editingId,setEditingId]=useState<string|null>(null);
 const [showEurdEditor,setShowEurdEditor]=useState(false);
 const [previewId,setPreviewId]=useState<string|null>(null);
 const [activeLifecycle,setActiveLifecycle]=useState<string|null>(null);
 const [previewOffset,setPreviewOffset]=useState(30);
 const [productId,setProductId]=useState(""),[substance,setSubstance]=useState(""),[dlp,setDlp]=useState(""),[due,setDue]=useState("");
 const [frequency,setFrequency]=useState(""),[jurisdiction,setJurisdiction]=useState("reference_only");
 const [simulated,setSimulated]=useState(false);
 const [isDemoCompany,setIsDemoCompany]=useState(false);
 const [basis,setBasis]=useState(""),[revision,setRevision]=useState("EMA EURD Rev. 164 (23 Sep 2026)");
 const [published,setPublished]=useState("2026-09-23"),[selectedRow,setSelectedRow]=useState<EurdRow|null>(null),[search,setSearch]=useState("");
 const load=useCallback(async()=>{
  const {data,error:e}=await pvosSupabase.from("pvos_psur_cycles").select("*").eq("company_id",companyId).eq("organization_id",organizationId).order("submission_due_date",{ascending:true});
  if(e)throw e;
  setEntries(data||[]);
 },[companyId,organizationId]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 useEffect(()=>{
  let active=true;
  setIsDemoCompany(false);
  pvosSupabase.from("pvos_companies").select("seed_key").eq("id",companyId).eq("organization_id",organizationId).single()
   .then(({data,error})=>{if(active&&!error)setIsDemoCompany(String(data?.seed_key||"").startsWith("demo-"));});
  return ()=>{active=false;};
 },[companyId,organizationId]);
 useEffect(()=>{if(products.length&&!productId)setProductId(products[0].id)},[products,productId]);
 const p=products.find(x=>x.id===productId);
 const preview=entries.find(c=>c.id===previewId);
 const selectedLifecycle=entries.find(c=>c.id===activeLifecycle);
 const previewAsOf=preview?new Date(Date.parse(preview.submission_due_date+"T00:00:00Z")-previewOffset*86400000).toISOString().slice(0,10):"";
 const previewCountdown=previewOffset<0?`${Math.abs(previewOffset)} days overdue`:previewOffset===0?"Due today":`${previewOffset} day${previewOffset===1?"":"s"} remaining`;
 const previewActivity=preview?products.find(p=>p.id===preview.product_id)?.brand_name||preview.active_substance:"";

 const suggestions=useMemo(()=>{
  const term=norm(search||p?.active_ingredient||"");
  if(!term)return parsed.slice(0,20);
  return parsed.filter(r=>norm(r.substance)===term||norm(r.substance).includes(term)).slice(0,30);
 },[parsed,p?.active_ingredient,search]);
 async function upload(file:File|undefined){
  if(!file)return;
  setError("");setMessage("");setParsed([]);setImportData(null);setSelectedRow(null);
  try{
   const parsedFile=readEurdFile(await file.arrayBuffer());
   if(!parsedFile.sheets.length)throw Error("No worksheets found in the XLSX file.");
   const selected=parsedFile.sheets[parsedFile.bestSheet];
   setImportData(parsedFile);setMapSheet(parsedFile.bestSheet);
   setHeaderRow(selected.headerRow);setColumns({...selected.columns});
   setParsed(parsedFile.rows);
   setShowMapping(parsedFile.rows.length===0);
   if(parsedFile.rows.length){
    setMessage(parsedFile.rows.length+" EURD entries parsed from '"+selected.name+"'. Select the correct substance and verify the dates.");
   }else{
    setError("The spreadsheet was opened, but no valid DLP/submission pairs could be verified automatically. Select the source columns below; PVOS has not created any deadlines.");
   }
  }catch(e){setParsed([]);setImportData(null);setError((e as Error).message);}
 }
 const sheet=importData?.sheets[mapSheet];
 function selectSheet(index:number){
  const target=importData?.sheets[index];if(!target)return;
  setMapSheet(index);setHeaderRow(target.headerRow);setColumns({...target.columns});
 }
 function manualParse(){
  setError("");if(!sheet)return;
  const rows=parseEurdRows(sheet,columns,headerRow);
  if(!rows.length){setError("No valid EURD rows were found using these columns. Check the header row and ensure you selected DLP and Submission date (not Next DLP or the EU reference date).");return;}
  setParsed(rows);setShowMapping(false);
  setMessage(rows.length+" rows validated from '"+sheet.name+"'. Check the substance and dates before saving.");
 }
 function choose(r:EurdRow){setSelectedRow(r);setSubstance(r.substance);setDlp(r.dlp);setDue(r.due);setFrequency(String(eurdFrequencyMonths(r.frequency)||""));setSearch(r.substance);setMessage("Source row selected. Verify the jurisdiction and regulatory basis before confirming.");}
 function edit(c:Entry){
  setEditingId(c.id);setProductId(c.product_id);setSubstance(c.active_substance);
  setDlp(c.data_lock_point);setDue(c.submission_due_date);setFrequency(String(c.frequency_months||""));
  setJurisdiction(c.jurisdiction);setSimulated(Boolean(c.is_simulated));setBasis(c.authority_basis||"");setRevision(c.source_revision);setPublished(c.is_simulated?"":c.source_published_at||"");
  setSelectedRow({substance:c.active_substance,dlp:c.data_lock_point,due:c.submission_due_date,frequency:"",
   raw:c.source_row||{}});setError("");setMessage("Review the dates against the current authority reference, then save this draft.");
  setShowEurdEditor(true);
  setTimeout(()=>document.getElementById("psur-edit-form")?.scrollIntoView({behavior:"smooth",block:"start"}),80);
 }
 function toggleSimulation(value:boolean){
  setSimulated(value);
  if(value){
   setJurisdiction("reference_only");setFrequency("");setPublished("");
   setRevision(v=>v.toUpperCase().startsWith("TEST ONLY")?v:"TEST ONLY — Simulated PSUR UAT");
   setBasis(v=>v.toUpperCase().startsWith("TEST ONLY")?v:"TEST ONLY — PVOS simulation. Not a verified regulatory obligation or an actual filing deadline.");
   setSelectedRow(null);
  }
 }
 async function save(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   if(!productId||!substance.trim()||!dlp||!due)throw Error("Choose a product, active substance, DLP and submission date.");
   if(simulated&&(!revision.toUpperCase().startsWith("TEST ONLY")||!basis.toUpperCase().startsWith("TEST ONLY")))
    throw Error("Simulation records must be clearly labelled TEST ONLY in both source and basis.");
   const payload={organization_id:organizationId,company_id:companyId,product_id:productId,active_substance:substance.trim(),
    data_lock_point:dlp,submission_due_date:due,frequency_months:simulated?null:frequency?Number(frequency):null,
    jurisdiction:simulated?"reference_only":jurisdiction,is_simulated:simulated,
    authority_basis:basis.trim()||null,source_url:simulated?"https://pvos.site":EMA_URL,
    source_revision:revision.trim(),source_published_at:simulated?null:published||null,
    source_row:simulated?{test_only:true,entered_manually:true}:selectedRow?.raw||{entered_manually:true}};
   const request=editingId
    ?pvosSupabase.from("pvos_psur_cycles").update(payload).eq("id",editingId).eq("status","draft")
    :pvosSupabase.from("pvos_psur_cycles").insert(payload);
   const {error:e2}=await request;
   if(e2)throw e2;
   setMessage(simulated?"TEST ONLY draft saved. Start the simulation from the register; no regulatory deadline has been created.":
    editingId?"Draft updated. Confirm the regulatory basis to create the PSUR task.":"Draft saved. A PV lead must confirm applicability before PVOS creates a deadline task.");
   setEditingId(null);setSelectedRow(null);setShowEurdEditor(false);await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function startSimulation(id:string){
  setBusy(true);setError("");setMessage("");
  try{
   const {data,error:e}=await pvosSupabase.rpc("pvos_start_psur_simulation",{p_cycle_id:id});
   if(e)throw e;
   setActiveLifecycle(id);
   setMessage(data?.already_started?"TEST ONLY simulation already running.":"TEST ONLY simulation started. No regulatory confirmation, real deadline or recurring schedule was created.");
   await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function confirm(id:string){
  setBusy(true);setError("");setMessage("");
  try{
   const {data,error:e}=await pvosSupabase.rpc("pvos_confirm_psur_cycle",{p_cycle_id:id});
   if(e)throw e;setActiveLifecycle(id);setMessage(data?.already_confirmed?"Already confirmed.":"Confirmed. PSUR lifecycle record created, with a source-linked deadline.");
   await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div style={{display:"grid",gap:16}}>
  <div className={styles.inlineActions} style={{marginTop:0,justifyContent:"space-between"}}>
   <span className={styles.muted}>Confirmed obligations become structured PSUR records. EURD references require explicit applicability confirmation.</span>
   <button type="button" className={styles.buttonGhost} onClick={()=>setShowEurdEditor(x=>!x)}>
    {showEurdEditor?"Close EURD form":"+ Import EURD / New cycle"}</button>
  </div>
  {showEurdEditor?<section className={styles.panel}>
   <div className={styles.panelHeader}><h2>EURD import & applicability</h2><Help>EMA EURD dates are binding for applicable EU submissions, not automatically for Saudi-authorised products. Record and confirm the actual authority obligation before creating a task. The official EURD file changes monthly.</Help></div>
   <div className={styles.sectionBody}>
    <div className={styles.inlineActions}>
     <a href={EMA_URL} target="_blank" rel="noreferrer" className={styles.buttonGhost}>Official EMA EURD list ↗</a>
     <label className={styles.buttonGhost}>Import EMA XLSX <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>{upload(e.target.files?.[0]);e.target.value="";}}/></label>
     {parsed.length?<Badge tone="green">{parsed.length} source rows</Badge>:null}
    </div>
    {importData?<div style={{marginTop:12}}>
     <div className={styles.inlineActions}>
      <button type="button" className={styles.buttonGhost} onClick={()=>setShowMapping(v=>!v)}>
       {showMapping?"Hide spreadsheet mapping":"Review spreadsheet columns"}
      </button>
      <span className={styles.muted}>Workbook inspected locally; no file uploaded to PVOS</span>
     </div>
     {showMapping&&sheet?<div className={styles.info} style={{display:"grid",gap:12,marginTop:10}}>
      <div className={styles.formGrid}>
       <label>Worksheet<select className={styles.input} value={mapSheet} onChange={e=>selectSheet(Number(e.target.value))}>
        {importData.sheets.map((sh,i)=><option key={sh.name} value={i}>{sh.name} ({sh.grid.length} rows)</option>)}
       </select></label>
       <label>Header row (in Excel)<input className={styles.input} type="number" min={1} max={Math.max(1,sheet.grid.length)} value={headerRow+1} onChange={e=>setHeaderRow(Math.max(0,Number(e.target.value)-1))}/></label>
      </div>
      <div className={styles.formGrid}>
       {([{id:"substance",title:"Active substance"},{id:"dlp",title:"DLP (not Next DLP)"},{id:"due",title:"Submission date (not Next)"},{id:"frequency",title:"Frequency (optional)"}] as const).map(field=><label key={field.id}>{field.title}
        <select className={styles.input} value={columns[field.id]} onChange={e=>setColumns(c=>({...c,[field.id]:Number(e.target.value)}))}>
         <option value={-1}>Select column</option>
         {Array.from({length:Math.min(80,Math.max((sheet.grid[headerRow]||[]).length,(sheet.grid[headerRow+1]||[]).length,15))},(_,i)=><option key={i} value={i}>
          {colLetter(i)} · {String(sheet.grid[headerRow]?.[i]??sheet.grid[headerRow+1]?.[i]??"").replace(/\s+/g," ").slice(0,65)||"(blank header)"}
         </option>)}
        </select>
       </label>)}
      </div>
      <div className={styles.muted}>Source preview (first three rows after the selected header):</div>
      <div className={styles.tableWrap} style={{maxHeight:190,overflow:"auto"}}>
       <table className={styles.table}><thead><tr>{(["substance","dlp","due"] as const).map(k=><th key={k}>{k.toUpperCase()}</th>)}</tr></thead>
        <tbody>{sheet.grid.slice(headerRow+1,headerRow+4).map((row,i)=><tr key={i}>{(["substance","dlp","due"] as const).map(k=><td key={k}>{columns[k]<0?"—":String(row[columns[k]]??"").slice(0,90)}</td>)}</tr>)}</tbody>
       </table>
      </div>
      <div><button type="button" className={styles.button} onClick={manualParse} disabled={[columns.substance,columns.dlp,columns.due].some(c=>c<0)}>Validate mapped columns</button></div>
     </div>:null}
    </div>:null}
    {parsed.length?<div style={{marginTop:16}}>
     <label>Find substance<input className={styles.input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search an active substance"/></label>
     <div className={styles.tableWrap} style={{maxHeight:240,overflowY:"auto",marginTop:10}}><table className={styles.table}><thead><tr><th>EURD active substance</th><th>DLP</th><th>Submission</th><th></th></tr></thead><tbody>
      {suggestions.map((r,i)=><tr key={i}><td>{r.substance}</td><td>{r.dlp}</td><td>{r.due}</td><td><button className={styles.buttonGhost} onClick={()=>choose(r)}>Use row</button></td></tr>)}
     </tbody></table></div>
     {suggestions.length===0?<div className={styles.muted}>No automatic match. Search the official file; never assume a similar substance is equivalent.</div>:null}
    </div>:null}
    <form id="psur-edit-form" onSubmit={save} style={{display:"grid",gap:12,marginTop:18}}>
     {isDemoCompany||simulated?<label style={{display:"flex",alignItems:"center",gap:9,fontSize:13,fontWeight:650}}>
      <input type="checkbox" checked={simulated} onChange={e=>toggleSimulation(e.target.checked)}
       disabled={Boolean(editingId&&entries.find(c=>c.id===editingId)?.is_simulated)}
       style={{accentColor:"#c4f85e"}}/>
      TEST ONLY — Simulated PSUR workflow (demo company)
     </label>:null}
     {simulated?<p className={styles.info} style={{margin:0}}>
      <strong>Simulation only.</strong> No SFDA/EU regulatory obligation is confirmed. Dates are fictional references;
      PVOS will create a clearly labelled test workflow without a real deadline, reminder schedule or recurring projection.
     </p>:null}
     <div className={styles.formGrid}>
      <label>Product<select className={styles.input} required value={productId} onChange={e=>{setProductId(e.target.value);setSearch("");}}>{products.map(p=><option key={p.id} value={p.id}>{p.brand_name} · {p.active_ingredient||"no ingredient recorded"}</option>)}</select></label>
      <label>Matched active substance<input className={styles.input} required value={substance} onChange={e=>setSubstance(e.target.value)}/></label>
      <label>Data lock point<input className={styles.input} type="date" required value={dlp} onChange={e=>setDlp(e.target.value)}/></label>
      <label>Submission deadline<input className={styles.input} type="date" required value={due} min={dlp||undefined} onChange={e=>setDue(e.target.value)}/></label>
      <label>Frequency (source-confirmed)<select className={styles.input} disabled={simulated} value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="">Unspecified</option>{[3,6,12,24,36].map(m=><option key={m} value={m}>{m} months</option>)}</select></label>
      <label>Applicable authority<select className={styles.input} disabled={simulated} value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)}><option value="reference_only">Reference only — do not schedule</option><option value="eu">EU EURD obligation confirmed</option><option value="sfda">SFDA/local obligation separately verified</option></select></label>
      <label>EURD revision<input className={styles.input} required value={revision} onChange={e=>setRevision(e.target.value)}/></label>
      <label>Source publication<input className={styles.input} type="date" disabled={simulated} value={published} onChange={e=>setPublished(e.target.value)}/></label>
     </div>
     <label>Regulatory basis / documented verification<textarea className={styles.input} rows={2} value={basis} onChange={e=>setBasis(e.target.value)} placeholder="Applicable authority, licence condition or regulatory instruction; cite the source and scope"/></label>
     <div className={styles.inlineActions}><button className={styles.button} type="submit" disabled={busy||!products.length}>{editingId?"Update draft":"Save draft for confirmation"}</button>{editingId?<button className={styles.buttonGhost} type="button" disabled={busy} onClick={()=>{setEditingId(null);setSelectedRow(null);}}>Cancel editing</button>:null}</div>
    </form>
   </div>
  </section>:null}
  {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
  {message?<div className={styles.info} role="status">{message}</div>:null}
  <section className={styles.panel}>
   <div className={styles.panelHeader}><h2>PSUR/PBRER register</h2><Help>Only independently confirmed regulatory cycles create actual deadlines. TEST ONLY simulations are isolated from regulatory confirmation and generate no due-date task or recurring schedule.</Help></div>
   <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Product / DLP</th><th>Submission deadline</th><th>Authority</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>
    {entries.map(c=><tr key={c.id}><td>{products.find(p=>p.id===c.product_id)?.brand_name||c.active_substance}
       {c.is_simulated?<div className={styles.muted}>TEST ONLY · Simulation</div>:null}
       <div className={styles.muted}>DLP {c.data_lock_point}</div></td>
     <td>{c.submission_due_date}{c.is_simulated||c.status==="draft"?<div className={styles.muted}>Reference date · not scheduled</div>:null}</td>
     <td>{c.is_simulated?"None · simulation":c.jurisdiction==="reference_only"?"Unverified":c.jurisdiction.toUpperCase()}</td>
     <td title={c.source_revision}>{c.source_revision}</td>
     <td><Badge tone={c.is_simulated?"amber":c.status==="confirmed"?"green":"amber"}>
      {c.status==="simulated"?"TEST ONLY · Running":c.is_simulated?"TEST ONLY · Draft":c.status==="draft"?"Needs confirmation":c.status==="confirmed"?"Basis confirmed":c.status}
     </Badge></td>
     <td>
      <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-start"}}>
       <div className={styles.inlineActions} style={{marginTop:0}}>
        {c.task_id?<button type="button" className={styles.buttonGhost} onClick={()=>{
         setActiveLifecycle(activeLifecycle===c.id?null:c.id);
         setTimeout(()=>document.getElementById("psur-lifecycle")?.scrollIntoView({behavior:"smooth",block:"start"}),100);
        }}>{activeLifecycle===c.id?"Close PSUR":"Open PSUR"}</button>:c.status==="draft"?<button type="button" className={styles.buttonGhost} disabled={busy} onClick={()=>edit(c)}>Review draft</button>:null}
        {!c.is_simulated?<button type="button" className={styles.buttonGhost} onClick={()=>{setPreviewId(c.id===previewId?null:c.id);setPreviewOffset(30);}}>{c.id===previewId?"Hide preview":"Preview reminders"}</button>:null}
       </div>
       {c.status==="draft"&&!c.task_id?c.is_simulated?
        <button type="button" className={styles.button} disabled={busy} onClick={()=>startSimulation(c.id)}>Start TEST ONLY simulation →</button>:
        c.jurisdiction==="reference_only"?
        <span className={styles.muted} style={{fontSize:12}}>{c.source_revision.toUpperCase().startsWith("TEST ONLY")?"TEST ONLY draft — enable simulation mode in Review draft":"Scheduling blocked — verify authority"}</span>:
        !c.authority_basis?.trim()?
        <span className={styles.muted} style={{fontSize:12}}>Scheduling blocked — document regulatory basis</span>:
        <button type="button" className={styles.buttonGhost} disabled={busy} onClick={()=>confirm(c.id)}>Confirm &amp; schedule</button>
       :null}
      </div>
     </td>
    </tr>)}
   </tbody></table>{!entries.length?<div className={styles.empty}>No EURD cycles recorded for this company.</div>:null}</div>
   {selectedLifecycle?.task_id?<div className={styles.sectionBody}>
    <PSURLifecycle key={selectedLifecycle.id} cycle={selectedLifecycle} companyId={companyId} organizationId={organizationId}
     productName={products.find(x=>x.id===selectedLifecycle.product_id)?.brand_name||selectedLifecycle.active_substance} onChanged={onChanged}/>
   </div>:null}
   {preview?<div className={styles.sectionBody} style={{borderTop:"1px solid var(--line,#dce2e5)",display:"grid",gap:14}}>
     <div>
      <h3 style={{fontSize:15,margin:"0 0 7px"}}>PSUR deadline & reminder simulation</h3>
      <div className={styles.muted}>PREVIEW ONLY · No task, reminder, email or regulatory obligation is created. The real Dashboard is unchanged.</div>
     </div>
     <div className={styles.formGrid}>
      <label>Simulate deadline position
       <select className={styles.input} value={previewOffset} onChange={e=>setPreviewOffset(Number(e.target.value))}>
        <option value={90}>90 days remaining</option>
        <option value={30}>30 days remaining</option>
        <option value={7}>7 days remaining</option>
        <option value={1}>1 day remaining</option>
        <option value={0}>Due today</option>
        <option value={-2}>2 days overdue</option>
       </select>
      </label>
      <div style={{alignSelf:"end"}}><span className={styles.muted}>Simulated today: </span><strong>{previewAsOf}</strong><div className={styles.muted}>Actual filing deadline: {preview.submission_due_date}</div></div>
     </div>
     <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Activity</th><th>Deadline</th><th>Status</th><th>Reminder state</th></tr></thead><tbody>
      <tr><td>PSUR/PBRER · {previewActivity}<div className={styles.muted}>DLP {preview.data_lock_point}</div></td>
      <td>{preview.submission_due_date}<div className={previewOffset<0?styles.bad:styles.muted}>{previewCountdown}</div></td>
      <td><Badge tone="default">Not Started · simulated</Badge></td>
      <td><Badge tone={previewOffset<0?"red":previewOffset<=7?"amber":"default"}>{previewOffset<0?"Overdue":previewOffset<=7?"Due soon":"PSUR advance reminder"}</Badge></td>
      </tr>
     </tbody></table></div>
     <div className={styles.muted}>This preview tests timing and labels only. Creating a real Dashboard task still requires an applicable authority requirement and a recorded regulatory basis. Email/push reminders are not yet implemented.</div>
     <div><button type="button" className={styles.buttonGhost} onClick={()=>setPreviewId(null)}>Close simulation</button></div>
    </div>:null}
  </section>
 </div>;
}
