import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderHandoverPDF } from "../../_pdf";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:"Invalid handover ID"},{status:400});
  const authorization=req.headers.get("authorization")??"";
  if(!authorization.startsWith("Bearer "))return NextResponse.json({error:"Sign in to download evidence"},{status:401});
  const db=createClient(process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL??"https://kvhmxjfenjtzfavyhnvb.supabase.co",
    process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY??"sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D",
    {global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:user,error:authError}=await db.auth.getUser(authorization.slice(7));
  if(authError||!user.user)return NextResponse.json({error:"Session expired; sign in again"},{status:401});
  // Caller-scoped client: RLS, not a service-role credential, controls tenant access.
  const {data:evidence,error}=await db.from("pvos_handover_evidence").select("*").eq("handover_id",id).maybeSingle();
  if(error)return NextResponse.json({error:"Could not read handover evidence"},{status:500});
  if(!evidence)return NextResponse.json({error:"Evidence unavailable: all company acknowledgements are required"},{status:404});
  try{
    const pdf=await renderHandoverPDF(evidence);
    return new NextResponse(Buffer.from(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="PVOS-handover-${id}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-PVOS-Snapshot-SHA256":evidence.snapshot_sha256}});
  }catch(error){
    console.error("Handover PDF render failed",error);
    return NextResponse.json({error:"Acknowledgement evidence is preserved, but PDF generation failed. Please retry the download."},{status:500});
  }
}
