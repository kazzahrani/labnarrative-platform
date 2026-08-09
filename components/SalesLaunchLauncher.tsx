"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-launch-launcher.module.css";

type Data={launch?:{status:string;handover_view_count?:number;handover_acknowledged_at?:string|null}|null;ready_to_launch?:boolean;system_ready?:boolean};
function label(v?:string|null){return(v||"launch").replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase())}
export default function SalesLaunchLauncher({prospectId}:{prospectId:string}){
 const[data,setData]=useState<Data|null>(null);const[open,setOpen]=useState(false);
 const load=useCallback(async()=>{const{data:res,error}=await supabase.rpc("sales_client_launch_admin_get",{p_prospect_id:prospectId});if(!error&&res&&typeof res==="object")setData(res as Data)},[prospectId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(!data?.launch)return;const channel=supabase.channel(`sales-launch-${prospectId}`).on("postgres_changes",{event:"*",schema:"public",table:"sales_client_launches",filter:`prospect_id=eq.${prospectId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[data?.launch,load,prospectId]);
 if(!data?.launch)return null;const l=data.launch;const attention=l.status==="ready"||l.status==="launched"||l.status==="handover_sent";return <div className={styles.wrap}>{open?<section className={styles.panel}><header><div><span>Client delivery</span><strong>{label(l.status)}</strong></div><button type="button" onClick={()=>setOpen(false)}>×</button></header>{l.status==="preparing"?<p>{data.system_ready?"Complete the operational launch checklist.":"A system gate needs attention before launch."}</p>:l.status==="ready"?<p>All launch gates are complete. The website is ready for the deliberate launch action.</p>:l.status==="launched"?<p>The website is live. Send the private client handover link.</p>:l.status==="handover_sent"?<p>Handover sent · {l.handover_view_count||0} views. Waiting for client acknowledgement.</p>:<p>Client delivery is complete.</p>}<Link href={`/admin/sales/${prospectId}/launch`}>Open launch workspace</Link></section>:null}<button className={`${styles.launcher} ${attention?styles.attention:""}`} type="button" onClick={()=>setOpen(v=>!v)}><span>Launch</span><strong>{label(l.status)} →</strong></button></div>
}
