import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDemoWorkspace } from "./_seed";

async function requireOk(label:string, promise:PromiseLike<any>){
  const res=await promise;
  if(res?.error) throw new Error(label+": "+res.error.message);
  return res;
}

export async function prepareReviewerDemoWorkspace(
  supabase:SupabaseClient,
  organizationId:string,
  userId:string
){
  const {data:org,error:orgError}=await supabase
    .from("pvos_organizations")
    .select("id,name")
    .eq("id",organizationId)
    .single();
  if(orgError) throw orgError;
  if(org?.name!=="PVOS Demo Workspace"){
    return {skipped:true,reason:"not_demo_workspace"};
  }

  const {data:companies,error:companiesError}=await supabase
    .from("pvos_companies")
    .select("*")
    .eq("organization_id",organizationId)
    .order("created_at");
  if(companiesError) throw companiesError;

  const canonical=(companies||[]).find((c:any)=>c.seed_key==="demo-riyadh-pharma")
    ||(companies||[]).find((c:any)=>c.name==="Riyadh Pharma Demo");
  if(!canonical) throw new Error("Riyadh Pharma Demo was not found.");

  const companyIds=(companies||[]).map((c:any)=>c.id);

  // Remove test activity first so the regenerated workspace is deterministic.
  await requireOk("Could not clear handovers",
    supabase.from("pvos_handovers").delete().eq("organization_id",organizationId));
  await requireOk("Could not clear tasks",
    supabase.from("pvos_tasks").delete().eq("organization_id",organizationId));

  if(companyIds.length){
    await requireOk("Could not clear obligations",
      supabase.from("pvos_obligations").delete().in("company_id",companyIds));
    await requireOk("Could not clear approval routes",
      supabase.from("pvos_approval_routes").delete().in("company_id",companyIds));
    await requireOk("Could not clear products",
      supabase.from("pvos_products").delete().in("company_id",companyIds));
  }

  // Keep exactly one realistic demo company; all related rows on duplicate
  // demo companies cascade away with the company deletion.
  for(const c of companies||[]){
    if(c.id===canonical.id) continue;
    await requireOk("Could not remove duplicate demo company",
      supabase.from("pvos_companies").delete().eq("id",c.id));
  }

  await requireOk("Could not refresh demo company",
    supabase.from("pvos_companies").update({
      name:"Riyadh Pharma Demo",
      contract_scope:"Local QPPV operations · RMP · Literature · SFDA follow-up",
      qppv_user_id:userId,
      status:"active",
      seed_key:"demo-riyadh-pharma"
    }).eq("id",canonical.id));

  // Rebuild the compact reviewer-ready demo from the canonical seed.
  await ensureDemoWorkspace(supabase,organizationId,userId);
  await supabase.rpc("pvos_materialize_due_obligations",{horizon_days:30});

  return {
    company:"Riyadh Pharma Demo",
    products:["DapaMet","Oncora","Cardiovex"],
    importedRmp:"DapaMet"
  };
}
