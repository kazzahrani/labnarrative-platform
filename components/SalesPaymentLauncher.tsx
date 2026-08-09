"use client";

import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-payment-launcher.module.css";

type Payment = { id:string; token:string; kind:string; status:string; amount:number|string; currency:string; deposit_percent:number|string; paid_at?:string|null; provider_capture_id?:string|null };
type ResponseData = { payment?: Payment | null; proposal?: { status?: string; title?: string } | null };
function money(value:number|string,currency:string){const amount=Number(value||0)||0;try{return new Intl.NumberFormat("en-US",{style:"currency",currency:currency||"USD",maximumFractionDigits:2}).format(amount)}catch{return`${currency||"USD"} ${amount.toFixed(2)}`}}
function label(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase())}

export default function SalesPaymentLauncher({prospectId}:{prospectId:string}){
 const[payment,setPayment]=useState<Payment|null>(null);const[open,setOpen]=useState(false);const[notice,setNotice]=useState("");
 const load=useCallback(async()=>{const{data,error}=await supabase.rpc("sales_payment_admin_get",{p_prospect_id:prospectId});if(!error&&data&&typeof data==="object")setPayment(((data as ResponseData).payment||null))},[prospectId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(!prospectId)return;const channel=supabase.channel(`sales-payment-${prospectId}`).on("postgres_changes",{event:"*",schema:"public",table:"sales_payment_requests",filter:`prospect_id=eq.${prospectId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[load,prospectId]);
 if(!payment)return null;const url=`https://labnarrative.com/pay/${payment.token}`;const paid=payment.status==="paid";const isBalance=payment.kind==="balance";const title=isBalance?"Final balance":"Deposit payment";const paidLabel=isBalance?"Paid in full":"Deposit received";
 async function copyLink(){await navigator.clipboard.writeText(url);setNotice("Payment link copied.");window.setTimeout(()=>setNotice(""),1800)}
 return <div className={styles.wrap}>{open?<section className={styles.panel}><header><div><span>{title}</span><strong>{money(payment.amount,payment.currency)}</strong></div><button type="button" onClick={()=>setOpen(false)}>×</button></header><dl><div><dt>Status</dt><dd className={paid?styles.paid:undefined}>{label(payment.status)}</dd></div>{!isBalance?<div><dt>Deposit</dt><dd>{Number(payment.deposit_percent||0)}%</dd></div>:<div><dt>Payment type</dt><dd>Final project balance</dd></div>}{payment.provider_capture_id?<div><dt>Reference</dt><dd>{payment.provider_capture_id}</dd></div>:null}</dl><div className={styles.actions}><a href={url} target="_blank" rel="noreferrer">Open payment ↗</a><button type="button" onClick={()=>void copyLink()}>Copy link</button></div>{notice?<p>{notice}</p>:null}</section>:null}<button className={`${styles.launcher} ${paid?styles.launcherPaid:""}`} type="button" onClick={()=>setOpen(v=>!v)}><span>{paid?paidLabel:isBalance?"Final payment":"Payment"}</span><strong>{paid?`${money(payment.amount,payment.currency)} received`:`${money(payment.amount,payment.currency)} · ${label(payment.status)} →`}</strong></button></div>
}
