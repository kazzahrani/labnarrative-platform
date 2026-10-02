"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { pvosSupabase } from "./_pvos-supabase";
import { ensureDemoWorkspace } from "./_seed";

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
  const isLogin = pathname === "/pvos/login";

  async function initialize(nextSession:Session|null) {
    setSession(nextSession);
    setError(null);
    if (!nextSession) {
      setOrganizationId(null);
      setLoading(false);
      if (!isLogin) router.replace("/pvos/login");
      return;
    }

    setLoading(true);
    const { data: orgId, error: bootstrapError } = await pvosSupabase.rpc("pvos_bootstrap_workspace", { workspace_name:"PVOS Demo Workspace" });
    if (bootstrapError || !orgId) {
      setError(bootstrapError?.message ?? "Could not initialize PVOS workspace.");
      setLoading(false);
      return;
    }

    try {
      await ensureDemoWorkspace(pvosSupabase, orgId as string, nextSession.user.id);
      setOrganizationId(orgId as string);
      setLoading(false);
      if (isLogin) router.replace("/pvos/dashboard");
    } catch (e:any) {
      setError(e?.message ?? "Could not prepare demo workspace.");
      setLoading(false);
    }
  }

  useEffect(()=>{
    let active = true;
    pvosSupabase.auth.getSession().then(({data})=>{ if(active) initialize(data.session); });
    const { data:{subscription} } = pvosSupabase.auth.onAuthStateChange((_event,nextSession)=>{
      if(active) initialize(nextSession);
    });
    return ()=>{ active=false; subscription.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pathname]);

  const value = useMemo(()=>({
    session, organizationId, loading, error, reloadToken,
    refresh:()=>setReloadToken(v=>v+1)
  }),[session,organizationId,loading,error,reloadToken]);

  return <PVOSContext.Provider value={value}>{children}</PVOSContext.Provider>;
}

export function usePVOS() {
  const ctx = useContext(PVOSContext);
  if (!ctx) throw new Error("usePVOS must be used inside PVOSProvider");
  return ctx;
}
