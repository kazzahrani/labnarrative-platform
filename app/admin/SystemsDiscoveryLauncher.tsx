"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SystemsDiscoveryLauncher(){
  const pathname=usePathname();
  if(!pathname.startsWith("/admin/systems-outreach"))return null;
  const isConversion=pathname.startsWith("/admin/systems-outreach/conversion");
  const isDelivery=pathname.startsWith("/admin/systems-outreach/delivery");
  const isGroup=pathname.startsWith("/admin/systems-outreach/discovery/group");
  const isCommercial=pathname.startsWith("/admin/systems-outreach/discovery/commercial");
  const isPilot=pathname.startsWith("/admin/systems-outreach/discovery/pilot");
  const isBuilder=pathname.startsWith("/admin/systems-outreach/discovery/demo-v2");
  const isDiscovery=pathname.startsWith("/admin/systems-outreach/discovery");
  const href=isConversion?"/admin/systems-outreach/discovery":isDelivery?"/admin/systems-outreach/conversion":isGroup?"/admin/systems-outreach/delivery":isCommercial?"/admin/systems-outreach/discovery/group":isPilot?"/admin/systems-outreach/discovery/commercial":isBuilder?"/admin/systems-outreach/discovery/pilot":isDiscovery?"/admin/systems-outreach/discovery/demo-v2":"/admin/systems-outreach/discovery";
  const label=isConversion?"Discovery Workspace":isDelivery?"Full-System Conversion":isGroup?"Pilot Delivery":isCommercial?"Group Architecture":isPilot?"Pricing Architecture":isBuilder?"Pilot Proposal Builder":isDiscovery?"Demo V2 Builder":"Discovery Workspace";
  const icon=isDelivery?"↗":isGroup?"✓":isCommercial?"▦":isPilot?"◇":isBuilder?"▤":isDiscovery&&!isConversion?"✦":"◆";
  return <Link href={href} style={{position:"fixed",right:22,bottom:22,zIndex:80,display:"inline-flex",alignItems:"center",gap:8,padding:"11px 14px",borderRadius:999,border:"1px solid #35c7c1",background:"#10212b",color:"#f2f6f7",textDecoration:"none",fontSize:12,fontWeight:800,boxShadow:"0 12px 34px rgba(0,0,0,.3)"}}><span style={{color:"#aee94e"}}>{icon}</span> {label}</Link>;
}
