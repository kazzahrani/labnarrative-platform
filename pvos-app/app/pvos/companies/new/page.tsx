"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "../../_components";
import { usePVOS } from "../../_provider";
import { pvosSupabase } from "../../_pvos-supabase";
import styles from "../../pvos.module.css";

export default function NewCompanyPage(){
  const {organizationId,session}=usePVOS();
  const router=useRouter();
  const [name,setName]=useState("");
  const [scope,setScope]=useState("PV full service");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!session)return;
    setBusy(true);setError(null);
    const {data,error:e2}=await pvosSupabase.from("pvos_companies").insert({
      organization_id:organizationId,
      name:name.trim(),
      contract_scope:scope.trim()||null,
      qppv_user_id:session.user.id
    }).select("id").single();
    setBusy(false);
    if(e2){setError(e2.message);return;}
    router.push("/pvos/companies/"+data.id);
  }

  return <>
    <Header eyebrow="Client setup" title="Add company" sub="Create a client or MAH workspace. Products, obligations and recurring PV activities are configured inside the company workspace."/>
    <form className={styles.info} style={{maxWidth:680}} onSubmit={submit}>
      <div className={styles.form}>
        <label>Company / client name<input className={styles.input} value={name} onChange={e=>setName(e.target.value)} required placeholder="e.g. Riyadh Pharma"/></label>
        <label>PV scope<input className={styles.input} value={scope} onChange={e=>setScope(e.target.value)} placeholder="e.g. Local QPPV + literature + PSSF"/></label>
      </div>
      {error?<div className={styles.errorBox} style={{marginTop:12}}>{error}</div>:null}
      <div className={styles.inlineActions}><button className={styles.button} disabled={busy}>{busy?"Creating…":"Create company"}</button><button type="button" className={styles.buttonGhost} onClick={()=>router.back()}>Cancel</button></div>
    </form>
  </>;
}
