"use client";

import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/systems", label: "Systems Home", short: "Home" },
  { href: "/admin/systems/acquire", label: "Acquisition", short: "Acquire" },
  { href: "/admin/systems-outreach/discovery", label: "Discovery", short: "Discover" },
  { href: "/admin/systems-outreach/discovery/demo-v2", label: "Demo V2", short: "Demo V2" },
  { href: "/admin/systems-outreach/discovery/pilot", label: "Pilot Proposal", short: "Pilot" },
  { href: "/admin/systems-outreach/delivery", label: "Pilot Delivery", short: "Deliver" },
  { href: "/admin/systems-outreach/conversion", label: "Full-System Conversion", short: "Convert" },
  { href: "/admin/systems-outreach/discovery/commercial", label: "Pricing", short: "Pricing" },
  { href: "/admin/systems-outreach/discovery/group", label: "Group Architecture", short: "Group" },
];

function active(pathname: string, href: string) {
  if (href === "/admin/systems") return pathname === href;
  if (href === "/admin/systems/acquire") return pathname === href || pathname === "/admin/systems-outreach";
  return pathname.startsWith(href);
}

export default function SystemsPlatformNav() {
  const pathname = usePathname();
  const isSystems = pathname.startsWith("/admin/systems") || pathname.startsWith("/admin/systems-outreach");
  if (!isSystems) return null;

  return (
    <nav aria-label="LabNarrative Systems" style={{position:"sticky",top:0,zIndex:2147483647,display:"flex",alignItems:"center",gap:8,padding:"9px 14px",background:"#07131b",borderBottom:"1px solid rgba(75,118,132,.38)",overflowX:"auto",boxShadow:"0 8px 28px rgba(0,0,0,.22)",pointerEvents:"auto",isolation:"isolate"}}>
      <a href="/admin/systems" style={{display:"inline-flex",alignItems:"center",gap:7,color:"#f3f8f9",textDecoration:"none",fontWeight:900,fontSize:13,whiteSpace:"nowrap",marginRight:6,pointerEvents:"auto",position:"relative",zIndex:2147483647}}><span style={{color:"#35c7c1"}}>Lab</span>Narrative <b style={{color:"#aee94e",fontSize:9,letterSpacing:".12em"}}>SYSTEMS</b></a>
      {items.map((item) => {
        const isActive = active(pathname, item.href);
        return <a key={item.href} href={item.href} title={item.label} aria-label={`Open ${item.label}`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap",textDecoration:"none",borderRadius:999,padding:"8px 11px",fontSize:10,fontWeight:800,border:isActive?"1px solid #35c7c1":"1px solid #243f49",background:isActive?"#12343e":"#0b1c24",color:isActive?"#f4fbfb":"#96aeb7",cursor:"pointer",pointerEvents:"auto",position:"relative",zIndex:2147483647}}>{item.short}</a>;
      })}
    </nav>
  );
}
