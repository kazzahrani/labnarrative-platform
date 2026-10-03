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

export async function ensureDemoWorkspace(supabase:SupabaseClient, organizationId:string, userId:string) {
  const companies=await upsertAndFetch(
    supabase,"pvos_companies",
    [
      { organization_id:organizationId, seed_key:"demo-riyadh-pharma", name:"Riyadh Pharma Demo", contract_scope:"Local QPPV + Literature + RMP", qppv_user_id:userId },
      { organization_id:organizationId, seed_key:"demo-najd-therapeutics", name:"Najd Therapeutics Demo", contract_scope:"Local QPPV + PSSF + Training", qppv_user_id:userId },
      { organization_id:organizationId, seed_key:"demo-gulfmed", name:"GulfMed Demo", contract_scope:"Literature + ICSR + Reconciliation", qppv_user_id:userId },
    ],
    "organization_id,seed_key","seed_key",
    ["demo-riyadh-pharma","demo-najd-therapeutics","demo-gulfmed"]
  );
  const company=Object.fromEntries(companies.map((c:any)=>[c.seed_key,c.id]));

  const products=await upsertAndFetch(
    supabase,"pvos_products",
    [
      { company_id:company["demo-riyadh-pharma"], seed_key:"demo-cardiovex", brand_name:"Cardiovex", active_ingredient:"apixaban", registration_status:"Registered", rmp_status:"Active" },
      { company_id:company["demo-riyadh-pharma"], seed_key:"demo-oncora", brand_name:"Oncora", active_ingredient:"osimertinib", registration_status:"Registered", rmp_status:"Active" },
      { company_id:company["demo-najd-therapeutics"], seed_key:"demo-neurovia", brand_name:"Neurovia", active_ingredient:"fingolimod", registration_status:"Registered", rmp_status:"Routine" },
      { company_id:company["demo-gulfmed"], seed_key:"demo-metaglix", brand_name:"Metaglix", active_ingredient:"metformin", registration_status:"Registered", rmp_status:"Routine" },
    ],
    "company_id,seed_key","seed_key",
    ["demo-cardiovex","demo-oncora","demo-neurovia","demo-metaglix"]
  );
  const product=Object.fromEntries(products.map((p:any)=>[p.seed_key,p.id]));

  await upsertAndFetch(
    supabase,"pvos_obligations",
    [
      { company_id:company["demo-riyadh-pharma"], seed_key:"demo-weekly-literature", activity_type:"Literature", title:"Weekly local literature screening", cadence:"weekly", owner_user_id:userId, next_due_at:atNoon(2) },
      { company_id:company["demo-najd-therapeutics"], seed_key:"demo-monthly-pssf", activity_type:"PSSF", title:"PSSF monthly maintenance", cadence:"monthly", owner_user_id:userId, next_due_at:atNoon(5) },
      { company_id:company["demo-gulfmed"], seed_key:"demo-monthly-reconciliation", activity_type:"Reconciliation", title:"Monthly case reconciliation", cadence:"monthly", owner_user_id:userId, next_due_at:atNoon(7) },
    ],
    "company_id,seed_key","seed_key",
    ["demo-weekly-literature","demo-monthly-pssf","demo-monthly-reconciliation"]
  );

  const seededTasks=await upsertAndFetch(
    supabase,"pvos_tasks",
    [
      { organization_id:organizationId, company_id:company["demo-riyadh-pharma"], product_id:product["demo-oncora"], seed_key:"demo-rmp-annual-review", title:"RMP annual review", activity_type:"RMP", source:"manual", status:"awaiting_review", priority:"high", owner_user_id:userId, due_at:atNoon(4) },
      { organization_id:organizationId, company_id:company["demo-najd-therapeutics"], product_id:product["demo-neurovia"], seed_key:"demo-sfda-inquiry", title:"SFDA safety inquiry response", activity_type:"SFDA Inquiry", source:"sfda_event", status:"in_progress", priority:"critical", owner_user_id:userId, due_at:atNoon(1) },
      { organization_id:organizationId, company_id:company["demo-najd-therapeutics"], seed_key:"demo-medrep-training", title:"Medical representative refresher training", activity_type:"Training", source:"manual", status:"awaiting_external", priority:"medium", owner_user_id:userId, due_at:atNoon(8) },
      { organization_id:organizationId, company_id:company["demo-gulfmed"], seed_key:"demo-literature-archive", title:"September literature review archive", activity_type:"Literature", source:"recurring", status:"complete", priority:"medium", owner_user_id:userId, due_at:atNoon(-5), completed_at:atNoon(-5) },
    ],
    "organization_id,seed_key","seed_key",
    ["demo-rmp-annual-review","demo-sfda-inquiry","demo-medrep-training","demo-literature-archive"]
  );
  const task=Object.fromEntries(seededTasks.map((t:any)=>[t.seed_key,t.id]));

  await upsertAndFetch(
    supabase,"pvos_task_evidence",
    [
      { task_id:task["demo-rmp-annual-review"], seed_key:"demo-rmp-checklist", title:"RMP review checklist", evidence_type:"checklist", uploaded_by:userId },
      { task_id:task["demo-sfda-inquiry"], seed_key:"demo-sfda-correspondence", title:"SFDA correspondence", evidence_type:"correspondence", uploaded_by:userId },
      { task_id:task["demo-literature-archive"], seed_key:"demo-literature-log", title:"Signed literature review log", evidence_type:"document", uploaded_by:userId },
    ],
    "task_id,seed_key","seed_key",
    ["demo-rmp-checklist","demo-sfda-correspondence","demo-literature-log"]
  );

  const routes=await upsertAndFetch(
    supabase,"pvos_approval_routes",
    [{ company_id:company["demo-riyadh-pharma"], seed_key:"demo-rmp-route", name:"RMP approval", activity_type:"RMP" }],
    "company_id,seed_key","seed_key",["demo-rmp-route"]
  );
  const route=routes[0];

  const { error:stepsError } = await supabase.from("pvos_approval_steps").upsert([
    { route_id:route.id, position:1, role:"QPPV", assignee_user_id:userId },
    { route_id:route.id, position:2, role:"Quality" },
    { route_id:route.id, position:3, role:"Manager" },
    { route_id:route.id, position:4, role:"Client representative" },
  ],{onConflict:"route_id,position",ignoreDuplicates:true});
  if (stepsError) throw stepsError;

  await upsertAndFetch(
    supabase,"pvos_task_approvals",
    [
      { task_id:task["demo-rmp-annual-review"], route_id:route.id, seed_key:"demo-rmp-step-1", step_position:1, assigned_user_id:userId, status:"approved", completed_at:new Date(Date.now()-86400000).toISOString() },
      { task_id:task["demo-rmp-annual-review"], route_id:route.id, seed_key:"demo-rmp-step-2", step_position:2, status:"in_review" },
      { task_id:task["demo-rmp-annual-review"], route_id:route.id, seed_key:"demo-rmp-step-3", step_position:3, status:"pending" },
      { task_id:task["demo-rmp-annual-review"], route_id:route.id, seed_key:"demo-rmp-step-4", step_position:4, status:"pending" },
    ],
    "task_id,seed_key","seed_key",
    ["demo-rmp-step-1","demo-rmp-step-2","demo-rmp-step-3","demo-rmp-step-4"]
  );
}
