import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, paypal-auth-algo, paypal-cert-url, paypal-transmission-id, paypal-transmission-sig, paypal-transmission-time","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function text(v:unknown,max=4000){return typeof v==="string"?v.trim().slice(0,max):""}
function obj(v:unknown):J{return v&&typeof v==="object"&&!Array.isArray(v)?v as J:{}}
function arr(v:unknown):J[]{return Array.isArray(v)?v.filter(x=>x&&typeof x==="object") as J[]:[]}
function envMap(name:string):Record<string,string>{try{return JSON.parse(Deno.env.get(name)||"{}") as Record<string,string>}catch{return{}}}
function serviceKey(){return envMap("SUPABASE_SECRET_KEYS").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
function paypalBase(){return (Deno.env.get("PAYPAL_ENVIRONMENT")||"live").toLowerCase()==="sandbox"?"https://api-m.sandbox.paypal.com":"https://api-m.paypal.com"}
function environment(){return paypalBase().includes("sandbox")?"sandbox":"live"}

async function accessToken(){
 const id=Deno.env.get("PAYPAL_CLIENT_ID")||"",secret=Deno.env.get("PAYPAL_CLIENT_SECRET")||"";
 if(!id||!secret)throw new Error("PayPal credentials are not configured.");
 const r=await fetch(`${paypalBase()}/v1/oauth2/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
 const p=await r.json().catch(()=>({})) as J; const token=text(p.access_token,6000);
 if(!r.ok||!token)throw new Error(text(p.error_description,1000)||"PayPal authentication failed."); return token;
}
async function paypal(path:string,init:RequestInit={}){
 const token=await accessToken(); const r=await fetch(`${paypalBase()}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Prefer":"return=representation",...(init.headers||{})}}); const p=await r.json().catch(()=>({})) as J; return{r,p};
}
function link(payload:J,rels:string[]){const x=arr(payload.links).find(v=>rels.includes(text(v.rel,60)));return x?text(x.href):""}
function subscriber(payload:J){const s=obj(payload.subscriber),n=obj(s.name);return{name:[text(n.given_name,150),text(n.surname,150)].filter(Boolean).join(" "),email:text(s.email_address,320)}}
function billing(payload:J){const b=obj(payload.billing_info);return{next:text(b.next_billing_time,100)||null}}
function asIso(v:unknown){const s=text(v,100);return s&&Number.isFinite(Date.parse(s))?s:null}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const base=Deno.env.get("SUPABASE_URL")||"",key=serviceKey(); if(!base||!key)return json({error:"Care payment service configuration is incomplete."},500);
 const admin=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const body=await req.json().catch(()=>({})) as J;
 const eventType=text(body.event_type,100);

 async function ensureAdmin(){
  const auth=text(req.headers.get("authorization"),8000); const token=auth.toLowerCase().startsWith("bearer ")?auth.slice(7):""; if(!token)throw new Error("Administrator authentication required");
  const{data:u,error}=await admin.auth.getUser(token); if(error||!u.user)throw new Error("Administrator authentication required");
  const{data:r}=await admin.from("user_roles").select("role").eq("user_id",u.user.id).maybeSingle(); if(r?.role!=="admin")throw new Error("Administrator access required"); return u.user.id;
 }

 async function ensureProviderState(){
  const{data:state}=await admin.from("care_provider_state").select("*").eq("singleton",true).maybeSingle(); let productId=text(state?.paypal_product_id,200); let webhookId=text(state?.paypal_webhook_id,200);
  if(!productId){
   const made=await paypal("/v1/catalogs/products",{method:"POST",headers:{"PayPal-Request-Id":"care-product-v1"},body:JSON.stringify({name:"LabNarrative Care",description:"Managed scientific website care, monitoring and content updates",type:"SERVICE",category:"WEB_HOSTING_AND_DESIGN",home_url:"https://labnarrative.com"})});
   if(!made.r.ok||!text(made.p.id,200))throw new Error(text(made.p.message,1000)||"Could not create PayPal Care product."); productId=text(made.p.id,200);
  }
  const webhookUrl=`${base.replace(/\/$/,"")}/functions/v1/paypal-care`;
  if(!webhookId){
   const listed=await paypal("/v1/notifications/webhooks",{method:"GET"});
   const existing=arr(listed.p.webhooks).find(w=>text(w.url,4000)===webhookUrl); webhookId=existing?text(existing.id,200):"";
   if(!webhookId){
    const made=await paypal("/v1/notifications/webhooks",{method:"POST",headers:{"PayPal-Request-Id":"care-webhook-v1"},body:JSON.stringify({url:webhookUrl,event_types:[
     {name:"BILLING.SUBSCRIPTION.ACTIVATED"},{name:"BILLING.SUBSCRIPTION.CANCELLED"},{name:"BILLING.SUBSCRIPTION.SUSPENDED"},{name:"BILLING.SUBSCRIPTION.EXPIRED"},{name:"BILLING.SUBSCRIPTION.UPDATED"},{name:"BILLING.SUBSCRIPTION.PAYMENT.FAILED"},{name:"PAYMENT.SALE.COMPLETED"},{name:"PAYMENT.SALE.REFUNDED"},{name:"PAYMENT.SALE.REVERSED"}
    ]})}); if(!made.r.ok||!text(made.p.id,200))throw new Error(text(made.p.message,1000)||"Could not create PayPal Care webhook."); webhookId=text(made.p.id,200);
   }
  }
  await admin.from("care_provider_state").update({environment:environment(),paypal_product_id:productId,paypal_webhook_id:webhookId,webhook_status:"ready",last_verified_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("singleton",true);
  return{productId,webhookId};
 }

 async function ensurePlan(planId:string){
  const{data:plan,error}=await admin.from("care_plans").select("*").eq("id",planId).eq("is_active",true).maybeSingle(); if(error||!plan)throw new Error("Care plan is unavailable.");
  if(plan.paypal_plan_id&&plan.provider_status==="synced")return plan;
  const setup=await ensureProviderState(); const unit=plan.billing_interval==="year"?"YEAR":"MONTH";
  const made=await paypal("/v1/billing/plans",{method:"POST",headers:{"PayPal-Request-Id":`care-${String(plan.id).slice(0,30)}`},body:JSON.stringify({product_id:setup.productId,name:plan.name,description:plan.description||plan.name,status:"ACTIVE",billing_cycles:[{frequency:{interval_unit:unit,interval_count:1},tenure_type:"REGULAR",sequence:1,total_cycles:0,pricing_scheme:{fixed_price:{value:Number(plan.price_amount).toFixed(2),currency_code:String(plan.currency).toUpperCase()}}}],payment_preferences:{auto_bill_outstanding:true,payment_failure_threshold:2}})});
  if(!made.r.ok||!text(made.p.id,200)){const message=text(made.p.message,1000)||"Could not create PayPal Care plan.";await admin.from("care_plans").update({provider_status:"error",provider_error:message,updated_at:new Date().toISOString()}).eq("id",plan.id);throw new Error(message)}
  const providerPlanId=text(made.p.id,200); await admin.from("care_plans").update({paypal_plan_id:providerPlanId,provider_status:"synced",provider_synced_at:new Date().toISOString(),provider_error:null,updated_at:new Date().toISOString()}).eq("id",plan.id); return{...plan,paypal_plan_id:providerPlanId,provider_status:"synced"};
 }

 async function syncSubscription(providerId:string){
  const got=await paypal(`/v1/billing/subscriptions/${encodeURIComponent(providerId)}`,{method:"GET"}); if(!got.r.ok)throw new Error(text(got.p.message,1000)||"Could not verify PayPal subscription.");
  const who=subscriber(got.p),bill=billing(got.p); const{error}=await admin.rpc("care_provider_sync_subscription",{p_provider_subscription_id:providerId,p_status:text(got.p.status,50),p_subscriber_name:who.name||null,p_subscriber_email:who.email||null,p_started_at:asIso(got.p.start_time),p_next_billing_at:bill.next,p_metadata:{paypal_status:text(got.p.status,50),paypal_plan_id:text(got.p.plan_id,200)}}); if(error)throw new Error(error.message); return got.p;
 }

 if(eventType){
  try{
   const{data:state}=await admin.from("care_provider_state").select("paypal_webhook_id").eq("singleton",true).maybeSingle(); const webhookId=text(state?.paypal_webhook_id,200); if(!webhookId)return json({error:"Care webhook is not registered."},503);
   const verify=await paypal("/v1/notifications/verify-webhook-signature",{method:"POST",body:JSON.stringify({auth_algo:req.headers.get("paypal-auth-algo"),cert_url:req.headers.get("paypal-cert-url"),transmission_id:req.headers.get("paypal-transmission-id"),transmission_sig:req.headers.get("paypal-transmission-sig"),transmission_time:req.headers.get("paypal-transmission-time"),webhook_id:webhookId,webhook_event:body})});
   if(!verify.r.ok||text(verify.p.verification_status,50)!=="SUCCESS")return json({error:"Invalid PayPal webhook signature."},400);
   const resource=obj(body.resource); const resourceId=text(resource.id,300);
   if(eventType.startsWith("BILLING.SUBSCRIPTION.")){
    if(resourceId){try{await syncSubscription(resourceId)}catch(e){console.error("subscription sync",e)}
     if(eventType==="BILLING.SUBSCRIPTION.PAYMENT.FAILED"){
      const{data:s}=await admin.from("care_subscriptions").select("prospect_id,id").eq("provider_subscription_id",resourceId).maybeSingle(); if(s){await admin.from("sales_lead_workspaces").update({next_action:"Resolve Care subscription payment issue",next_action_due_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("prospect_id",s.prospect_id);await admin.from("pipeline_events").insert({prospect_id:s.prospect_id,event_type:"care_payment_failed",step:"care",message:"PayPal reported a failed LabNarrative Care payment",payload:{subscription_id:s.id,event_id:text(body.id,300)}})}}
    }
   } else if(eventType==="PAYMENT.SALE.COMPLETED"){
    const providerSub=text(resource.billing_agreement_id,300);const amount=obj(resource.amount);const paymentId=resourceId;if(providerSub&&paymentId){await admin.rpc("care_provider_record_payment",{p_provider_subscription_id:providerSub,p_provider_payment_id:paymentId,p_amount:Number(amount.total||amount.value||0),p_currency:text(amount.currency||amount.currency_code,20),p_paid_at:asIso(resource.create_time||body.create_time)||new Date().toISOString(),p_metadata:{event_id:text(body.id,300)}});try{await syncSubscription(providerSub)}catch{}}
   } else if(eventType==="PAYMENT.SALE.REFUNDED"||eventType==="PAYMENT.SALE.REVERSED"){
    if(resourceId){const target=text(resource.sale_id||resource.parent_payment,300)||resourceId;await admin.from("care_subscription_payments").update({status:eventType.endsWith("REFUNDED")?"refunded":"reversed",provider_metadata:{event_id:text(body.id,300),event_type:eventType}}).eq("provider_payment_id",target)}
   }
   return json({ok:true});
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Webhook handling failed."},500)}
 }

 const action=text(body.action,60)||"status";
 if(action==="status"){
  try{await accessToken();const{data:s}=await admin.from("care_provider_state").select("paypal_product_id,paypal_webhook_id,webhook_status,last_verified_at,last_error").eq("singleton",true).maybeSingle();return json({ok:true,configured:true,verified:true,environment:environment(),provider:s})}catch(e){return json({ok:true,configured:Boolean(Deno.env.get("PAYPAL_CLIENT_ID")&&Deno.env.get("PAYPAL_CLIENT_SECRET")),verified:false,environment:environment(),error:e instanceof Error?e.message:"PayPal verification failed."})}
 }
 try{
  if(action==="sync_plans"){
   await ensureAdmin();const{data:plans}=await admin.from("care_plans").select("id").eq("is_active",true);for(const p of plans||[])await ensurePlan(String(p.id));const setup=await ensureProviderState();return json({ok:true,productId:setup.productId,webhookReady:Boolean(setup.webhookId),synced:(plans||[]).length});
  }
  if(action==="create_subscription"){
   const portalToken=text(body.token,100),planId=text(body.planId,100);if(!portalToken||!planId)return json({error:"Care token and plan are required."},400);
   const{data:offer}=await admin.from("care_offers").select("*").eq("token",portalToken).eq("link_enabled",true).maybeSingle();if(!offer)return json({error:"Care offer not found."},404);if(offer.status==="declined"||offer.status==="cancelled")return json({error:"This Care offer is closed."},409);if(new Date(`${offer.valid_until}T23:59:59Z`).getTime()<Date.now())return json({error:"This Care offer has expired."},409);
   const{data:existing}=await admin.from("care_subscriptions").select("*").eq("offer_id",offer.id).in("status",["approval_pending","active","suspended"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(existing?.provider==="proposal_included"&&existing.status==="active")return json({error:"LabNarrative Care is already active and included with this project. No additional subscription is required.",included:true,active:true},409);
   if(existing?.provider_subscription_id){if(existing.status==="active")return json({ok:true,active:true,subscriptionId:existing.provider_subscription_id});const got=await paypal(`/v1/billing/subscriptions/${encodeURIComponent(existing.provider_subscription_id)}`,{method:"GET"});const approve=link(got.p,["approve"]);if(got.r.ok&&approve)return json({ok:true,subscriptionId:existing.provider_subscription_id,approvalUrl:approve,reused:true});}
   const plan=await ensurePlan(planId);const returnUrl=`https://labnarrative.com/care/${encodeURIComponent(portalToken)}?paypal=return`,cancelUrl=`https://labnarrative.com/care/${encodeURIComponent(portalToken)}?paypal=cancelled`;
   const made=await paypal("/v1/billing/subscriptions",{method:"POST",headers:{"PayPal-Request-Id":`care-sub-${String(offer.id).slice(0,25)}`},body:JSON.stringify({plan_id:plan.paypal_plan_id,custom_id:String(offer.id),application_context:{brand_name:"LabNarrative",shipping_preference:"NO_SHIPPING",user_action:"SUBSCRIBE_NOW",return_url:returnUrl,cancel_url:cancelUrl}})});
   const providerId=text(made.p.id,300),approve=link(made.p,["approve"]);if(!made.r.ok||!providerId||!approve)return json({error:text(made.p.message,1000)||"Could not create PayPal Care subscription."},502);
   const{error:bind}=await admin.rpc("care_provider_bind_subscription",{p_offer_id:offer.id,p_plan_id:plan.id,p_provider_subscription_id:providerId,p_status:text(made.p.status,50),p_metadata:{paypal_plan_id:plan.paypal_plan_id}});if(bind)throw new Error(bind.message);return json({ok:true,subscriptionId:providerId,approvalUrl:approve});
  }
  if(action==="verify_subscription"){
   const portalToken=text(body.token,100);const{data:offer}=await admin.from("care_offers").select("id").eq("token",portalToken).eq("link_enabled",true).maybeSingle();if(!offer)return json({error:"Care portal not found."},404);const{data:s}=await admin.from("care_subscriptions").select("provider_subscription_id").eq("offer_id",offer.id).order("created_at",{ascending:false}).limit(1).maybeSingle();if(!s?.provider_subscription_id)return json({error:"No Care subscription is waiting for verification."},404);const p=await syncSubscription(s.provider_subscription_id);return json({ok:true,status:text(p.status,50),active:text(p.status,50)==="ACTIVE",subscriptionId:s.provider_subscription_id});
  }
  if(action==="cancel_subscription"){
   await ensureAdmin();const providerId=text(body.subscriptionId,300),reason=text(body.reason,128)||"Cancelled by LabNarrative administrator";if(!providerId)return json({error:"Subscription ID is required."},400);const r=await paypal(`/v1/billing/subscriptions/${encodeURIComponent(providerId)}/cancel`,{method:"POST",body:JSON.stringify({reason})});if(!r.r.ok&&r.r.status!==204)return json({error:text(r.p.message,1000)||"Could not cancel PayPal subscription."},502);await syncSubscription(providerId);return json({ok:true});
  }
  return json({error:"Unknown Care payment action."},400);
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Care payment service failed."},500)}
});