"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SystemsDiscoveryLauncher(){
  const pathname=usePathname();
  if(!pathname.startsWith("/admin/systems-outreach")||pathname.startsWith("/admin/systems-outreach/discovery"))return null;
  return <Link href="/admin/systems-outreach/discovery" style={{position:"fixed",right:22,bottom:22,zIndex:80,display:"inline-flex",alignItems:"center",gap:8,padding:"11px 14px",borderRadius:999,border:"1px solid #35c7c1",background:"#10212b",color:"#f2f6f7",textDecoration:"none",fontSize:12,fontWeight:800,boxShadow:"0 12px 34px rgba(0,0,0,.3)"}}><span style={{color:"#aee94e"}}>◆</span> Discovery Workspace</Link>;
}
