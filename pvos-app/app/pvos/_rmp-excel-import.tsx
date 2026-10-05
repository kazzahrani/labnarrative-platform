"use client";

import {ChangeEvent,useMemo,useState} from "react";
import * as XLSX from "xlsx";
import {Badge} from "./_components";
import {pvosSupabase} from "./_pvos-supabase";
import styles from "./pvos.module.css";

type Props={
  organizationId:string|null;
  userId?:string|null;
  companies:any[];
  products:any[];
  onImported:()=>void|Promise<void>;
};

type ImportRow={
  rowNumber:number;
  molecule:string;
  submittedTo:string;
  frequency:string;
  initialDlp:string;
  initialSubmission:string;
  initialIdentified:string;
  initialPotential:string;
  initialMissing:string;
  initialAdditionalRmm:string;
  nextDue:string;
  subsequentSubmission:string;
  subsequentIdentified:string;
  subsequentPotential:string;
  subsequentMissing:string;
  commentsReason:string;
  subsequentAdditionalRmm:string;
  targetProductId:string;
};

const clean=(v:any)=>String(v??"").trim();
const norm=(v:any)=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,"");

function excelDate(v:any){
  if(v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if(typeof v==="number" && Number.isFinite(v)){
    const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);
    return d.toISOString().slice(0,10);
  }
  const s=clean(v);
  if(!s || /^(na|n\/a|none)$/i.test(s)) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d=new Date(s);
  return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);
}

function mergeInitial(existing:any,row:ImportRow){
  const now=new Date().toISOString();
  const previous=(existing?.versions||[]).find((v:any)=>v.type==="initial");
  return {
    id:previous?.id||crypto.randomUUID(),
    type:"initial",
    dlp:row.initialDlp,
    submission_date:row.initialSubmission,
    identified_risks:row.initialIdentified,
    potential_risks:row.initialPotential,
    missing_information:row.initialMissing,
    comments_reason:"",
    additional_rmm:row.initialAdditionalRmm,
    created_at:previous?.created_at||now
  };
}

function subsequentFrom(row:ImportRow){
  if(![row.subsequentSubmission,row.subsequentIdentified,row.subsequentPotential,row.subsequentMissing,row.commentsReason,row.subsequentAdditionalRmm].some(Boolean)) return null;
  return {
    id:crypto.randomUUID(),
    type:"subsequent",
    dlp:"",
    submission_date:row.subsequentSubmission,
    identified_risks:row.subsequentIdentified,
    potential_risks:row.subsequentPotential,
    missing_information:row.subsequentMissing,
    comments_reason:row.commentsReason,
    additional_rmm:row.subsequentAdditionalRmm,
    created_at:new Date().toISOString()
  };
}

function sameSub(a:any,b:any){
  return [
    a?.submission_date,a?.identified_risks,a?.potential_risks,a?.missing_information,a?.comments_reason,a?.additional_rmm
  ].map(clean).join("|") === [
    b?.submission_date,b?.identified_risks,b?.potential_risks,b?.missing_information,b?.comments_reason,b?.additional_rmm
  ].map(clean).join("|");
}

