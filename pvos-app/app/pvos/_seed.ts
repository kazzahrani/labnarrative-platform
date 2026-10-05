import type { SupabaseClient } from "@supabase/supabase-js";

function atNoon(offsetDays:number) {
  const d = new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()+offsetDays);
  return d.toISOString();
}

async function upsertAndFetch(supabase:SupabaseClient, table:string, rows:any[], conflict:string, keyColumn:string, keys:string[]) {
  const { error } = await supabase.from(table).upsert(rows,{onConflict:conflict,ignoreDuplicates:true});
  if (error) throw error;
  const { data, error:fetchError } = await supabase.from(table).select("*").in(keyColumn,keys);
  if (fetchError) throw fetchError;
  return data ?? [];
}

const DAPAMET_RMP = {
  submitted_to:"SFDA",
  frequency:"On request",
  next_due_date:"",
  status:"Active",
  versions:[
    {
      id:"demo-dapamet-initial-rmp",
      type:"initial",
      dlp:"NA",
      submission_date:"2025-03-24",
      identified_risks:"Urinary tract infection (dapagliflozin), Lactic acidosis (metformin),Renal impairment (dapagliflozin), Diabetic Ketoacidosis including events with atypical presentation (dapagliflozin)",
      potential_risks:"Liver injury (dapaglidozin), Bladder cancer (dapagliflozin), Breast cancer (dapagliflozin), Prostate cancer (dapagliflozin), Lower limb amputation (dapagliflozin)",
      missing_information:"None",
      comments_reason:"",
      additional_rmm:"No aRMMs",
      created_at:"2026-10-05T00:00:00.000Z"
    }
  ]
};

export async function ensureDemoWorkspace(supabase:SupabaseClient, organizationId:string, userId:string) {
  const companies=await upsertAndFetch(
    supabase,"pvos_companies",
    [
      {
        organization_id:organizationId,
        seed_key:"demo-riyadh-pharma",
        name:"Riyadh Pharma Demo",
        contract_scope:"Local QPPV operations · RMP · Literature · SFDA follow-up",
        qppv_user_id:userId
      },
    ],
    "organization_id,seed_key","seed_key",
    ["demo-riyadh-pharma"]
  );
  const companyId=companies[0]?.id;
  if(!companyId) throw new Error("Could not prepare demo company.");

  const products=await upsertAndFetch(
    supabase,"pvos_products",
    [
      {
        company_id:companyId,seed_key:"demo-dapamet",brand_name:"DapaMet",
        active_ingredient:"Dapagliflozin & metformin hydrochloride",
        registration_status:"Registered",rmp_status:"Active",
        metadata:{rmp:DAPAMET_RMP}
      },
      {
        company_id:companyId,seed_key:"demo-oncora",brand_name:"Oncora",
        active_ingredient:"osimertinib",registration_status:"Registered",rmp_status:"Active"
      },
      {
        company_id:companyId,seed_key:"demo-cardiovex",brand_name:"Cardiovex",
        active_ingredient:"apixaban",registration_status:"Registered",rmp_status:"Routine"
      },
    ],
    "company_id,seed_key","seed_key",
    ["demo-dapamet","demo-oncora","demo-cardiovex"]
  );
  const product=Object.fromEntries(products.map((p:any)=>[p.seed_key,p.id]));

  await upsertAndFetch(
    supabase,"pvos_obligations",
    [
      {
        company_id:companyId,seed_key:"demo-weekly-literature",
        activity_type:"Literature",title:"Weekly local literature screening",
        cadence:"weekly",owner_user_id:userId,next_due_at:atNoon(2)
      },
      {
        company_id:companyId,seed_key:"demo-monthly-signal",
        activity_type:"Signal",title:"Monthly health authority & signal review",
        cadence:"monthly",owner_user_id:userId,next_due_at:atNoon(10)
      },
    ],
    "company_id,seed_key","seed_key",
    ["demo-weekly-literature","demo-monthly-signal"]
  );

  const seededTasks=await upsertAndFetch(
    supabase,"pvos_tasks",
    [
      {
        organization_id:organizationId,company_id:companyId,product_id:product["demo-dapamet"],
        seed_key:"demo-sfda-inquiry",title:"SFDA safety inquiry response",
        activity_type:"SFDA Inquiry",source:"sfda_event",status:"in_progress",
        priority:"critical",owner_user_id:userId,due_at:atNoon(1)
      },
      {
        organization_id:organizationId,company_id:companyId,
        seed_key:"demo-training",title:"Medical representative refresher training",
        activity_type:"Training",source:"manual",status:"awaiting_external",
        priority:"medium",owner_user_id:userId,due_at:atNoon(8)
      },
      {
        organization_id:organizationId,company_id:companyId,product_id:product["demo-dapamet"],
        seed_key:"demo-rmp-review",title:"DapaMet RMP review & approval",
        activity_type:"RMP",source:"manual",status:"awaiting_review",
        priority:"high",owner_user_id:userId,due_at:atNoon(6)
      },
    ],
    "organization_id,seed_key","seed_key",
    ["demo-sfda-inquiry","demo-training","demo-rmp-review"]
  );
  const task=Object.fromEntries(seededTasks.map((t:any)=>[t.seed_key,t.id]));

  await upsertAndFetch(
    supabase,"pvos_task_evidence",
    [
      { task_id:task["demo-sfda-inquiry"],seed_key:"demo-sfda-correspondence",title:"SFDA correspondence",evidence_type:"correspondence",uploaded_by:userId },
      { task_id:task["demo-rmp-review"],seed_key:"demo-rmp-checklist",title:"RMP review checklist",evidence_type:"checklist",uploaded_by:userId },
    ],
    "task_id,seed_key","seed_key",
    ["demo-sfda-correspondence","demo-rmp-checklist"]
  );

  const routes=await upsertAndFetch(
    supabase,"pvos_approval_routes",
    [{ company_id:companyId,seed_key:"demo-rmp-route",name:"RMP approval",activity_type:"RMP" }],
    "company_id,seed_key","seed_key",["demo-rmp-route"]
  );
  const route=routes[0];

  const { error:stepsError } = await supabase.from("pvos_approval_steps").upsert([
    { route_id:route.id, position:1, role:"QPPV", assignee_user_id:userId },
    { route_id:route.id, position:2, role:"Quality" },
    { route_id:route.id, position:3, role:"Manager" },
  ],{onConflict:"route_id,position",ignoreDuplicates:true});
  if (stepsError) throw stepsError;

  await upsertAndFetch(
    supabase,"pvos_task_approvals",
    [
      { task_id:task["demo-rmp-review"],route_id:route.id,seed_key:"demo-rmp-step-1",step_position:1,assigned_user_id:userId,status:"approved",completed_at:new Date(Date.now()-86400000).toISOString() },
      { task_id:task["demo-rmp-review"],route_id:route.id,seed_key:"demo-rmp-step-2",step_position:2,status:"in_review" },
      { task_id:task["demo-rmp-review"],route_id:route.id,seed_key:"demo-rmp-step-3",step_position:3,status:"pending" },
    ],
    "task_id,seed_key","seed_key",
    ["demo-rmp-step-1","demo-rmp-step-2","demo-rmp-step-3"]
  );
}
