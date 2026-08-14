"use client";

import { useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Props={
  slug:string;
  siteStatus:string;
  runId?:string|null;
  runState?:string|null;
  engine?:"v3"|"v4"|null;
  onDone:(message:string)=>void|Promise<void>;
};

type PublishResult={ok?:boolean;outreachSent?:boolean};

export default function WebsitePublishAction({slug,siteStatus,runId,runState,engine,onDone}:Props){
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  if(siteStatus!=="draft")return null;

  const ready=Boolean(runId&&engine&&runState==="final_review");

  async function publish(){
    if(!ready||working||!runId||!engine)return;
    const confirmed=window.confirm(`Publish ${slug}.labnarrative.com now?\n\nThis will publish the approved private draft and prepare its outreach draft. It will NOT send outreach automatically.`);
    if(!confirmed)return;

    setWorking(true);setError("");
    try{
      const {data,error:rpcError}=await supabase.rpc("engine_admin_approve_publish",{
        p_run_id:runId,
        p_engine:engine,
        p_note:null,
      });
      if(rpcError)throw rpcError;
      const result=(data||{}) as PublishResult;
      if(!result.ok||result.outreachSent)throw new Error("Publication did not return the expected safe outreach-draft state.");
      await onDone(`Published ${slug}. Outreach draft prepared; nothing was sent automatically.`);
    }catch(e){
      setError(e instanceof Error?e.message:"Website could not be published.");
      setWorking(false);
    }
  }

  return <><button
    type="button"
    onClick={()=>void publish()}
    disabled={!ready||working}
    title={ready?"Publish this approved private draft":"Publish becomes available when this private draft reaches Final Review"}
    style={{
      minHeight:"28px",
      height:"28px",
      padding:"3px 8px",
      border:`1px solid ${ready?"rgba(63,143,113,.58)":"rgba(146,157,153,.30)"}`,
      borderRadius:"6px",
      background:ready?"#2f6f5e":"rgba(255,255,255,.045)",
      color:ready?"#f4fbf8":"#7d8985",
      font:"inherit",
      fontSize:".66rem",
      fontWeight:800,
      lineHeight:1,
      cursor:working?"wait":ready?"pointer":"not-allowed",
      whiteSpace:"nowrap",
      opacity:working?.7:1,
    }}
  >{working?"Publishing…":"Publish"}</button>{error?<span title={error} style={{color:"#ff9a9a",fontSize:".62rem"}}>!</span>:null}</>;
}
