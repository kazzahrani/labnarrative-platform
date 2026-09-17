"use client";

import { usePathname } from "next/navigation";

export default function TraderCreatorAffiliateLink(){
 const pathname=usePathname();
 if(pathname!=="/trader")return null;
 return <a href="/trader/affiliate" aria-label="Open Creator and Affiliate program" style={{position:"fixed",left:18,bottom:76,zIndex:80,display:"inline-flex",alignItems:"center",gap:8,padding:"9px 12px",border:"1px solid #353b37",borderRadius:12,background:"#202522",color:"#c7d5cc",textDecoration:"none",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",fontSize:9,fontWeight:800,letterSpacing:".02em",boxShadow:"0 8px 26px rgba(0,0,0,.22)"}}><span style={{fontSize:12}}>↗</span><span>Creator + Affiliate</span></a>;
}
