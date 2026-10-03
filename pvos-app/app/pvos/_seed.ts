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
      { organization_id:organizationId, name:"Riyadh Pharma Demo", contract_scope:"Local QPPV + Literature + RMP", qppv_user_id:userId },
      { organization_id:organizationId, name:"Najd Therapeutics Demo", contract_scope:"Local QPPV + PSSF + Training", qppv_user_id:userId },
      { organization_id:organizationId, name:"GulfMed Demo", contract_scope:"Literature + ICSR + Reconciliation", qppv_user_id:userId },
    ])
    .select("id,name");
  if (companyError) throw companyError;
  const company = Object.fromEntries((companies ?? []).map((c:any)=>[c.name,c.id]));

  const { data: products, error: productError } = await supabase.from("pvos_products").insert([
    { company_id:company["Riyadh Pharma Demo"], brand_name:"Cardiovex", active_ingredient:"apixaban", registration_status:"Registered", rmp_status:"Active" },
    { company_id:company["Riyadh Pharma Demo"], brand_name:"Oncora", active_ingredient:"osimertinib", registration_status:"Registered", rmp_status:"Active" },
    { company_id:company["Najd Therapeutics Demo"], brand_name:"Neurovia", active_ingredient:"fingolimod", registration_status:"Registered", rmp_status:"Routine" },
    { company_id:company["GulfMed Demo"], brand_name:"Metaglix", active_ingredient:"metformin", registration_status:"Registered", rmp_status:"Routine" },
  ]).select("id,brand_name,company_id");
  if (productError) throw productError;
  const product = Object.fromEntries((products ?? []).map((p:any)=>[p.brand_name,p.id]));

  const { error: obligationError } = await supabase.from("pvos_obligations").insert([
    { company_id:company["Riyadh Pharma Demo"], activity_type:"Literature", title:"Weekly local literature screening", cadence:"weekly", owner_user_id:userId, next_due_at:atNoon(2) },
    { company_id:company["Najd Therapeutics Demo"], activity_type:"PSSF", title:"PSSF monthly maintenance", cadence:"monthly", owner_user_id:userId, next_due_at:atNoon(5) },
    { company_id:company["GulfMed Demo"], activity_type:"Reconciliation", title:"Monthly case reconciliation", cadence:"monthly", owner_user_id:userId, next_due_at:atNoon(7) },
  ]);
  if (obligationError) throw obligationError;

  const taskRows = [
    { organization_id:organizationId, company_id:company["Riyadh Pharma Demo"], product_id:product["Oncora"], title:"RMP annual review", activity_type:"RMP", source:"manual", status:"awaiting_review", priority:"high", owner_user_id:userId, due_at:atNoon(4) },
    { organization_id:organizationId, company_id:company["Najd Therapeutics Demo"], product_id:product["Neurovia"], title:"SFDA safety inquiry response", activity_type:"SFDA Inquiry", source:"sfda_event", status:"in_progress", priority:"critical", owner_user_id:userId, due_at:atNoon(1) },
    { organization_id:organizationId, company_id:company["Najd Therapeutics Demo"], title:"Medical representative refresher training", activity_type:"Training", source:"manual", status:"awaiting_external", priority:"medium", owner_user_id:userId, due_at:atNoon(8) },
    { organization_id:organizationId, company_id:company["GulfMed Demo"], title:"September literature review archive", activity_type:"Literature", source:"recurring", status:"complete", priority:"medium", owner_user_id:userId, due_at:atNoon(-5), completed_at:atNoon(-5) },
  ];
  const { data: tasks, error: taskError } = await supabase.from("pvos_tasks").insert(taskRows).select("id,title,company_id");
  if (taskError) throw taskError;
  const task = Object.fromEntries((tasks ?? []).map((t:any)=>[t.title+"|"+t.company_id,t.id]));

  await supabase.from("pvos_task_evidence").insert([
    { task_id:task["RMP annual review|"+company["Riyadh Pharma Demo"]], title:"RMP review checklist", evidence_type:"checklist", uploaded_by:userId },
    { task_id:task["SFDA safety inquiry response|"+company["Najd Therapeutics Demo"]], title:"SFDA correspondence", evidence_type:"correspondence", uploaded_by:userId },
    { task_id:task["September literature review archive|"+company["GulfMed Demo"]], title:"Signed literature review log", evidence_type:"document", uploaded_by:userId },
  ]);

  const { data: route, error: routeError } = await supabase.from("pvos_approval_routes").insert({
    company_id:company["Riyadh Pharma Demo"], name:"RMP approval", activity_type:"RMP"
  }).select("id").single();
  if (routeError) throw routeError;

  await supabase.from("pvos_approval_steps").insert([
    { route_id:route.id, position:1, role:"QPPV", assignee_user_id:userId },
    { route_id:route.id, position:2, role:"Quality" },
    { route_id:route.id, position:3, role:"Manager" },
    { route_id:route.id, position:4, role:"Client representative" },
  ]);

  const rmpTaskId=task["RMP annual review|"+company["Riyadh Pharma Demo"]];
  await supabase.from("pvos_task_approvals").insert([
    { task_id:rmpTaskId, route_id:route.id, step_position:1, assigned_user_id:userId, status:"approved", completed_at:new Date(Date.now()-86400000).toISOString() },
    { task_id:rmpTaskId, route_id:route.id, step_position:2, status:"in_review" },
    { task_id:rmpTaskId, route_id:route.id, step_position:3, status:"pending" },
    { task_id:rmpTaskId, route_id:route.id, step_position:4, status:"pending" },
  ]);
}
