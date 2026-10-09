"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import {usePVOS} from "../../_provider";
import {pvosSupabase} from "../../_pvos-supabase";
import {DepartmentRequests} from "../../companies/_department-requests";
import styles from "../../pvos.module.css";

type Company={id:string;name:string;organization_id:string};
type Product=Record<string,unknown>;

export default function DepartmentRequestWorkspace(){
 const params=useSearchParams();
 const companyId=params.get("company")||"";
 const requestId=params.get("request");
 const create=params.get("new")==="1";
 const {session}=usePVOS();
 const [company,setCompany]=useState<Company|null>(null);
 const [products,setProducts]=useState<Product[]>([]);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{
  if(!session||!companyId){setBusy(false);return;}
  let mounted=true;
  setBusy(true);setError("");setCompany(null);setProducts([]);
  (async()=>{
   const [c,p]=await Promise.all([
    pvosSupabase.from("pvos_companies").select("id,name,organization_id").eq("id",companyId).single(),
    pvosSupabase.from("pvos_products").select("*").eq("company_id",companyId).order("brand_name")
   ]);
   if(c.error)throw c.error;
   if(p.error)throw p.error;
   if(mounted){setCompany(c.data);setProducts(p.data||[]);}
  })().catch(e=>{if(mounted)setError(e instanceof Error?e.message:"Could not load company requests");})
    .finally(()=>{if(mounted)setBusy(false);});
  return ()=>{mounted=false;};
 },[companyId,session?.user.id]);

 const back=companyId?"/pvos/requests?company="+encodeURIComponent(companyId):"/pvos/requests";
 return <div className={styles.unifiedRequests}>
  <div style={{marginBottom:18,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
   <Link href={back} className={styles.buttonGhost}>← All requests</Link>
   {company?<span className={styles.muted}>{company.name} · Department requests</span>:null}
  </div>
  {!companyId?<div className={styles.errorBox}>Select a company from <Link href="/pvos/requests">Requests</Link> to continue.</div>:null}
  {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
  {busy?<div className={styles.empty}>Loading department requests…</div>:null}
  {company&&!busy?<DepartmentRequests key={company.id} companyId={company.id} organizationId={company.organization_id}
   products={products} initialRequestId={requestId} startCreate={create}/>:null}
 </div>;
}
