"use client";

import Link from "next/link";
import ScientificAdminGate from "@/components/admin/ScientificAdminGate";
import { scientificAdminLogout } from "@/lib/scientific-admin-auth";

function Wordmark(){return <><span>Lab</span>Narrative</>}

export default function ScientificAdminHome(){
  return <ScientificAdminGate>
    <main style={{minHeight:"100vh",background:"#0d171e",color:"#f2f6f4",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <div style={{width:"min(1180px,calc(100% - 42px))",margin:"0 auto"}}>
        <header style={{minHeight:76,display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #213640"}}>
          <Link href="/admin" style={{color:"#f2f6f4",textDecoration:"none",fontSize:19,fontWeight:850,letterSpacing:"-.05em"}}><span style={{color:"#73c9aa"}}>Lab</span>Narrative</Link>
          <span style={{color:"#708681",fontSize:10,fontWeight:900,letterSpacing:".16em"}}>SCIENTIFIC ADMIN</span>
          <button onClick={()=>void scientificAdminLogout().then(()=>window.location.replace("/admin/login"))} style={{marginLeft:"auto",border:"1px solid #29404b",borderRadius:9,background:"#101d25",color:"#aebfbb",padding:"9px 12px",fontWeight:800,cursor:"pointer"}}>Sign out</button>
        </header>

        <section style={{padding:"72px 0 48px"}}>
          <p style={{margin:0,color:"#73c9aa",fontSize:10,fontWeight:900,letterSpacing:".18em",textTransform:"uppercase"}}>LabNarrative Scientific</p>
          <h1 style={{maxWidth:860,margin:"18px 0 0",fontSize:"clamp(3.2rem,7vw,6.2rem)",lineHeight:.92,letterSpacing:"-.065em"}}>Scientific websites,<br/><em style={{fontFamily:"Georgia,serif",fontWeight:400,color:"#73c9aa"}}>new operating system.</em></h1>
          <p style={{maxWidth:700,margin:"24px 0 0",color:"#98aaa8",fontSize:15,lineHeight:1.7}}>This admin is dedicated to the revived scientific website business on labnarrative.site. The retired .com Websites admin is no longer used for this workflow.</p>
        </section>

        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,padding:"14px 0 80px"}}>
          <Link href="/admin/lead-radar" style={{display:"block",minHeight:260,padding:28,border:"1px solid #315047",borderRadius:16,background:"linear-gradient(145deg,#152730,#13242d)",color:"#f2f6f4",textDecoration:"none"}}>
            <span style={{color:"#73c9aa",fontSize:10,fontWeight:900,letterSpacing:".15em"}}>01 · ACQUISITION</span>
            <h2 style={{margin:"34px 0 0",fontSize:34,letterSpacing:"-.05em"}}>Lead Radar</h2>
            <p style={{margin:"13px 0 0",color:"#98aaa8",lineHeight:1.65,fontSize:13}}>Recent funding triggers → automatic scoring → website/contact enrichment → selective outreach.</p>
            <strong style={{display:"block",marginTop:28,color:"#b7dfd1",fontSize:13}}>Open Lead Radar →</strong>
          </Link>

          <Link href="/proposal/a660d7d9-8c6c-4813-b21c-e72ac2fa14e3" style={{display:"block",minHeight:260,padding:28,border:"1px solid #29404b",borderRadius:16,background:"#101d25",color:"#f2f6f4",textDecoration:"none"}}>
            <span style={{color:"#708681",fontSize:10,fontWeight:900,letterSpacing:".15em"}}>02 · FIRST CLIENT</span>
            <h2 style={{margin:"34px 0 0",fontSize:34,letterSpacing:"-.05em"}}>Bourdon</h2>
            <p style={{margin:"13px 0 0",color:"#98aaa8",lineHeight:1.65,fontSize:13}}>Proposal, PayPal, onboarding and delivery workflow for the first revived scientific website client.</p>
            <strong style={{display:"block",marginTop:28,color:"#b7c8c3",fontSize:13}}>Open proposal →</strong>
          </Link>
        </section>
      </div>
    </main>
  </ScientificAdminGate>;
}
