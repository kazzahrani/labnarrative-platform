"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { pvosSupabase } from "./_pvos-supabase";
import { ensureDemoWorkspace } from "./_seed";
import {clearPVOSCache,invalidatePVOSCache} from "./_session-cache";

type PVOSContextValue = {
  session: Session | null;
  organizationId: string | null;
  loading: boolean;
  error: string | null;
  reloadToken: number;
  refresh: () => void;
};

const PVOSContext = createContext<PVOSContextValue | null>(null);

export function PVOSProvider({children}:{children:ReactNode}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session,setSession] = useState<Session|null>(null);
  const [organizationId,setOrganizationId] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [reloadToken,setReloadToken] = useState(0);
  const initUserRef=useRef<string|null>(null);
  const isLogin = pathname === "/pvos/login";
  function redirectAfterLogin(){
    const raw=new URLSearchParams(window.location.search).get("next")||"";
    // Accept only internal PVOS links, never an external redirect.
    if(!raw.startsWith("/pvos/")||raw.startsWith("//")||raw.startsWith("/pvos/login")||raw.includes("\\"))
      return "/pvos/dashboard";
    // Some client redirects preserve an existing URL hash: accept one fragment only.
    const [path, ...fragments]=raw.split("#");
    return path+(fragments.length?"#"+fragments[0]:"");
  }
  function goAfterLogin(){
    const destination=redirectAfterLogin();
    // Native replacement avoids the client router appending the old fragment.
    if(destination.includes("#"))window.location.replace(destination);
    else router.replace(destination);
  }

  async function initialize(nextSession:Session|null) {
    setSession(nextSession);
    setError(null);

    if (!nextSession) {
      if(initUserRef.current)clearPVOSCache();
      initUserRef.current=null;
      setOrganizationId(null);
      setLoading(false);
      if (!isLogin) {
        // Every authenticated PVOS screen can be linked from an email or the
        // notification bell. Preserve the whole internal destination, including
        // filters and a task's #task-review/#evidence tab, across sign-in.
        const fragment=window.location.hash
          ?"#"+window.location.hash.slice(1).split("#")[0]
          :"";
        const deepLink=pathname.startsWith("/pvos/")
          ?pathname+window.location.search+fragment
          :"";
        const loginUrl=deepLink
          ?"/pvos/login?next="+encodeURIComponent(deepLink)
          :"/pvos/login";
        // Don't copy the fragment twice when redirecting an unauthenticated visitor.
        if(fragment)window.location.replace(loginUrl);
        else router.replace(loginUrl);
      }
      return;
    }

    if(initUserRef.current===nextSession.user.id){
      // A second auth callback can arrive while the first workspace bootstrap is
      // still in flight. Do not seed the same fresh organization twice.
      if(organizationId){
        // Materialize obligations once during bootstrap; navigating between
        // sections must not trigger another write RPC and loading sequence.
        setLoading(false);
        if(isLogin) goAfterLogin();
      }
      return;
    }

    initUserRef.current=nextSession.user.id;
    setLoading(true);
    const { data: orgId, error: bootstrapError } = await pvosSupabase.rpc("pvos_bootstrap_workspace", { workspace_name:"PVOS Demo Workspace" });
    if (bootstrapError || !orgId) {
      initUserRef.current=null;
      setError(bootstrapError?.message ?? "Could not initialize PVOS workspace.");
      setLoading(false);
      return;
    }

    try {
      await ensureDemoWorkspace(pvosSupabase, orgId as string, nextSession.user.id);
      await pvosSupabase.rpc("pvos_materialize_due_obligations",{horizon_days:30});
      setOrganizationId(orgId as string);
      setLoading(false);
      if(isLogin) goAfterLogin();
    } catch (e:any) {
      initUserRef.current=null;
      setError(e?.message ?? "Could not prepare demo workspace.");
      setLoading(false);
    }
  }

  useEffect(()=>{
    let active = true;
    pvosSupabase.auth.getSession().then(({data})=>{ if(active) initialize(data.session); });
    const { data:{subscription} } = pvosSupabase.auth.onAuthStateChange((event,nextSession)=>{
      if(!active || event==="INITIAL_SESSION") return;
      initialize(nextSession);
    });
    return ()=>{ active=false; subscription.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pathname]);

  const value = useMemo(()=>({
    session, organizationId, loading, error, reloadToken,
    refresh:()=>{invalidatePVOSCache();setReloadToken(v=>v+1);}
  }),[session,organizationId,loading,error,reloadToken]);

  return <PVOSContext.Provider value={value}>{children}</PVOSContext.Provider>;
}

export function usePVOS() {
  const ctx = useContext(PVOSContext);
  if (!ctx) throw new Error("usePVOS must be used inside PVOSProvider");
  return ctx;
}
