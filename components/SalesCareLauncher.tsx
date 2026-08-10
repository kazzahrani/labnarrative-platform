"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-care-launcher.module.css";

type Data={offer?:{status:string;view_count?:number}|null;subscription?:{status:string;plan_name:string;price_amount:number|string;currency:string;billing_interval:string;next_billing_at?:string|null}|null;requests?:{status:string}[]};
function label(v?:string|null){return(v||"care").replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase())}
function money(v:number|string,c:string){const n=Number(v||0)||0;try{return new Intl.NumberFormat("en-US",{style:"currency",currency:c||"USD",maximumFractionDigits:2}).format(n)}catch{return`${c} ${n.toFixed(2)}`}}
export default function SalesCareLauncher({prospectId}:{prospectId:string}){
 const[data,setData]=useState<Data|null>(null);const[open,setOpen]=useState(false);
 const load=useCallback(async()=>{const{data:r,error}=await supabase.rpc("care_admin_get",{p_prospect_id:prospectId});if(!error&&r&&typeof r==="object")setData(r as Data)},[prospectId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(!data?.offer)return;const channel=supabase.channel(`sales-care-${prospectId}`).on("postgres_changes",{event:"*",schema:"public",table:"care_subscriptions",filter:`prospect_id=eq.${prospectId}`},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"care_requests",filter:`prospect_id=eq.${prospectId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[data?.offer,load,prospectId]);
 if(!data?.offer)return null;const s=data.subscription;const state=s?.status||data.offer.status;const openRequests=(data.requests||[]).filter(r=>["submitted","reviewing","scheduled"].includes(r.status)).length;const attention=openRequests>0||["suspended","failed"].includes(state);
 return <div className={styles.wrap}>{open?<section className={styles.panel}><header><div><span>LabNarrative Care</span><strong>{label(state)}</strong></div><button type="button" onClick={()=>setOpen(false)}>×</button></header>{s?<p>{s.plan_name} · {money(s.price_amount,s.currency)} / {s.billing_interval}.{openRequests?` ${openRequests} open maintenance request${openRequests===1?"":"s"}.`:""}</p>:<p>Private Care offer ready · {data.offer.view_count||0} views.</p>}<Link href={`/admin/sales/${prospectId}/care`}>Open Care workspace</Link></section>:null}<button className={`${styles.launcher} ${attention?styles.attention:""} ${state==="active"?styles.active:""}`} type="button" onClick={()=>setOpen(v=>!v)}><span>Care</span><strong>{openRequests?`${openRequests} request${openRequests===1?"":"s"}`:label(state)} →</strong></button></div>
}
