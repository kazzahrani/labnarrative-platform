import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

// All sends are server-side. A browser never receives Resend or service-role secrets.
// Without configured credentials, notices stay queued and are visible in PVOS.
export const dynamic="force-dynamic";
const URL=process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL||"https://kvhmxjfenjtzfavyhnvb.supabase.co";
const ANON=process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";
type Notice={id:string;invoice_id:string;recipient_email:string;event_type:string;company_name:string;created_at:string};
const topics:Record<string,string>={
 head_review:"An invoice needs your Head approval",
 finance_review:"An invoice needs Finance approval",
 awaiting_payment:"An approved invoice awaits payment execution",
 returned_head:"An invoice was returned by the Department Head",
 returned_finance:"An invoice was returned by Finance",
 paid:"Finance confirmed payment completion"
};
function serverConfig(){
 const serviceKey=process.env.PVOS_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 const resendKey=process.env.RESEND_API_KEY;
 const sender=process.env.PVOS_MAIL_FROM;
 return serviceKey&&resendKey&&sender?{serviceKey,resendKey,sender}:null;
}
async function deliver(invoiceId:string|null){
 const cfg=serverConfig();
 if(!cfg)return NextResponse.json({configured:false,queued:true,reason:"Mail transport not configured"}, {status:202});
 const supabase=createClient(URL,cfg.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await supabase.rpc("pvos_invoice_mail_claim",{p_invoice_id:invoiceId,p_limit:15});
 if(error)return NextResponse.json({error:"Notification queue could not be read"}, {status:500});
 const batch=(data||[]) as Notice[];
 let sent=0;let failed=0;
 for(const n of batch){
  let success=false;let providerId:string|null=null;let failReason="";
  try{
   const subject=topics[n.event_type]||"A PVOS invoice workflow has an update";
   const url="https://pvos.site/pvos/invoices?invoice="+encodeURIComponent(n.invoice_id);
   const body="PVOS Invoice Processing\n\n"+subject+"\nCompany: "+n.company_name+
      "\n\nSign in to review the current status or take action:\n"+url+
      "\n\nThis is an automated notification. No patient information or invoice attachment is included.\n";
   const response=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{"Authorization":"Bearer "+cfg.resendKey,"Content-Type":"application/json","Idempotency-Key":n.id},
    body:JSON.stringify({from:cfg.sender,to:[n.recipient_email],subject:"PVOS · "+subject,text:body}),
    signal:AbortSignal.timeout(15000)
   });
   const payload=await response.json().catch(()=>({}));
   if(response.ok&&payload.id){success=true;providerId=String(payload.id);sent++;}
   else{failReason="Provider returned HTTP "+response.status;failed++;}
  }catch{failReason="Email provider could not be reached";failed++;}
  const {error:finishError}=await supabase.rpc("pvos_invoice_mail_finish",{
   p_notice_id:n.id,p_success:success,p_provider_id:providerId,p_error:success?null:failReason
  });
  if(finishError)return NextResponse.json({error:"Notification delivery state could not be recorded",sent,failed},{status:500});
 }
 return NextResponse.json({configured:true,attempted:batch.length,sent,failed});
}
export async function POST(request:NextRequest){
 const auth=request.headers.get("authorization")||"";
 const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
 let invoiceId="";
 try{
  const body=await request.json();
  invoiceId=typeof body?.invoice_id==="string"?body.invoice_id:"";
 }catch{return NextResponse.json({error:"Invalid request"},{status:400});}
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(invoiceId))
   return NextResponse.json({error:"Invalid invoice id"},{status:400});
 const sessionClient=createClient(URL,ANON,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:user,error:authError}=await sessionClient.auth.getUser(token);
 if(authError||!user.user)return NextResponse.json({error:"Not signed in"},{status:401});
 const {error:scopeError}=await sessionClient.rpc("pvos_invoice_detail",{p_invoice_id:invoiceId});
 if(scopeError)return NextResponse.json({error:"Invoice not accessible"},{status:403});
 return deliver(invoiceId);
}
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!=="Bearer "+secret)
  return NextResponse.json({error:"Not authorized"},{status:401});
 return deliver(null);
}
