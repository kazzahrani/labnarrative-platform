"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "../../../lib/supabase-browser";
import ReferralDashboard from "../ReferralDashboard";
import styles from "./affiliate-workspace.module.css";

export default function AffiliateWorkspace() {
  const [state,setState]=useState<"checking"|"signed_out"|"ready">("checking");
  useEffect(()=>{
    let active=true;
    void browserSupabase.auth.getSession().then(({data})=>{if(active)setState(data.session?"ready":"signed_out")});
    const{data:listener}=browserSupabase.auth.onAuthStateChange((_event,session)=>{if(active)setState(session?"ready":"signed_out")});
    return()=>{active=false;listener.subscription.unsubscribe()};
  },[]);
  if(state==="checking")return <main className={styles.state}>Checking your session…</main>;
  if(state==="signed_out")return <main className={styles.state}><section><small>CREATOR + AFFILIATE</small><h1>Sign in to your LabNarrative Trading account.</h1><p>Your creator submissions, Max rewards and affiliate earnings are connected to your account.</p><a href="/trader">Sign in / open trading →</a></section></main>;
  return <main className={styles.page}><div className={styles.top}><a href="/trader">← Trading</a><a href="/affiliate">Program rules ↗</a></div><ReferralDashboard /></main>;
}
