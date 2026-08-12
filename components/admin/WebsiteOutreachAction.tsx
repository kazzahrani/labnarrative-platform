"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Props={siteId:string;siteStatus:string;outreachStatus?:string|null;runId?:string|null;runState?:string|null};
type PrepareResult={runId?:string;route?:string};

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
      const result=(data||{}) as PrepareResult;
      const nextRunId=String(result.runId||"");
      const route=String(result.route||"").trim()|| (nextRunId?`/admin/outreach-v2/${nextRunId}`:"");
      if(!route)throw new Error("Outreach draft was not created.");
      router.push(route);
    }catch(e){setError(e instanceof Error?e.message:"Outreach could not be opened.");setWorking(false);}
  }

  return <><button
    type="button"
    onClick={()=>void openOutreach()}
    disabled={working}
    style={{
      minHeight:"28px",
      height:"28px",
      padding:"3px 8px",
      border:"1px solid rgba(63,143,113,.50)",
      borderRadius:"6px",
      background:"#2f6f5e",
      color:"#f4fbf8",
      font:"inherit",
      fontSize:".66rem",
      fontWeight:800,
      lineHeight:1,
      cursor:working?"wait":"pointer",
      whiteSpace:"nowrap",
      opacity:working?.7:1,
    }}
  >{working?"Preparing…":"Outreach"}</button>{error?<span title={error} style={{color:"#ff9a9a",fontSize:".62rem"}}>!</span>:null}</>;
}
