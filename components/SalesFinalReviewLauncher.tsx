"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-final-review-launcher.module.css";

type Data={eligible?:boolean;stale?:boolean;review?:{status:string;version:number;share_token:string}|null;balance?:{status:string;amount:number|string;currency:string}|null};
function label(v?:string|null){return(v||"ready").replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase())}
function money(v:number|string,c:string){const n=Number(v||0)||0;try{return new Intl.NumberFormat("en-US",{style:"currency",currency:c||"USD",maximumFractionDigits:2}).format(n)}catch{return`${c||"USD"} ${n.toFixed(2)}`}}

export default function SalesFinalReviewLauncher({prospectId}:{prospectId:string}){
 const[data,setData]=useState<Data|null>(null);const[open,setOpen]=useState(false);
 const load=useCallback(async()=>{const{data:res,error}=await supabase.rpc("sales_client_final_review_admin_get",{p_prospect_id:prospectId});if(!error&&res&&typeof res==="object")setData(res as Data)},[prospectId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(!prospectId||!data)return;const channel=supabase.channel(`sales-final-review-${prospectId}`).on("postgres_changes",{event:"*",schema:"public",table:"sales_client_final_reviews",filter:`prospect_id=eq.${prospectId}`},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"sales_payment_requests",filter:`prospect_id=eq.${prospectId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[data,load,prospectId]);
 if(!data||(data.eligible!==true&&!data.review))return null;
 const r=data.review;const attention=data.stale||r?.status==="changes_requested"||r?.status==="approved";
 return <div className={styles.wrap}>{open?<section className={styles.panel}><header><div><span>Client final review</span><strong>{r?`v${r.version} · ${label(r.status)}`:"Ready to prepare"}</strong></div><button type="button" onClick={()=>setOpen(false)}>×</button></header>{data.stale?<p className={styles.warning}>The website changed after the current review was prepared. Prepare a fresh review before the client approves.</p>:r?.status==="changes_requested"?<p>The client requested changes. Open delivery review to see the exact request.</p>:r?.status==="approved"?<p>{data.balance?`Website approved · final balance ${money(data.balance.amount,data.balance.currency)} ${label(data.balance.status).toLowerCase()}.`:"Website approved. No final balance is outstanding."}</p>:<p>Prepare, share and monitor the client&apos;s final website approval from one place.</p>}<Link href={`/admin/sales/${prospectId}/final-review`}>Open final review</Link></section>:null}<button className={`${styles.launcher} ${attention?styles.attention:""}`} type="button" onClick={()=>setOpen(v=>!v)}><span>Final review</span><strong>{r?`v${r.version} · ${label(r.status)} →`:"Ready to prepare →"}</strong></button></div>
}
