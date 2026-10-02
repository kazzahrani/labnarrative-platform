"use client";

import { FormEvent, useState } from "react";
import { pvosSupabase } from "../_pvos-supabase";
import styles from "../pvos.module.css";

export default function LoginPage(){
  const [mode,setMode] = useState<"signin"|"signup">("signin");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState<string|null>(null);
  const [error,setError] = useState<string|null>(null);

  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setError(null); setMessage(null);
    if(mode==="signin"){
      const {error:e2}=await pvosSupabase.auth.signInWithPassword({email,password});
      if(e2) setError(e2.message);
    } else {
      const {data,error:e2}=await pvosSupabase.auth.signUp({
        email,password,
        options:{ emailRedirectTo: typeof window!=="undefined" ? window.location.origin+"/pvos/dashboard" : undefined }
      });
      if(e2) setError(e2.message);
      else if(!data.session) setMessage("Account created. Check your email to confirm it, then return here and sign in.");
      else setMessage("Account created. Preparing your PVOS workspace…");
    }
    setBusy(false);
  }

  return <div className={styles.authWrap}>
    <div className={styles.authCard}>
      <div className={styles.brand} style={{padding:0,marginBottom:24}}><span className={styles.mark}>PV</span><div>PVOS<small>Saudi PV operations</small></div></div>
      <div className={styles.eyebrow}>Private prototype</div>
      <h1 className={styles.title}>{mode==="signin"?"Sign in to PVOS":"Create your PVOS account"}</h1>
      <p className={styles.sub}>The first account automatically gets a private demo workspace with sample companies and PV tasks. No patient data is used.</p>
      <div className={styles.authTabs}>
        <button className={mode==="signin"?styles.authTabActive:styles.authTab} onClick={()=>setMode("signin")}>Sign in</button>
        <button className={mode==="signup"?styles.authTabActive:styles.authTab} onClick={()=>setMode("signup")}>Create account</button>
      </div>
      <form onSubmit={submit} className={styles.form}>
        <label>Email<input className={styles.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label>Password<input className={styles.input} type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        {error?<div className={styles.errorBox}>{error}</div>:null}
        {message?<div className={styles.successBox}>{message}</div>:null}
        <button className={styles.button} disabled={busy}>{busy?"Please wait…":mode==="signin"?"Sign in":"Create account"}</button>
      </form>
    </div>
  </div>;
}
