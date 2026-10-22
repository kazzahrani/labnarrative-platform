import {adminApiError,requireAdminApi} from "@/lib/admin-api";
import {fetchVideoWorkerMedia} from "@/lib/video-studio";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const{db,token}=await requireAdminApi(request);
  const{id}=await context.params;
  const{data:job,error}=await db.from("internal_video_jobs").select("id,status,output_url").eq("id",id).maybeSingle();
  if(error)throw error;
  if(!job?.output_url||!["completed","approved"].includes(job.status))return Response.json({error:"This video is not ready for preview."},{status:409});
  const upstream=await fetchVideoWorkerMedia(token,String(job.output_url));
  if(!upstream.ok){
   const payload=await upstream.json().catch(()=>({}));
   return Response.json({error:String(payload?.error||"Renderer media request failed.")},{status:502});
  }
  const headers=new Headers();
  headers.set("content-type",upstream.headers.get("content-type")||"video/mp4");
  const length=upstream.headers.get("content-length");if(length)headers.set("content-length",length);
  headers.set("cache-control","private, no-store");
  return new Response(upstream.body,{status:200,headers});
 }catch(error){return adminApiError(error)}
}
