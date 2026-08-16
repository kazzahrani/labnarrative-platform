import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const WORKSPACE_URL="https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/intelligence-workspace";
function text(v:unknown,max=4000){return typeof v==="string"?v.trim().slice(0,max):""}
function serviceKey(){try{const m=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}") as Record<string,string>;if(m.default)return m.default}catch{}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
function allowed(origin:string|null){if(!origin)return "*";try{const u=new URL(origin);if(u.protocol==="https:"&&(u.hostname==="labnarrative.com"||u.hostname==="www.labnarrative.com"||/^labnarrative-platform(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(u.hostname)))return origin;if(u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname))return origin}catch{}return ""}
function headers(origin:string|null){const a=allowed(origin);return {...(a?{"access-control-allow-origin":a}:{}),"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type, authorization","content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"}}
function response(body:unknown,status=200,origin:string|null=null){return new Response(JSON.stringify(body),{status,headers:headers(origin)})}
function initials(name:string,email:string){const p=name.split(/\s+/).filter(Boolean);if(p.length>=2)return(p[0][0]+p[p.length-1][0]).toUpperCase();if(p[0])return p[0].slice(0,2).toUpperCase();return email.slice(0,2).toUpperCase()}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");if(origin&&!allowed(origin))return response({error:"origin_not_allowed"},403,origin);if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});if(req.method!=="POST")return response({error:"method_not_allowed"},405,origin);
 const base=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();if(!base||!key)return response({error:"portal_backend_not_configured"},500,origin);const admin=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!bearer)return response({error:"authentication_required"},401,origin);const got=await admin.auth.getUser(bearer);if(got.error||!got.data.user)return response({error:"invalid_session"},401,origin);const user=got.data.user;
 const body=await req.json().catch(()=>({})) as J;const action=text(body.action,40)||"load";
 const members=await admin.from("intelligence_client_workspace_members").select("workspace_id,role,created_at").eq("user_id",user.id).order("created_at",{ascending:false});if(members.error)return response({error:members.error.message},500,origin);if(!members.data?.length)return response({error:"No paid Intelligence workspace is linked to this account."},403,origin);
 const ids=members.data.map((m:any)=>m.workspace_id);const workspaces=await admin.from("intelligence_client_workspaces").select("id,purchase_id,access_token,company_name,company_website,onboarding_status,portal_activated_at,created_at").in("id",ids);if(workspaces.error)return response({error:workspaces.error.message},500,origin);
 const workspaceById=new Map((workspaces.data||[]).map((w:any)=>[w.id,w]));const requested=text(body.workspaceId,100);const selected=(requested&&ids.includes(requested)?workspaceById.get(requested):workspaceById.get(ids[0])) as any;if(!selected)return response({error:"workspace_not_found"},404,origin);
 async function workspaceCall(innerAction:string,extra:J={}){const r=await fetch(WORKSPACE_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:innerAction,token:selected.access_token,...extra}),cache:"no-store"});const p=await r.json().catch(()=>({})) as any;if(!r.ok)throw new Error(String(p.error||"Workspace request failed."));return p}
 async function envelope(core:any){
   const profileResult=await admin.from("intelligence_client_profiles").select("*").eq("user_id",user.id).maybeSingle();const profile=profileResult.data||{user_id:user.id,email:user.email||"",full_name:user.user_metadata?.full_name||"",company_name:core.workspace?.companyName||"",company_website:core.workspace?.companyWebsite||"",avatar_initials:initials(String(user.user_metadata?.full_name||""),String(user.email||""))};
   const purchaseIds=(workspaces.data||[]).map((w:any)=>w.purchase_id);const purchases=purchaseIds.length?await admin.from("intelligence_package_purchases").select("id,package_name,product_count,amount,currency,status,paid_at").in("id",purchaseIds):{data:[]};const purchaseMap=new Map((purchases.data||[]).map((p:any)=>[p.id,p]));
   const options=(workspaces.data||[]).map((w:any)=>{const p:any=purchaseMap.get(w.purchase_id)||{};return{workspaceId:w.id,packageName:p.package_name||"Intelligence",productCount:Number(p.product_count||0),amount:Number(p.amount||0),currency:p.currency||"USD",paidAt:p.paid_at||null,status:w.onboarding_status,companyName:w.company_name||""}});
   await admin.from("intelligence_client_workspaces").update({portal_last_login_at:new Date().toISOString()}).eq("id",selected.id);
   return {...core,profile:{email:profile.email||user.email||"",fullName:profile.full_name||"",companyName:profile.company_name||"",companyWebsite:profile.company_website||"",avatarInitials:profile.avatar_initials||initials(profile.full_name||"",profile.email||"")},workspaceOptions:options,activeWorkspaceId:selected.id};
 }
 try{
   if(action==="load")return response(await envelope(await workspaceCall("load")),200,origin);
   if(action==="save"||action==="submit_product"){
     const extra={companyName:text(body.companyName,300),companyWebsite:text(body.companyWebsite,1200),contactName:text(body.contactName,300),contactEmail:text(body.contactEmail,320),targetGeography:text(body.targetGeography,500),clientNotes:text(body.clientNotes,4000),products:Array.isArray(body.products)?body.products:[],...(action==="submit_product"?{position:Number(body.position)}:{})};
     const core=await workspaceCall(action,extra);return response(await envelope(core),200,origin)
   }
   if(action==="update_profile"){
     const fullName=text(body.fullName,300),companyName=text(body.companyName,300),companyWebsite=text(body.companyWebsite,1200),email=String(user.email||"").toLowerCase();
     const saved=await admin.from("intelligence_client_profiles").upsert({user_id:user.id,email,full_name:fullName||null,company_name:companyName||null,company_website:companyWebsite||null,avatar_initials:initials(fullName,email),updated_at:new Date().toISOString()},{onConflict:"user_id"});if(saved.error)throw new Error(saved.error.message);
     await admin.from("intelligence_client_workspaces").update({company_name:companyName||null,company_website:companyWebsite||null,contact_name:fullName||null,updated_at:new Date().toISOString()}).in("id",ids);
     return response(await envelope(await workspaceCall("load")),200,origin)
   }
   return response({error:"unknown_action"},400,origin)
 }catch(e){console.error(e);return response({error:e instanceof Error?e.message:"portal_request_failed"},500,origin)}
});
