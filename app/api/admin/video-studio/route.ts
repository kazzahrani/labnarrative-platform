import {adminApiError,requireAdminApi} from "@/lib/admin-api";
import {getPublicLeagueBot,getPublicLeagueDiscovery} from "@/lib/video-studio-league";
import {buildVideoStudioCopy,pollVideoWorkerJob,submitVideoWorkerJob,videoRendererConfigured,VIDEO_STUDIO_VOICES,type VideoStudioLanguage,type VideoStudioType} from "@/lib/video-studio";

export const dynamic="force-dynamic";
export const maxDuration=30;
const DURATIONS=new Set([15,30,45,60]);
const TYPES=new Set<VideoStudioType>(["performance_story","strategy_explainer","educational"]);
const LANGUAGES=new Set<VideoStudioLanguage>(["en","ar"]);
const VOICES=new Set<string>([VIDEO_STUDIO_VOICES.en.male,VIDEO_STUDIO_VOICES.en.female,VIDEO_STUDIO_VOICES.ar.male,VIDEO_STUDIO_VOICES.ar.female]);
const SELECT="id,created_by,league_entry_id,league_slug,bot_name,bot_snapshot,language,duration_seconds,video_type,voice_name,script,caption,status,worker_task_id,worker_progress,worker_state,output_url,error,approved_at,approved_by,created_at,updated_at";
function cleanError(value:unknown){const message=value instanceof Error?value.message:String(value||"Video renderer request failed.");return message.slice(0,1500)}

export async function GET(request:Request){
 try{
  const{db,token}=await requireAdminApi(request);
  const[{bots},jobsResult,configured]=await Promise.all([
   getPublicLeagueDiscovery(),
   db.from("internal_video_jobs").select(SELECT).order("created_at",{ascending:false}).limit(40),
   videoRendererConfigured(token),
  ]);
  if(jobsResult.error)throw jobsResult.error;
  return Response.json({ok:true,renderer:{configured},bots,jobs:jobsResult.data||[]});
 }catch(error){return adminApiError(error)}
}

export async function POST(request:Request){
 try{
  const{db,user,token}=await requireAdminApi(request);
  const body=await request.json() as{entryId?:string;language?:VideoStudioLanguage;durationSeconds?:number;videoType?:VideoStudioType;voiceName?:string};
  const entryId=String(body.entryId||"").trim(),language=body.language||"en",durationSeconds=Number(body.durationSeconds||30),videoType=body.videoType||"performance_story",voiceName=String(body.voiceName||VIDEO_STUDIO_VOICES[language]?.male||"").trim();
  if(!entryId)return Response.json({error:"Choose a League bot first."},{status:400});
  if(!LANGUAGES.has(language)||!DURATIONS.has(durationSeconds)||!TYPES.has(videoType)||!VOICES.has(voiceName))return Response.json({error:"Unsupported video configuration."},{status:400});
  const bot=await getPublicLeagueBot(entryId);
  if(!bot)return Response.json({error:"That public League bot could not be loaded."},{status:404});
  const copy=buildVideoStudioCopy(bot,language,durationSeconds,videoType);
  const snapshot={id:bot.id,slug:bot.slug,name:bot.name,creator:bot.creator,pair:bot.pair,status:bot.status,versionNumber:bot.versionNumber,totalReturn:bot.totalReturn,maxDrawdown:bot.maxDrawdown,winRate:bot.winRate,closedTrades:bot.closedTrades,ageDays:bot.ageDays,apy:bot.apy,benchmark:bot.benchmark,ethBenchmark:bot.ethBenchmark,publishedAt:bot.publishedAt};
  const{data:inserted,error:insertError}=await db.from("internal_video_jobs").insert({created_by:user.id,league_entry_id:bot.id,league_slug:bot.slug,bot_name:bot.name,bot_snapshot:snapshot,language,duration_seconds:durationSeconds,video_type:videoType,voice_name:voiceName,script:copy.script,caption:copy.caption,status:"draft"}).select(SELECT).single();
  if(insertError)throw insertError;
  const configured=await videoRendererConfigured(token);
  if(!configured)return Response.json({ok:true,renderer:{configured:false},job:inserted,message:"Video brief created. Renderer is not configured."});
  try{
   const worker=await submitVideoWorkerJob(token,{subject:copy.subject,script:copy.script,language,voiceName});
   const{data:queued,error:updateError}=await db.from("internal_video_jobs").update({status:"queued",worker_task_id:worker.taskId,worker_progress:0,worker_state:worker.raw,error:null,updated_at:new Date().toISOString()}).eq("id",inserted.id).select(SELECT).single();
   if(updateError)throw updateError;
   return Response.json({ok:true,renderer:{configured:true},job:queued});
  }catch(workerError){
   const message=cleanError(workerError);
   const{data:failed}=await db.from("internal_video_jobs").update({status:"failed",error:message,updated_at:new Date().toISOString()}).eq("id",inserted.id).select(SELECT).single();
   return Response.json({ok:false,renderer:{configured:true},job:failed||inserted,error:message},{status:502});
  }
 }catch(error){return adminApiError(error)}
}

export async function PATCH(request:Request){
 try{
  const{db,user,token}=await requireAdminApi(request);
  const body=await request.json() as{id?:string;action?:"refresh"|"approve"};
  const id=String(body.id||"").trim();
  if(!id)return Response.json({error:"Job id is required."},{status:400});
  const{data:job,error:fetchError}=await db.from("internal_video_jobs").select(SELECT).eq("id",id).maybeSingle();
  if(fetchError)throw fetchError;
  if(!job)return Response.json({error:"Video job not found."},{status:404});
  if(body.action==="approve"){
   if(job.status!=="completed"||!job.output_url)return Response.json({error:"Only a completed video can be approved."},{status:409});
   const now=new Date().toISOString();
   const{data,error}=await db.from("internal_video_jobs").update({status:"approved",approved_at:now,approved_by:user.id,updated_at:now}).eq("id",id).select(SELECT).single();
   if(error)throw error;
   return Response.json({ok:true,job:data});
  }
  if(body.action!=="refresh")return Response.json({error:"Unsupported job action."},{status:400});
  if(!job.worker_task_id)return Response.json({error:"This brief has not been submitted to a renderer."},{status:409});
  try{
   const worker=await pollVideoWorkerJob(token,job.worker_task_id),now=new Date().toISOString();
   const patch:Record<string,unknown>={worker_progress:worker.progress,worker_state:worker.raw,updated_at:now};
   if(worker.state===1){patch.status=worker.outputUrl?"completed":"processing";patch.output_url=worker.outputUrl||null;patch.error=null}
   else if(worker.state===-1){patch.status="failed";patch.error=(worker.error||`Renderer failed during ${worker.failedStage||"generation"}.`).slice(0,1500)}
   else{patch.status="processing";patch.error=null}
   const{data,error}=await db.from("internal_video_jobs").update(patch).eq("id",id).select(SELECT).single();
   if(error)throw error;
   return Response.json({ok:true,job:data});
  }catch(workerError){return Response.json({error:cleanError(workerError),job},{status:502})}
 }catch(error){return adminApiError(error)}
}