export function RmpExcelImport({organizationId,userId,companies,products,onImported}:Props){
  const [open,setOpen]=useState(false);
  const [companyId,setCompanyId]=useState("");
  const [fileName,setFileName]=useState("");
  const [rows,setRows]=useState<ImportRow[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState("");

  const companyProducts=useMemo(()=>products.filter(p=>p.company_id===companyId),[products,companyId]);
  const mapped=rows.filter(r=>r.targetProductId).length;

  function autoMatch(row:Omit<ImportRow,"targetProductId">,cid:string){
    const candidates=products.filter(p=>p.company_id===cid);
    const m=norm(row.molecule);
    const match=candidates.find(p=>norm(p.active_ingredient)===m)||candidates.find(p=>norm(p.brand_name)===m);
    return match?.id||"";
  }

  function rematch(cid:string){
    setCompanyId(cid);
    setRows(rs=>rs.map(r=>({...r,targetProductId:autoMatch(r,cid)})));
  }

  async function chooseFile(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file)return;
    setFileName(file.name);setRows([]);setError("");setResult("");
    try{
      const buffer=await file.arrayBuffer();
      const wb=XLSX.read(buffer,{type:"array",cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const matrix=XLSX.utils.sheet_to_json<any[]>(ws,{header:1,raw:true,defval:""});
      if(norm(matrix?.[0]?.[0])!=="molecule" || norm(matrix?.[0]?.[1])!=="submittedto"){
        throw new Error("This does not look like the RMP tracker format. Expected the first columns to be Molecule and Submitted to.");
      }
      const parsed:ImportRow[]=[];
      for(let i=3;i<matrix.length;i++){
        const x=matrix[i]||[];
        const molecule=clean(x[0]); if(!molecule)continue;
        const base={
          rowNumber:i+1,
          molecule,
          submittedTo:clean(x[1]),
          frequency:clean(x[2]),
          initialDlp:clean(x[3]),
          initialSubmission:excelDate(x[4]),
          initialIdentified:clean(x[5]),
          initialPotential:clean(x[6]),
          initialMissing:clean(x[7]),
          initialAdditionalRmm:clean(x[8]),
          nextDue:excelDate(x[9]),
          subsequentSubmission:excelDate(x[10]),
          subsequentIdentified:clean(x[11]),
          subsequentPotential:clean(x[12]),
          subsequentMissing:clean(x[13]),
          commentsReason:clean(x[14]),
          subsequentAdditionalRmm:clean(x[15]),
        };
        parsed.push({...base,targetProductId:autoMatch(base,companyId)});
      }
      if(!parsed.length) throw new Error("No RMP data rows were found in the workbook.");
      setRows(parsed);
    }catch(err:any){setError(err?.message||"Could not read the Excel file.");}
  }

  async function syncTask(product:any,nextDue:string){
    if(!organizationId||!nextDue)return false;
    const {data}=await pvosSupabase.from("pvos_tasks").select("*").eq("product_id",product.id).eq("activity_type","RMP").in("status",["not_started","in_progress","awaiting_review","awaiting_external"]);
    const existing=(data||[]).find((x:any)=>x.metadata?.rmp_tracker===true);
    const due_at=new Date(nextDue+"T17:00:00").toISOString();
    if(existing){
      const {error}=await pvosSupabase.from("pvos_tasks").update({title:"RMP update — "+product.brand_name,due_at}).eq("id",existing.id);
      return !error;
    }
    const {error}=await pvosSupabase.from("pvos_tasks").insert({
      organization_id:organizationId,company_id:product.company_id,product_id:product.id,
      title:"RMP update — "+product.brand_name,activity_type:"RMP",source:"system",
      status:"not_started",priority:"medium",owner_user_id:userId||null,due_at,metadata:{rmp_tracker:true}
    });
    return !error;
  }

  async function runImport(){
    if(!companyId){setError("Select the company these RMP records belong to.");return;}
    const selected=rows.filter(r=>r.targetProductId);
    if(!selected.length){setError("Map at least one molecule to a PVOS product before importing.");return;}
    setBusy(true);setError("");setResult("");
    let updated=0,tasks=0,failed=0;
    for(const row of selected){
      const product=products.find(p=>p.id===row.targetProductId);
      if(!product){failed++;continue;}
      const old=product.metadata?.rmp||{};
      const oldVersions=Array.isArray(old.versions)?old.versions:[];
      const initial=mergeInitial(old,row);
      let versions=oldVersions.filter((v:any)=>v.type!=="initial");
      versions.unshift(initial);
      const sub=subsequentFrom(row);
      if(sub && !versions.some((v:any)=>v.type==="subsequent"&&sameSub(v,sub))) versions.push(sub);
      const next={
        submitted_to:row.submittedTo||old.submitted_to||"SFDA",
        frequency:row.frequency||old.frequency||"On request",
        next_due_date:row.nextDue||old.next_due_date||"",
        status:old.status||product.rmp_status||"Active",
        versions
      };
      const metadata={...(product.metadata||{}),rmp:next};
      const {error:updateError}=await pvosSupabase.from("pvos_products").update({metadata,rmp_status:next.status}).eq("id",product.id);
      if(updateError){failed++;continue;}
      updated++;
      if(next.next_due_date && await syncTask(product,next.next_due_date)) tasks++;
    }
    setBusy(false);
    setResult(updated+" RMP record"+(updated===1?"":"s")+" imported"+(tasks?" · "+tasks+" due-date task"+(tasks===1?"":"s")+" synced":"")+(failed?" · "+failed+" failed":"")+".");
    await onImported();
  }

  return <>
    <button className={styles.buttonGhost} onClick={()=>{setOpen(true);setCompanyId(v=>v||companies[0]?.id||"")}}>Import RMP Excel</button>
    {open?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className={styles.modalCard} style={{width:"min(980px,100%)"}}>
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>Existing tracker migration</div><h2>Import RMP Excel</h2><div className={styles.muted}>Upload the same RMP tracker format shared by Lujain. PVOS will map each molecule to a product before anything is saved.</div></div>
          <button className={styles.modalClose} onClick={()=>setOpen(false)}>×</button>
        </div>

        <div className={styles.formGrid}>
          <label>Company<select className={styles.input} value={companyId} onChange={e=>rematch(e.target.value)}><option value="">Select company</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>RMP tracker (.xlsx / .xls)<input className={styles.input} type="file" accept=".xlsx,.xls" onChange={chooseFile}/></label>
        </div>

        {fileName?<div className={styles.notice} style={{marginTop:14}}><strong>{fileName}</strong> · {rows.length} RMP row{rows.length===1?"":"s"} found · {mapped} mapped to products.</div>:null}
        {error?<div className={styles.errorBox} style={{marginTop:14}}>{error}</div>:null}
        {result?<div className={styles.successBox} style={{marginTop:14}}>{result}</div>:null}

        {rows.length?<div className={styles.tableWrap} style={{marginTop:14,maxHeight:390,overflow:"auto"}}><table className={styles.table}>
          <thead><tr><th>Excel row</th><th>Molecule</th><th>Submitted to</th><th>Frequency</th><th>Initial submission</th><th>Next DLP/Update</th><th>PVOS product mapping</th></tr></thead>
          <tbody>{rows.map((row,i)=><tr key={row.rowNumber}>
            <td>{row.rowNumber}</td><td><strong>{row.molecule}</strong></td><td>{row.submittedTo||"—"}</td><td>{row.frequency||"—"}</td><td>{row.initialSubmission||"—"}</td><td>{row.nextDue||"—"}</td>
            <td style={{minWidth:260}}><select className={styles.input} value={row.targetProductId} onChange={e=>setRows(rs=>rs.map((x,j)=>j===i?{...x,targetProductId:e.target.value}:x))}>
              <option value="">Unmatched — choose product</option>{companyProducts.map(p=><option key={p.id} value={p.id}>{p.brand_name}{p.active_ingredient?" · "+p.active_ingredient:""}</option>)}
            </select></td>
          </tr>)}</tbody>
        </table></div>:null}

        {rows.length&&mapped<rows.length?<div className={styles.notice} style={{marginTop:14}}>{rows.length-mapped} row{rows.length-mapped===1?" is":"s are"} unmatched. Map them manually or leave them unmapped; PVOS will import only the mapped rows.</div>:null}

        <div className={styles.modalActions}>
          <button className={styles.buttonGhost} onClick={()=>setOpen(false)}>Close</button>
          <button className={styles.button} disabled={busy||mapped===0} onClick={runImport}>{busy?"Importing…":"Import "+mapped+" mapped RMP record"+(mapped===1?"":"s")}</button>
        </div>
      </div>
    </div>:null}
  </>;
}
