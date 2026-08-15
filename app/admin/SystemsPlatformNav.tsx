"use client";

import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { href: "/admin/systems", label: "Systems Home", short: "Home" },
  { href: "/admin/systems-outreach", label: "Acquisition", short: "Acquire" },
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
  if (href === "/admin/systems-outreach") return pathname === href;
  return pathname.startsWith(href);
}

export default function SystemsPlatformNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSystems = pathname === "/admin/systems" || pathname.startsWith("/admin/systems-outreach");
  if (!isSystems) return null;

  const prospect = searchParams.get("prospect");
  const destination = (href: string) => {
    if (!prospect || href === "/admin/systems") return href;
    return `${href}?prospect=${encodeURIComponent(prospect)}`;
  };
  const go = (href: string) => {
    window.location.assign(destination(href));
  };

  return (
    <nav aria-label="LabNarrative Systems" style={{position:"sticky",top:0,zIndex:100000,display:"flex",alignItems:"center",gap:8,padding:"9px 14px",background:"rgba(7,19,27,.98)",backdropFilter:"blur(16px)",borderBottom:"1px solid rgba(75,118,132,.28)",overflowX:"auto",boxShadow:"0 8px 28px rgba(0,0,0,.18)",pointerEvents:"auto",isolation:"isolate"}}>
      <button type="button" onClick={() => go("/admin/systems")} style={{display:"inline-flex",alignItems:"center",gap:7,color:"#f3f8f9",background:"transparent",border:0,padding:0,cursor:"pointer",fontWeight:900,fontSize:13,whiteSpace:"nowrap",marginRight:6,pointerEvents:"auto"}}><span style={{color:"#35c7c1"}}>Lab</span>Narrative <b style={{color:"#aee94e",fontSize:9,letterSpacing:".12em"}}>SYSTEMS</b></button>
      {items.map((item) => {
        const isActive = active(pathname, item.href);
        return <button type="button" key={item.href} onClick={() => go(item.href)} title={item.label} aria-label={`Open ${item.label}`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap",borderRadius:999,padding:"8px 11px",fontSize:10,fontWeight:800,border:isActive?"1px solid #35c7c1":"1px solid #243f49",background:isActive?"#12343e":"#0b1c24",color:isActive?"#f4fbfb":"#96aeb7",cursor:"pointer",pointerEvents:"auto",position:"relative",zIndex:1}}>{item.short}</button>;
      })}
    </nav>
  );
}
