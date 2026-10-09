import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {sendPvosSmtpMessage} from "../../invoices/_smtp";

// Reuses PVOS's iCloud STARTTLS SMTP transport. All credentials remain server-side.
export const dynamic="force-dynamic";
export const runtime="nodejs";
const URL=process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL||"https://kvhmxjfenjtzfavyhnvb.supabase.co";
const ANON=process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type MailItem={
 id:string;review_id:string;task_id:string;recipient_email:string;
 event_type:"requested"|"approved"|"returned";company_name:string;task_title:string;
 sent_at:string;decision_at:string|null;
};
const subjects:Record<MailItem["event_type"],string>={
 requested:"A task needs your review",
 approved:"Your task review was approved",
 returned:"Your task review was returned for corrections"
};
function serverClient(){
 const key=process.env.PVOS_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!process.env.PVOS_SMTP_USER||!process.env.PVOS_SMTP_PASSWORD)return null;
 return createClient(URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function deliver(reviewId:string|null){
 const supabase=serverClient();
 if(!supabase)return NextResponse.json({configured:false,queued:true,reason:"Email transport not configured"},{status:202});
 const {data,error}=await supabase.rpc("pvos_task_review_mail_claim",{p_review_id:reviewId,p_limit:12});
 if(error)return NextResponse.json({error:"Could not claim notification queue"},{status:500});
 let sent=0,failed=0;
 const batch=(data||[]) as MailItem[];
 for(const n of batch){
  let successful=false,providerId:string|null=null,reason="";
  try{
   const subject=subjects[n.event_type]||"Task review updated";
   const deepLink="https://pvos.site/pvos/tasks/"+encodeURIComponent(n.task_id)+"#task-review";
   const body="PVOS Task Reviews\n\n"+subject+"\nCompany: "+n.company_name+
     "\n\nOpen the task in PVOS to review the work, evidence and decision:\n"+deepLink+
     "\n\nThis is an automated notification. No patient information or attachments are included.\n";
   providerId=await sendPvosSmtpMessage({to:n.recipient_email,subject:"PVOS · "+subject,body});
   successful=true;sent++;
  }catch{reason="iCloud SMTP send failed";failed++;}
  const {error:finishError}=await supabase.rpc("pvos_task_review_mail_finish",{
   p_notice_id:n.id,p_success:successful,p_provider_id:providerId,p_error:successful?null:reason
  });
  if(finishError)return NextResponse.json({error:"Email state could not be recorded",sent,failed},{status:500});
 }
 return NextResponse.json({configured:true,attempted:batch.length,sent,failed});
}

export async function POST(request:NextRequest){
 const authorization=request.headers.get("authorization")||"";
 const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 if(!token)return NextResponse.json({error:"Authentication required"},{status:401});
 let reviewId="";
 try{
  const body=await request.json();
  reviewId=typeof body?.review_id==="string"?body.review_id:"";
 }catch{return NextResponse.json({error:"Invalid request"},{status:400});}
 if(!uuid.test(reviewId))return NextResponse.json({error:"Invalid review id"},{status:400});
 const client=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userData,error:authError}=await client.auth.getUser(token);
 if(authError||!userData.user)return NextResponse.json({error:"Not signed in"},{status:401});
 const supabase=serverClient();
 if(!supabase)return NextResponse.json({configured:false,queued:true},{status:202});
 const {data:review,error:reviewError}=await supabase.from("pvos_task_reviews")
  .select("id,sent_by,assigned_to").eq("id",reviewId).maybeSingle();
 if(reviewError)return NextResponse.json({error:"Review access could not be verified"},{status:500});
 if(!review||(review.sent_by!==userData.user.id&&review.assigned_to!==userData.user.id))
  return NextResponse.json({error:"Review not accessible"},{status:403});
 return deliver(reviewId);
}

export async function GET(request:NextRequest){
 const cronSecret=process.env.CRON_SECRET;
 if(!cronSecret||request.headers.get("authorization")!=="Bearer "+cronSecret)
  return NextResponse.json({error:"Not authorized"},{status:401});
 return deliver(null);
}
