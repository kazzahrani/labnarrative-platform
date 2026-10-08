import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.110.8";
import {collectFeed,sha256} from "./_feeds.ts";
Deno.serve(async(req)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const valid=await client.rpc("pvos_validate_authority_cron_secret",{p_token:req.headers.get("x-pvos-cron-secret")||""});
 if(valid.error||valid.data!==true)return new Response("Unauthorized",{status:401});
 const body=await req.json().catch(()=>({}));
 const sourceRows:any[]=[];for(let from=0;;from+=500){const q=await client.from("pvos_authority_sources").select("*").eq("active",true).neq("method","manual").order("id").range(from,from+499);if(q.error)return Response.json({error:q.error.message},{status:500});sourceRows.push(...q.data);if(q.data.length<500)break;}
 const cache=new Map<string,Promise<any>>(),results:any[]=[];
 // Two verified feed URLs only. Never fetch user-supplied manual authority URLs.
 for(const source of sourceRows){
  const started=new Date().toISOString();let result:any;
  try{
   let promise=cache.get(source.source_key);if(!promise){promise=collectFeed(source);cache.set(source.source_key,promise);}
   result=await promise;
   if(body.diagnostic===true){results.push({source_id:source.id,name:source.name,status:"ok",entry_count:result.entry_count,oldest_published_at:result.oldest_published_at,newest_published_at:result.newest_published_at});continue;}
   const notices=[];for(const notice of result.notices)notices.push({...notice,content_sha256:await sha256(JSON.stringify(notice))});
   const saved=await client.rpc("pvos_register_authority_collection",{p_source_id:source.id,p_started_at:started,p_http_status:result.http_status,p_feed_sha256:result.feed_sha256,p_notices:notices});if(saved.error)throw saved.error;
   results.push({source_id:source.id,name:source.name,status:"ok",entries:saved.data.entry_count,new_versions:saved.data.new_count,baseline:saved.data.baseline});
  }catch(e:any){
   const error=String(e?.message||e).slice(0,2000);
   if(body.diagnostic!==true){const saved=await client.from("pvos_authority_collection_runs").insert({organization_id:source.organization_id,source_id:source.id,started_at:started,completed_at:new Date().toISOString(),status:"error",error});if(saved.error)return Response.json({error:"Could not record collection failure",details:saved.error.message},{status:500});}
   results.push({source_id:source.id,name:source.name,status:"error",error});
  }
 }
 if(body.diagnostic!==true){const created=await client.rpc("pvos_materialize_authority_periods");if(created.error)return Response.json({error:created.error.message,results},{status:500});}
 return Response.json({diagnostic:body.diagnostic===true,checked_at:new Date().toISOString(),cadence_hours:4,results,scope:"Published MHRA Drug Safety Update and FDA MedWatch feeds only; human source checks remain required"});
});
