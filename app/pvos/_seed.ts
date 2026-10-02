import type { SupabaseClient } from "@supabase/supabase-js";

function atNoon(offsetDays:number) {
  const d = new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()+offsetDays);
  return d.toISOString();
}

export async function ensureDemoWorkspace(supabase:SupabaseClient, organizationId:string, userId:string) {
  const { data: existing, error: existingError } = await supabase
    .from("pvos_companies")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return;

  const { data: companies, error: companyError } = await supabase
    .from("pvos_companies")
    .insert([
      { organization_id:organizationId, name:"Alpha Pharma", contract_scope:"PV full service", qppv_user_id:userId },
      { organization_id:organizationId, name:"Beta Pharma", contract_scope:"Literature + ICSR", qppv_user_id:userId },
      { organization_id:organizationId, name:"Gamma Therapeutics", contract_scope:"Local QPPV", qppv_user_id:userId },
      { organization_id:organizationId, name:"Delta Biologics", contract_scope:"PV full service", qppv_user_id:userId },
      { organization_id:organizationId, name:"Epsilon Pharma", contract_scope:"PSSF + Training", qppv_user_id:userId },
      { organization_id:organizationId, name:"Zeta Medical", contract_scope:"Signal + Literature", qppv_user_id:userId },
    ])
    .select("id,name");
  if (companyError) throw companyError;
  const company = Object.fromEntries((companies ?? []).map((c:any)=>[c.name,c.id]));

  const { data: products, error: productError } = await supabase.from("pvos_products").insert([
    { company_id:company["Alpha Pharma"], brand_name:"Oncora", active_ingredient:"osimertinib", registration_status:"Registered", rmp_status:"Active" },
    { company_id:company["Alpha Pharma"], brand_name:"Cardiovex", active_ingredient:"apixaban", registration_status:"Registered", rmp_status:"Routine" },
    { company_id:company["Beta Pharma"], brand_name:"Metaglix", active_ingredient:"metformin", registration_status:"Registered", rmp_status:"Routine" },
    { company_id:company["Delta Biologics"], brand_name:"Neurovia", active_ingredient:"fingolimod", registration_status:"Registered", rmp_status:"Active" },
  ]).select("id,brand_name,company_id");
  if (productError) throw productError;
  const product = Object.fromEntries((products ?? []).map((p:any)=>[p.brand_name,p.id]));

  const { data: obligations, error: obligationError } = await supabase.from("pvos_obligations").insert([
    { company_id:company["Alpha Pharma"], activity_type:"Literature", title:"Weekly literature surveillance", cadence:"weekly", owner_user_id:userId, next_due_at:atNoon(3) },
    { company_id:company["Alpha Pharma"], product_id:product["Oncora"], activity_type:"RMP", title:"RMP annual review", cadence:"annual", owner_user_id:userId, next_due_at:atNoon(0) },
    { company_id:company["Beta Pharma"], activity_type:"Literature", title:"Weekly literature review", cadence:"weekly", owner_user_id:userId, next_due_at:atNoon(0) },
    { company_id:company["Gamma Therapeutics"], activity_type:"PSSF", title:"PSSF monthly maintenance", cadence:"monthly", owner_user_id:userId, next_due_at:atNoon(1) },
    { company_id:company["Zeta Medical"], activity_type:"Signal", title:"Monthly authority & signal review", cadence:"monthly", owner_user_id:userId, next_due_at:atNoon(9) },
  ]).select("id,title,company_id");
  if (obligationError) throw obligationError;
  const obligation = Object.fromEntries((obligations ?? []).map((o:any)=>[o.title+"|"+o.company_id,o.id]));

  const taskRows = [
    { organization_id:organizationId, company_id:company["Alpha Pharma"], product_id:product["Oncora"], obligation_id:obligation["RMP annual review|"+company["Alpha Pharma"]], title:"RMP annual review", activity_type:"RMP", source:"recurring", status:"not_started", priority:"high", owner_user_id:userId, due_at:atNoon(0) },
    { organization_id:organizationId, company_id:company["Beta Pharma"], obligation_id:obligation["Weekly literature review|"+company["Beta Pharma"]], title:"Weekly literature review", activity_type:"Literature", source:"recurring", status:"not_started", priority:"medium", owner_user_id:userId, due_at:atNoon(0) },
    { organization_id:organizationId, company_id:company["Gamma Therapeutics"], obligation_id:obligation["PSSF monthly maintenance|"+company["Gamma Therapeutics"]], title:"PSSF monthly maintenance", activity_type:"PSSF", source:"recurring", status:"in_progress", priority:"medium", owner_user_id:userId, due_at:atNoon(1) },
    { organization_id:organizationId, company_id:company["Alpha Pharma"], title:"Medical representative refresher training", activity_type:"Training", source:"manual", status:"awaiting_review", priority:"medium", owner_user_id:userId, due_at:atNoon(5) },
    { organization_id:organizationId, company_id:company["Delta Biologics"], product_id:product["Neurovia"], title:"SFDA safety inquiry response", activity_type:"SFDA Inquiry", source:"sfda_event", status:"awaiting_external", priority:"critical", owner_user_id:userId, due_at:atNoon(-1) },
    { organization_id:organizationId, company_id:company["Epsilon Pharma"], title:"SOP-07 annual review", activity_type:"SOP", source:"recurring", status:"in_progress", priority:"low", owner_user_id:userId, due_at:atNoon(7) },
    { organization_id:organizationId, company_id:company["Zeta Medical"], obligation_id:obligation["Monthly authority & signal review|"+company["Zeta Medical"]], title:"Monthly authority & signal review", activity_type:"Signal", source:"recurring", status:"not_started", priority:"medium", owner_user_id:userId, due_at:atNoon(9) },
    { organization_id:organizationId, company_id:company["Beta Pharma"], title:"Monthly case reconciliation", activity_type:"Reconciliation", source:"recurring", status:"not_started", priority:"medium", owner_user_id:userId, due_at:atNoon(10) },
    { organization_id:organizationId, company_id:company["Alpha Pharma"], title:"September literature review archive", activity_type:"Literature", source:"recurring", status:"complete", priority:"medium", owner_user_id:userId, due_at:atNoon(-5), completed_at:atNoon(-5) },
  ];
  const { data: tasks, error: taskError } = await supabase.from("pvos_tasks").insert(taskRows).select("id,title,company_id");
  if (taskError) throw taskError;
  const task = Object.fromEntries((tasks ?? []).map((t:any)=>[t.title,t.id]));

  await supabase.from("pvos_task_evidence").insert([
    { task_id:task["RMP annual review"], title:"RMP review checklist", evidence_type:"checklist", uploaded_by:userId },
    { task_id:task["Weekly literature review"], title:"Literature search log", evidence_type:"document", uploaded_by:userId },
    { task_id:task["SFDA safety inquiry response"], title:"SFDA correspondence", evidence_type:"correspondence", uploaded_by:userId },
    { task_id:task["September literature review archive"], title:"Signed review log", evidence_type:"document", uploaded_by:userId },
  ]);

  const { data: route, error: routeError } = await supabase.from("pvos_approval_routes").insert({
    company_id:company["Alpha Pharma"], name:"Training approval", activity_type:"Training"
  }).select("id").single();
  if (routeError) throw routeError;

  await supabase.from("pvos_approval_steps").insert([
    { route_id:route.id, position:1, role:"QPPV", assignee_user_id:userId },
    { route_id:route.id, position:2, role:"Quality", assignee_user_id:userId },
    { route_id:route.id, position:3, role:"Client representative" },
  ]);

  await supabase.from("pvos_task_approvals").insert([
    { task_id:task["Medical representative refresher training"], route_id:route.id, step_position:1, assigned_user_id:userId, status:"approved", completed_at:new Date(Date.now()-86400000).toISOString() },
    { task_id:task["Medical representative refresher training"], route_id:route.id, step_position:2, assigned_user_id:userId, status:"in_review" },
    { task_id:task["Medical representative refresher training"], route_id:route.id, step_position:3, status:"pending" },
  ]);
}
