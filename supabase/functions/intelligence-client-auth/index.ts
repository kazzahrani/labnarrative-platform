import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
function text(v: unknown, max = 2000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function isUuid(v: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
function serviceKey() { try { const m = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string,string>; if (m.default) return m.default; } catch {} return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function allowed(origin:string|null){if(!origin)return "*";try{const u=new URL(origin);if(u.protocol==="https:"&&(u.hostname==="labnarrative.com"||u.hostname==="www.labnarrative.com"||/^labnarrative-platform(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(u.hostname)))return origin;if(u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname))return origin}catch{}return ""}
function headers(origin:string|null){const a=allowed(origin);return {...(a?{"access-control-allow-origin":a}:{}),"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type, authorization","content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"}}
function response(body:unknown,status=200,origin:string|null=null){return new Response(JSON.stringify(body),{status,headers:headers(origin)})}
function initials(name:string,email:string){const parts=name.split(/\s+/).filter(Boolean);if(parts.length>=2)return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();if(parts[0])return parts[0].slice(0,2).toUpperCase();return email.slice(0,2).toUpperCase()}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin"); if(origin&&!allowed(origin)) return response({error:"origin_not_allowed"},403,origin); if(req.method==="OPTIONS") return new Response(null,{status:204,headers:headers(origin)}); if(req.method!=="POST") return response({error:"method_not_allowed"},405,origin);
  const base=Deno.env.get("SUPABASE_URL")||"", key=serviceKey(); if(!base||!key)return response({error:"auth_backend_not_configured"},500,origin);
  const admin=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json().catch(()=>({})) as J; const action=text(body.action,40)||"inspect"; const token=text(body.token,100);

  async function loadInvite(){
    if(!isUuid(token)) throw new Error("invalid_activation_link");
    const w=await admin.from("intelligence_client_workspaces").select("*").eq("access_token",token).maybeSingle(); if(w.error||!w.data) throw new Error("activation_link_not_found");
    const p=await admin.from("intelligence_package_purchases").select("*").eq("id",w.data.purchase_id).maybeSingle(); if(p.error||!p.data||p.data.status!=="paid") throw new Error("paid_purchase_not_found");
    const snap=(p.data.provider_metadata&&typeof p.data.provider_metadata==="object"?(p.data.provider_metadata as any).source_report_snapshot:null)||{};
    return {workspace:w.data,purchase:p.data,snapshot:snap};
  }
  async function findUser(email:string){
    for(let page=1;page<=10;page++){const r=await admin.auth.admin.listUsers({page,perPage:200});if(r.error)throw r.error;const found=r.data.users.find(u=>String(u.email||"").toLowerCase()===email.toLowerCase());if(found)return found;if(r.data.users.length<200)break}return null;
  }
  async function linkUser(user:any, invite:any, fullName:string){
    const email=String(user.email||invite.purchase.payer_email||invite.workspace.contact_email||"").toLowerCase();
    const companyName=invite.workspace.company_name||invite.snapshot.companyName||invite.snapshot.company_name||null;
    const companyWebsite=invite.workspace.company_website||invite.snapshot.companyWebsite||invite.snapshot.company_website||null;
    const name=fullName||invite.workspace.contact_name||invite.purchase.payer_name||String(user.user_metadata?.full_name||"")||email.split("@")[0];
    await admin.from("intelligence_client_profiles").upsert({user_id:user.id,email,full_name:name,company_name:companyName,company_website:companyWebsite,avatar_initials:initials(name,email),updated_at:new Date().toISOString()},{onConflict:"user_id"});
    await admin.from("user_roles").upsert({user_id:user.id,role:"client",updated_at:new Date().toISOString()},{onConflict:"user_id"});
    await admin.from("intelligence_client_workspace_members").upsert({workspace_id:invite.workspace.id,user_id:user.id,role:"owner"},{onConflict:"workspace_id,user_id"});
    await admin.from("intelligence_client_workspaces").update({portal_activated_at:invite.workspace.portal_activated_at||new Date().toISOString(),portal_last_login_at:new Date().toISOString(),contact_name:invite.workspace.contact_name||name,contact_email:invite.workspace.contact_email||email,company_name:companyName,company_website:companyWebsite,updated_at:new Date().toISOString()}).eq("id",invite.workspace.id);
    return {email,name,companyName,companyWebsite};
  }

  try{
    if(action==="inspect"){
      const i=await loadInvite(); const email=String(i.purchase.payer_email||i.workspace.contact_email||"").toLowerCase();
      return response({ok:true,activated:Boolean(i.workspace.portal_activated_at),email,name:i.workspace.contact_name||i.purchase.payer_name||"",companyName:i.workspace.company_name||i.snapshot.companyName||"",companyWebsite:i.workspace.company_website||i.snapshot.companyWebsite||"",packageName:i.purchase.package_name,productCount:i.purchase.product_count,amount:Number(i.purchase.amount),currency:i.purchase.currency},200,origin)
    }
    if(action==="activate"){
      const i=await loadInvite(); if(i.workspace.portal_activated_at)return response({error:"already_activated",loginUrl:"https://labnarrative.com/intelligence/login"},409,origin);
      const email=String(i.purchase.payer_email||i.workspace.contact_email||"").toLowerCase(); if(!email)return response({error:"purchase_email_missing"},409,origin);
      const password=text(body.password,200),fullName=text(body.fullName,300); if(password.length<8)return response({error:"Password must be at least 8 characters."},400,origin);
      const existing=await findUser(email); if(existing)return response({error:"account_exists",email,claimRequired:true},409,origin);
      const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName||i.purchase.payer_name||""}}); if(made.error||!made.data.user)throw made.error||new Error("account_creation_failed");
      const linked=await linkUser(made.data.user,i,fullName); return response({ok:true,activated:true,...linked},200,origin)
    }
    if(action==="claim"){
      const i=await loadInvite(); const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,""); if(!bearer)return response({error:"authentication_required"},401,origin);
      const got=await admin.auth.getUser(bearer); if(got.error||!got.data.user)return response({error:"invalid_session"},401,origin);
      const expected=String(i.purchase.payer_email||i.workspace.contact_email||"").toLowerCase(); const actual=String(got.data.user.email||"").toLowerCase(); if(!expected||expected!==actual)return response({error:"This purchase belongs to a different email address."},403,origin);
      const linked=await linkUser(got.data.user,i,text(body.fullName,300)); return response({ok:true,claimed:true,...linked},200,origin)
    }
    return response({error:"unknown_action"},400,origin)
  }catch(e){console.error(e);const msg=e instanceof Error?e.message:"client_auth_failed";const status=msg.includes("not_found")||msg.includes("invalid_activation")?404:500;return response({error:msg},status,origin)}
});
