"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Props={siteId:string;siteStatus:string;outreachStatus?:string|null;runId?:string|null;runState?:string|null};

export default function WebsiteOutreachAction({siteId,siteStatus,outreachStatus}:Props){
  const router=useRouter();
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const canPrepare=siteStatus==="concept"&&String(outreachStatus||"not_contacted")==="not_contacted";
  if(!canPrepare)return null;

  async function openOutreach(){
    if(working)return;
    setWorking(true);setError("");
    try{
      const {data,error:rpcError}=await supabase.rpc("engine_v2_admin_prepare_site_outreach",{p_site_id:siteId});
      if(rpcError)throw rpcError;
      const nextRunId=String((data as {runId?:string}|null)?.runId||"");
      if(!nextRunId)throw new Error("Outreach draft was not created.");
      router.push(`/admin/outreach/${nextRunId}`);
    }catch(e){setError(e instanceof Error?e.message:"Outreach could not be opened.");setWorking(false);}
  }

  return <><button type="button" onClick={()=>void openOutreach()} disabled={working} style={{background:"#2f6f5e",borderColor:"rgba(63,143,113,.50)",color:"#f4fbf8"}}>{working?"Preparing…":"Outreach"}</button>{error?<span title={error} style={{color:"#ff9a9a",fontSize:".62rem"}}>!</span>:null}</>;
}
